// スプレッドシート連携（GAS）の設定。
// ここで GAS Web App のURLを入れると、起動時の取り込みと自動保存が動き出す。
import { useEffect, useState } from 'react';
import {
  getGasConfig,
  refreshStatus,
  saveGasConfig,
  subscribeSync,
  syncNow,
  testConnection,
} from '../../lib/sync.js';
import { markAllPending } from '../../db/db.js';

const fmtWhen = (iso) => {
  if (!iso) return 'まだ同期していません';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'まだ同期していません';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function SyncPanel({ onToast }) {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [auto, setAuto] = useState(true);
  const [status, setStatus] = useState({ state: 'off', pending: 0, lastSyncedAt: null, error: '' });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    getGasConfig().then((cfg) => {
      setUrl(cfg.url);
      setToken(cfg.token);
      setAuto(cfg.auto);
    });
    refreshStatus();
    return subscribeSync(setStatus);
  }, []);

  const handleSave = async () => {
    setBusy(true);
    setNote('');
    try {
      await saveGasConfig({ url, token, auto });
      onToast('連携の設定を保存しました');
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setNote('');
    try {
      await saveGasConfig({ url, token, auto });
      const res = await testConnection();
      const c = res?.counts ?? {};
      setNote(
        `つながりました。シート「${res?.spreadsheet ?? '—'}」 公園 ${c.parks ?? 0}件 / 樹木 ${c.trees ?? 0}件`,
      );
    } catch (err) {
      setNote(`つながりません: ${err?.message ?? err}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSyncNow = async () => {
    setBusy(true);
    setNote('');
    try {
      await saveGasConfig({ url, token, auto });
      const res = await syncNow();
      if (res?.skipped) {
        setNote('GASのURLを入れてから実行してください。');
        return;
      }
      onToast(
        `同期しました（取込 ${res.pulled.put}件 / 削除 ${res.pulled.removed}件 / 送信 ${res.pushed.records}件）`,
      );
    } catch (err) {
      setNote(`同期に失敗しました: ${err?.message ?? err}`);
    } finally {
      setBusy(false);
    }
  };

  // 端末のデータをまるごとシートへ載せ直す（シートを作り直したとき用）
  const handlePushAll = async () => {
    const ok = window.confirm(
      '端末内のすべての公園・樹木をシートへ送り直します。\n' +
        '（シート側で新しいものは上書きされません。写真は送りません）\n\n実行しますか？',
    );
    if (!ok) return;
    setBusy(true);
    setNote('');
    try {
      const n = await markAllPending();
      const res = await syncNow();
      onToast(`${n}件を送信待ちにし、${res?.pushed?.records ?? 0}件を送りました`);
    } catch (err) {
      setNote(`送信に失敗しました: ${err?.message ?? err}`);
    } finally {
      setBusy(false);
    }
  };

  const stateLabel = {
    off: '未設定',
    idle: '待機中',
    syncing: '同期中…',
    error: 'エラー',
  }[status.state] ?? '—';

  return (
    <section className="block">
      <h3 className="block-title">スプレッドシート連携（GAS）</h3>

      <p className="hint">
        GAS（Google Apps Script）のWeb Appを中継して、登録内容をスプレッドシートに保存します。
        アプリを開くたびにシートの内容を取り込み、登録・編集・削除のたびに自動でシートへ送ります。
        <strong>写真はシートに送りません</strong>（容量が大きいため端末内とJSONバックアップで扱います）。
      </p>

      <p className={status.state === 'error' ? 'status status-error' : 'hint'}>
        状態: {stateLabel}
        {status.pending > 0 && ` / 送信待ち ${status.pending}件`}
        {` / 最終同期 ${fmtWhen(status.lastSyncedAt)}`}
        {status.error && <><br />{status.error}</>}
      </p>

      <label className="field">
        <span className="field-label">GAS Web App のURL（末尾が /exec）</span>
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://script.google.com/macros/s/××××/exec"
        />
      </label>

      <label className="field">
        <span className="field-label">合言葉（GAS側で SYNC_TOKEN を設定したときだけ・任意）</span>
        <div className="link-row">
          <input
            type={showToken ? 'text' : 'password'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="未設定なら空のまま"
            autoComplete="off"
          />
          <button type="button" className="btn btn-ghost" onClick={() => setShowToken((v) => !v)}>
            {showToken ? '隠す' : '表示'}
          </button>
        </div>
      </label>

      <label className="check-row">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
        <span>自動保存する（登録・編集・削除のたびにシートへ送る）</span>
      </label>

      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={busy}>
          保存
        </button>
        <button type="button" className="btn" onClick={handleTest} disabled={busy || !url}>
          接続テスト
        </button>
        <button type="button" className="btn" onClick={handleSyncNow} disabled={busy || !url}>
          今すぐ同期
        </button>
      </div>

      <div className="btn-row">
        <button
          type="button"
          className="btn btn-ghost btn-wrap"
          onClick={handlePushAll}
          disabled={busy || !url}
        >
          端末の全データをシートへ送る
        </button>
      </div>

      {note && <p className="status">{note}</p>}

      <p className="hint">
        設置のしかたは <code>gas/README.md</code> にあります。スプレッドシートに
        <code>gas/Code.gs</code> を貼り付け、「ウェブアプリ」としてデプロイし（アクセスは「全員」）、
        表示されたURLをここに貼り付けてください。
      </p>
    </section>
  );
}
