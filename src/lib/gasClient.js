// GAS（Google Apps Script）Web App への通信だけを担当する。
//
// なぜ Content-Type が text/plain なのか:
//   GAS の Web App はレスポンスに自前で CORS ヘッダーを付けられない。
//   application/json で送るとブラウザが事前確認（プリフライト＝OPTIONSリクエスト）を
//   投げてしまい、GAS はそれに答えられないので失敗する。
//   text/plain・form・multipart のいずれかなら「単純リクエスト」扱いになり
//   プリフライトが飛ばないので通る。中身は JSON 文字列のまま送ってよい。
//
// GAS の /exec は script.googleusercontent.com へ302リダイレクトする。
// fetch は既定でリダイレクトを追うので、こちら側の対応は要らない。

// GAS は初回（コールドスタート＋シート作成）だけ十数秒かかることがあるので長めに取る
const DEFAULT_TIMEOUT = 45000; // 45秒

export class GasError extends Error {
  constructor(message, { kind = 'error' } = {}) {
    super(message);
    this.name = 'GasError';
    this.kind = kind; // 'network' | 'auth' | 'server' | 'config' | 'error'
  }
}

/** 設定された文字列が GAS Web App のURLとして妥当か */
export function isGasUrl(url) {
  return /^https:\/\/script\.google(usercontent)?\.com\/.+/.test(String(url ?? '').trim());
}

/**
 * GAS Web App を呼ぶ。
 * @param {string} url     Web App のURL（末尾が /exec）
 * @param {object} payload {action:'pull'|'push'|'ping', ...}
 * @returns {Promise<object>} GAS が返した JSON（ok:true のときだけ返る）
 */
export async function callGas(url, payload, { timeout = DEFAULT_TIMEOUT } = {}) {
  const endpoint = String(url ?? '').trim();
  if (!endpoint) throw new GasError('GASのURLが設定されていません。', { kind: 'config' });
  if (!isGasUrl(endpoint)) {
    throw new GasError(
      'GASのURLの形が違います（https://script.google.com/… で終わりが /exec のURLを貼ってください）。',
      { kind: 'config' },
    );
  }
  if (/\/dev\/?$/.test(endpoint)) {
    throw new GasError(
      'URLの末尾が /dev になっています。これは本人しか開けないテスト用URLです。' +
        '「デプロイ」で作った末尾 /exec のURLを貼り付けてください。',
      { kind: 'config' },
    );
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new GasError('オフラインです。電波の届くところで再度お試しください。', { kind: 'network' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      // CORSのプリフライトを避けるため text/plain。中身はJSON文字列。
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new GasError(
        'GASの応答がありませんでした（タイムアウト）。Web AppのURLをブラウザで開いて、' +
          'JSONが返るか確かめてください。',
        { kind: 'network' },
      );
    }
    throw new GasError(`GASに接続できませんでした（${err?.message ?? err}）。`, { kind: 'network' });
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();

  // アクセス権が「自分だけ」のままだと、JSONではなくGoogleのログインHTMLが返る
  if (/^\s*</.test(text)) {
    throw new GasError(
      'GASからJSONではなくHTML（ログイン画面）が返りました。デプロイ設定の' +
        '「アクセスできるユーザー」を「全員」にして、' +
        '「デプロイを管理 → 編集 → 新しいバージョン」で再デプロイしてください。' +
        'URLの末尾が /exec になっているかも確認してください（/dev では動きません）。',
      { kind: 'auth' },
    );
  }
  if (!res.ok) {
    throw new GasError(`GASがエラーを返しました（HTTP ${res.status}）。`, { kind: 'server' });
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new GasError('GASの返事をJSONとして読み取れませんでした。', { kind: 'server' });
  }
  if (data?.ok === false) {
    throw new GasError(data.error || 'GAS側でエラーが起きました。', { kind: 'server' });
  }
  return data;
}

/** 疎通確認。シート名と件数が返る。 */
export function gasPing(url, token) {
  return callGas(url, { action: 'ping', token });
}

/** シートの全内容を取り出す（起動時の反映に使う） */
export function gasPull(url, token, { since = null } = {}) {
  return callGas(url, { action: 'pull', token, since });
}

/** 変更ぶんをシートへ書き込む（自動保存） */
export function gasPush(url, token, { parks = [], trees = [], deletions = [] }) {
  return callGas(url, { action: 'push', token, parks, trees, deletions });
}
