// 地図で座標を補正するモーダル。
// 中身は v27 の src/components/InspectForm/LocationPicker.jsx とほぼ同じ
// （クリックでピン移動・ドラッグで微修正・外から座標が変わったら中心を追従）。
// 本アプリでは登録タブを短く保ちたいので、常時表示ではなくモーダルに入れている。
// 樹冠の下ではGPSが反射（マルチパス）でずれるので、手で直せる導線が要る。
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { GSI_ATTRIBUTION, GSI_TILE_URL, pinIcon } from '../MapView/leafletSetup.js';
import { formatLatLng } from '../../lib/geo.js';

const DEFAULT_CENTER = [35.0045, 135.8686]; // 既定中心（大津市付近）。v27 と同じ

// 地図クリックでピンを移動
function ClickCapture({ onPick }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// 外から緯度経度が変わったら地図の中心を追従させる
function Recenter({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.setView([lat, lng], map.getZoom(), { animate: true });
    }
  }, [lat, lng, map]);
  return null;
}

export default function MapModal({ lat, lng, hasPin, onCancel, onPick }) {
  const start = Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  const [pos, setPos] = useState(hasPin && start ? start : null);
  const markerRef = useRef(null);
  const center = useMemo(() => start ?? DEFAULT_CENTER, [start?.[0], start?.[1]]);
  const hasPoint = Boolean(pos);

  const dragHandlers = useMemo(
    () => ({
      dragend() {
        const m = markerRef.current;
        if (m) {
          const p = m.getLatLng();
          setPos([p.lat, p.lng]);
        }
      },
    }),
    [],
  );

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal modal-map">
        <div className="modal-head">
          <strong>地図で位置を直す</strong>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            閉じる
          </button>
        </div>

        <div className="map-wrap">
          <MapContainer center={center} zoom={hasPoint ? 18 : 15} className="map">
            <TileLayer url={GSI_TILE_URL} attribution={GSI_ATTRIBUTION} maxZoom={18} />
            <ClickCapture onPick={(a, b) => setPos([a, b])} />
            {hasPoint && (
              <Marker
                draggable
                position={pos}
                icon={pinIcon}
                ref={markerRef}
                eventHandlers={dragHandlers}
              />
            )}
          </MapContainer>
        </div>

        <p className="hint">
          {hasPoint
            ? `${formatLatLng(pos[0], pos[1])} — ピンをドラッグ、または地図をタップして位置を微修正できます。`
            : '「📍現在地を入れる」で取得するか、地図をタップして位置を指定してください。'}
        </p>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            キャンセル
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!hasPoint}
            onClick={() => onPick({ lat: pos[0], lng: pos[1] })}
          >
            この位置にする
          </button>
        </div>
      </div>
    </div>
  );
}
