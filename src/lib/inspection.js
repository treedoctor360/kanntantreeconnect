// 樹木点検 現地チェックシート（1ページ目）の項目定義。
// 紙のチェックシートの選択肢をそのまま持つ。ここは純粋なデータと関数だけを置き、
// DOM にも DB にも触らない（画面・CSV・GAS のどこからでも同じ定義を使うため）。
//
// 紙の並び:
//   テープ番号 / 樹木番号（公園コード+テープ番号）/ 樹種（不明可）/ 樹高 / 葉の茂り /
//   キノコ / キノコ部位 / 空洞・傷 / 空洞・傷の位置 / フラス /
//   周辺環境（道路園路・電線・建物・備考）/ 注意 / 写真
//
// 表頭（1枚のシートで共通の項目）:
//   場所（＝公園）/ 調査日 / 調査者 / テープロール A・B・C

// 以下の hint は紙の「記入ルールと運用」3. 記入の凡例 の文言をそのまま使っている。
// 紙を直したらここも直すこと（画面・CSV・GASのどこからでもこの定義を見ている）。

/** 葉の茂り。迷ったら「普」 */
export const LEAF_DENSITY = [
  { code: '濃', hint: '枝先まで密' },
  { code: '普', hint: 'ふつう' },
  { code: 'ま', hint: 'まばら（樹冠から空が透ける）' },
  { code: 'ほ', hint: 'ほとんどない' },
];

/** キノコ。「無」と「未」を必ず区別する */
export const FUNGUS = [
  { code: '有', hint: 'あった' },
  { code: '無', hint: '見たが無かった' },
  { code: '未', hint: '見ていない・下草裏が見えないなどで見えない' },
];

/** キノコ部位（複数可） */
export const FUNGUS_PART = [
  { code: '根', hint: '根元（地際〜50cm・露出根）' },
  { code: '幹', hint: '根元より上の生きた幹' },
  { code: '枝', hint: '枝の付け根' },
  { code: '枯', hint: '枯枝・枯幹' },
  { code: '不', hint: '不明' },
];

/** 空洞・傷。大きさの基準は設けない。気になったら「有」でよい */
export const CAVITY = [
  { code: '有', hint: '穴・樹皮の広範囲な剥離・割れ目があった' },
  { code: '無', hint: 'なかった' },
];

/** 空洞・傷の位置（複数可）。キノコ部位より粗く、根・幹・枝の3つだけ */
export const CAVITY_PART = [
  { code: '根', hint: '根元（地際〜50cm・露出根）' },
  { code: '幹', hint: '根元より上の生きた幹' },
  { code: '枝', hint: '枝' },
];

/** フラス（木くずとフンが混ざったうどん状・かりんとう状の排出物） */
export const FRASS = [
  { code: '有', hint: 'あった' },
  { code: '無', hint: '見たが無かった' },
  { code: '未', hint: '見ていない・見えない' },
];

/** 周辺環境（道路園路・電線・建物）。倒れたときに何に当たるかの目安 */
export const ENV_PRESENCE = [
  { code: '有', hint: 'ある' },
  { code: '無', hint: 'ない' },
];

/** 周辺環境の3項目。ラベルは紙の見出しに合わせる */
export const ENV_ITEMS = [
  { key: 'envRoad', label: '道路・園路', hint: '倒れたら道路や園路にかかる' },
  { key: 'envWire', label: '電線', hint: '枝や幹が電線に近い' },
  { key: 'envBuilding', label: '建物', hint: '倒れたら建物にかかる' },
];

/** よく使う樹高（m）。現場では測らないので、目分量で押せるものを並べる */
export const HEIGHT_PRESETS = [3, 5, 8, 10, 15, 20];

/** テープロール */
export const TAPE_ROLLS = ['A', 'B', 'C'];

/** 樹木1本ぶんの点検項目（tree に持たせるキー） */
export const INSPECTION_FIELDS = [
  'tapeNo',
  'height',
  'leafDensity',
  'fungus',
  'fungusPart',
  'cavity',
  'cavityPart',
  'frass',
  'envRoad',
  'envWire',
  'envBuilding',
  'envNote',
  'caution',
];

/** 調査ごとに共通の項目（表頭。登録のたびに引き継ぐ） */
export const SURVEY_FIELDS = ['surveyDate', 'surveyor', 'tapeRoll'];

// ------------------------------------------------------------------
// 部位（複数可）— キノコ部位と空洞・傷の位置で共通に使う
//
// 複数選べるが、CSV・スプレッドシート・JSONのどこでも同じ形で扱いたいので
// 配列ではなく「根・幹」のような文字列1つで持つ。
// options を渡すとその並び順にそろえる（既定はキノコ部位）。
// ------------------------------------------------------------------

export const PART_SEP = '・';

/** 保存されている文字列を配列にする（順番はシートの並びにそろえる） */
export function partList(value, options = FUNGUS_PART) {
  const chosen = String(value ?? '')
    .split(/[・,、\/\s]+/)
    .filter(Boolean);
  return options.map((p) => p.code).filter((code) => chosen.includes(code));
}

/** その部位が選ばれているか */
export function hasPart(value, code, options = FUNGUS_PART) {
  return partList(value, options).includes(code);
}

/** 部位の入切を切り替えた文字列を返す */
export function togglePart(value, code, options = FUNGUS_PART) {
  const cur = partList(value, options);
  const next = cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code];
  return options
    .map((p) => p.code)
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
    height: '',
    leafDensity: '',
    fungus: '',
    fungusPart: '',
    cavity: '',
    cavityPart: '',
    frass: '',
    envRoad: '',
    envWire: '',
    envBuilding: '',
    envNote: '',
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

/**
 * 「見つけたらすぐ連絡すること」（紙の運用ルール4）にあたるものを文にして返す。
 * 現場でその場に立っているうちに気づけるよう、入力した直後に画面へ出す。
 */
export function urgentNotes(v = {}) {
  const notes = [];
  if (v.frass === '有') {
    notes.push(
      'フラス「有」→ 全景と近景（形が分かるように）を撮影し、可能なら持ち帰る。すぐ連絡すること。',
    );
  }
  if (v.fungus === '有' && hasPart(v.fungusPart, '根')) {
    notes.push('根元のキノコ → 大きいものはすぐ連絡すること。');
  }
  // 「園路や車道に倒れそうな木」（運用ルール4）に近いので、両方そろったら出す
  if (v.cavity === '有' && v.envRoad === '有') {
    notes.push('空洞・傷があり、道路・園路がそば → 倒れたときの影響が大きい。連絡すること。');
  }
  return notes;
}

/** 点検内容が1つでも入っているか（一覧の「点検なし」判定用） */
export function hasInspection(tree = {}) {
  return INSPECTION_FIELDS.some((key) => String(tree?.[key] ?? '').trim() !== '');
}
