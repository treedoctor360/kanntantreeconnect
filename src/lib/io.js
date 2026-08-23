// バックアップ（JSON）・書き出し（CSV / GeoJSON）と、取込のマージ計画。

import { ALERT_LABELS, LEAF_DENSITY, TREE_FORM, VIGOR } from './inspection.js';

export const BACKUP_FORMAT = 'kantantree-backup';
export const BACKUP_VERSION = 1;

// ------------------------------------------------------------------
// 書き出し
// ------------------------------------------------------------------

/** フルバックアップ（写真のBase64込み） */
export function buildFullBackup({ parks, trees, photos, settings }) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    kind: 'full',
    exportedAt: new Date().toISOString(),
    parks,
    trees,
    photos,
    settings,
  };
}

/** 軽量JSON（写真なし・他アプリへの受け渡し用） */
export function buildLightBackup({ parks, trees }) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    kind: 'light',
    exportedAt: new Date().toISOString(),
    parks,
    trees: trees.map(({ thumb, ...rest }) => rest), // サムネイルは載せない
    photos: [],
  };
}

// 並びは国交省様式・紙のチェックシートに合わせてある。
// 段階もの（葉の茂り・活力度）は値が 1〜4 なので、別途「凡例」を buildLegendCsv で出す。
// 「重点観察」は WebGIS の色分け用の派生値（3=重点/2=注意/1=通常/0=未点検）。
// 列を足すときは gas/Code.gs の SHEETS も直すこと。
const CSV_COLUMNS = [
  ['id', (t) => t.id],
  ['公園コード', (t) => t.parkCode ?? ''],
  ['公園名', (t, parkName) => parkName],
  ['テープ番号', (t) => t.tapeNo ?? ''],
  ['樹木番号', (t) => t.treeNo ?? ''],
  ['樹種', (t) => t.species ?? ''],
  ['重点観察', (t) => (t.alertLevel == null ? '' : t.alertLevel)],
  ['樹高m', (t) => t.height ?? ''],
  ['樹冠幅m', (t) => t.crownWidth ?? ''],
  ['区分', (t) => t.vegClass ?? ''],
  ['葉の茂り', (t) => t.leafDensity ?? ''],
  ['キノコ', (t) => t.fungus ?? ''],
  ['キノコ部位', (t) => t.fungusPart ?? ''],
  ['空洞・傷', (t) => t.cavity ?? ''],
  ['空洞・傷の位置', (t) => t.cavityPart ?? ''],
  ['樹幹の揺らぎ', (t) => t.trunkSway ?? ''],
  ['樹幹の不自然な傾斜', (t) => t.trunkLean ?? ''],
  ['樹幹の亀裂', (t) => t.trunkCrack ?? ''],
  ['結合部の異常', (t) => t.barkInclusion ?? ''],
  ['フラス', (t) => t.frass ?? ''],
  ['活力度_樹勢', (t) => t.vigor ?? ''],
  ['活力度_樹形', (t) => t.treeForm ?? ''],
  ['道路園路', (t) => t.envRoad ?? ''],
  ['電線', (t) => t.envWire ?? ''],
  ['建物', (t) => t.envBuilding ?? ''],
  ['周辺環境備考', (t) => t.envNote ?? ''],
  ['注意', (t) => t.caution ?? ''],
  ['写真枚数', (t) => (t.photoCount == null ? '' : t.photoCount)],
  ['調査日', (t) => t.surveyDate ?? ''],
  ['調査者', (t) => t.surveyor ?? ''],
  ['テープロール', (t) => t.tapeRoll ?? ''],
  ['緯度', (t) => (t.lat ?? '') === '' ? '' : String(t.lat)],
  ['経度', (t) => (t.lng ?? '') === '' ? '' : String(t.lng)],
  ['誤差m', (t) => (t.accuracy == null ? '' : Math.round(t.accuracy))],
  ['座標入力元', (t) => t.coordSource ?? ''],
  ['幹周cm', (t) => t.girth ?? ''],
  ['幹周測定高m', (t) => t.girthHeight ?? ''],
  ['メモ', (t) => t.note ?? ''],
  ['幹の損傷_旧', (t) => t.trunkDamageLegacy ?? ''],
  ['登録日時', (t) => t.registeredAt ?? ''],
  ['更新日時', (t) => t.updatedAt ?? ''],
];

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV文字列を作る（Excel対策で先頭にBOMを付ける） */
export function buildCsv(trees, parkNameById = {}) {
  const header = CSV_COLUMNS.map(([name]) => name).join(',');
  const rows = trees.map((t) =>
    CSV_COLUMNS.map(([, get]) => csvCell(get(t, parkNameById[t.parkId] ?? ''))).join(','),
  );
  return '﻿' + [header, ...rows].join('\r\n') + '\r\n';
}

