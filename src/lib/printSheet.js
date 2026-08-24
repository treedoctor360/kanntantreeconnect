// 紙の調査票（アプリを使わない人が記入するための用紙）を組み立てる。
//
// **アプリの項目定義（inspection.js）から作る。** 紙とアプリの項目がずれると、
// 転記のときに「紙にあるがアプリに無い欄」「その逆」が出て必ず事故になるので、
// 選択肢は必ず inspection.js の配列を参照すること（ここに文字列を直書きしない）。
// ずれていないかは test/printSheet.test.js が機械で確かめている。
//
// 出力は2通り。どちらも同じ中身から作る。
//   buildSurveySheetHtml()     … そのまま印刷できる1つのHTML文書（「HTMLで保存」用）
//   buildSurveySheetFragment() … アプリの中に貼り付ける断片（設定タブのプレビュー用）
// 別タブで開くと、ホーム画面から起動したiPhoneでは戻るボタンが無くてアプリへ帰れない。
// そのため画面で見せるほうは「アプリの中に重ねて出して、閉じるボタンで戻る」形にしてある。
// どちらもDOMには触らないので node --test でそのまま中身を確かめられる。
//
// 用紙: A4横。1行＝1本（株立ちも1本として1行）。

import {
  BARK_INCLUSION,
  CAVITY,
  CAVITY_PART,
  ENV_PRESENCE,
  FRASS,
  FUNGUS,
  FUNGUS_PART,
  LEAF_DENSITY,
  TAPE_ROLLS,
  TREE_FORM,
  TRUNK_CRACK,
  TRUNK_LEAN,
  TRUNK_SWAY,
  VEG_CLASS,
  VIGOR,
} from './inspection.js';

/** 選択肢の並びを「濃 普 ま ほ」のような1つの文字列にする（〇を付けてもらう） */
const marks = (options) => options.map((o) => o.label).join(' ');

/**
 * 用紙の列。
 *   key      … アプリのフィールド名（転記先。write-in の欄も対応づけておく）
 *   head     … 見出し
 *   choices  … セルにあらかじめ刷っておく選択肢（〇で囲む）。空なら手書き欄
 *   mm       … 列幅の目安
 *
 * 見出しは横書きのまま折り返す。縦書き（writing-mode）は、縦書き用グリフを持たない
 * フォントだと漢字が消えることがあり、印刷する端末を選べない用紙では危ないので使わない。
 */
export const SHEET_COLUMNS = [
  { key: 'tapeNo', head: 'テープ番号', mm: 13 },
  { key: 'treeNo', head: '樹木番号', sub: '公園コード+テープ番号', mm: 17 },
  { key: 'species', head: '樹種', sub: '不明可', mm: 17 },
  { key: 'height', head: '樹高', sub: 'm', mm: 9 },
  { key: 'crownWidth', head: '樹冠幅', sub: 'm', mm: 9 },
  { key: 'vegClass', head: '区分', choices: marks(VEG_CLASS), mm: 17 },
  { key: 'leafDensity', head: '葉の茂り', choices: marks(LEAF_DENSITY), mm: 13 },
  { key: 'fungus', head: 'キノコ', choices: marks(FUNGUS), mm: 11 },
  { key: 'fungusPart', head: 'キノコ部位', choices: marks(FUNGUS_PART), mm: 16 },
  { key: 'cavity', head: '空洞・傷', choices: marks(CAVITY), mm: 9 },
  { key: 'cavityPart', head: '空洞の位置', choices: marks(CAVITY_PART), mm: 11 },
  { key: 'trunkSway', head: '揺らぎ', choices: marks(TRUNK_SWAY), mm: 9 },
  { key: 'trunkLean', head: '傾斜', choices: marks(TRUNK_LEAN), mm: 9 },
  { key: 'trunkCrack', head: '亀裂', choices: marks(TRUNK_CRACK), mm: 9 },
  { key: 'barkInclusion', head: '入り皮', choices: marks(BARK_INCLUSION), mm: 9 },
  { key: 'frass', head: 'フラス', choices: marks(FRASS), mm: 11 },
  { key: 'vigor', head: '樹勢', choices: marks(VIGOR), mm: 12 },
  { key: 'treeForm', head: '樹形', choices: marks(TREE_FORM), mm: 12 },
  { key: 'envRoad', head: '道路園路', choices: marks(ENV_PRESENCE), mm: 9 },
  { key: 'envWire', head: '電線', choices: marks(ENV_PRESENCE), mm: 9 },
  { key: 'envBuilding', head: '建物', choices: marks(ENV_PRESENCE), mm: 9 },
  { key: 'envNote', head: '周辺環境の備考', mm: 14 },
  { key: 'caution', head: '注意', mm: 15 },
  { key: 'photoCount', head: '写真', sub: '枚', mm: 9 },
];

