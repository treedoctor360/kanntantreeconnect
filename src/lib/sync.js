// スプレッドシート（GAS）との同期の段取り。
//
// この3つを受け持つ:
//   1. 起動時の反映   … アプリを開くたびにシートの内容を端末へ取り込む（pullFromGas）
//   2. 自動保存       … 端末で何か書き換えたら、少し待ってからシートへ送る（自動push）
//   3. 手動同期       … 設定タブの「今すぐ同期」（syncNow = pull → push）
//
// 送信できなかったぶんは pending / deletions テーブルに残るので、
// 圏外で登録しても、電波が戻ったとき・次に開いたときに送り直される。
//
// 写真（photos）と設定（settings・樹種マスタ）はシートに送らない。
// 写真はBase64が大きすぎてセル上限（5万文字）に載らないため、端末内＋JSONバックアップで扱う。

import { countPendingSync, db, getSetting, nowIso, setSetting } from '../db/db.js';
import { GasError, gasPing, gasPull, gasPush } from './gasClient.js';
import { onLocalChange } from './changeBus.js';
import { planPull, stripTreeForSheet, summarizePull } from './syncMerge.js';

/** 設定タブに保存する項目のキー */
export const SYNC_SETTING_KEYS = {
  url: 'gasUrl',
  token: 'gasToken',
  auto: 'autoSync',
  lastSyncedAt: 'lastSyncedAt',
};

const AUTO_PUSH_DELAY = 2500; // 書き換えてから送るまでの待ち時間(ms)。連続登録を1回にまとめる
const RETRY_DELAYS = [5000, 15000, 60000, 180000]; // 失敗したときの再送間隔(ms)
const PUSH_CHUNK = 150; // 1回のリクエストで送る最大レコード数

// ------------------------------------------------------------------
// 同期の状態（画面に出すため）
// ------------------------------------------------------------------

/** state: 'off'（未設定）| 'idle' | 'syncing' | 'error' */
let status = { state: 'off', message: '', lastSyncedAt: null, pending: 0, error: '' };
const listeners = new Set();

function setStatus(patch) {
  status = { ...status, ...patch };
  for (const fn of [...listeners]) {
    try {
      fn(status);
    } catch {
      /* 画面側の失敗で同期を止めない */
    }
  }
}

export const getSyncStatus = () => status;

/** 同期の状態を受け取る。戻り値を呼ぶと購読をやめる。 */
export function subscribeSync(fn) {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}

// ------------------------------------------------------------------
// 設定
// ------------------------------------------------------------------

/** GAS の設定を読む。auto（自動保存）の既定は ON。 */
export async function getGasConfig() {
  const [url, token, auto, lastSyncedAt] = await Promise.all([
    getSetting(SYNC_SETTING_KEYS.url, ''),
    getSetting(SYNC_SETTING_KEYS.token, ''),
    getSetting(SYNC_SETTING_KEYS.auto, true),
    getSetting(SYNC_SETTING_KEYS.lastSyncedAt, null),
  ]);
  return { url: url ?? '', token: token ?? '', auto: auto !== false, lastSyncedAt };
}

export async function saveGasConfig({ url, token, auto }) {
  if (url !== undefined) await setSetting(SYNC_SETTING_KEYS.url, String(url).trim());
  if (token !== undefined) await setSetting(SYNC_SETTING_KEYS.token, String(token).trim());
  if (auto !== undefined) await setSetting(SYNC_SETTING_KEYS.auto, Boolean(auto));
  await refreshStatus();
}

/** 現在の設定と送信待ち件数を状態に反映する（画面を開いたときに呼ぶ） */
export async function refreshStatus() {
  const { url, lastSyncedAt } = await getGasConfig();
  const pending = await countPendingSync();
  setStatus({
    pending,
    lastSyncedAt,
    state: !url ? 'off' : status.state === 'off' ? 'idle' : status.state,
  });
  return status;
}

/** 疎通確認（設定タブの「接続テスト」） */
export async function testConnection() {
  const { url, token } = await getGasConfig();
  const res = await gasPing(url, token);
  return res; // { ok:true, spreadsheet, counts:{parks,trees,deletions} }
}

