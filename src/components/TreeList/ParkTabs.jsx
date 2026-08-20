// 公園タブ（横スクロール）。最終使用日時の降順で並べる。
export default function ParkTabs({ parks, currentParkId, onSelectPark, allowAll = false }) {
  const sorted = [...parks].sort((a, b) =>
    String(b.lastUsedAt ?? '').localeCompare(String(a.lastUsedAt ?? '')),
  );
  return (
    <div className="parktabs">
      {allowAll && (
        <button
          type="button"
          className={`parktab ${!currentParkId ? 'parktab-on' : ''}`}
          onClick={() => onSelectPark(null)}
        >
          すべて
        </button>
      )}
      {sorted.map((p) => (
        <button
          type="button"
          key={p.id}
          className={`parktab ${p.id === currentParkId ? 'parktab-on' : ''}`}
          onClick={() => onSelectPark(p.id)}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}
