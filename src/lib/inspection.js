// 樹木点検 現地チェックシート（1ページ目）の項目定義。
// 紙のチェックシートの選択肢をそのまま持つ。ここは純粋なデータと関数だけを置き、
// DOM にも DB にも触らない（画面・CSV・GAS のどこからでも同じ定義を使うため）。
//
// 紙の並び:
//   テープ番号 / 樹木番号（公園コード+テープ番号）/ 樹種（不明可）/ 葉の茂り /
//   キノコ / キノコ部位 / 空洞・傷 / フラス / 注意 / 写真
//
// 表頭（1枚のシートで共通の項目）:
//   場所（＝公園）/ 調査日 / 調査者 / テープロール A・B・C

/** 葉の茂り。※印の凡例はシート下の注記のとおり */
export const LEAF_DENSITY = [
  { code: '濃', hint: '茂っている' },
  { code: '普', hint: '普通' },
  { code: 'ま', hint: '空が透けて見える' },
  { code: 'ほ', hint: '葉が殆どない' },
];

/** キノコ。未＝未確認（草や入りにくいところで見られなかった場合） */
export const FUNGUS = [
  { code: '有', hint: 'あった' },
  { code: '無', hint: 'なかった' },
  { code: '未', hint: '未確認' },
];

/**
 * キノコ部位（複数可）。
 * 【推定】1文字の見出しは紙の凡例（2ページ目）に対応する省略形として扱っている。
 * 凡例の文言が違っていたら hint だけ直せばよい（code はシートと同じ1文字のまま）。
 */
export const FUNGUS_PART = [
  { code: '根', hint: '根・根元' },
  { code: '幹', hint: '幹' },
  { code: '枝', hint: '枝' },
  { code: '枯', hint: '枯れた部分' },
  { code: '不', hint: '不明' },
];

/** 空洞・傷 */
export const CAVITY = [
  { code: '有', hint: 'あった' },
  { code: '無', hint: 'なかった' },
];

/** フラス（虫の食いかす。穿孔性害虫の目印） */
export const FRASS = [
  { code: '有', hint: 'あった' },
  { code: '無', hint: 'なかった' },
  { code: '未', hint: '未確認' },
];

/** テープロール */
export const TAPE_ROLLS = ['A', 'B', 'C'];

/** 樹木1本ぶんの点検項目（tree に持たせるキー） */
export const INSPECTION_FIELDS = [
  'tapeNo',
  'leafDensity',
  'fungus',
  'fungusPart',
  'cavity',
  'frass',
  'caution',
];

/** 調査ごとに共通の項目（表頭。登録のたびに引き継ぐ） */
export const SURVEY_FIELDS = ['surveyDate', 'surveyor', 'tapeRoll'];

// ------------------------------------------------------------------
// キノコ部位（複数可）
//
// 複数選べるが、CSV・スプレッドシート・JSONのどこでも同じ形で扱いたいので
// 配列ではなく「根・幹」のような文字列1つで持つ。
// ------------------------------------------------------------------

export const PART_SEP = '・';

/** 保存されている文字列を配列にする（順番はシートの並びにそろえる） */
export function partList(value) {
  const chosen = String(value ?? '')
    .split(/[・,、\/\s]+/)
    .filter(Boolean);
  return FUNGUS_PART.map((p) => p.code).filter((code) => chosen.includes(code));
}

/** その部位が選ばれているか */
export function hasPart(value, code) {
  return partList(value).includes(code);
}

/** 部位の入切を切り替えた文字列を返す */
export function togglePart(value, code) {
  const cur = partList(value);
  const next = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
  return FUNGUS_PART.map((p) => p.code)
    .filter((c) => next.includes(c))
    .join(PART_SEP);
}

// ------------------------------------------------------------------
// 出し入れの補助
// ------------------------------------------------------------------

/** 空の点検内容 */
export function emptyInspection() {
  return {
    tapeNo: '',
    leafDensity: '',
    fungus: '',
    fungusPart: '',
    cavity: '',
    frass: '',
    caution: '',
  };
}

/** 樹木レコードから点検内容だけを取り出す（無い項目は空文字） */
export function pickInspection(tree = {}) {
  const out = emptyInspection();
  for (const key of INSPECTION_FIELDS) out[key] = tree?.[key] ?? '';
  return out;
}

/** 空の調査情報（表頭）。調査日は今日 */
export function emptySurvey(today = new Date()) {
  return { surveyDate: toDateInput(today), surveyor: '', tapeRoll: '' };
}

/** Date を <input type="date"> の値（YYYY-MM-DD）にする */
export function toDateInput(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 一覧に出す注意バッジ。
 * 「キノコがあった」「空洞・傷があった」「フラスがあった」は現場で拾いたい情報なので、
 * カードの上で分かるようにする。
 */
export function inspectionBadges(tree = {}) {
  const badges = [];
  if (tree.fungus === '有') badges.push('キノコ');
  if (tree.cavity === '有') badges.push('空洞・傷');
  if (tree.frass === '有') badges.push('フラス');
  return badges;
}

/** 点検内容が1つでも入っているか（一覧の「点検なし」判定用） */
export function hasInspection(tree = {}) {
  return INSPECTION_FIELDS.some((key) => String(tree?.[key] ?? '').trim() !== '');
}
