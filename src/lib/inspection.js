// 樹木点検票の項目定義。ここは純粋なデータと関数だけを置き、
// DOM にも DB にも触らない（画面・CSV・GAS のどこからでも同じ定義を使うため）。
//
// 文言は国土交通省「都市公園の樹木の点検・診断に関する指針(案)」の樹木点検票(個表)に
// 可能な限り合わせている（出典: https://www.mlit.go.jp/toshi/park/content/001414803.pdf）。
//
// ------------------------------------------------------------------
// コード化の原則（2026-08-21 決定）
//   - 段階もの（順序に意味がある: 葉の茂り・活力度）は保存値を '1'〜'4' にする。
//     1 = 良い/充実 側にそろえる（国交省の活力度に合わせる）。
//   - 状態もの（有/無/未）は語のまま保存する。「未（見ていない）」を潰さないため。
//   - 選択肢は { value, label, hint } の3点で持つ。
//       value … 保存・CSV・シートに出る値（不変にしたい）
//       label … 画面のボタンに出る表示（あとで変えてよい）
//       hint  … 補足説明
//     こうすると表示ラベルを変えても保存値は動かない。
// ------------------------------------------------------------------

/** 葉の茂り。1＝充実 側。※国交省様式に対応項目は無い（現場の目安として存置） */
export const LEAF_DENSITY = [
  { value: '1', label: '濃', hint: '枝先まで密' },
  { value: '2', label: '普', hint: 'ふつう' },
  { value: '3', label: 'ま', hint: 'まばら（樹冠から空が透ける）' },
  { value: '4', label: 'ほ', hint: 'ほとんどない' },
];

/** キノコ（国交省: 樹幹・大枝・地際のキノコ）。「無」と「未」を必ず区別する */
export const FUNGUS = [
  { value: '有', label: '有', hint: 'あった' },
  { value: '無', label: '無', hint: '見たが無かった' },
  { value: '未', label: '未', hint: '見ていない・下草裏が見えないなどで見えない' },
];

/** キノコ部位（複数可）。値は語のまま（根/幹/枝/枯/不） */
export const FUNGUS_PART = [
  { value: '根', label: '根', hint: '根元（地際〜50cm・露出根）' },
  { value: '幹', label: '幹', hint: '根元より上の生きた幹' },
  { value: '枝', label: '枝', hint: '枝の付け根' },
  { value: '枯', label: '枯', hint: '枯枝・枯幹' },
  { value: '不', label: '不', hint: '不明' },
];

/**
 * 空洞・傷。国交省「樹幹の亀裂」と切り分けるため、ここは
 * 「穴（空洞）・樹皮の広範囲な剥離」に限定する（割れ目・裂けは trunkCrack へ）。
 */
export const CAVITY = [
  { value: '有', label: '有', hint: '穴（空洞）・樹皮の広範囲な剥離があった' },
  { value: '無', label: '無', hint: 'なかった' },
];

/** 空洞・傷の位置（複数可）。根・幹・枝の3つ */
export const CAVITY_PART = [
  { value: '根', label: '根', hint: '根元（地際〜50cm・露出根）' },
  { value: '幹', label: '幹', hint: '根元より上の生きた幹' },
  { value: '枝', label: '枝', hint: '枝' },
];

/** 樹幹の揺らぎ（国交省 主要項目）。押すと動く＝倒木直前のサイン */
export const TRUNK_SWAY = [
  { value: '有', label: '有', hint: '幹を押すと根鉢ごと動く・地際が浮く' },
  { value: '無', label: '無', hint: 'なかった' },
];

/** 樹幹の不自然な傾斜（国交省 主要項目） */
export const TRUNK_LEAN = [
  { value: '有', label: '有', hint: '近年傾いた・根元が持ち上がる等の不自然な傾き' },
  { value: '無', label: '無', hint: 'なかった' },
];

/** 樹幹の亀裂（国交省 主要項目）。旧「幹の損傷」を整理してここに寄せた */
export const TRUNK_CRACK = [
  { value: '有', label: '有', hint: '幹の割れ目・裂け・縦の亀裂があった' },
  { value: '無', label: '無', hint: 'なかった' },
];

