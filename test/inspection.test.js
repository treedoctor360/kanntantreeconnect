// 点検内容（現地チェックシート1ページ目）のテスト。実行: npm test（node --test）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CAVITY,
  CAVITY_PART,
  ENV_ITEMS,
  FUNGUS,
  FUNGUS_PART,
  INSPECTION_FIELDS,
  LEAF_DENSITY,
  SURVEY_FIELDS,
  ALERT_LABELS,
  TREE_FORM,
  VEG_CLASS,
  VIGOR,
  alertLevel,
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
    '空洞',
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
  assert.deepEqual(FUNGUS_PART.map((p) => p.value), ['根', '幹', '枝', '枯', '不']);
});


// --- スプレッドシートで追加された項目（樹高 / 空洞・傷の位置 / 周辺環境） ---

test('空洞・傷の位置は 根 幹 枝 の3つ。並びもその順', () => {
  assert.deepEqual(CAVITY_PART.map((p) => p.value), ['根', '幹', '枝']);
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

test('すぐ連絡: 根元のキノコは大小に関わらず（大小を条件にしない）', () => {
  // キノコの大小は腐朽の程度の目安にならないので、根元にあれば大小を問わず連絡させる
  const notes = urgentNotes({ fungus: '有', fungusPart: '根' });
  assert.equal(notes.length, 1);
  assert.match(notes[0], /根元/);
  // 「大きいものだけ」に絞る文言を復活させない
  assert.doesNotMatch(notes[0], /大きい/);
  // 幹だけ（根を含まない）なら根元の注意は出さない
  assert.deepEqual(urgentNotes({ fungus: '有', fungusPart: '幹' }), []);
});


// --- 樹幹の揺らぎ/傾斜/亀裂（国交省 主要項目）/ 結合部の異常（入り皮） ---

test('樹幹の揺らぎ/傾斜/亀裂と入り皮が点検内容に入っている', () => {
  const empty = emptyInspection();
  for (const k of ['trunkSway', 'trunkLean', 'trunkCrack', 'barkInclusion']) {
    assert.equal(k in empty, true, `${k} が emptyInspection に無い`);
  }
  // 旧「幹の損傷」は廃止（trunkDamage は無い）
  assert.equal('trunkDamage' in empty, false);
  // 並びは国交省の主要項目順: 空洞・傷の位置 → 揺らぎ → 傾斜 → 亀裂 → 入り皮 → フラス
  const i = (k) => INSPECTION_FIELDS.indexOf(k);
  assert.ok(i('cavityPart') < i('trunkSway'));
  assert.ok(i('trunkSway') < i('trunkLean'));
  assert.ok(i('trunkLean') < i('trunkCrack'));
  assert.ok(i('trunkCrack') < i('barkInclusion'));
  assert.ok(i('barkInclusion') < i('frass'));
});

test('活力度（樹勢・樹形）が点検内容に入っている', () => {
  const empty = emptyInspection();
  assert.equal('vigor' in empty, true);
  assert.equal('treeForm' in empty, true);
  const i = (k) => INSPECTION_FIELDS.indexOf(k);
  assert.ok(i('frass') < i('vigor'));
  assert.ok(i('vigor') < i('treeForm'));
});

test('一覧バッジ: 揺らぎ・傾斜・亀裂・入り皮も「有」なら出す', () => {
  assert.deepEqual(inspectionBadges({ trunkSway: '有' }), ['揺らぎ']);
  assert.deepEqual(inspectionBadges({ trunkLean: '有' }), ['傾斜']);
  assert.deepEqual(inspectionBadges({ trunkCrack: '有' }), ['亀裂']);
  assert.deepEqual(inspectionBadges({ barkInclusion: '有' }), ['入り皮']);
  assert.deepEqual(
    inspectionBadges({
      fungus: '有', cavity: '有', trunkSway: '有', trunkLean: '有', trunkCrack: '有',
      barkInclusion: '有', frass: '有',
    }),
    ['キノコ', '空洞', '揺らぎ', '傾斜', '亀裂', '入り皮', 'フラス'],
  );
  // 「無」では出さない
  assert.deepEqual(inspectionBadges({ trunkCrack: '無', barkInclusion: '無' }), []);
});


// --- コード化（段階は value/label 分離、有無は語のまま）---

test('段階ものの選択肢は value 1〜4 / label は表示用', () => {
  assert.deepEqual(LEAF_DENSITY.map((o) => o.value), ['1', '2', '3', '4']);
  assert.deepEqual(VIGOR.map((o) => o.value), ['1', '2', '3', '4']);
  assert.deepEqual(TREE_FORM.map((o) => o.value), ['1', '2', '3', '4']);
  // すべての選択肢が value と label を持つ
  for (const opts of [LEAF_DENSITY, VIGOR, TREE_FORM, FUNGUS, CAVITY, FUNGUS_PART, CAVITY_PART]) {
    for (const o of opts) {
      assert.ok(o.value !== undefined && o.value !== '', 'value がある');
      assert.ok(o.label !== undefined && o.label !== '', 'label がある');
    }
  }
});

test('有/無/未 は語のまま（潰さない）', () => {
  assert.deepEqual(FUNGUS.map((o) => o.value), ['有', '無', '未']);
});


// --- 重点観察区分（WebGISの色分け用） ---

test('重点観察: キノコ有・フラス有は 3（重点）', () => {
  assert.equal(alertLevel({ fungus: '有' }), 3);
  assert.equal(alertLevel({ frass: '有' }), 3);
  // 重点は注意より優先
  assert.equal(alertLevel({ fungus: '有', cavity: '有' }), 3);
});

test('重点観察: 空洞・亀裂・傾斜・揺らぎ・入り皮 有は 2（注意）', () => {
  assert.equal(alertLevel({ cavity: '有' }), 2);
  assert.equal(alertLevel({ trunkCrack: '有' }), 2);
  assert.equal(alertLevel({ trunkLean: '有' }), 2);
  assert.equal(alertLevel({ trunkSway: '有' }), 2);
  assert.equal(alertLevel({ barkInclusion: '有' }), 2);
});

test('重点観察: 所見なし点検済みは 1、未入力は 0', () => {
  assert.equal(alertLevel({ leafDensity: '2', fungus: '無' }), 1);
  assert.equal(alertLevel({}), 0);
});


// --- 点検履歴 / 凡例（GAS側・v1.3）---

const gasSource = () => readFileSync(new URL('../gas/Code.gs', import.meta.url), 'utf8');

test('GAS: tree_history は trees と同じ列＋historyId/recordedAt', () => {
  const gas = gasSource();
  // SHEETS.tree_history = ['historyId', 'recordedAt'].concat(SHEETS.trees)
  assert.match(
    gas,
    /SHEETS\.tree_history\s*=\s*\['historyId',\s*'recordedAt'\]\.concat\(SHEETS\.trees\)/,
    'tree_history が trees の列から作られていること（列を足したとき履歴にも自動でつく）',
  );
  // 同期対象（pull/upsert）には入れない＝追記のみ
  const dataSheets = /var DATA_SHEETS = \[([^\]]+)\]/.exec(gas)[1];
  assert.equal(dataSheets.includes('tree_history'), false, 'tree_history は DATA_SHEETS に入れない');
  assert.match(gas, /function appendHistory_/, '追記する関数がある');
});

test('GAS: 凡例シートの中身が inspection.js とずれていない', () => {
  const gas = gasSource();
  const block = gas.slice(gas.indexOf('var LEGEND = ['), gas.indexOf('// ---'));
  // 「項目, 値, 意味」の3つ組を取り出す
  const rows = [...block.matchAll(/\['([^']*)',\s*'([^']*)',\s*'([^']*)'\]/g)]
    .map((m) => [m[1], m[2], m[3]]);
  const find = (name, value) => rows.find((r) => r[0] === name && r[1] === value);

  const check = (name, options) => {
    for (const o of options) {
      const hit = find(name, o.value);
      assert.ok(hit, `凡例に ${name} の ${o.value} が無い`);
      assert.equal(hit[2], o.hint, `${name} ${o.value} の意味がずれている`);
    }
  };
  check('葉の茂り', LEAF_DENSITY);
  check('活力度_樹勢', VIGOR);
  check('活力度_樹形', TREE_FORM);
  for (const [value, label] of Object.entries(ALERT_LABELS)) {
    const hit = find('重点観察', value);
    assert.ok(hit, `凡例に 重点観察 の ${value} が無い`);
    assert.equal(hit[2], label, `重点観察 ${value} の表示名がずれている`);
  }
});


// --- PLATEAU移行に備えた任意項目（移行メモ4-2）---

test('樹冠幅・区分が点検内容に入っている', () => {
  const empty = emptyInspection();
  for (const k of ['crownWidth', 'vegClass']) {
    assert.equal(k in empty, true, `${k} が emptyInspection に無い`);
  }
  // 幹周の測定高は持たない（樹木医の判断: 幹周は胸高で測るものと決まっており、
  // 1.2/1.3m の差は記録する意味がない。2026-08-23）
  assert.equal('girthHeight' in empty, false);
  // 樹冠幅は樹高の隣（大きさの項目をまとめる）
  const i = (k) => INSPECTION_FIELDS.indexOf(k);
  assert.ok(i('height') < i('crownWidth'));
  assert.ok(i('crownWidth') < i('vegClass'));
});

test('区分は 高木/中木/低木', () => {
  assert.deepEqual(VEG_CLASS.map((o) => o.value), ['高木', '中木', '低木']);
});

test('樹冠幅は数値列（GAS側）', () => {
  const gas = gasSource();
  const numberFields = /var NUMBER_FIELDS = \[([^\]]+)\]/s.exec(gas)[1];
  assert.equal(numberFields.includes("'crownWidth'"), true, 'crownWidth は数値列');
});

test('幹周の測定高はどこにも残っていない', () => {
  assert.equal(gasSource().includes('girthHeight'), false, 'GASの列に残っていない');
});
