// 公園マスタCSVの読み取りテスト（parktreenote と同じ列名を受け付けるか）
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvLine, parseParkCsv, decodeCsvBuffer } from '../src/lib/parkCsv.js';

test('CSV1行のパース（ダブルクオート・カンマ入り）', () => {
  assert.deepEqual(parseCsvLine('a,b,c'), ['a', 'b', 'c']);
  assert.deepEqual(parseCsvLine('"皇子が丘, 公園",P001'), ['皇子が丘, 公園', 'P001']);
  assert.deepEqual(parseCsvLine('"引用""符",x'), ['引用"符', 'x']);
});

test('見出しは 児童遊園地名 / 公園名 / タイトル のいずれでもよい', () => {
  for (const h of ['児童遊園地名', '公園名', 'タイトル']) {
    const r = parseParkCsv(`${h},ID\n皇子が丘公園,123\n`);
    assert.equal(r.ok, true, h);
    assert.equal(r.rows[0].name, '皇子が丘公園');
    assert.equal(r.rows[0].pid, '123');
  }
});

test('緯度・経度の列があれば代表座標として読む', () => {
  const r = parseParkCsv('公園名,緯度,経度\n皇子が丘公園,35.017764,135.854629\n');
  assert.equal(r.rows[0].lat, 35.017764);
  assert.equal(r.rows[0].lng, 135.854629);
});

test('座標の列が無い・空なら null', () => {
  const r = parseParkCsv('公園名\n皇子が丘公園\n');
  assert.equal(r.rows[0].lat, null);
  assert.equal(r.rows[0].lng, null);
  const r2 = parseParkCsv('公園名,緯度,経度\n皇子が丘公園,,\n');
  assert.equal(r2.rows[0].lat, null);
});

test('名前が空の行は飛ばす', () => {
  const r = parseParkCsv('公園名\n皇子が丘公園\n\n  \nにおの浜公園\n');
  assert.equal(r.rows.length, 2);
});

test('公園名の列が無ければエラー', () => {
  const r = parseParkCsv('名称,ID\n皇子が丘公園,1\n');
  assert.equal(r.ok, false);
  assert.match(r.reason, /公園名の列が見つかりません/);
});

test('データ行が無ければエラー', () => {
  assert.equal(parseParkCsv('公園名\n').ok, false);
  assert.equal(parseParkCsv('').ok, false);
});

test('文字コード判定: UTF-8のBOMは落とす / 化けたらShift_JISで読み直す', () => {
  const utf8 = new TextEncoder().encode('﻿公園名\n皇子が丘公園\n');
  assert.ok(decodeCsvBuffer(utf8).startsWith('公園名'));

  // Shift_JIS の「公園名」（UTF-8として読むと化ける）
  const sjis = new Uint8Array([0x8c, 0xf6, 0x89, 0x80, 0x96, 0xbc, 0x0a, 0x82, 0xa0, 0x0a]);
  assert.ok(decodeCsvBuffer(sjis).startsWith('公園名'));
});