/**
 * 結合部の異常（入り皮）。
 * 入り皮＝二又や枝の付け根の合わせ目に樹皮が巻き込まれた状態。裂けやすい。
 * ※国交省様式に対応項目は無い（現場で拾いたいので存置）。
 */
export const BARK_INCLUSION = [
  { value: '有', label: '有', hint: 'あった' },
  { value: '無', label: '無', hint: 'なかった' },
];

/** フラス（木くずとフンが混ざったうどん状・かりんとう状の排出物）。※国交省様式に対応項目は無い */
export const FRASS = [
  { value: '有', label: '有', hint: 'あった' },
  { value: '無', label: '無', hint: '見たが無かった' },
  { value: '未', label: '未', hint: '見ていない・見えない' },
];

/**
 * 活力度・樹勢（国交省）。段階の説明は指針p.25の文言。1＝良い。
 * ※印刷版の指針原文で最終照合すること（保存値 1〜4 は照合結果に関わらず不変）。
 */
export const VIGOR = [
  { value: '1', label: '1', hint: '良い' },
  { value: '2', label: '2', hint: '少し悪い' },
  { value: '3', label: '3', hint: '悪い' },
  { value: '4', label: '4', hint: '枯死（ナラ枯れ・マツ枯れ等）' },
];

/** 活力度・樹形（国交省）。段階の説明は指針p.25の文言。1＝良い */
export const TREE_FORM = [
  { value: '1', label: '1', hint: '望ましい樹形を保っている' },
  { value: '2', label: '2', hint: '樹形に乱れがある' },
  { value: '3', label: '3', hint: '樹形が著しく乱れ、回復の見込みが低い' },
  { value: '4', label: '4', hint: '望ましい樹形が完全に崩壊している' },
];

/** 周辺環境（道路園路・電線・建物）。倒れたときに何に当たるかの目安 */
export const ENV_PRESENCE = [
  { value: '有', label: '有', hint: 'ある' },
  { value: '無', label: '無', hint: 'ない' },
];

/** 周辺環境の3項目。ラベルは紙の見出しに合わせる */
export const ENV_ITEMS = [
  { key: 'envRoad', label: '道路・園路', hint: '倒れたら道路や園路にかかる' },
  { key: 'envWire', label: '電線', hint: '枝や幹が電線に近い' },
  { key: 'envBuilding', label: '建物', hint: '倒れたら建物にかかる' },
];

/** よく使う樹高（m）。現場では測らないので、目分量で押せるものを並べる */
export const HEIGHT_PRESETS = [3, 5, 8, 10, 15, 20];

/**
 * よく使う樹冠幅（m）。PLATEAU の veg:crownDiameter にあたる。
 * 水平投影の最大直径を1つだけ取る（長径・短径は分けない）。樹高と同じく目分量でよい。
 */
export const CROWN_WIDTH_PRESETS = [3, 5, 8, 10, 15];

/** 区分（高木・中木・低木）。PLATEAU の veg:class にあたる */
export const VEG_CLASS = [
  { value: '高木', label: '高木', hint: 'おおむね3m以上' },
  { value: '中木', label: '中木', hint: 'おおむね1.5〜3m' },
  { value: '低木', label: '低木', hint: 'おおむね1.5m未満' },
];

/**
 * 幹周の測定高。**大津市の運用は地上高 1.2m（日本の「胸高」）**。
 *
 * 測定高が分からない幹周は、あとから比較できず診断根拠として使えなくなる。
 * 遡って調べようがないので、幹周を入れたときは必ず一緒に残す
 * （幹周を入力すると 1.2 が自動で入る。違う高さで測ったときだけ押し替える）。
 */
export const GIRTH_HEIGHT = [
  { value: '1.2', label: '1.2m', hint: '胸高（日本の標準・大津市の運用）' },
  { value: '1.3', label: '1.3m', hint: '国際的なDBHの測定高' },
  { value: '根元', label: '根元', hint: '地際で測った' },
  { value: 'その他', label: 'その他', hint: '上のいずれでもない（メモに書く）' },
];