// ------------------------------------------------------------------
// 取り込み（シート → 端末）
// ------------------------------------------------------------------

/** シートの内容を端末に反映する。戻り値は反映件数の要約。 */
export async function pullFromGas() {
  const { url, token } = await getGasConfig();
  if (!url) throw new GasError('GASのURLが設定されていません。', { kind: 'config' });

  const res = await gasPull(url, token);
  const [parks, trees] = await Promise.all([db.parks.toArray(), db.trees.toArray()]);
  const plan = planPull({ parks, trees }, res);

  await db.transaction('rw', db.parks, db.trees, db.photos, async () => {
    if (plan.parks.put.length) await db.parks.bulkPut(plan.parks.put);
    if (plan.trees.put.length) await db.trees.bulkPut(plan.trees.put);
    if (plan.remove.trees.length) {
      await db.photos.where('treeId').anyOf(plan.remove.trees).delete();
      await db.trees.bulkDelete(plan.remove.trees);
    }
    if (plan.remove.parks.length) await db.parks.bulkDelete(plan.remove.parks);
  });
  // ここでは pending に積まない（シートから来たものを送り返さないため）

  return summarizePull(plan);
}

// ------------------------------------------------------------------
// 送信（端末 → シート）
// ------------------------------------------------------------------

/** 送信待ちのレコードと削除の記録をシートへ送る。戻り値は送った件数。 */
export async function pushToGas() {
  const { url, token } = await getGasConfig();
  if (!url) throw new GasError('GASのURLが設定されていません。', { kind: 'config' });

  const [pending, deletions] = await Promise.all([db.pending.toArray(), db.deletions.toArray()]);
  if (!pending.length && !deletions.length) return { records: 0, deletions: 0 };

  const parkIds = pending.filter((p) => p.table === 'parks').map((p) => p.id);
  const treeIds = pending.filter((p) => p.table === 'trees').map((p) => p.id);
  const [parkRows, treeRows] = await Promise.all([
    db.parks.bulkGet(parkIds),
    db.trees.bulkGet(treeIds),
  ]);
  const parks = parkRows.filter(Boolean);
  const trees = treeRows.filter(Boolean).map(stripTreeForSheet);

  // 1回のリクエストが大きくなりすぎないよう分割して送る。
  // 削除の記録は最初の1回にまとめて載せる。
  const sentDeletions = deletions;
  const batches = [];
  for (let i = 0; i < parks.length; i += PUSH_CHUNK) batches.push({ parks: parks.slice(i, i + PUSH_CHUNK), trees: [] });
  for (let i = 0; i < trees.length; i += PUSH_CHUNK) batches.push({ parks: [], trees: trees.slice(i, i + PUSH_CHUNK) });
  if (!batches.length) batches.push({ parks: [], trees: [] });

  for (let i = 0; i < batches.length; i++) {
    await gasPush(url, token, {
      ...batches[i],
      deletions: i === 0 ? sentDeletions : [],
    });
  }

  // 送れたぶんだけ控えから消す（送信中に増えたものは次回に回る）
  await db.transaction('rw', db.pending, db.deletions, async () => {
    if (pending.length) await db.pending.bulkDelete(pending.map((p) => p.id));
    if (sentDeletions.length) await db.deletions.bulkDelete(sentDeletions.map((d) => d.id));
  });

  return { records: parks.length + trees.length, deletions: sentDeletions.length };
}

// ------------------------------------------------------------------
// まとめ役
// ------------------------------------------------------------------

let running = null; // 実行中の同期。多重に走らせない

/**
 * 取り込み → 送信 をこの順で行う。
 * 先に取り込むのは、同じレコードを他の端末が直していたときに
 * 「新しい方を採用」の判定をしてから送るため。
 */
