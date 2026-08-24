// 紙の調査票のテスト。実行: npm test（node --test）
//
// いちばん大事なのは「紙とアプリの項目がずれていないこと」。
// ずれると転記のときに事故になるので、機械で止める。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INSPECTION_FIELDS,
  SURVEY_FIELDS,
  LEAF_DENSITY,
  VIGOR,
  FUNGUS_PART,
  VEG_CLASS,
} from '../src/lib/inspection.js';
import {
  SHEET_COLUMNS,
  LEGEND_SECTIONS,
  buildSurveySheetHtml,
  buildSurveySheetFragment,
  rowHeightMm,
} from '../src/lib/printSheet.js';

test('紙の列に、アプリの点検項目がすべてある', () => {
  const keys = SHEET_COLUMNS.map((c) => c.key);
  for (const field of INSPECTION_FIELDS) {
    assert.ok(keys.includes(field), `紙の調査票に ${field} の欄が無い`);
  }
});

test('紙の列の並びが、アプリの入力順と同じ', () => {
  const keys = SHEET_COLUMNS.map((c) => c.key).filter((k) => INSPECTION_FIELDS.includes(k));
  assert.deepEqual(keys, INSPECTION_FIELDS, '紙とアプリで項目の並びが違う（転記しにくくなる）');
});

test('紙に無い列を勝手に作っていない（転記先が無い欄を作らない）', () => {
  const known = new Set([...INSPECTION_FIELDS, 'treeNo', 'species', 'photoCount']);
  for (const c of SHEET_COLUMNS) {
    assert.ok(known.has(c.key), `${c.key} はアプリに対応する項目が無い`);
  }
});

test('表頭は調査情報（調査日・調査者・テープロール）と場所', () => {
  const html = buildSurveySheetHtml({ parkName: '皇子が丘公園', surveyor: '橘川', tapeRoll: 'B' });
  for (const label of ['場所', '調査日', '調査者', 'テープロール']) {
    assert.ok(html.includes(label), `${label} が表頭に無い`);
  }
  assert.equal(SURVEY_FIELDS.length, 3);
  assert.ok(html.includes('皇子が丘公園'));
  assert.ok(html.includes('橘川'));
  assert.ok(html.includes('<u>B</u>'), '選んだテープロールに下線が引かれる');
});

test('選択肢はアプリの定義そのまま（紙に直書きしていない）', () => {
  const html = buildSurveySheetHtml();
  // 葉の茂りは画面と同じ 濃 普 ま ほ（保存値の1〜4ではなくラベルを刷る）
  assert.ok(html.includes(LEAF_DENSITY.map((o) => o.label).join(' ')));
  assert.ok(html.includes(FUNGUS_PART.map((o) => o.label).join(' ')));
  assert.ok(html.includes(VEG_CLASS.map((o) => o.label).join(' ')));
  assert.ok(html.includes(VIGOR.map((o) => o.label).join(' ')));
});

test('凡例はアプリの説明文（hint）をそのまま載せる', () => {
  const html = buildSurveySheetHtml();
  for (const s of LEGEND_SECTIONS) {
    for (const o of s.options) {
      if (o.hint) assert.ok(html.includes(o.hint), `凡例に「${o.hint}」が無い`);
    }
  }
});

test('行数を指定できる（1行＝1本）', () => {
  const rows = (n) => (buildSurveySheetHtml({ rows: n }).match(/<tr style="height:/g) ?? []).length;
  assert.equal(rows(10), 10);
  assert.equal(rows(14), 14);
});

test('行数が多いほど1行は細くなるが、手で書ける高さは残す', () => {
  // 行数を増やしても1枚に収めるため、高さは 6mm〜11mm の範囲で自動調整する
  assert.ok(rowHeightMm(10) > rowHeightMm(18), '行数が多いほど細くなる');
  for (const n of [1, 10, 14, 18, 40]) {
    const h = rowHeightMm(n);
    assert.ok(h >= 6 && h <= 11, `${n}行のときの高さ ${h}mm が範囲外`);
  }
  // 本文がA4横の1枚（約194mm）に収まること。見出し・表頭・注記でおよそ50mm使う
  for (const n of [10, 14, 18]) {
    assert.ok(rowHeightMm(n) * n + 50 <= 194, `${n}行が1枚に収まらない`);
  }
});

test('A4横・2ページで、印刷ボタンが付いている', () => {
  const html = buildSurveySheetHtml();
  assert.ok(html.includes('size: A4 landscape'));
  assert.equal((html.match(/class="sheet"/g) ?? []).length, 2, '記入表と凡例の2枚');
  assert.ok(html.includes('window.print()'));
});

test('HTMLを壊す文字が混ざっても崩れない', () => {
  const html = buildSurveySheetHtml({ parkName: '<script>x</script>', surveyor: 'A & B' });
  assert.ok(!html.includes('<script>x</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('A &amp; B'));
});

test('アプリの中に貼る断片は、文書ではなく用紙だけを返す', () => {
  const frag = buildSurveySheetFragment({ rows: 12 });
  // 断片なので文書の外枠は付けない（アプリのHTMLの中に入れるため）
  assert.ok(!frag.includes('<!doctype'), '断片に doctype が混ざっている');
  assert.ok(!frag.includes('<body'), '断片に body が混ざっている');
  // 用紙は文書版と同じ2枚
  assert.equal((frag.match(/class="sheet"/g) ?? []).length, 2);
  assert.equal((frag.match(/<tr style="height:/g) ?? []).length, 12);
  assert.ok(frag.includes('@page { size: A4 landscape'), '印刷の用紙指定が無い');
});

test('断片のCSSは .sheetdoc の中だけに効く（アプリの見た目を壊さない）', () => {
  const frag = buildSurveySheetFragment();
  const css = frag.slice(frag.indexOf('<style>') + 7, frag.indexOf('</style>'));
  for (const line of css.split('\n')) {
    const sel = line.split('{')[0].trim();
    // 宣言の行・@ルール・閉じ括弧・空行は見ない。セレクタの行だけ確かめる
    if (!line.includes('{') || sel.startsWith('@') || sel === '') continue;
    for (const one of sel.split(',')) {
      assert.ok(
        one.trim().startsWith('.sheetdoc'),
        `アプリ側へ漏れるセレクタがある: ${one.trim()}`,
      );
    }
  }
});

test('文書版は単体で開いて印刷できる（保存して配るため）', () => {
  const html = buildSurveySheetHtml();
  assert.ok(html.includes('<!doctype html>'));
  assert.ok(html.includes('window.print()'), '印刷ボタンが無い');
});
