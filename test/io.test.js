// 書き出し・取込マージのテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCsv, buildGeoJson, planMerge, validateBackup } from '../src/lib/io.js';

const trees = [
  {
    id: 'a',
    parkId: 'p1',
    parkCode: 'P001',
    treeNo: 'P001-001',
    species: 'クスノキ',
    lat: 35.017764,
    lng: 135.854629,
    accuracy: 9.3,
    coordSource: 'gps',
    height: 12,
    girth: 180,
    note: 'メモ,カンマ入り',
    registeredAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  {
    id: 'b',
    parkId: 'p1',
    parkCode: 'P001',
    treeNo: 'P001-002',
    species: '不明',
    lat: null,
    lng: null,
    note: '',
    updatedAt: '2026-07-02T00:00:00.000Z',
  },
];

test('CSV: BOM付き・カンマはクォートされる', () => {
  const csv = buildCsv(trees, { p1: '皇子が丘公園' });
  assert.ok(csv.startsWith('﻿'), 'BOMで始まること');
  assert.ok(csv.includes('"メモ,カンマ入り"'));
  assert.ok(csv.includes('皇子が丘公園'));
  assert.equal(csv.trimEnd().split('\r\n').length, 3); // 見出し+2行
});

test('GeoJSON: 座標のある樹木だけが出る／順序は [経度, 緯度]', () => {
  const gj = buildGeoJson(trees, { p1: '皇子が丘公園' });
  assert.equal(gj.features.length, 1);
  assert.deepEqual(gj.features[0].geometry.coordinates, [135.854629, 35.017764]);
  assert.equal(gj.features[0].properties.treeNo, 'P001-001');
});

test('マージ: 未知のidは追加、updatedAtが新しければ更新、古ければ無視', () => {
  const existing = {
    parks: [{ id: 'p1', updatedAt: '2026-07-01T00:00:00.000Z' }],
    trees: [
      { id: 'a', updatedAt: '2026-07-05T00:00:00.000Z' },
      { id: 'b', updatedAt: '2026-07-01T00:00:00.000Z' },
    ],
  };
  const incoming = {
    parks: [{ id: 'p2', updatedAt: '2026-07-03T00:00:00.000Z' }],
    trees: [
      { id: 'a', updatedAt: '2026-07-02T00:00:00.000Z' }, // 古い → 無視
      { id: 'b', updatedAt: '2026-07-09T00:00:00.000Z' }, // 新しい → 更新
      { id: 'c', updatedAt: '2026-07-09T00:00:00.000Z' }, // 未知 → 追加
    ],
  };
  const plan = planMerge(existing, incoming);
  assert.equal(plan.parks.add.length, 1);
  assert.equal(plan.trees.add.length, 1);
  assert.equal(plan.trees.update.length, 1);
  assert.equal(plan.trees.update[0].id, 'b');
  assert.equal(plan.skipped, 1);
});

test('取込ファイルの検査', () => {
  assert.equal(validateBackup({ parks: [], trees: [] }), null);
  assert.match(validateBackup({}), /parks/);
  assert.match(validateBackup({ format: 'other', parks: [], trees: [] }), /別のアプリ/);
  assert.match(validateBackup(null), /JSON/);
});