export async function syncNow() {
  if (running) return running;
  const { url } = await getGasConfig();
  if (!url) {
    setStatus({ state: 'off', message: 'GASのURLが未設定です', error: '' });
    return { skipped: true };
  }

  setStatus({ state: 'syncing', message: '同期中…', error: '' });
  running = (async () => {
    try {
      const pulled = await pullFromGas();
      const pushed = await pushToGas();
      const at = nowIso();
      await setSetting(SYNC_SETTING_KEYS.lastSyncedAt, at);
      retryIndex = 0;
      setStatus({
        state: 'idle',
        lastSyncedAt: at,
        pending: await countPendingSync(),
        error: '',
        message: `同期しました（取込 ${pulled.put}件 / 送信 ${pushed.records}件）`,
      });
      return { pulled, pushed };
    } catch (err) {
      const message = err?.message ?? String(err);
      setStatus({
        state: 'error',
        error: message,
        message: '同期できませんでした',
        pending: await countPendingSync(),
      });
      throw err;
    } finally {
      running = null;
    }
  })();
  return running;
}

/** アプリ起動時。設定があればシートの内容を取り込み、送信待ちがあれば送る。 */
export async function syncOnStartup() {
  await refreshStatus();
  const { url } = await getGasConfig();
  if (!url) return { skipped: true };
  try {
    return await syncNow();
  } catch {
    // 起動を止めない。状態バーにエラーが出る
    return { failed: true };
  }
}

// ------------------------------------------------------------------
// 自動保存
// ------------------------------------------------------------------

let pushTimer = null;
let retryTimer = null;
let retryIndex = 0;
let started = false;

function clearTimers() {
  if (pushTimer) clearTimeout(pushTimer);
  if (retryTimer) clearTimeout(retryTimer);
  pushTimer = null;
  retryTimer = null;
}

/** いま送信待ちのものをシートへ送る（自動保存の本体） */
async function runAutoPush() {
  pushTimer = null;
  const { url, auto } = await getGasConfig();
  if (!url || !auto) return;
  if (running) {
    // 手動同期の最中なら、それが終わってから送り直す
    queueAutoPush(AUTO_PUSH_DELAY);
    return;
  }
  const pending = await countPendingSync();
  const deletions = await db.deletions.count();
  if (!pending && !deletions) {
    setStatus({ pending: 0 });
    return;
  }

  setStatus({ state: 'syncing', message: '保存中…', pending, error: '' });
  try {
    const pushed = await pushToGas();
    const at = nowIso();
    await setSetting(SYNC_SETTING_KEYS.lastSyncedAt, at);
    retryIndex = 0;
    setStatus({
      state: 'idle',
      lastSyncedAt: at,
      pending: await countPendingSync(),
      error: '',
      message: pushed.records ? `シートに保存しました（${pushed.records}件）` : '',
    });
  } catch (err) {
    const wait = RETRY_DELAYS[Math.min(retryIndex, RETRY_DELAYS.length - 1)];
    retryIndex += 1;
    setStatus({
      state: 'error',
      error: err?.message ?? String(err),
      message: `保存できませんでした（${Math.round(wait / 1000)}秒後に再送します）`,
      pending: await countPendingSync(),
    });
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      runAutoPush();
    }, wait);
  }
}

/** 少し待ってから送る（連続登録をまとめて1回にする） */
function queueAutoPush(delay = AUTO_PUSH_DELAY) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(runAutoPush, delay);
}

/**
 * 自動保存を始める。App の起動時に1回だけ呼ぶ。
 * 端末内DBの書き換え・オンライン復帰・画面を閉じる操作を見張る。
 */
export function startAutoSync() {
  if (started) return () => {};
  started = true;

  const offChange = onLocalChange(async () => {
    setStatus({ pending: await countPendingSync() });
    queueAutoPush();
  });

  const onOnline = () => {
    retryIndex = 0;
    queueAutoPush(500);
  };
  const onVisibility = () => {
    // 画面を閉じる／別アプリに移るとき、送信待ちがあればすぐ送る
    if (document.visibilityState === 'hidden' && status.pending > 0) queueAutoPush(0);
    if (document.visibilityState === 'visible') queueAutoPush(1500);
  };

  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    started = false;
    offChange();
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisibility);
    clearTimers();
  };
}

/** 設定タブから手で送るとき（待たずに送る） */
export function flushAutoPush() {
  queueAutoPush(0);
}