/** 記入の凡例（2枚目）。説明文は inspection.js の hint をそのまま使う */
export const LEGEND_SECTIONS = [
  { title: '葉の茂り', options: LEAF_DENSITY, note: '迷ったら「普」' },
  { title: 'キノコ', options: FUNGUS, note: '「無（見たが無かった）」と「未（見ていない）」を必ず区別する' },
  { title: 'キノコ部位', options: FUNGUS_PART, note: '当てはまるものすべてに〇' },
  { title: '空洞・傷', options: CAVITY, note: '割れ目・裂けは「亀裂」の欄へ' },
  { title: '空洞・傷の位置', options: CAVITY_PART, note: '当てはまるものすべてに〇' },
  { title: '樹幹の揺らぎ', options: TRUNK_SWAY },
  { title: '樹幹の不自然な傾斜', options: TRUNK_LEAN },
  { title: '樹幹の亀裂', options: TRUNK_CRACK },
  { title: '結合部の異常（入り皮）', options: BARK_INCLUSION },
  { title: 'フラス', options: FRASS },
  { title: '活力度・樹勢', options: VIGOR },
  { title: '活力度・樹形', options: TREE_FORM },
  { title: '区分', options: VEG_CLASS },
  { title: '周辺環境（道路園路・電線・建物）', options: ENV_PRESENCE, note: '倒れたときに何にかかるかの目安' },
];

/** 運用のきまり（紙の「記入ルールと運用」。アプリには持たせていない現場の手順） */
export const RULES = [
  ['手順（1本あたり）',
   'ロールからテープを取り、幹の地上約1.5mに巻く（締めつけない）→ テープ番号を書く → ' +
   'この用紙に記入 → 写真撮影（スタッフを立てておおよそのサイズ感を残す）'],
  ['測らない',
   '巻尺・測定機器は不要。木に登る、脚立を使う等はしない。地上から見える範囲だけを見る。' +
   '樹高・樹冠幅は目分量でよい'],
  ['テープ番号',
   'ロールは使い切るまで場所をまたいで連続して使う（場所ごとに区切らない）。' +
   '一度使った番号は二度と使わない（伐採後も他の木に使い回さない）'],
  ['1行＝1本',
   '幹が根元から複数に分岐している株立ちの個体も、1本として1行に書く'],
  ['この点検でやらないこと',
   'どこに何本あり、どれに異変があるかを記録するためのもの。倒木の危険度は判定しない。' +
   '「葉の茂り」は簡易な観察項目であり、活力度・健全度の区分とは別のもの。' +
   '樹種が分からなければ「不明」と書く（無理に推測しない）'],
];

/** 見つけたらすぐ連絡すること */
export const URGENT_RULES = [
  'フラスが「有」の木 → 全景と近景（形が分かるように）を撮影。可能なら持ち帰る',
  '根元に大きなキノコがある木',
  '幹が明らかに傾いている木・園路や車道に倒れそうな木・頭上に枯れた大枝がある木',
];

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * 用紙のCSS。
 * scope が空なら単体のHTML文書用（`body` にそのまま当てる）。
 * scope に `.sheetdoc` を渡すとアプリの中に貼っても他の画面に影響しない形になる
 * （h1 / table のような広い指定がアプリ側へ漏れないようにするため）。
 */
