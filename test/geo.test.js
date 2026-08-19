// 座標パースのテスト。v27 の src/logic/geo.test.js をそのまま持ってきて、
// 本アプリ固有の分（誤差メッセージなど）を足したもの。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLatLng,
  formatCoord,
  formatLatLng,
  mapUrl,
  isValidLat,
  isValidLng,
  geolocationErrorMessage,
  SOURCE_LABEL,
} from '../src/lib/geo.js';

const near = (a, b, tol = 1e-4) => Math.abs(a - b) < tol;

test('parseLatLng: 緯度経度ペア（カンマ・スラッシュ・空白）', () => {
  for (const s of ['35.0116, 135.7681', '35.0116/135.7681', '35.0116 135.7681', '35.0116、135.7681']) {
    const r = parseLatLng(s);
    assert.equal(r.ok, true, s);
    assert.ok(near(r.lat, 35.0116) && near(r.lng, 135.7681), s);
  }
});

test('parseLatLng: Googleマップのリンク（q= / @ / !3d!4d）', () => {
  const q = parseLatLng('https://www.google.com/maps?q=35.011600,135.768100');
  assert.ok(q.ok && near(q.lat, 35.0116) && near(q.lng, 135.7681));

  const at = parseLatLng('https://www.google.com/maps/@35.0116,135.7681,18z');
  assert.ok(at.ok && near(at.lat, 35.0116) && near(at.lng, 135.7681));

  // ピン位置(!3d!4d)は表示中心(@)より優先する
  const pin = parseLatLng(
    'https://www.google.com/maps/place/X/@35.0000,135.0000,17z/data=!3m1!4b1!4m5!3d35.0116!4d135.7681',
  );
  assert.ok(pin.ok && near(pin.lat, 35.0116) && near(pin.lng, 135.7681));
});

test('parseLatLng: 度分秒（半球記号あり・順序が逆でも緯経を判別）', () => {
  const a = parseLatLng('35°00\'41.8"N 135°46\'05.2"E');
  assert.ok(a.ok && near(a.lat, 35.0116) && near(a.lng, 135.768111));

  const b = parseLatLng('E135°46\'05.2" N35°00\'41.8"');
  assert.ok(b.ok && near(b.lat, 35.0116) && near(b.lng, 135.768111));

  const s = parseLatLng('35°00\'41.8"S 135°46\'05.2"W');
  assert.ok(s.ok && near(s.lat, -35.0116) && near(s.lng, -135.768111));
});

test('parseLatLng: 度のみ＋日本語の半球記号（北・東）', () => {
  const a = parseLatLng('北35.01394°, 東135.85369°');
  assert.equal(a.ok, true);
  assert.ok(near(a.lat, 35.01394) && near(a.lng, 135.85369));

  // 南・西はマイナスになる
  const b = parseLatLng('南35.01394°, 西135.85369°');
  assert.ok(near(b.lat, -35.01394) && near(b.lng, -135.85369));

  // 経度→緯度の順で書かれていても記号で判別する
  const c = parseLatLng('東135.85369° 北35.01394°');
  assert.ok(near(c.lat, 35.01394) && near(c.lng, 135.85369));
});

test('parseLatLng: 度のみ＋英字の半球記号／度記号だけ', () => {
  const a = parseLatLng('N35.01394 E135.85369');
  assert.ok(a.ok && near(a.lat, 35.01394) && near(a.lng, 135.85369));

  const b = parseLatLng('35.01394°, 135.85369°');
  assert.ok(b.ok && near(b.lat, 35.01394) && near(b.lng, 135.85369));

  // 「度」表記
  const c = parseLatLng('北緯35.01394度 東経135.85369度');
  assert.ok(c.ok && near(c.lat, 35.01394) && near(c.lng, 135.85369));
});

test('parseLatLng: 度のみ表記でもフル桁を落とさない', () => {
  const r = parseLatLng('北35.01776443639602°, 東135.85462927807734°');
  assert.equal(r.lat, 35.01776443639602);
  assert.equal(r.lng, 135.85462927807734);
});

test('parseLatLng: 度のみ表記が既存の形式を壊さない', () => {
  // 度分秒はこれまでどおり
  const dms = parseLatLng('35°00\'41.8"N 135°46\'05.2"E');
  assert.ok(dms.ok && near(dms.lat, 35.0116) && near(dms.lng, 135.768111));
  // URLはこれまでどおり（小文字の e や n を半球記号と誤解しない）
  const url = parseLatLng('https://www.google.com/maps?q=35.011600,135.768100');
  assert.ok(url.ok && near(url.lat, 35.0116) && near(url.lng, 135.7681));
});

test('parseLatLng: 短縮リンクは読めない旨を返す', () => {
  const r = parseLatLng('https://maps.app.goo.gl/abcdefg');
  assert.equal(r.ok, false);
  assert.match(r.reason, /短縮リンク/);
});

test('parseLatLng: 空文字・読み取り不能・範囲外', () => {
  assert.equal(parseLatLng('').ok, false);
  assert.equal(parseLatLng('   ').ok, false);
  assert.equal(parseLatLng('現地の大きなケヤキ').ok, false);
  assert.equal(parseLatLng('皇子が丘公園').ok, false);
  // 緯度と経度が逆（緯度に135）→ 範囲外として弾く
  const swapped = parseLatLng('135.768100, 35.011600');
  assert.equal(swapped.ok, false);
  assert.match(swapped.reason, /範囲外/);
  assert.equal(parseLatLng('95.0000, 200.0000').ok, false);
});

test('formatCoord / formatLatLng / mapUrl', () => {
  assert.equal(formatCoord(35.012), '35.012');
  assert.equal(formatCoord(''), '');
  assert.equal(formatLatLng(35.0116, 135.7681), '35.0116, 135.7681');
  assert.equal(formatLatLng('', 135.7681), '');
  assert.equal(mapUrl(35.0116, 135.7681), 'https://www.google.com/maps?q=35.0116,135.7681');
});

test('isValidLat / isValidLng', () => {
  assert.equal(isValidLat(35), true);
  assert.equal(isValidLat(90.1), false);
  assert.equal(isValidLng(180), true);
  assert.equal(isValidLng(-180.1), false);
  assert.equal(isValidLat(NaN), false);
});

// --- ここから本アプリ固有 ---

test('フル桁は落とさない（保存する値は丸めない）', () => {
  const r = parseLatLng('35.01776443639602, 135.85462927807734');
  assert.equal(r.lat, 35.01776443639602);
  assert.equal(r.lng, 135.85462927807734);
  // 表示だけ6桁に丸める
  assert.equal(formatLatLng(r.lat, r.lng), '35.017764, 135.854629');
});

test('位置情報エラーは原因ごとの日本語にする', () => {
  assert.match(geolocationErrorMessage({ code: 1 }), /許可されていません/);
  assert.match(geolocationErrorMessage({ code: 3 }), /タイムアウト/);
  assert.match(geolocationErrorMessage(new Error('NO_GEOLOCATION')), /取得できません/);
  // どのメッセージにも代替手段を書き添える
  for (const e of [{ code: 1 }, { code: 2 }, { code: 3 }, {}]) {
    assert.match(geolocationErrorMessage(e), /手入力・貼り付けでも登録できます。$/);
  }
});

test('座標の入力元ラベル（v27 の SOURCE_LABEL と同じ言い回し）', () => {
  assert.equal(SOURCE_LABEL.gps, '現在地');
  assert.equal(SOURCE_LABEL.manual, '手入力');
  assert.equal(SOURCE_LABEL.link, '貼り付け');
  assert.equal(SOURCE_LABEL.map, '地図');
});
