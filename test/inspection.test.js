// 点検内容（現地チェックシート1ページ目）のテスト。実行: npm test（node --test）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
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
