// バックアップ（JSON）と書き出し（CSV / GeoJSON）、取込（追記マージ）
import { useEffect, useRef, useState } from 'react';
import { db, estimateStorage, getSetting, setSetting } from '../../db/db.js';
import {
  buildCsv,
  buildFullBackup,
  buildGeoJson,
  buildLightBackup,
  downloadFile,
  fileStamp,
  planMerge,
  validateBackup,
} from '../../lib/io.js';
import { formatBytes } from '../../lib/image.js';

const daysSince = (iso) => {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Number.isNaN(ms) ? null : Math.floor(ms / 86400000);
};

export default function BackupPanel({ onToast }) {
  const fileRef = useRef(null);
  const [storage, setStorage] = useState(null);
  const [lastBackupAt, setLastBackupAt] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setStorage(await estimateStorage());
    setLastBackupAt(await getSetting('lastBackupAt', null));
  };

  useEffect(() => {
    refresh();
  }, []);

  const loadAll = async () => {
    const [parks, trees, photos, settings] = await Promise.all([
      db.parks.toArray(),
      db.trees.toArray(),
      db.photos.toArray(),
      db.settings.toArray(),
    ]);
    return { parks, trees, photos, settings };
  };

  const exportFullJson = async () => {
    setBusy(true);
    try {
      const all = await loadAll();
      downloadFile(
        `kantantree-backup-${fileStamp()}.json`,
        JSON.stringify(buildFullBackup(all)),
        'application/json',
      );
      await setSetting('lastBackupAt', new Date().toISOString());
      await refresh();
      onToast(`フルバックアップを書き出しました（樹木 ${all.trees.length}件 / 写真 ${all.photos.length}枚）`);
    } finally {
      setBusy(false);
    }
  };

  const exportLightJson = async () => {
    const { parks, trees } = await loadAll();
    downloadFile(
      `kantantree-light-${fileStamp()}.json`,
      JSON.stringify(buildLightBackup({ parks, trees })),
      'application/json',
    );
    onToast(`軽量JSONを書き出しました（樹木 ${trees.length}件）`);
  };

  const exportCsv = async () => {
    const { parks, trees } = await loadAll();
    const nameById = Object.fromEntries(parks.map((p) => [p.id, p.name]));
    downloadFile(`kantantree-${fileStamp()}.csv`, buildCsv(trees, nameById), 'text/csv;charset=utf-8');
    onToast(`CSVを書き出しました（${trees.length}件）`);
  };

  const exportGeoJson = async () => {
    const { parks, trees } = await loadAll();
    const nameById = Object.fromEntries(parks.map((p) => [p.id, p.name]));
    const gj = buildGeoJson(trees, nameById);
    downloadFile(
      `kantantree-${fileStamp()}.geojson`,
      JSON.stringify(gj),
      'application/geo+json',
    );
    onToast(`GeoJSONを書き出しました（座標あり ${gj.features.length}件）`);
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const data = JSON.parse(await file.text());
      const invalid = validateBackup(data);
      if (invalid) {
        onToast(invalid);
        return;
      }

      const existing = { parks: await db.parks.toArray(), trees: await db.trees.toArray() };
      const plan = planMerge(existing, data);
      const ok = window.confirm(
        `このファイルを追記マージします（全上書きではありません）。\n\n` +
          `　公園: 追加 ${plan.parks.add.length}件 / 更新 ${plan.parks.update.length}件\n` +
          `　樹木: 追加 ${plan.trees.add.length}件 / 更新 ${plan.trees.update.length}件\n` +
          `　変更なし（取込側が古い）: ${plan.skipped}件\n\n実行しますか？`,
      );
      if (!ok) return;

      const touched = new Set([...plan.trees.add, ...plan.trees.update].map((t) => t.id));
      const incomingPhotos = (data.photos ?? []).filter((p) => touched.has(p.treeId));
      const photoTreeIds = [...new Set(incomingPhotos.map((p) => p.treeId))];

      await db.transaction('rw', db.parks, db.trees, db.photos, db.settings, async () => {
        if (plan.parks.add.length || plan.parks.update.length) {
          await db.parks.bulkPut([...plan.parks.add, ...plan.parks.update]);
        }
        if (touched.size) {
          await db.trees.bulkPut([...plan.trees.add, ...plan.trees.update]);
        }
        // 写真は「取込側に写真が入っている樹木」だけ入れ替える
        if (photoTreeIds.length) {
          await db.photos.where('treeId').anyOf(photoTreeIds).delete();
          await db.photos.bulkPut(incomingPhotos);
        }
        // 樹種マスタは足し合わせる（消さない）
        const incomingMaster =
          (data.settings ?? []).find((s) => s.key === 'speciesMaster')?.value ?? [];
        if (incomingMaster.length) {
          const cur = (await db.settings.get('speciesMaster'))?.value ?? [];
          const merged = [...cur];
          for (const name of incomingMaster) if (!merged.includes(name)) merged.push(name);
          await db.settings.put({ key: 'speciesMaster', value: merged });
        }
      });

      onToast(
        `取込みました（公園 +${plan.parks.add.length}/更新${plan.parks.update.length}、樹木 +${plan.trees.add.length}/更新${plan.trees.update.length}）`,
      );
      await refresh();
    } catch (err) {
      onToast(`取込に失敗しました: ${err.message ?? err}`);
    } finally {
      setBusy(false);
    }
  };

  const d = daysSince(lastBackupAt);

  return (
    <section className="block">
      <h3 className="block-title">バックアップ・書き出し</h3>

      <p className={d !== null && d >= 7 ? 'status status-error' : 'hint'}>
        {d === null ? 'まだバックアップを取っていません。' : `最終バックアップから ${d} 日`}
      </p>

      <div className="btn-grid">
        <button type="button" className="btn btn-primary" onClick={exportFullJson} disabled={busy}>
          JSON 写真あり
        </button>
        <button type="button" className="btn" onClick={exportLightJson} disabled={busy}>
          JSON 写真なし
        </button>
        <button type="button" className="btn" onClick={exportCsv} disabled={busy}>
          CSV
        </button>
        <button type="button" className="btn" onClick={exportGeoJson} disabled={busy}>
          GeoJSON
        </button>
      </div>
      <p className="hint">
        「写真あり」が端末を移すときのフルバックアップ。「写真なし」は他のアプリへの受け渡し用。
        CSVはExcel（UTF-8 BOM付き）、GeoJSONは座標のある樹木だけ。
      </p>

      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={handleImport} />
      <div className="btn-row">
        <button
          type="button"
          className="btn btn-wrap"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          JSONを読み込む（追記マージ）
        </button>
      </div>
      <p className="hint">
        読み込みは「追記マージ」です。同じ id は更新日時の新しい方を採用し、知らない id は追加します。
      </p>

      <p className="hint">
        ストレージ使用量:{' '}
        {storage
          ? `約 ${formatBytes(storage.usage)}${storage.quota ? ` / ${formatBytes(storage.quota)}` : ''}`
          : 'この端末では取得できません'}
      </p>
    </section>
  );
}
