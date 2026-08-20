// 公園名の表記ゆれ照合のテスト（parktreenote の normalizeParkKey 由来）
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeParkKey, findParkByName, parkCandidates } from '../src/lib/parkName.js';

const parks = [
  { id: 'a', code: 'P001', name: '皇子が丘公園' },
  { id: 'b', code: 'P002', name: 'におの浜公園' },
  { id: 'c', code: 'P003', name: '第二児童公園' },
];

test('正規化: ヶ／ケ・空白・全角半角・漢数字を吸収する', () => {
  assert.equal(normalizeParkKey('皇子が丘公園'), normalizeParkKey('皇子が丘 公園'));
  assert.equal(normalizeParkKey('皇子ヶ丘公園'), normalizeParkKey('皇子ケ丘公園'));
  assert.equal(normalizeParkKey('第二児童公園'), normalizeParkKey('第2児童公園'));
  assert.equal(normalizeParkKey('ＡＢＣ公園'), normalizeParkKey('abc公園'));
  assert.equal(normalizeParkKey(''), '');
  assert.equal(normalizeParkKey(null), '');
});

test('同じ公園を見つける', () => {
  assert.equal(findParkByName(parks, '皇子が丘 公園')?.id, 'a');
  assert.equal(findParkByName(parks, '第2児童公園')?.id, 'c');
  assert.equal(findParkByName(parks, '柳が崎公園'), null);
  assert.equal(findParkByName(parks, ''), null);
});

test('自分自身は一致とみなさない（編集で名前を変えないまま保存できる）', () => {
  assert.equal(findParkByName(parks, '皇子が丘公園', 'a'), null);
});

test('近い候補を出す', () => {
  assert.deepEqual(parkCandidates(parks, '皇子が丘'), ['皇子が丘公園']);
  assert.deepEqual(parkCandidates(parks, '柳が崎公園'), []);
});