function css(scope = '') {
  const root = scope || 'body';
  const s = scope ? `${scope} ` : '';
  return `
@page { size: A4 landscape; margin: 8mm; }
${s}* { box-sizing: border-box; }
${root} {
  margin: 0;
  font-family: 'Hiragino Sans', 'Noto Sans JP', 'Yu Gothic', sans-serif;
  color: #000;
  font-size: 9pt;
}
${s}.sheet { page-break-after: always; }
${s}.sheet:last-child { page-break-after: auto; }
${s}h1 { font-size: 13pt; margin: 0 0 3mm; text-align: center; letter-spacing: 0.1em; }
${s}h2 { font-size: 9.5pt; margin: 2.5mm 0 1.5mm; border-bottom: 1px solid #000; padding-bottom: 0.8mm; }
${s}table { border-collapse: collapse; width: 100%; table-layout: fixed; }
${s}th, ${s}td { border: 0.4pt solid #000; padding: 0.6mm 0.4mm; vertical-align: middle; }
/* 表頭（場所・調査日・調査者・テープロール） */
${s}.head td { height: 8mm; font-size: 9pt; padding: 1mm 2mm; }
${s}.head .label { width: 18mm; background: #f0f0f0; font-weight: 600; white-space: nowrap; }
/* 本表 */
${s}.grid th {
  background: #f0f0f0;
  font-size: 7pt;
  line-height: 1.25;
  height: 13mm;
  font-weight: 600;
  word-break: break-all; /* 「道路園路」のような4文字を2行に折り返して細い列に収める */
}
${s}.grid th .sub { display: block; font-size: 5.5pt; font-weight: 400; word-break: normal; }
/* 選択肢は1行に収める（折り返すと〇が付けにくい） */
${s}.grid td { text-align: center; font-size: 7pt; white-space: nowrap; color: #333; }
${s}.grid td.write { color: #000; }
${s}.note { font-size: 7.5pt; margin: 2mm 0 0; line-height: 1.5; }
/* 2枚目 */
${s}.legend { column-count: 3; column-gap: 6mm; font-size: 7.5pt; }
${s}.legend section { break-inside: avoid; margin-bottom: 2mm; }
${s}.legend h3 { font-size: 8pt; margin: 0 0 0.5mm; }
${s}.legend ul { margin: 0; padding-left: 4mm; line-height: 1.35; }
${s}.legend .memo { color: #444; line-height: 1.35; }
${s}.rules { font-size: 7.5pt; line-height: 1.4; margin: 0; column-count: 2; column-gap: 6mm; }
${s}.rules div { break-inside: avoid; margin-bottom: 1.5mm; }
${s}.rules b { display: block; }
${s}.urgent { border: 1.2pt solid #000; padding: 2mm 3mm; margin-top: 2mm; font-size: 8pt; }
${s}.urgent ul { margin: 1mm 0 0; padding-left: 5mm; }
${s}.urgent li { line-height: 1.45; }
${s}.foot { margin-top: 4mm; font-size: 7.5pt; color: #333; display: flex; justify-content: space-between; }
@media screen {
  ${root} { background: #f2f2f2; padding: 8mm; }
  ${s}.sheet { background: #fff; padding: 8mm; margin: 0 auto 8mm; width: 281mm; box-shadow: 0 1px 6px rgba(0,0,0,.25); }
  ${s}.toolbar { position: sticky; top: 0; text-align: center; margin-bottom: 6mm; }
  ${s}.toolbar button { font: inherit; font-size: 11pt; padding: 8px 20px; cursor: pointer; }
}
@media print { ${s}.toolbar { display: none; } }
`;
}

/** 表頭（場所・調査日・調査者・テープロール） */
function headerHtml({ parkName, surveyDate, surveyor, tapeRoll }) {
  const roll = TAPE_ROLLS.map((r) => (r === tapeRoll ? `<u>${esc(r)}</u>` : esc(r))).join(' ・ ');
  return `<table class="head"><tr>
    <td class="label">場所</td><td>${esc(parkName)}</td>
    <td class="label">調査日</td><td>${esc(surveyDate) || '　　　年　　月　　日'}</td>
    <td class="label">調査者</td><td>${esc(surveyor)}</td>
    <td class="label">テープロール</td><td>${roll}</td>
  </tr></table>`;
}

/**
 * 本表（1行＝1本）。
 * 行の高さは行数から決める。A4横の本文に使える高さ（およそ136mm）を行数で割り、
 * 手で書ける下限6mm・上げすぎない上限11mm に収める。
 * こうすると10行でも18行でも1枚に収まり、行数が少ないときは行が広くなる。
 */
export function rowHeightMm(rows) {
  return Math.min(11, Math.max(6, Math.round((136 / Math.max(1, rows)) * 10) / 10));
}

