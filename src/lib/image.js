// 写真の縮小。撮影したままの画像は数MBあるため、保存前に必ず通す。

const MAX_EDGE = 1280; // 長辺の上限(px)
const QUALITY = 0.7; // JPEG品質
const THUMB_EDGE = 240; // 一覧・地図用サムネイルの長辺(px)
const THUMB_QUALITY = 0.6;

/** File を <img> として読み込む */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を読み込めませんでした'));
    };
    img.src = url;
  });
}

function drawToDataUrl(img, maxEdge, quality) {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL('image/jpeg', quality);
}

/** 撮影・選択したファイルを保存用（長辺1280 / 品質0.7）に縮小する */
export async function resizePhoto(file) {
  const img = await loadImage(file);
  return drawToDataUrl(img, MAX_EDGE, QUALITY);
}

/** 一覧・地図に出すサムネイル（長辺240）を dataUrl から作る */
export function makeThumb(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(drawToDataUrl(img, THUMB_EDGE, THUMB_QUALITY));
    img.onerror = () => reject(new Error('サムネイルを作成できませんでした'));
    img.src = dataUrl;
  });
}

/** dataUrl のおおよそのバイト数 */
export function dataUrlBytes(dataUrl) {
  if (!dataUrl) return 0;
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((base64.length * 3) / 4);
}

/** バイト数を読みやすい単位にする */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