/** 幹周を入れたときに既定で入る測定高 */
export const DEFAULT_GIRTH_HEIGHT = '1.2';

/** テープロール */
export const TAPE_ROLLS = ['A', 'B', 'C'];

/**
 * 樹木1本ぶんの点検項目（tree に持たせるキー）。
 * 並びは国交省の主要項目（揺らぎ→傾斜→亀裂→キノコ）と活力度をふまえつつ、
 * 現場で入れやすい流れにそろえている。
 */
export const INSPECTION_FIELDS = [
  'tapeNo',
  'height',
  'crownWidth',
  'vegClass',
  'leafDensity',
  'fungus',
  'fungusPart',
  'cavity',
  'cavityPart',
  'trunkSway',
  'trunkLean',
  'trunkCrack',
  'barkInclusion',
  'frass',
  'vigor',
  'treeForm',
  'envRoad',
  'envWire',
  'envBuilding',
  'envNote',
  'girthHeight',
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
  return options.map((p) => p.value).filter((v) => chosen.includes(v));
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
    .map((p) => p.value)
    .filter((v) => next.includes(v))
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
    crownWidth: '',
    vegClass: '',
    leafDensity: '',
    fungus: '',
    fungusPart: '',
    cavity: '',
    cavityPart: '',
    trunkSway: '',
    trunkLean: '',
    trunkCrack: '',
    barkInclusion: '',
    frass: '',
    vigor: '',
    treeForm: '',
    envRoad: '',
    envWire: '',
    envBuilding: '',
    envNote: '',
    girthHeight: '',
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
 * 「有」だったものは現場で拾いたいので、カードの上で分かるようにする。
 */
export function inspectionBadges(tree = {}) {
  const badges = [];
  if (tree.fungus === '有') badges.push('キノコ');
  if (tree.cavity === '有') badges.push('空洞');
  if (tree.trunkSway === '有') badges.push('揺らぎ');
  if (tree.trunkLean === '有') badges.push('傾斜');
  if (tree.trunkCrack === '有') badges.push('亀裂');
  if (tree.barkInclusion === '有') badges.push('入り皮');
  if (tree.frass === '有') badges.push('フラス');
  return badges;
}

/**
 * 重点観察区分（WebGISの色分け用）。危険度・診断結果ではなく「観察の優先度」。
 *   3 = 重点（赤）… キノコ有 または フラス有（菌・虫の活動サイン）
 *   2 = 注意（黄）… 空洞・亀裂・傾斜・揺らぎ・入り皮 のいずれか有
 *   1 = 通常（緑）… 上記なし・点検済み
 *   0 = 未   （灰）… 点検項目が未入力（実質、見ていない）
 * 生の項目は消さず、この区分は派生値として出す。
 */
export function alertLevel(tree = {}) {
  const yes = (k) => tree?.[k] === '有';
  if (yes('fungus') || yes('frass')) return 3;
  if (yes('cavity') || yes('trunkCrack') || yes('trunkLean') || yes('trunkSway') || yes('barkInclusion')) {
    return 2;
  }
  return hasInspection(tree) ? 1 : 0;
}

/** 重点観察区分の表示名（凡例・ツール表示用） */
export const ALERT_LABELS = { 3: '重点', 2: '注意', 1: '通常', 0: '未点検' };

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

/**
 * 保存値（value）から表示ラベルを引く。
 * 段階もの（1〜4）を一覧などで人が読める形に戻すために使う。
 * 該当が無ければ元の値をそのまま返す（旧データや未知値でも壊れない）。
 */
export function labelOf(options, value) {
  const hit = options.find((o) => o.value === value);
  return hit ? hit.label : String(value ?? '');
}

/** 葉の茂りの表示ラベル（例: '2' → '普'） */
export const leafDensityLabel = (value) => labelOf(LEAF_DENSITY, value);
