// ヘッダー右上の同期バッジ。タップすると今すぐ同期する。
// 「送れているのか」を現場で一目で分かるようにするためのもの。

const ICON = { off: '⚪', idle: '☁️', syncing: '🔄', error: '⚠️' };

export default function SyncBadge({ status, onClick }) {
  const state = status?.state ?? 'off';
  const pending = status?.pending ?? 0;

  const label =
    state === 'off'
      ? '未連携'
      : state === 'syncing'
        ? '同期中'
        : state === 'error'
          ? '未送信あり'
          : pending > 0
            ? `${pending}件待ち`
            : '同期済';

  const title =
    state === 'off'
      ? '設定タブでGASのURLを入れるとスプレッドシートと同期します'
      : status?.error || status?.message || 'タップで今すぐ同期';

  return (
    <button
      type="button"
      className={`syncbadge syncbadge-${state}`}
      onClick={onClick}
      title={title}
      aria-label={`同期状態: ${label}`}
    >
      <span className={`syncbadge-icon ${state === 'syncing' ? 'spin' : ''}`}>
        {ICON[state] ?? '☁️'}
      </span>
      <span className="syncbadge-text">{label}</span>
    </button>
  );
}
