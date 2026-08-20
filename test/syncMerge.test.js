// スプレッドシート同期の突き合わせ規則のテスト。実行: npm test（node --test）
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isNewer,
  planPull,
  stripTreeForSheet,
  summarizePull,
} from '../src/lib/syncMerge.js';

const park = (id, updatedAt, extra = {}) => ({ id, code: 'P001', name: '公園', updatedAt, ...extra });
const tree = (id, updatedAt, extra = {}) => ({ id, parkId: 'k1', treeNo: 'P001-001', updatedAt, ...extra });

const empty = { parks: [], trees: [] };

test('日時の新旧比較（ISO文字列は辞書順＝時刻順）', () => {
  assert.equal(isNewer('2026-08-19T10:00:00.000Z', '2026-08-19T09:00:00.000Z'), true);
  assert.equal(isNewer('2026-08-19T09:00:00.000Z', '2026-08-19T10:00:00.000Z'), false);
  assert.equal(isNewer('2026-08-19T10:00:00.000Z', '2026-08-19T10:00:00.000Z'), false);
  assert.equal(isNewer('2026-08-19T10:00:00.000Z', undefined), true);
});

test('知らない id は追加する', () => {
  const plan = planPull(empty, { parks: [park('k1', '2026-08-19T10:00:00.000Z')], trees: [] });
  assert.equal(plan.parks.put.length, 1);
  assert.equal(plan.skipped, 0);
});

test('id が同じなら updatedAt の新しい方を採用する', () => {
  const local = { parks: [], trees: [tree('t1', '2026-08-19T10:00:00.000Z')] };

  const newer = planPull(local, { trees: [tree('t1', '2026-08-19T11:00:00.000Z')] });
  assert.equal(newer.trees.put.length, 1);
  assert.equal(newer.skipped, 0);

  const older = planPull(local, { trees: [tree('t1', '2026-08-19T09:00:00.000Z')] });
  assert.equal(older.trees.put.length, 0);
  assert.equal(older.skipped, 1);
});

test('シート側が勝つときも、端末のサムネイルは消さない', () => {
  const local = { parks: [], trees: [tree('t1', '2026-08-19T10:00:00.000Z', { thumb: 'data:image/jpeg;base64,xxx' })] };
  const plan = planPull(local, { trees: [tree('t1', '2026-08-19T11:00:00.000Z', { species: 'クスノキ' })] });
  assert.equal(plan.trees.put[0].species, 'クスノキ');
  assert.equal(plan.trees.put[0].thumb, 'data:image/jpeg;base64,xxx');
});

test('削除の記録: 端末にあれば消す', () => {
  const local = { parks: [], trees: [tree('t1', '2026-08-19T10:00:00.000Z')] };
  const plan = planPull(local, {
    deletions: [{ id: 't1', table: 'trees', at: '2026-08-19T11:00:00.000Z' }],
  });
  assert.deepEqual(plan.remove.trees, ['t1']);
});

test('削除の記録: 端末に無ければ何もしない', () => {
  const plan = planPull(empty, {
    deletions: [{ id: 'zzz', table: 'trees', at: '2026-08-19T11:00:00.000Z' }],
  });
  assert.equal(plan.remove.trees.length, 0);
});

test('削除より後に端末で更新していたら、削除は無視して端末の値を残す', () => {
  const local = { parks: [], trees: [tree('t1', '2026-08-19T12:00:00.000Z')] };
  const plan = planPull(local, {
    deletions: [{ id: 't1', table: 'trees', at: '2026-08-19T11:00:00.000Z' }],
  });
  assert.equal(plan.remove.trees.length, 0);
  assert.equal(plan.skipped, 1);
});

test('端末にあるものに put と削除が同時に来たら、削除が勝つ（putは取り消す）', () => {
  const local = { parks: [], trees: [tree('t1', '2026-08-19T09:00:00.000Z')] };
  const plan = planPull(local, {
    trees: [tree('t1', '2026-08-19T10:00:00.000Z')],
    deletions: [{ id: 't1', table: 'trees', at: '2026-08-19T11:00:00.000Z' }],
  });
  assert.deepEqual(plan.remove.trees, ['t1']);
  assert.equal(plan.trees.put.length, 0);
});

test('端末に無いものは、削除記録があっても消す対象にならない', () => {
  const plan = planPull(empty, {
    trees: [tree('t1', '2026-08-19T10:00:00.000Z')],
    deletions: [{ id: 't9', table: 'trees', at: '2026-08-19T11:00:00.000Z' }],
  });
  assert.equal(plan.remove.trees.length, 0);
  assert.equal(plan.trees.put.length, 1);
});

test('知らないテーブルの削除記録は無視する', () => {
  const local = { parks: [], trees: [tree('t1', '2026-08-19T10:00:00.000Z')] };
  const plan = planPull(local, {
    deletions: [{ id: 't1', table: 'photos', at: '2026-08-19T11:00:00.000Z' }],
  });
  assert.equal(plan.remove.trees.length, 0);
});

test('空の入力でも落ちない', () => {
  const plan = planPull(undefined, undefined);
  assert.deepEqual(summarizePull(plan), { put: 0, removed: 0, skipped: 0 });
});

test('シートに送る樹木からサムネイルを外す', () => {
  const t = stripTreeForSheet(tree('t1', '2026-08-19T10:00:00.000Z', { thumb: 'data:...', species: 'ケヤキ' }));
  assert.equal(t.thumb, undefined);
  assert.equal(t.species, 'ケヤキ');
  assert.equal(t.id, 't1');
});

test('要約: 追加・削除・据え置きの件数', () => {
  const local = { parks: [park('k1', '2026-08-19T10:00:00.000Z')], trees: [tree('t1', '2026-08-19T10:00:00.000Z')] };
  const plan = planPull(local, {
    parks: [park('k1', '2026-08-19T09:00:00.000Z'), park('k2', '2026-08-19T11:00:00.000Z')],
    trees: [tree('t2', '2026-08-19T11:00:00.000Z')],
    deletions: [{ id: 't1', table: 'trees', at: '2026-08-19T11:00:00.000Z' }],
  });
  assert.deepEqual(summarizePull(plan), { put: 2, removed: 1, skipped: 1 });
});