/**
 * 凡例CSV。段階もの（1〜4）や重点観察区分の意味を別ファイルで添える。
 * 本体CSVに凡例行を混ぜると機械取込が壊れるため、凡例は別に出す。
 */
export function buildLegendCsv() {
  const rows = [['項目', '値', '意味']];
  const push = (name, options) => {
    for (const o of options) rows.push([name, o.value, o.hint ?? o.label]);
  };
  push('葉の茂り', LEAF_DENSITY);
  push('活力度_樹勢', VIGOR);
  push('活力度_樹形', TREE_FORM);
  for (const [value, label] of Object.entries(ALERT_LABELS)) {
    rows.push(['重点観察', value, label]);
  }
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  return '﻿' + body + '\r\n';
}

/** GeoJSON（座標のある樹木だけ） */
export function buildGeoJson(trees, parkNameById = {}) {
  const features = trees
    .filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lng))
    .map((t) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [t.lng, t.lat] },
      properties: {
        id: t.id,
        parkCode: t.parkCode ?? '',
        parkName: parkNameById[t.parkId] ?? '',
        tapeNo: t.tapeNo ?? '',
        treeNo: t.treeNo ?? '',
        species: t.species ?? '',
        // 重点観察区分（WebGISの色分け用。3=重点/2=注意/1=通常/0=未点検）
        alertLevel: t.alertLevel ?? 0,
        // 点検内容（国交省様式）
        height: t.height ?? null,
        crownWidth: t.crownWidth ?? null,
        vegClass: t.vegClass ?? '',
        leafDensity: t.leafDensity ?? '',
        fungus: t.fungus ?? '',
        fungusPart: t.fungusPart ?? '',
        cavity: t.cavity ?? '',
        cavityPart: t.cavityPart ?? '',
        trunkSway: t.trunkSway ?? '',
        trunkLean: t.trunkLean ?? '',
        trunkCrack: t.trunkCrack ?? '',
        barkInclusion: t.barkInclusion ?? '',
        frass: t.frass ?? '',
        vigor: t.vigor ?? '',
        treeForm: t.treeForm ?? '',
        envRoad: t.envRoad ?? '',
        envWire: t.envWire ?? '',
        envBuilding: t.envBuilding ?? '',
        envNote: t.envNote ?? '',
        caution: t.caution ?? '',
        photoCount: t.photoCount ?? 0,
        surveyDate: t.surveyDate ?? '',
        surveyor: t.surveyor ?? '',
        tapeRoll: t.tapeRoll ?? '',
        accuracy: t.accuracy ?? null,
        coordSource: t.coordSource ?? null,
        girth: t.girth ?? null,
        girthHeight: t.girthHeight ?? '',
        note: t.note ?? '',
        registeredAt: t.registeredAt ?? null,
        updatedAt: t.updatedAt ?? null,
      },
    }));
  return { type: 'FeatureCollection', features };
}

/** ファイルとして保存させる */
export function downloadFile(filename, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 書き出しファイル名に付ける日時（例 20260727-1432） */
export function fileStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// ------------------------------------------------------------------
// 取込（追記マージ）
// ------------------------------------------------------------------

/**
 * 取込内容を「追加するもの」「更新するもの」に仕分ける（純粋関数）。
 * 規則: id が一致したら updatedAt の新しい方を採用。未知の id は追加。
 */
export function planMerge(existing, incoming) {
  const plan = { parks: { add: [], update: [] }, trees: { add: [], update: [] }, skipped: 0 };

  const byId = (list) => new Map(list.map((r) => [r.id, r]));
  const existingParks = byId(existing.parks ?? []);
  const existingTrees = byId(existing.trees ?? []);

  const sort = (incomingList, existingMap, bucket) => {
    for (const rec of incomingList ?? []) {
      if (!rec?.id) continue;
      const cur = existingMap.get(rec.id);
      if (!cur) {
        bucket.add.push(rec);
      } else if (String(rec.updatedAt ?? '') > String(cur.updatedAt ?? '')) {
        bucket.update.push(rec);
      } else {
        plan.skipped += 1;
      }
    }
  };

  sort(incoming.parks, existingParks, plan.parks);
  sort(incoming.trees, existingTrees, plan.trees);
  return plan;
}

/** 読み込んだJSONがこのアプリのバックアップとして扱える形かを確かめる */
export function validateBackup(data) {
  if (!data || typeof data !== 'object') return 'JSONとして読み取れませんでした。';
  if (!Array.isArray(data.parks) || !Array.isArray(data.trees)) {
    return 'このファイルには parks / trees が入っていません。';
  }
  if (data.format && data.format !== BACKUP_FORMAT) {
    return `別のアプリのファイルのようです（format: ${data.format}）。`;
  }
  return null;
}
