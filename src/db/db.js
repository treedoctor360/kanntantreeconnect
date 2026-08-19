// 端末内DB（IndexedDB）の定義。Dexie は IndexedDB の薄いラッパー。
import Dexie from 'dexie';
import { nextParkCode, nextTreeNo, renameTreeNoPrefix } from '../lib/treeNo.js';
import { findParkByName } from '../lib/parkName.js';

export const db = new Dexie('kantantree');

db.version(1).stores({
  parks: 'id, code, name, lastUsedAt',
  trees: 'id, parkId, treeNo, species, updatedAt, [parkId+treeNo]',
  photos: 'id, treeId', // 写真は別テーブル（一覧の描画を軽くするため）
  settings: 'key', // 樹種マスタ・使用履歴など単一値
});

/** UUID を作る（crypto.randomUUID が無い環境向けの控えも用意） */
export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const nowIso = () => new Date().toISOString();

// ------------------------------------------------------------------
// 設定（単一値）
// ------------------------------------------------------------------

export async function getSetting(key, fallback = null) {
  const row = await db.settings.get(key);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  await db.settings.put({ key, value });
}

/** 樹種マスタ（ユーザーが登録した樹種の並び。初期値は空） */
export const getSpeciesMaster = () => getSetting('speciesMaster', []);
export const setSpeciesMaster = (list) => setSetting('speciesMaster', list);

/** 樹種の使用回数 { '樹種名': 回数 } */
export const getSpeciesUsage = () => getSetting('speciesUsage', {});

/**
 * 樹種を使ったことを記録する。マスタに無ければ追加する。
 * count: false のときは使用回数を増やさず、マスタへの登録だけ行う。
 */
export async function recordSpeciesUse(species, { count = true } = {}) {
  if (!species) return;
  const [master, usage] = await Promise.all([getSpeciesMaster(), getSpeciesUsage()]);
  if (!master.includes(species)) await setSpeciesMaster([...master, species]);
  if (count) await setSetting('speciesUsage', { ...usage, [species]: (usage[species] ?? 0) + 1 });
}

// ------------------------------------------------------------------
// 公園
// ------------------------------------------------------------------

/** 次の公園コードを求める（既存コードの最大値+1） */
export async function suggestParkCode() {
  const parks = await db.parks.toArray();
  return nextParkCode(parks.map((p) => p.code));
}

/** 公園コードの重複チェック（selfId の公園は除く） */
export async function isParkCodeTaken(code, selfId = null) {
  const hit = await db.parks.where('code').equals(code).toArray();
  return hit.some((p) => p.id !== selfId);
}

export async function addPark({ code, name, lat = null, lng = null, note = '' }) {
  const t = nowIso();
  const park = {
    id: uid(),
    code: code.trim(),
    name: name.trim(),
    lat,
    lng,
    note,
    lastUsedAt: t,
    createdAt: t,
    updatedAt: t,
  };
  await db.parks.add(park);
  return park;
}

/**
 * CSVから読んだ公園をまとめて登録する（単一トランザクション）。
 * 既にある公園（名前の正規化キーが一致）は飛ばす。公園コードは続きから自動採番。
 * @returns {{added:number, skipped:number, skippedNames:string[]}}
 */
export async function importParks(rows) {
  let added = 0;
  const skippedNames = [];
  await db.transaction('rw', db.parks, async () => {
    const existing = await db.parks.toArray();
    const codes = existing.map((p) => p.code);
    const pool = [...existing];
    const toAdd = [];
    const t = nowIso();
    // 公園の並びは最終使用日時の降順。全部同じ日時にすると順序が不定になるので、
    // CSVの行順がそのまま並び順になるよう1秒ずつずらす。
    const base = Date.now();
    let i = 0;

    for (const row of rows) {
      const name = String(row.name ?? '').trim();
      if (!name) continue;
      if (findParkByName(pool, name)) {
        skippedNames.push(name);
        continue;
      }
      const code = nextParkCode(codes);
      codes.push(code);
      const park = {
        id: uid(),
        code,
        name,
        lat: Number.isFinite(row.lat) ? row.lat : null,
        lng: Number.isFinite(row.lng) ? row.lng : null,
        note: '',
        // parktreenote 側が持っているID（プリザンター等）。あれば残しておく
        pid: row.pid || '',
        lastUsedAt: new Date(base - i * 1000).toISOString(),
        createdAt: t,
        updatedAt: t,
      };
      toAdd.push(park);
      pool.push(park);
      added += 1;
      i += 1;
    }
    if (toAdd.length) await db.parks.bulkAdd(toAdd);
  });
  return { added, skipped: skippedNames.length, skippedNames };
}

