// 採番ロジックのテスト。実行: npm test（node --test）
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidParkCode,
  nextParkCode,
  formatTreeNo,
  parseTreeSeq,
  nextTreeNo,
  isDuplicateTreeNo,
  renameTreeNoPrefix,
  treeNoFromTape,
  parseTapeNo,
  nextTapeNo,
} from '../src/lib/treeNo.js';

test('公園コード: 空配列なら P001', () => {
  assert.equal(nextParkCode([]), 'P001');
});

test('公園コード: 欠番があっても最大値+1（欠番は埋めない）', () => {
  assert.equal(nextParkCode(['P001', 'P003']), 'P004');
});

test('公園コード: P+数字 以外は無視する', () => {
  assert.equal(nextParkCode(['KOJI', 'P002', 'P-9', '']), 'P003');
});

test('公園コードの書式チェック', () => {
  assert.equal(isValidParkCode('P001'), true);
  assert.equal(isValidParkCode('KOJI-1'), true);
  assert.equal(isValidParkCode('皇子が丘'), false);
  assert.equal(isValidParkCode('P 001'), false);
  assert.equal(isValidParkCode(''), false);
});

test('樹木番号の書式', () => {
  assert.equal(formatTreeNo('P001', 4), 'P001-004');
  assert.equal(formatTreeNo('KOJI', 12), 'KOJI-012');
  assert.equal(formatTreeNo('P001', 1234), 'P001-1234'); // 4桁になっても壊れない
});

test('連番の取り出し: 公園コードが違えば null', () => {
  assert.equal(parseTreeSeq('P001-004', 'P001'), 4);
  assert.equal(parseTreeSeq('P002-004', 'P001'), null);
  assert.equal(parseTreeSeq('P001-004b', 'P001'), null);
  assert.equal(parseTreeSeq('', 'P001'), null);
});

// --- 最低限確認する3ケース（CLAUDE.md 9章） ---

test('ケース1 欠番あり: 最大値+1 を返し、欠番は埋めない', () => {
  const existing = ['P001-001', 'P001-003'];
  assert.equal(nextTreeNo('P001', existing), 'P001-004');
});

test('ケース2 削除後: 末尾を削除しても番号は戻らない…が、最大値が消えれば詰まる', () => {
  // 001,002,003 のうち 002 を削除 → 最大値は 003 のままなので次は 004
  assert.equal(nextTreeNo('P001', ['P001-001', 'P001-003']), 'P001-004');
  // 末尾の 003 を削除した場合は最大値が 002 になるため次は 003（番号の再利用が起きる）
  assert.equal(nextTreeNo('P001', ['P001-001', 'P001-002']), 'P001-003');
  // 全部削除したら 001 に戻る
  assert.equal(nextTreeNo('P001', []), 'P001-001');
});

test('ケース3 重複時: 重複を検知する（保存自体は呼び出し側で許可）', () => {
  const existing = ['P001-001', 'P001-002'];
  assert.equal(isDuplicateTreeNo('P001-002', existing), true);
  assert.equal(isDuplicateTreeNo('P001-003', existing), false);
  assert.equal(isDuplicateTreeNo('', existing), false);
});

test('他公園の番号は採番に混ぜない', () => {
  const existing = ['P002-050', 'P001-002', '手書き-9'];
  assert.equal(nextTreeNo('P001', existing), 'P001-003');
});

test('公園コード変更時の番号付け替え', () => {
  assert.equal(renameTreeNoPrefix('P001-004', 'P001', 'KOJI'), 'KOJI-004');
  // 旧コードで始まらない番号（手で書き換えたもの）は触らない
  assert.equal(renameTreeNoPrefix('別番号-1', 'P001', 'KOJI'), '別番号-1');
});

// --- テープ番号（現地チェックシートの「樹木番号（公園コード+テープ番号）」） ---

test('テープ番号から樹木番号を作る（数字は3桁にそろえる）', () => {
  assert.equal(treeNoFromTape('P001', 'A201'), 'P001-A201'); // ロール記号付きはそのまま
  assert.equal(treeNoFromTape('P001', '4'), 'P001-004');
  assert.equal(treeNoFromTape('P001', '004'), 'P001-004');
  assert.equal(treeNoFromTape('P001', '128'), 'P001-128');
  assert.equal(treeNoFromTape('KOJI', '7'), 'KOJI-007');
});

test('テープ番号が数字でなければそのまま付ける', () => {
  assert.equal(treeNoFromTape('P001', '12b'), 'P001-12b');
});

test('テープ番号が空なら樹木番号も作らない', () => {
  assert.equal(treeNoFromTape('P001', ''), '');
  assert.equal(treeNoFromTape('P001', '  '), '');
  assert.equal(treeNoFromTape('', '4'), '');
});

test('テープ番号をロール記号と連番に分ける', () => {
  assert.deepEqual(parseTapeNo('A201'), { prefix: 'A', seq: 201 });
  assert.deepEqual(parseTapeNo('201'), { prefix: '', seq: 201 });
  assert.deepEqual(parseTapeNo(' a12 '), { prefix: 'A', seq: 12 });
  assert.equal(parseTapeNo('12b'), null); // 手書きの枝番は採番に混ぜない
  assert.equal(parseTapeNo(''), null);
});

// 紙の運用ルール2「ロールは場所をまたいで連続して使う」＝公園で区切らない
test('次のテープ番号: 同じロール記号の最大値+1', () => {
  assert.equal(nextTapeNo(['A201', 'A203', 'B7'], 'A'), 'A204');
});

test('次のテープ番号: 公園が違っても連続する（呼び出し側が全件渡す）', () => {
  // 真野川で A200 まで使ったら、長沢川は A201 から続く
  assert.equal(nextTapeNo(['A198', 'A199', 'A200'], 'A'), 'A201');
});

test('次のテープ番号: そのロールの記録がまだ無ければ 1 から', () => {
  assert.equal(nextTapeNo([], 'A'), 'A1');
  assert.equal(nextTapeNo(['A201'], 'B'), 'B1');
});

test('次のテープ番号: 記号なしで書いている運用はそのまま数字で続ける', () => {
  assert.equal(nextTapeNo(['201', '202'], 'A'), '203');
  assert.equal(nextTapeNo(['12'], ''), '13');
});

test('次のテープ番号: ロール未選択ならいちばん大きい番号の記号に合わせる', () => {
  assert.equal(nextTapeNo(['A201', 'B7'], ''), 'A202');
});

test('次のテープ番号: 数字にならない手書きは無視する', () => {
  assert.equal(nextTapeNo(['A201', 'A12b', ''], 'A'), 'A202');
});
