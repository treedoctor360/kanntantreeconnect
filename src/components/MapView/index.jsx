// 地図タブ。国土地理院タイル。選択中の公園の代表座標を初期表示に使う。
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { db } from '../../db/db.js';
import { GSI_ATTRIBUTION, GSI_TILE_URL, treeIcon } from './leafletSetup.js';
import ParkTabs from '../TreeList/ParkTabs.jsx';

const DEFAULT_CENTER = [35.0, 135.85];

/** 公園を切り替えたら地図の中心も動かす */
function Recenter({ center, zoom }) {
  const map = useMap();
  map.setView(center, zoom);
  return null;
}

export default function MapView({ parks, currentParkId, onSelectPark, onEdit }) {
  const trees = useLiveQuery(
    () =>
      currentParkId
        ? db.trees.where('parkId').equals(currentParkId).toArray()
        : db.trees.toArray(),
    [currentParkId],
    null,
  );

  const list = trees ?? [];
  const withCoord = list.filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lng));
  const noCoordCount = list.length - withCoord.length;

  const park = parks.find((p) => p.id === currentParkId) ?? null;
  const center = useMemo(() => {
    if (park && Number.isFinite(park.lat) && Number.isFinite(park.lng)) return [park.lat, park.lng];
    if (withCoord.length) return [withCoord[0].lat, withCoord[0].lng];
    return DEFAULT_CENTER;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [park?.id, park?.lat, park?.lng, withCoord.length]);

  return (
    <div className="pane pane-map">
      <ParkTabs parks={parks} currentParkId={currentParkId} onSelectPark={onSelectPark} allowAll />

      <div className="map-wrap map-wrap-full">
        <MapContainer center={center} zoom={17} className="map">
          <Recenter center={center} zoom={17} />
          <TileLayer url={GSI_TILE_URL} attribution={GSI_ATTRIBUTION} maxZoom={18} />
          {withCoord.map((t) => (
            <Marker key={t.id} position={[t.lat, t.lng]} icon={treeIcon(t.treeNo)}>
              <Popup>
                <div className="popup">
                  <strong>{t.treeNo}</strong>
                  <div>{t.species}</div>
                  {t.thumb && <img className="popup-thumb" src={t.thumb} alt="" />}
                  <button type="button" className="btn btn-ghost" onClick={() => onEdit(t)}>
                    編集
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {noCoordCount > 0 && <div className="map-note">座標なし {noCoordCount}件</div>}
      </div>
    </div>
  );
}
