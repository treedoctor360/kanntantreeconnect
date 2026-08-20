// 座標の解釈と整形（DOM非依存の純粋関数）＋ 現在地の取得。
//
// 前半（isValidLat 〜 parseLatLng）は v27 の src/logic/geo.js をそのまま持ってきている。
// 関数名・戻り値の形（{ok, lat, lng} / {ok:false, reason}）も v27 に合わせてあるので、
// 向こうを直したらこちらにも反映すること。
//
// 想定する貼り付け元:
//   - Googleマップのリンク（アドレスバーのURL）
//   - 「35.011600, 135.768100」のような緯度経度ペア
//   - 度分秒表記「35°00'41.8"N 135°46'05.2"E」

export const isValidLat = (v) => Number.isFinite(v) && v >= -90 && v <= 90;
export const isValidLng = (v) => Number.isFinite(v) && v >= -180 && v <= 180;

// 表示用に桁を丸める。末尾の余分な0は落とす（35.012000 → 35.012）。
export function formatCoord(v, digits = 6) {
  // 空文字は Number('') === 0 になってしまうため、数値化する前に弾く
  if (v == null || String(v).trim() === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return String(Number(n.toFixed(digits)));
}

export function formatLatLng(lat, lng, digits = 6) {
  const a = formatCoord(lat, digits);
  const b = formatCoord(lng, digits);
  return a && b ? `${a}, ${b}` : '';
}

// 座標を地図で目視確認するためのGoogleマップURL。
export function mapUrl(lat, lng) {
  return `https://www.google.com/maps?q=${formatCoord(lat)},${formatCoord(lng)}`;
}

const num = (s) => Number(String(s).trim());

// 度分秒（35°00'41.8"N / N35°00'41.8" …）。全角の「度分秒」やプライム記号にも対応。
// 半球記号（N/S/E/W）は空白を挟まず隣接している側の座標に属するとみなす。
// そのため末尾側（グループ5）の前には \s* を置かない。これを許すと
// 「E135°46'05.2" N35°00'41.8"」の N を1つ目の末尾記号として食ってしまう。
const DMS_RE = /([NSEW])?\s*(\d{1,3})\s*[°度]\s*(\d{1,2})\s*[′'’分]\s*([\d.]+)\s*[″"”秒]?([NSEW])?/gi;

function dmsToDeg(d, m, s, hemi) {
  const v = Math.abs(d) + m / 60 + s / 3600;
  return /[SW]/i.test(hemi || '') ? -v : v;
}

function parseDms(text) {
  const hits = [...String(text).matchAll(DMS_RE)];
  if (hits.length < 2) return null;
  const vals = hits.slice(0, 2).map((h) => {
    const hemi = h[1] || h[5] || '';
    return { deg: dmsToDeg(num(h[2]), num(h[3]), num(h[4]), hemi), hemi: hemi.toUpperCase() };
  });
  // 半球記号（N/S/E/W）があればそれで緯度・経度を決める。無ければ「緯度→経度」の順とみなす。
  const lat = vals.find((v) => v.hemi === 'N' || v.hemi === 'S') || vals[0];
  let lng = vals.find((v) => v.hemi === 'E' || v.hemi === 'W');
  // 緯度に選んだものと同じになった場合（記号が片方しか無い等）は残りを経度にする
  if (!lng || lng === lat) lng = vals.find((v) => v !== lat);
  if (!lat || !lng) return null;
  return { lat: lat.deg, lng: lng.deg };
}

// URLから座標を拾う。優先度: 明示クエリ(q/ll等) > ピン位置(!3d!4d) > 表示中心(@)
// 表示中心(@)は「地図の中心」であってピンとは限らないため最後に見る。
function parseUrl(text) {
  const s = String(text);
  const pairs = [
    /[?&](?:q|ll|center|daddr|saddr|sll|mlat)=(-?\d{1,3}(?:\.\d+)?)[,%2C]+\s*(-?\d{1,3}(?:\.\d+)?)/i,
    /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/,
    /@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
  ];
  for (const re of pairs) {
    const m = s.match(re);
    if (m) return { lat: num(m[1]), lng: num(m[2]) };
  }
  return null;
}

// 半球記号。日本語（北南東西）と英字（NSEW）のどちらでも受ける。
const HEMI = { 北: 'N', 南: 'S', 東: 'E', 西: 'W', N: 'N', S: 'S', E: 'E', W: 'W' };

// 度だけの表記（分秒なし）。iOSの「マップ」やGPSアプリがこの形で出す。
//   「北35.01394°, 東135.85369°」「N35.01394 E135.85369」「35.01394°, 135.85369°」
// 英字の半球記号は大文字だけ見る（URL中の小文字の e や n を拾わないため）。
// 末尾側（グループ3）の前に \s* を置かないのは parseDms と同じ理由。これを許すと
// 「35.01394度 東135.85369度」の「東」を1つ目の末尾記号として食ってしまう。
const DEG_TOKEN = /([北南東西NSEW])?\s*(-?\d{1,3}(?:\.\d+)?)\s*[°度]?([北南東西NSEW])?/g;

function parseDecimalDegrees(text) {
  // 「北緯」「東経」は「北」「東」と同じ扱いにする
  const s = String(text).trim().replace(/[緯経]/g, '');
  // 分秒があるものは parseDms に任せる
  if (/[′'’分″"”秒]/.test(s)) return null;
  // 半球記号か度記号が無ければ、ただの数字の並びなので parseDecimalPair に任せる
  if (!/[北南東西NSEW°度]/.test(s)) return null;

  const vals = [];
  for (const m of s.matchAll(DEG_TOKEN)) {
    if (m[2] === undefined) continue;
    const mark = m[1] || m[3] || '';
    vals.push({ deg: Number(m[2]), hemi: HEMI[mark] ?? '' });
  }
  if (vals.length < 2) return null;

  const two = vals.slice(0, 2);
  const signed = (v) => (v.hemi === 'S' || v.hemi === 'W' ? -Math.abs(v.deg) : v.deg);
  // 半球記号があればそれで緯度・経度を決める。無ければ「緯度→経度」の順とみなす。
  let lat = two.find((v) => v.hemi === 'N' || v.hemi === 'S');
  let lng = two.find((v) => v.hemi === 'E' || v.hemi === 'W');
  if (!lat && !lng) [lat, lng] = two;
  else if (!lat) lat = two.find((v) => v !== lng);
  else if (!lng) lng = two.find((v) => v !== lat);
  if (!lat || !lng) return null;
  return { lat: signed(lat), lng: signed(lng) };
}

// 「35.0116, 135.7681」「35.0116/135.7681」「35.0116 135.7681」
function parseDecimalPair(text) {
  const m = String(text).match(/(-?\d{1,3}(?:\.\d+)?)\s*[,、/\s]\s*(-?\d{1,3}(?:\.\d+)?)/);
  return m ? { lat: num(m[1]), lng: num(m[2]) } : null;
}

/**
 * 座標らしき文字列を解釈する。Googleマップのリンク／緯度経度ペア／度分秒に対応。
 * @param {string} text
 * @returns {{ok:true, lat:number, lng:number} | {ok:false, reason:string}}
 */
export function parseLatLng(text) {
  const s = String(text || '').trim();
  if (!s) return { ok: false, reason: '座標が入力されていません。' };
  // 短縮URLはブラウザからリダイレクト先を読めない（CORS制限）。展開後のURLを貼ってもらう。
  if (/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(s)) {
    return {
      ok: false,
      reason:
        '短縮リンクは展開できません。マップで開き直して、アドレスバーのURLか緯度経度を貼り付けてください。',
    };
  }
  const hit =
    (/https?:\/\//i.test(s) ? parseUrl(s) : null) ||
    parseDms(s) ||
    parseDecimalDegrees(s) ||
    parseUrl(s) ||
    parseDecimalPair(s);
  if (!hit) {
    return {
      ok: false,
      reason:
        '座標を読み取れませんでした（例: 35.011600, 135.768100 / 北35.01394°, 東135.85369° / Googleマップのリンク）。',
    };
  }
  if (!isValidLat(hit.lat) || !isValidLng(hit.lng)) {
    return {
      ok: false,
      reason:
        '数値が範囲外です（緯度 -90〜90、経度 -180〜180）。緯度と経度が逆になっていないか確認してください。',
    };
  }
  return { ok: true, lat: hit.lat, lng: hit.lng };
}

// ------------------------------------------------------------------
// ここから下は本アプリ固有。v27 では GeoField.jsx の中に直接書かれている部分を
// 関数として切り出したもの。
// ------------------------------------------------------------------

/** 座標をどの経路で入れたか（tree.coordSource）の表示名 */
export const SOURCE_LABEL = { gps: '現在地', manual: '手入力', link: '貼り付け', map: '地図' };

/**
 * 現在地を取得する。
 * enableHighAccuracy: GPSを使う / timeout: 10秒 / maximumAge: 0（キャッシュを使わない）
 * ※ v27 は timeout 15秒・maximumAge 指定なし。本アプリは CLAUDE.md 3-2 の指定に従う。
 */
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('NO_GEOLOCATION'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

/** 位置情報エラーを日本語のメッセージにする（CLAUDE.md 3-2: 許可拒否／タイムアウト／取得不可） */
export function geolocationErrorMessage(err) {
  const tail = '手入力・貼り付けでも登録できます。';
  if (err?.message === 'NO_GEOLOCATION') {
    return `この端末では位置情報を取得できません。${tail}`;
  }
  switch (err?.code) {
    case 1: // PERMISSION_DENIED
      return `位置情報の利用が許可されていません。ブラウザの設定で許可してください。${tail}`;
    case 2: // POSITION_UNAVAILABLE
      return `位置情報を取得できませんでした。空の見える場所で試してください。${tail}`;
    case 3: // TIMEOUT
      return `位置情報の取得がタイムアウトしました。もう一度お試しください。${tail}`;
    default:
      return `位置情報を取得できませんでした。${tail}`;
  }
}
