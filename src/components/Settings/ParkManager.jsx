// 公園の追加・編集・削除・CSV取込（設定タブ）
import { useEffect, useRef, useState } from 'react';
import {
  addPark,
  countParkContents,
  deleteParkCascade,
  importParks,
  isParkCodeTaken,
  suggestParkCode,
  updatePark,
} from '../../db/db.js';
import { decodeCsvBuffer, parseParkCsv, NAME_HEADERS } from '../../lib/parkCsv.js';
import { isValidParkCode } from '../../lib/treeNo.js';
import { findParkByName, parkCandidates } from '../../lib/parkName.js';
import { getCurrentPosition, geolocationErrorMessage, formatLatLng } from '../../lib/geo.js';

const blank = { code: '', name: '', lat: null, lng: null, note: '' };

export default function ParkManager({ parks, onToast, onParkDeleted, autoOpen = false }) {
  const [editing, setEditing] = useState(autoOpen ? {} : null); // null=閉 / {id?} =開
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const [geoBusy, setGeoBusy] = useState(false);
  const csvRef = useRef(null);
  const [csvBusy, setCsvBusy] = useState(false);

  // 新規登録を開いたら公園コードの初期値を入れておく（考えさせない）
  useEffect(() => {
    if (editing && !editing.id && !form.code) {
      suggestParkCode().then((code) => setForm((f) => ({ ...f, code })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const openNew = () => {
    setForm(blank);
    setError('');
    setEditing({});
  };

  const openEdit = (park) => {
    setForm({
      code: park.code,
      name: park.name,
      lat: park.lat ?? null,
      lng: park.lng ?? null,
      note: park.note ?? '',
    });
    setError('');
    setEditing(park);
  };

  const pickHere = async () => {
    setGeoBusy(true);
    try {
      const pos = await getCurrentPosition();
      setForm((f) => ({ ...f, lat: pos.lat, lng: pos.lng }));
      setError('');
    } catch (err) {
      setError(geolocationErrorMessage(err));
    } finally {
      setGeoBusy(false);
    }
  };

  const handleSave = async () => {
    const code = form.code.trim();
    const name = form.name.trim();
    if (!name) return setError('公園名を入れてください。');
    if (!isValidParkCode(code)) return setError('公園コードは半角英数とハイフンだけが使えます。');
    if (await isParkCodeTaken(code, editing.id ?? null)) {
      return setError(`公園コード ${code} はすでに使われています。`);
    }

    // 公園名の表記ゆれ照合（parktreenote 由来）。
    // 「皇子が丘公園」と「皇子ヶ丘公園」のような二重登録を止める。
    const same = findParkByName(parks, name, editing.id ?? null);
    if (same) {
      setError(`「${same.name}」（${same.code}）と同じ公園に見えます。別名で登録するか、既存の公園を編集してください。`);
      return;
    }
    if (!editing.id) {
      const cands = parkCandidates(parks, name);
      if (cands.length) {
        const ok = window.confirm(
          `「${name}」は既存の公園と名前が似ています。\n` +
            `　近い公園: ${cands.join(' / ')}\n\n` +
            `別の公園として新しく登録しますか？`,
        );
        if (!ok) return;
      }
    }

    if (!editing.id) {
      await addPark({ code, name, lat: form.lat, lng: form.lng, note: form.note });
      onToast(`${name} を登録しました`);
    } else {
      let renumber = false;
      if (editing.code !== code) {
        const { treeCount } = await countParkContents(editing.id);
        if (treeCount > 0) {
          renumber = window.confirm(
            `公園コードを ${editing.code} → ${code} に変えます。\n` +
              `この公園の樹木 ${treeCount}件 の樹木番号も書き換えますか？\n\n` +
              `OK: 書き換える（例 ${editing.code}-001 → ${code}-001）\n` +
              `キャンセル: 樹木番号はこのままにする`,
          );
        }
      }
      await updatePark(
        editing.id,
        { code, name, lat: form.lat, lng: form.lng, note: form.note },
        { renumber },
      );
      onToast(`${name} を更新しました`);
    }
    setEditing(null);
    setForm(blank);
  };

  const handleDelete = async (park) => {
    const { treeCount, photoCount } = await countParkContents(park.id);
    const ok = window.confirm(
      `「${park.name}」をまるごと削除します。\n\n` +
        `　樹木 ${treeCount}件 / 写真 ${photoCount}枚 も一緒に消えます。\n` +
        `この操作は取り消せません。よろしいですか？`,
    );
    if (!ok) return;
    await deleteParkCascade(park.id);
    onParkDeleted?.(park.id);
    onToast(`${park.name} を削除しました`);
  };

  // CSVから公園を一括登録する（樹木台帳メモと同じ形式のCSVを想定）
  const handleCsv = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCsvBusy(true);
    setError('');
    try {
      const parsed = parseParkCsv(decodeCsvBuffer(await file.arrayBuffer()));
      if (!parsed.ok) {
        setError(parsed.reason);
        return;
      }
      const ok = window.confirm(
        `${file.name} から ${parsed.rows.length}件 の公園を読み取りました。\n` +
          `すでに登録済みの公園は飛ばします。公園コードは続きから自動で付けます。\n\n登録しますか？`,
      );
      if (!ok) return;

      const { added, skipped, skippedNames } = await importParks(parsed.rows);
      onToast(`公園を ${added}件 登録しました${skipped ? `（${skipped}件は登録済みのため飛ばしました）` : ''}`);
      if (skipped) {
        setError(
          `登録済みだった公園（${skipped}件）: ${skippedNames.slice(0, 5).join(' / ')}${skipped > 5 ? ' …' : ''}`,
        );
      }
    } catch (err) {
      setError(`CSVを読み込めませんでした: ${err.message ?? err}`);
    } finally {
      setCsvBusy(false);
    }
  };

  const sorted = [...parks].sort((a, b) =>
    String(b.lastUsedAt ?? '').localeCompare(String(a.lastUsedAt ?? '')),
  );

  return (
    <section className="block">
      <h3 className="block-title">公園</h3>

      {sorted.length === 0 && <p className="muted">まだ公園がありません。</p>}

      <ul className="rows">
        {sorted.map((p) => (
          <li key={p.id} className="row">
            <span className="row-main">
              <strong>{p.name}</strong>
              <span className="muted">
                {p.code}
                {Number.isFinite(p.lat) ? ` / ${formatLatLng(p.lat, p.lng)}` : ' / 代表座標なし'}
              </span>
            </span>
            <span className="row-actions">
              <button type="button" className="btn btn-ghost" onClick={() => openEdit(p)}>
                編集
              </button>
              <button type="button" className="btn btn-danger" onClick={() => handleDelete(p)}>
                削除
              </button>
            </span>
          </li>
        ))}
      </ul>

      {!editing && (
        <>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={openNew}>
              ＋ 公園を追加
            </button>
            <input
              ref={csvRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={handleCsv}
            />
            <button
              type="button"
              className="btn"
              onClick={() => csvRef.current?.click()}
              disabled={csvBusy}
            >
              {csvBusy ? '読み込み中…' : '📤 CSVから取り込む'}
            </button>
          </div>
          <p className="hint">
            CSVの見出しに「{NAME_HEADERS.join(' / ')}」のいずれかがあれば公園名として読み取ります。
            「緯度」「経度」の列があれば代表座標にも入れます。文字コードは UTF-8 と Shift_JIS
            のどちらでも構いません（樹木台帳メモと同じ形式です）。
          </p>
        </>
      )}

      {editing && (
        <div className="subform">
          <label className="field">
            <span className="field-label">公園名</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例 皇子が丘公園"
            />
          </label>
          <label className="field">
            <span className="field-label">公園コード（樹木番号の頭に付く。半角英数とハイフン）</span>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="P001"
            />
          </label>
          <div className="btn-row">
            <button type="button" className="btn" onClick={pickHere} disabled={geoBusy}>
              📍 現在地を入れる
            </button>
            {Number.isFinite(form.lat) && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setForm({ ...form, lat: null, lng: null })}
              >
                クリア
              </button>
            )}
          </div>
          <p className="hint">
            代表座標{Number.isFinite(form.lat) ? `: ${formatLatLng(form.lat, form.lng)}` : 'は地図タブの初期表示に使います（任意）'}
          </p>
          <label className="field">
            <span className="field-label">メモ（任意）</span>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </label>

          {error && <p className="status status-error">{error}</p>}

          <div className="btn-row">
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
              キャンセル
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave}>
              {editing.id ? '更新' : '登録'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
