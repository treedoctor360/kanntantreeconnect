// バックアップ（JSON）・書き出し（CSV / GeoJSON）と、取込のマージ計画。

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

// 並びは紙の「樹木点検 現地チェックシート」に合わせてある
// （場所＝公園名 / テープ番号 / 樹木番号 / 樹種 / 葉の茂り / キノコ / キノコ部位 /
//   空洞・傷 / フラス / 注意 / 写真）。列を足すときは gas/Code.gs の SHEETS も直すこと。
const CSV_COLUMNS = [
  ['id', (t) => t.id],
  ['公園コード', (t) => t.parkCode ?? ''],
  ['公園名', (t, parkName) => parkName],
  ['テープ番号', (t) => t.tapeNo ?? ''],
  ['樹木番号', (t) => t.treeNo ?? ''],
  ['樹種', (t) => t.species ?? ''],
  ['葉の茂り', (t) => t.leafDensity ?? ''],
  ['キノコ', (t) => t.fungus ?? ''],
  ['キノコ部位', (t) => t.fungusPart ?? ''],
  ['空洞・傷', (t) => t.cavity ?? ''],
  ['フラス', (t) => t.frass ?? ''],
  ['注意', (t) => t.caution ?? ''],
  ['写真枚数', (t) => (t.photoCount == null ? '' : t.photoCount)],
  ['調査日', (t) => t.surveyDate ?? ''],
  ['調査者', (t) => t.surveyor ?? ''],
  ['テープロール', (t) => t.tapeRoll ?? ''],
  ['緯度', (t) => (t.lat ?? '') === '' ? '' : String(t.lat)],
  ['経度', (t) => (t.lng ?? '') === '' ? '' : String(t.lng)],
  ['誤差m', (t) => (t.accuracy == null ? '' : Math.round(t.accuracy))],
  ['座標入力元', (t) => t.coordSource ?? ''],
  ['樹高m', (t) => t.height ?? ''],
  ['幹周cm', (t) => t.girth ?? ''],
  ['メモ', (t) => t.note ?? ''],
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
        // 点検内容（紙のチェックシート1ページ目）
        leafDensity: t.leafDensity ?? '',
        fungus: t.fungus ?? '',
        fungusPart: t.fungusPart ?? '',
        cavity: t.cavity ?? '',
        frass: t.frass ?? '',
        caution: t.caution ?? '',
        photoCount: t.photoCount ?? 0,
        surveyDate: t.surveyDate ?? '',
        surveyor: t.surveyor ?? '',
        tapeRoll: t.tapeRoll ?? '',
        accuracy: t.accuracy ?? null,
        coordSource: t.coordSource ?? null,
        height: t.height ?? null,
        girth: t.girth ?? null,
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