function gridHtml(rows) {
  const h = rowHeightMm(rows);
  const cols = SHEET_COLUMNS.map((c) => `<col style="width:${c.mm}mm">`).join('');
  const head = SHEET_COLUMNS.map(
    (c) => `<th>${esc(c.head)}${c.sub ? `<span class="sub">${esc(c.sub)}</span>` : ''}</th>`,
  ).join('');
  const body = Array.from({ length: rows }, () =>
    `<tr style="height:${h}mm">${SHEET_COLUMNS.map(
      (c) => `<td class="${c.choices ? '' : 'write'}">${esc(c.choices ?? '')}</td>`,
    ).join('')}</tr>`,
  ).join('');
  return `<table class="grid"><colgroup>${cols}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** 2枚目（記入の凡例＋運用のきまり） */
function legendHtml() {
  const sections = LEGEND_SECTIONS.map((s) => {
    const items = s.options
      .map((o) => `<li><b>${esc(o.label)}</b> … ${esc(o.hint ?? '')}</li>`)
      .join('');
    const note = s.note ? `<div class="memo">※ ${esc(s.note)}</div>` : '';
    return `<section><h3>${esc(s.title)}</h3><ul>${items}</ul>${note}</section>`;
  }).join('');

  const rules = RULES.map(([t, b]) => `<div><b>${esc(t)}</b>${esc(b)}</div>`).join('');
  const urgent = URGENT_RULES.map((u) => `<li>${esc(u)}</li>`).join('');

  return `<div class="sheet">
    <h1>樹木点検 現地チェックシート — 記入の凡例</h1>
    <div class="legend">${sections}</div>
    <h2>運用のきまり</h2>
    <div class="rules">${rules}</div>
    <div class="urgent">
      <b>見つけたらすぐ連絡すること</b>
      <ul>${urgent}</ul>
    </div>
    <div class="foot"><span>© 2026 Koh Kitsukawa. All rights reserved.</span><span>2/2</span></div>
  </div>`;
}

/** 用紙2枚ぶんの中身（1枚目＝記入表、2枚目＝凡例）。文書にも断片にも同じものを使う */
function sheetsHtml({ parkName, surveyDate, surveyor, tapeRoll, rows }) {
  return `<div class="sheet">
  <h1>樹木点検　現地チェックシート</h1>
  ${headerHtml({ parkName, surveyDate, surveyor, tapeRoll })}
  ${gridHtml(rows)}
  <p class="note">
    <b>1行＝1本。</b>株立ち（幹が根元から複数に分岐している個体）も1本として1行に書く。
    あてはまる選択肢を〇で囲む。空欄のままでもよい（分からない・見ていない項目は無理に埋めない）。
    記入の凡例と運用のきまりは<b>2枚目</b>を参照。
  </p>
  <div class="foot"><span>© 2026 Koh Kitsukawa. All rights reserved.</span><span>1/2</span></div>
</div>
${legendHtml()}`;
}

const DEFAULTS = { parkName: '', surveyDate: '', surveyor: '', tapeRoll: '', rows: 14 };

/**
 * 紙の調査票（そのまま印刷できる1つのHTML文書）を作る。
 * 「HTMLで保存」で書き出す中身。単体で開いても印刷ボタンが使える。
 *
 * @param {object} o
 * @param {string} o.parkName   場所（公園名）。空なら手書き
 * @param {string} o.surveyDate 調査日。空なら「　年　月　日」
 * @param {string} o.surveyor   調査者
 * @param {string} o.tapeRoll   テープロール（'A'|'B'|'C'）。指定すると下線を引く
 * @param {number} o.rows       1枚に入れる行数（＝本数）
 * @returns {string} HTML文書
 */
export function buildSurveySheetHtml(o = {}) {
  const opts = { ...DEFAULTS, ...o };
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<title>樹木点検 現地チェックシート</title>
<style>${css()}</style></head>
<body>
<div class="toolbar"><button type="button" onclick="window.print()">🖨 印刷する</button></div>
${sheetsHtml(opts)}
</body></html>`;
}

/**
 * 同じ用紙を、アプリの中に貼り付けられる断片として作る。
 *
 * 設定タブのプレビューはこちらを使う。別タブで開くと、ホーム画面から起動した
 * iPhoneでは戻るボタンが無くてアプリに帰れなくなるため、アプリの中で開いて
 * 閉じるボタンで戻れるようにしている。
 *
 * CSSは `.sheetdoc` の中だけに効くようにしてあるので、アプリの見た目は変わらない。
 * 印刷はアプリ側（app.css の `@media print`）でアプリ本体を隠し、この断片だけを出す。
 *
 * @param {object} o buildSurveySheetHtml と同じ
 * @returns {string} `<style>` と用紙2枚ぶんのHTML（`.sheetdoc` の中に入れる）
 */
export function buildSurveySheetFragment(o = {}) {
  const opts = { ...DEFAULTS, ...o };
  return `<style>${css('.sheetdoc')}</style>${sheetsHtml(opts)}`;
}
