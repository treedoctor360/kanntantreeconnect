// 公園コード・樹木番号の採番。
// ここは「純粋関数」（外部の状態を読まず、引数だけで戻り値が決まる関数）だけを置く。
// DB には触らない。呼び出し側が既存データを配列で渡す。

/** 公園コードの書式チェック（半角英数とハイフンのみ・1文字以上） */
export function isValidParkCode(code) {
  return typeof code === 'string' && /^[0-9A-Za-z-]+$/.test(code);
}

/**
 * 既存の公園コード一覧から、次に使う公園コードを求める。
 * 'P' + 数字 形式のものだけを見て、その最大値 + 1 を返す。
 * カウンタは保存しない。欠番は埋めない。
 */
export function nextParkCode(existingCodes = []) {
  let max = 0;
  for (const code of existingCodes) {
    const m = /^P(\d+)$/.exec(String(code ?? '').trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'P' + String(max + 1).padStart(3, '0');
}

/** 公園コードと連番から樹木番号をつくる（例: 'P001', 4 → 'P001-004'） */
export function formatTreeNo(parkCode, seq) {
  return `${parkCode}-${String(seq).padStart(3, '0')}`;
}

/**
 * テープ番号を「ロール記号＋連番」に分ける。
 * 紙の運用では `A201` のようにロール記号を付けて書く（記号なしの `201` も受ける）。
 */
export function parseTapeNo(tapeNo) {
  const m = /^\s*([A-Za-z]*)\s*(\d+)\s*$/.exec(String(tapeNo ?? ''));
  return m ? { prefix: m[1].toUpperCase(), seq: parseInt(m[2], 10) } : null;
}

/**
 * 次のテープ番号を求める。
 *
 * 紙の運用ルール2:「ロールは使い切るまで**場所をまたいで連続して**使う。
 * 場所ごとに区切らない」。したがって公園では絞らず、端末にあるテープ番号
 * ぜんぶの最大値 +1 を返す（樹木番号の採番とはここが違う）。
 *
 * @param {string[]} existingTapeNos 端末にある全テープ番号
 * @param {string} roll 選んでいるテープロール（'A'|'B'|'C'）。空でもよい
 */
export function nextTapeNo(existingTapeNos = [], roll = '') {
  const parsed = existingTapeNos.map(parseTapeNo).filter(Boolean);
  const want = String(roll ?? '').trim().toUpperCase();

  // ロールを選んでいれば、その記号のものだけを見る
  let pool = want ? parsed.filter((p) => p.prefix === want) : parsed;
  let prefix = want;

  // その記号の記録がまだ無いなら、記号を書かない運用の続きとみなす
  if (want && !pool.length) {
    const plain = parsed.filter((p) => p.prefix === '');
    if (plain.length) {
      pool = plain;
      prefix = '';
    }
  }
  // ロール未選択のときは、いちばん大きい番号の記号に合わせる
  if (!want) {
    prefix = pool.reduce((top, p) => (p.seq > (top?.seq ?? -1) ? p : top), null)?.prefix ?? '';
  }

  const max = pool.reduce((m, p) => Math.max(m, p.seq), 0);
  return `${prefix}${max + 1}`;
}

/**
 * テープ番号から樹木番号を作る。
 * 紙のチェックシートの「樹木番号（公園コード+テープ番号）」に合わせる。
 * 数字だけのテープ番号は3桁に揃え、それ以外（'12b' など）はそのまま後ろに付ける。
 */
export function treeNoFromTape(parkCode, tapeNo) {
  const tape = String(tapeNo ?? '').trim();
  if (!parkCode || !tape) return '';
  return /^\d+$/.test(tape) ? formatTreeNo(parkCode, parseInt(tape, 10)) : `${parkCode}-${tape}`;
}

/**
 * 樹木番号から連番部分を取り出す。
 * 公園コードが一致しない／連番が数字でない場合は null。
 * （手で書き換えた 'P001-004b' のような番号は採番の計算に混ぜない）
 */
export function parseTreeSeq(treeNo, parkCode) {
  if (typeof treeNo !== 'string' || !parkCode) return null;
  const prefix = `${parkCode}-`;
  if (!treeNo.startsWith(prefix)) return null;
  const rest = treeNo.slice(prefix.length);
  if (!/^\d+$/.test(rest)) return null;
  return parseInt(rest, 10);
}

/**
 * その公園の次の樹木番号を求める。
 * 既存の連番の最大値 + 1。毎回計算し、カウンタは保存しない。
 * 欠番は埋めない（削除してもあとの番号がずれない）。
 */
export function nextTreeNo(parkCode, existingTreeNos = []) {
  let max = 0;
  for (const treeNo of existingTreeNos) {
    const seq = parseTreeSeq(treeNo, parkCode);
    if (seq !== null) max = Math.max(max, seq);
  }
  return formatTreeNo(parkCode, max + 1);
}

/**
 * 同一公園内で樹木番号が重複しているか。
 * existingTreeNos には自分自身を含めないこと（編集時は呼び出し側で除く）。
 */
export function isDuplicateTreeNo(treeNo, existingTreeNos = []) {
  if (!treeNo) return false;
  return existingTreeNos.some((t) => t === treeNo);
}

/**
 * 公園コードを変更したときの樹木番号の付け替え。
 * 旧コードで始まる番号だけ差し替え、手書きの番号はそのまま残す。
 */
export function renameTreeNoPrefix(treeNo, oldCode, newCode) {
  if (typeof treeNo !== 'string') return treeNo;
  const prefix = `${oldCode}-`;
  if (!treeNo.startsWith(prefix)) return treeNo;
  return `${newCode}-${treeNo.slice(prefix.length)}`;
}
