// 地図まわりの共通設定。
import L from 'leaflet';

// タイルは国土地理院（CLAUDE.md 2章）。v27 は OpenStreetMap を使っている。
export const GSI_TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png';
export const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">国土地理院</a>';

// Leaflet の既定マーカー画像はバンドラ経由だとパスがずれるため、
// data URL の簡易ピン（緑の雫）を使う。v27 の LocationPicker.jsx と同じもの。
const PIN_SVG =
  'data:image/svg+xml;charset=UTF-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42">' +
      '<path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.7 23.3 0 15 0z" fill="#2e7d32"/>' +
      '<circle cx="15" cy="15" r="6" fill="#fff"/></svg>',
  );

/** 座標補正用のピン */
export const pinIcon = L.icon({ iconUrl: PIN_SVG, iconSize: [30, 42], iconAnchor: [15, 42] });

/**
 * 地図タブの樹木ピン（番号ラベル付き）。
 * 1公園に何十本も並ぶので、雫ピンではなく小さい点＋番号にしている。
 */
export function treeIcon(label) {
  const safe = String(label ?? '').replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return L.divIcon({
    className: 'tree-icon',
    html: `<span class="tree-dot"></span><span class="tree-label">${safe}</span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}
