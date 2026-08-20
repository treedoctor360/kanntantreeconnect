// 登録タブ（新規登録と編集の両方に使う）。ここの摩擦をゼロにするのが最優先。
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  getTreePhotos,
  isTreeNoTaken,
  recordSpeciesUse,
  saveTree,
  suggestTapeNo,
} from '../../db/db.js';
import { makeThumb } from '../../lib/image.js';
import { emptyInspection, emptySurvey, pickInspection } from '../../lib/inspection.js';
import { treeNoFromTape } from '../../lib/treeNo.js';
import LocationPicker from '../LocationPicker/index.jsx';
import SpeciesTiles from '../SpeciesTiles/index.jsx';
import PhotoInput from '../PhotoInput/index.jsx';
import InspectionFields from '../InspectionFields/index.jsx';
import SurveyInfo from '../SurveyInfo/index.jsx';

const emptyCoord = { lat: null, lng: null, accuracy: null, coordSource: null };

export default function RegisterForm({
  parks,
  currentParkId,
  onSelectPark,
  editingTree = null,
  onFinishEdit,
  onToast,
  onGoSettings,
}) {
  const isEdit = Boolean(editingTree);
  const parkId = isEdit ? editingTree.parkId : currentParkId;
  const park = parks.find((p) => p.id === parkId) ?? null;

  const [treeNo, setTreeNo] = useState('');
  const [treeNoEdited, setTreeNoEdited] = useState(false);
  const [tapeEdited, setTapeEdited] = useState(false); // テープ番号を手で直したか
  const [species, setSpecies] = useState('');
  const [coord, setCoord] = useState(emptyCoord);
  const [photos, setPhotos] = useState([]);
  const [girth, setGirth] = useState('');
  const [note, setNote] = useState('');
  const [optionOpen, setOptionOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dupWarn, setDupWarn] = useState(false);
  // 点検内容（紙のチェックシート1ページ目）と調査情報（表頭）
  const [inspection, setInspection] = useState(emptyInspection);
  const [survey, setSurvey] = useState(emptySurvey);
  const [surveyOpen, setSurveyOpen] = useState(false);

  const speciesMaster = useLiveQuery(() => db.settings.get('speciesMaster'), [], null);
  const speciesUsage = useLiveQuery(() => db.settings.get('speciesUsage'), [], null);
  const master = speciesMaster?.value ?? [];
  const usage = speciesUsage?.value ?? {};

  // 編集を開いたとき: 既存の値を流し込む
  useEffect(() => {
    if (!isEdit) return;
    setTreeNo(editingTree.treeNo ?? '');
    setTreeNoEdited(true);
    setTapeEdited(true);
    setSpecies(editingTree.species ?? '');
    setCoord({
      lat: editingTree.lat ?? null,
      lng: editingTree.lng ?? null,
      accuracy: editingTree.accuracy ?? null,
      coordSource: editingTree.coordSource ?? null,
    });
    setGirth(editingTree.girth ?? '');
    setNote(editingTree.note ?? '');
    setOptionOpen(Boolean(editingTree.girth || editingTree.note));
    setInspection(pickInspection(editingTree));
    setSurvey({
      surveyDate: editingTree.surveyDate ?? '',
      surveyor: editingTree.surveyor ?? '',
      tapeRoll: editingTree.tapeRoll ?? '',
    });
    getTreePhotos(editingTree.id).then((rows) => setPhotos(rows.map((r) => r.dataUrl)));
  }, [isEdit, editingTree]);

  // 新規: 公園やテープロールが変わったら、次のテープ番号と樹木番号を出し直す。
  // テープロールは公園をまたいで連続して使うので、番号は端末全体から求める（14章）。
  useEffect(() => {
    if (isEdit || !park) return;
    let alive = true;
    suggestTapeNo(survey.tapeRoll).then((tape) => {
      if (!alive || tapeEdited) return;
      setInspection((v) => ({ ...v, tapeNo: tape }));
      if (!treeNoEdited) setTreeNo(treeNoFromTape(park.code, tape));
    });
    return () => {
      alive = false;
    };
    // tapeEdited / treeNoEdited は依存に入れない（手で直した番号を上書きしないため）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, park?.id, park?.code, survey.tapeRoll]);

  // 新規: 前回選んだ樹種を初期選択にする
  useEffect(() => {
    if (isEdit || species) return;
    db.settings.get('lastSpecies').then((row) => {
      if (row?.value) setSpecies(row.value);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit]);

  // 新規: 前回の調査情報（調査日・調査者・テープロール）を引き継ぐ
  useEffect(() => {
    if (isEdit) return;
    db.settings.get('lastSurvey').then((row) => {
      if (row?.value) setSurvey((v) => ({ ...v, ...row.value }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit]);

  // 番号の重複チェック（入力のたび）
  useEffect(() => {
    if (!parkId || !treeNo) {
      setDupWarn(false);
      return;
    }
    let alive = true;
    isTreeNoTaken(parkId, treeNo, editingTree?.id ?? null).then((taken) => {
      if (alive) setDupWarn(taken);
    });
    return () => {
      alive = false;
    };
  }, [parkId, treeNo, editingTree?.id]);

  const sortedParks = useMemo(
    () => [...parks].sort((a, b) => String(b.lastUsedAt ?? '').localeCompare(String(a.lastUsedAt ?? ''))),
    [parks],
  );

  /**
   * 点検内容の変更。テープ番号を入れたら樹木番号もそれに合わせる
   * （紙のシートの「樹木番号（公園コード+テープ番号）」に従う）。
   * 樹木番号を手で直したあとは、上書きしない。
   */
  const handleInspectionChange = (next) => {
    setInspection(next);
    if (next.tapeNo === inspection.tapeNo) return;
    setTapeEdited(true);
    if (isEdit || treeNoEdited || !park) return;
    const derived = treeNoFromTape(park.code, next.tapeNo);
    if (derived) setTreeNo(derived);
  };

  const resetForNext = async (nextPark) => {
    setCoord(emptyCoord);
    setPhotos([]);
    setGirth('');
    setNote('');
    setOptionOpen(false);
    setTreeNoEdited(false);
    setTapeEdited(false);
    // 点検内容は1本ごとに違うので消す。テープ番号だけは次の番号を入れておく
    const tape = await suggestTapeNo(survey.tapeRoll);
    setInspection({ ...emptyInspection(), tapeNo: tape });
    setTreeNo(nextPark ? treeNoFromTape(nextPark.code, tape) : '');
  };

  const handleSave = async () => {
    if (!park) return;
    if (!treeNo.trim()) {
      onToast('樹木番号を入れてください。');
      return;
    }
    if (dupWarn) {
      const ok = window.confirm(
        `${treeNo} は同じ公園にすでにあります。\nこのまま登録しますか？（一覧に「重複」バッジが付きます）`,
      );
      if (!ok) return;
    }

    setSaving(true);
    try {
      const thumb = photos.length ? await makeThumb(photos[0]) : null;
      const record = {
        ...(editingTree ?? {}),
        id: editingTree?.id,
        parkId: park.id,
        parkCode: park.code,
        treeNo: treeNo.trim(),
        species: species || '不明',
        lat: Number.isFinite(coord.lat) ? coord.lat : null,
        lng: Number.isFinite(coord.lng) ? coord.lng : null,
        accuracy: coord.accuracy ?? null,
        coordSource: coord.coordSource ?? null,
        girth: girth === '' ? null : Number(girth),
        note: note.trim(),
        thumb,
        // 点検内容（紙のチェックシート1ページ目）
        tapeNo: inspection.tapeNo.trim(),
        height: inspection.height === '' ? null : Number(inspection.height),
        leafDensity: inspection.leafDensity,
        fungus: inspection.fungus,
        fungusPart: inspection.fungusPart,
        cavity: inspection.cavity,
        cavityPart: inspection.cavityPart,
        frass: inspection.frass,
        envRoad: inspection.envRoad,
        envWire: inspection.envWire,
        envBuilding: inspection.envBuilding,
        envNote: inspection.envNote.trim(),
        caution: inspection.caution.trim(),
        photoCount: photos.length, // 紙の「写真」欄にあたる（写真そのものはシートに送らない）
        // 調査情報（表頭）
        surveyDate: survey.surveyDate,
        surveyor: survey.surveyor.trim(),
        tapeRoll: survey.tapeRoll,
      };
      const saved = await saveTree(record, photos);
      // 使用回数は新規登録のときだけ増やす（編集のたびに増えると並び順が実態とずれる）
      await recordSpeciesUse(saved.species, { count: !isEdit });
      await db.settings.put({ key: 'lastSpecies', value: saved.species });
      // 調査情報は次の登録に引き継ぐ
      await db.settings.put({
        key: 'lastSurvey',
        value: { surveyDate: survey.surveyDate, surveyor: survey.surveyor.trim(), tapeRoll: survey.tapeRoll },
      });

      if (isEdit) {
        onToast(`${saved.treeNo} を更新しました`);
        onFinishEdit?.();
      } else {
        onToast(`${saved.treeNo} を登録しました`);
        // 公園・樹種は保持。座標・写真・任意項目はクリアし、番号を +1 する
        await resetForNext(park);
      }
    } catch (err) {
      onToast(`保存に失敗しました: ${err.message ?? err}`);
    } finally {
      setSaving(false);
    }
  };

  if (!parks.length) {
    return (
      <div className="pane">
        <div className="empty">
          <p>公園がまだ登録されていません。</p>
          <button type="button" className="btn btn-primary" onClick={onGoSettings}>
            公園を登録する
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pane pane-form">
      {!isEdit && (
        <section className="block">
          <h3 className="block-title">公園</h3>
          <div className="chips">
            {sortedParks.map((p) => (
              <button
                type="button"
                key={p.id}
                className={`chip ${p.id === parkId ? 'chip-on' : ''}`}
                onClick={() => onSelectPark(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <SurveyInfo
        value={survey}
        onChange={setSurvey}
        parkName={park?.name ?? ''}
        open={surveyOpen}
        onToggle={() => setSurveyOpen((v) => !v)}
      />

      <section className="block">
        <h3 className="block-title">
          テープ番号・樹木番号{' '}
          {isEdit ? '' : <span className="muted">（次の番号。タップで編集）</span>}
        </h3>
        <div className="field-row">
          <label className="field field-tape">
            <span className="field-label">テープ番号</span>
            <input
              type="text"
              inputMode="numeric"
              value={inspection.tapeNo}
              onChange={(e) => handleInspectionChange({ ...inspection, tapeNo: e.target.value })}
              placeholder="12"
            />
          </label>
          <label className="field">
            <span className="field-label">樹木番号（公園コード＋テープ番号）</span>
            <input
              className="treeno-input"
              type="text"
              value={treeNo}
              onChange={(e) => {
                setTreeNo(e.target.value);
                setTreeNoEdited(true);
              }}
              placeholder="P001-001"
            />
          </label>
        </div>
        {isEdit && park && <p className="hint">公園: {park.name}</p>}
        {dupWarn && <p className="status status-error">同じ公園にこの番号がすでにあります。</p>}
      </section>

      <SpeciesTiles value={species} onChange={setSpecies} master={master} usage={usage} />

      <InspectionFields value={inspection} onChange={handleInspectionChange} />

      <LocationPicker
        value={coord}
        onChange={setCoord}
        fallbackCenter={park && Number.isFinite(park.lat) ? { lat: park.lat, lng: park.lng } : null}
      />

      <PhotoInput photos={photos} onChange={setPhotos} />

      <section className="block">
        <button type="button" className="disclosure" onClick={() => setOptionOpen((v) => !v)}>
          {optionOpen ? '▼' : '▶'} 任意項目（幹周・メモ）
        </button>
        {optionOpen && (
          <>
            {/* 樹高は点検内容の欄に移した（紙のシートの並びに合わせるため） */}
            <label className="field">
              <span className="field-label">幹周 (cm)</span>
              <input
                type="number"
                inputMode="decimal"
                step="1"
                value={girth}
                onChange={(e) => setGirth(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">メモ</span>
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </>
        )}
      </section>

      <div className="form-foot">
        {isEdit && (
          <button type="button" className="btn btn-ghost btn-big" onClick={onFinishEdit}>
            キャンセル
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary btn-big"
          onClick={handleSave}
          disabled={saving || !park}
        >
          {saving ? '保存中…' : isEdit ? '更新' : '登録'}
        </button>
      </div>
    </div>
  );
}
