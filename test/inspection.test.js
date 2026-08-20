// 点検内容（現地チェックシート1ページ目）のテスト。実行: npm test（node --test）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CAVITY_PART,
  ENV_ITEMS,
  FUNGUS_PART,
  INSPECTION_FIELDS,
  SURVEY_FIELDS,
  emptyInspection,
  hasInspection,
  hasPart,
  inspectionBadges,
  partList,
  pickInspection,
  toDateInput,
  togglePart,
  urgentNotes,
} from '../src/lib/inspection.js';

test('キノコ部位: 文字列と配列を行き来する', () => {
  assert.deepEqual(partList(''), []);
  assert.deepEqual(partList('根・幹'), ['根', '幹']);
  assert.deepEqual(partList(null), []);
});

test('キノコ部位: 区切りは・以外（カンマ・スラッシュ・空白）でも読める', () => {
  assert.deepEqual(partList('根,幹'), ['根', '幹']);
  assert.deepEqual(partList('根 / 枝'), ['根', '枝']);
});

test('キノコ部位: 知らない文字は落とす', () => {
  assert.deepEqual(partList('根・葉・幹'), ['根', '幹']);
});

test('キノコ部位: 並びは常にシートの順（根 幹 枝 枯 不）', () => {
  assert.equal(togglePart('枝', '根'), '根・枝');
  assert.equal(togglePart('不・根', '幹'), '根・幹・不');
});

test('キノコ部位: もう一度押すと外れる', () => {
  assert.equal(togglePart('根・幹', '根'), '幹');
  assert.equal(togglePart('根', '根'), '');
});

test('キノコ部位: hasPart', () => {
  assert.equal(hasPart('根・枯', '枯'), true);
  assert.equal(hasPart('根・枯', '幹'), false);
});

test('一覧バッジ: 「有」だったものだけ出す', () => {
  assert.deepEqual(inspectionBadges({ fungus: '有', cavity: '無', frass: '未' }), ['キノコ']);
  assert.deepEqual(inspectionBadges({ fungus: '有', cavity: '有', frass: '有' }), [
    'キノコ',
    '空洞・傷',
    'フラス',
  ]);
  assert.deepEqual(inspectionBadges({}), []);
});

test('点検内容が入っているかの判定', () => {
  assert.equal(hasInspection({}), false);
  assert.equal(hasInspection({ leafDensity: '' }), false);
  assert.equal(hasInspection({ leafDensity: '普' }), true);
  assert.equal(hasInspection({ caution: '根元に亀裂' }), true);
});

test('樹木レコードから点検内容だけ取り出す（無い項目は空文字）', () => {
  const picked = pickInspection({ treeNo: 'P001-001', fungus: '有', fungusPart: '根' });
  assert.deepEqual(picked, {
    ...emptyInspection(),
    fungus: '有',
    fungusPart: '根',
  });
});

test('調査日の初期値は YYYY-MM-DD', () => {
  assert.equal(toDateInput(new Date(2026, 7, 20)), '2026-08-20');
  assert.equal(toDateInput(new Date(2026, 0, 5)), '2026-01-05');
});

// CLAUDE.md 13-6「列を足すときは3か所そろえる」を機械で確かめる。
// アプリで持っている点検項目が、GAS のシート列から漏れていないこと。
test('GAS の trees シート列に、点検内容と調査情報がすべて入っている', () => {
  const gas = readFileSync(new URL('../gas/Code.gs', import.meta.url), 'utf8');
  const block = gas.slice(gas.indexOf('trees: ['));
  const columns = block.slice(0, block.indexOf(']')).match(/'([^']+)'/g).map((s) => s.slice(1, -1));

  for (const field of [...INSPECTION_FIELDS, ...SURVEY_FIELDS, 'photoCount']) {
    assert.ok(columns.includes(field), `gas/Code.gs の trees に ${field} が無い`);
  }
  // サムネイルは送らない（セル上限を圧迫するため）
  assert.equal(columns.includes('thumb'), false);
});

test('キノコ部位の選択肢はシートの1文字表記', () => {
  assert.deepEqual(FUNGUS_PART.map((p) => p.code), ['根', '幹', '枝', '枯', '不']);
});


// --- スプレッドシートで追加された項目（樹高 / 空洞・傷の位置 / 周辺環境） ---

test('空洞・傷の位置は 根 幹 枝 の3つ。並びもその順', () => {
  assert.deepEqual(CAVITY_PART.map((p) => p.code), ['根', '幹', '枝']);
  assert.equal(togglePart('枝', '根', CAVITY_PART), '根・枝');
  assert.equal(hasPart('根・枝', '幹', CAVITY_PART), false);
});

test('空洞・傷の位置は キノコ部位の選択肢に引きずられない', () => {
  // '枯' はキノコ部位にしかないので、空洞・傷の位置では落とす
  assert.deepEqual(partList('根・枯', CAVITY_PART), ['根']);
  assert.deepEqual(partList('根・枯', FUNGUS_PART), ['根', '枯']);
});

test('周辺環境は 道路・園路 / 電線 / 建物 の3つ', () => {
  assert.deepEqual(ENV_ITEMS.map((e) => e.key), ['envRoad', 'envWire', 'envBuilding']);
});

test('点検内容に樹高と周辺環境が含まれる（GASの列チェックが効くように）', () => {
  const empty = emptyInspection();
  for (const key of ['height', 'cavityPart', 'envRoad', 'envWire', 'envBuilding', 'envNote']) {
    assert.equal(key in empty, true, `${key} が emptyInspection に無い`);
  }
});

test('樹高だけ入れても「点検内容あり」と判定する', () => {
  assert.equal(hasInspection({ height: 8 }), true);
});

test('すぐ連絡: 空洞・傷「有」＋道路・園路「有」', () => {
  const notes = urgentNotes({ cavity: '有', envRoad: '有' });
  assert.equal(notes.length, 1);
  assert.match(notes[0], /道路・園路/);
  // 片方だけなら出さない
  assert.deepEqual(urgentNotes({ cavity: '有' }), []);
  assert.deepEqual(urgentNotes({ envRoad: '有' }), []);
});
