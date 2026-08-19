// 座標入力ブロック。v27 の src/components/InspectForm/GeoField.jsx を移植したもの。
// UI文言・入力欄の持ち方（手入力中の文字列をローカルstateで保持する）・エラー文は
// 向こうに合わせてある。本アプリ固有の差分は次の2点:
//   - 「地図で確認」が Googleマップへの外部リンクではなく、地図モーダル（ピン補正）を開く
//     （CLAUDE.md 3-2。v27 の LocationPicker.jsx にあたる機能をモーダルに入れている）
//   - 誤差(accuracy) を保持して「誤差 約◯m」を出す
import { useEffect, useState } from 'react';
import {
  getCurrentPosition,
  geolocationErrorMessage,
  parseLatLng,
  formatLatLng,
  isValidLat,
  isValidLng,
  mapUrl,
  SOURCE_LABEL,
} from '../../lib/geo.js';
import MapModal from './MapModal.jsx';

/**
 * value: { lat, lng, accuracy, coordSource }
 * onChange: 上の形のオブジェクトを返す
 */
export default function LocationPicker({ value, onChange, fallbackCenter }) {
  const { lat, lng, accuracy, coordSource } = value;
  const [latText, setLatText] = useState('');
  const [lngText, setLngText] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  // 外部（現在地取得・地図のピン操作・編集画面の読み込み）で値が変わったら入力欄に反映する。
  // 手入力中は lat が変化しないため、途中の "35." のような文字列が消えることはない。
  useEffect(() => {
    setLatText(lat == null || lat === '' ? '' : String(lat));
  }, [lat]);
  useEffect(() => {
    setLngText(lng == null || lng === '' ? '' : String(lng));
  }, [lng]);

  const hasCoord = lat != null && lat !== '' && lng != null && lng !== '';
  const latBad = latText.trim() !== '' && !isValidLat(Number(latText));
  const lngBad = lngText.trim() !== '' && !isValidLng(Number(lngText));

  // 手入力。数値として妥当になった時点だけ値に反映する（入力途中は欄の値のみ更新）。
  const setOne = (key, text, valid) => {
    setErr('');
    setMsg('');
    if (key === 'lat') setLatText(text);
    else setLngText(text);
    const t = text.trim();
    if (t === '') {
      onChange({ ...value, [key]: null, accuracy: null, coordSource: 'manual' });
      return;
    }
    const n = Number(t);
    if (valid(n)) onChange({ ...value, [key]: n, accuracy: null, coordSource: 'manual' });
  };

  const clear = () => {
    setLatText('');
    setLngText('');
    setPasteText('');
    setErr('');
    setMsg('');
    onChange({ lat: null, lng: null, accuracy: null, coordSource: null });
  };

  const getGeo = async () => {
    setErr('');
    setBusy(true);
    setMsg('取得中…');
    try {
      const pos = await getCurrentPosition();
      onChange({ lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, coordSource: 'gps' });
      setMsg(
        pos.accuracy
          ? `現在地を取得しました（誤差 約${Math.round(pos.accuracy)}m）。`
          : '現在地を取得しました。',
      );
    } catch (e) {
      setErr(geolocationErrorMessage(e));
      setMsg('');
    } finally {
      setBusy(false);
    }
  };

  // Googleマップのリンクなどを読み取って座標に変換する
  const applyPaste = () => {
    const r = parseLatLng(pasteText);
    if (!r.ok) {
      setErr(r.reason);
      setMsg('');
      return;
    }
    onChange({ lat: r.lat, lng: r.lng, accuracy: null, coordSource: 'link' });
    setPasteText('');
    setErr('');
    setMsg(`読み取りました：${formatLatLng(r.lat, r.lng)}`);
  };

  const applyMapPick = (picked) => {
    onChange({ lat: picked.lat, lng: picked.lng, accuracy: null, coordSource: 'map' });
    setErr('');
    setMsg(`地図で位置を指定しました：${formatLatLng(picked.lat, picked.lng)}`);
    setMapOpen(false);
  };

  return (
    <section className="block geo-field">
      <h3 className="block-title">座標</h3>

      <div className="gps-row">
        <label className="field">
          <span className="field-label">緯度 Latitude</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="35.011600"
            value={latText}
            aria-label="緯度"
            aria-invalid={latBad || undefined}
            onChange={(e) => setOne('lat', e.target.value, isValidLat)}
          />
        </label>
        <label className="field">
          <span className="field-label">経度 Longitude</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="135.768100"
            value={lngText}
            aria-label="経度"
            aria-invalid={lngBad || undefined}
            onChange={(e) => setOne('lng', e.target.value, isValidLng)}
          />
        </label>
      </div>

      <div className="geo-row">
        <button type="button" className="btn" onClick={getGeo} disabled={busy}>
          📍 現在地を入れる
        </button>
        {hasCoord && (
          <button type="button" className="btn btn-ghost" onClick={clear}>
            クリア
          </button>
        )}
        {/* v27 と同じく、Googleマップ（スマホならアプリ）で開いて目視確認する */}
        {hasCoord && !latBad && !lngBad && (
          <a
            className="linklike"
            href={mapUrl(lat, lng)}
            target="_blank"
            rel="noopener noreferrer"
          >
            地図で確認
          </a>
        )}
        <button type="button" className="linklike" onClick={() => setMapOpen(true)}>
          地図で位置を直す
        </button>
      </div>

      <p className="geo-status">
        {hasCoord
          ? `${formatLatLng(lat, lng)}${
              coordSource && SOURCE_LABEL[coordSource] ? `（${SOURCE_LABEL[coordSource]}）` : ''
            }`
          : '座標なし'}
      </p>

      <div className="geo-row">
        <input
          type="text"
          className="geo-paste"
          value={pasteText}
          placeholder={'Googleマップのリンク / 35.0116, 135.7681 / 35°00\'41.8"N 135°46\'05.2"E'}
          onChange={(e) => {
            setPasteText(e.target.value);
            setErr('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              applyPaste();
            }
          }}
        />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={applyPaste}
          disabled={!pasteText.trim()}
        >
          読み取り
        </button>
      </div>

      {(latBad || lngBad) && (
        <p className="geo-err">
          緯度は -90〜90、経度は -180〜180 の範囲で入力してください（緯度と経度が逆になっていませんか）。
        </p>
      )}
      {err && <p className="geo-err">{err}</p>}
      {!err && msg && <p className="hint">{msg}</p>}
      <p className="hint">
        後日の登録でも、現地のGoogleマップのリンクや緯度経度を貼り付ければ座標を残せます。
      </p>

      {mapOpen && (
        <MapModal
          lat={hasCoord ? Number(lat) : (fallbackCenter?.lat ?? null)}
          lng={hasCoord ? Number(lng) : (fallbackCenter?.lng ?? null)}
          hasPin={hasCoord}
          onCancel={() => setMapOpen(false)}
          onPick={applyMapPick}
        />
      )}
    </section>
  );
}