/**
 * 公園を更新する。
 * コードを変えたとき renumber=true なら、配下の樹木の treeNo / parkCode も
 * 単一トランザクション（途中で失敗したら全部取り消される一括処理）で書き換える。
 */
export async function updatePark(id, patch, { renumber = false } = {}) {
  await db.transaction('rw', db.parks, db.trees, async () => {
    const before = await db.parks.get(id);
    if (!before) return;
    const after = { ...before, ...patch, updatedAt: nowIso() };
    await db.parks.put(after);

    if (before.code !== after.code) {
      const trees = await db.trees.where('parkId').equals(id).toArray();
      const updated = trees.map((tree) => ({
        ...tree,
        parkCode: after.code,
        treeNo: renumber ? renameTreeNoPrefix(tree.treeNo, before.code, after.code) : tree.treeNo,
        updatedAt: nowIso(),
      }));
      if (updated.length) await db.trees.bulkPut(updated);
    }
  });
}

/** その公園に属する樹木・写真の件数（削除確認ダイアログ用） */
export async function countParkContents(parkId) {
  const trees = await db.trees.where('parkId').equals(parkId).toArray();
  const ids = trees.map((t) => t.id);
  const photoCount = ids.length ? await db.photos.where('treeId').anyOf(ids).count() : 0;
  return { treeCount: trees.length, photoCount };
}

/** 公園をまるごと削除（配下の樹木・写真も。単一トランザクション） */
export async function deleteParkCascade(parkId) {
  await db.transaction('rw', db.parks, db.trees, db.photos, async () => {
    const treeIds = (await db.trees.where('parkId').equals(parkId).toArray()).map((t) => t.id);
    if (treeIds.length) await db.photos.where('treeId').anyOf(treeIds).delete();
    await db.trees.where('parkId').equals(parkId).delete();
    await db.parks.delete(parkId);
  });
}

/** 公園を「最後に使った」印を付ける（一覧の並び順に使う） */
export async function touchPark(parkId) {
  if (!parkId) return;
  await db.parks.update(parkId, { lastUsedAt: nowIso() });
}

// ------------------------------------------------------------------
// 樹木
// ------------------------------------------------------------------

/** その公園の次の樹木番号 */
export async function suggestTreeNo(parkId, parkCode) {
  if (!parkId || !parkCode) return '';
  const trees = await db.trees.where('parkId').equals(parkId).toArray();
  return nextTreeNo(parkCode, trees.map((t) => t.treeNo));
}

/** 同一公園内の重複チェック（selfId の樹木は除く） */
export async function isTreeNoTaken(parkId, treeNo, selfId = null) {
  if (!parkId || !treeNo) return false;
  const hit = await db.trees.where({ parkId, treeNo }).toArray();
  return hit.some((t) => t.id !== selfId);
}

/**
 * 樹木を保存する（新規・更新の両方）。写真は dataUrl の配列で受け取り、
 * 1本ぶんをまとめて入れ替える。一覧を軽くするため、1枚目の縮小版を
 * tree.thumb として持たせる。
 */
export async function saveTree(tree, photoDataUrls = []) {
  const t = nowIso();
  const record = {
    ...tree,
    id: tree.id ?? uid(),
    registeredAt: tree.registeredAt ?? t,
    updatedAt: t,
  };
  await db.transaction('rw', db.trees, db.photos, db.parks, async () => {
    await db.trees.put(record);
    await db.photos.where('treeId').equals(record.id).delete();
    if (photoDataUrls.length) {
      await db.photos.bulkAdd(
        photoDataUrls.map((dataUrl, i) => ({
          id: uid(),
          treeId: record.id,
          dataUrl,
          order: i,
          takenAt: t,
        })),
      );
    }
    if (record.parkId) await db.parks.update(record.parkId, { lastUsedAt: t });
  });
  return record;
}

export async function getTreePhotos(treeId) {
  const photos = await db.photos.where('treeId').equals(treeId).toArray();
  return photos.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** 樹木を削除（写真も一緒に。単一トランザクション） */
export async function deleteTrees(treeIds) {
  if (!treeIds.length) return;
  await db.transaction('rw', db.trees, db.photos, async () => {
    await db.photos.where('treeId').anyOf(treeIds).delete();
    await db.trees.bulkDelete(treeIds);
  });
}

/** ストレージ使用量の概算（ブラウザが対応していれば） */
export async function estimateStorage() {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage: usage ?? 0, quota: quota ?? 0 };
  } catch {
    return null;
  }
}
