// 樹種タイル。よく使う樹種を12枚まで、使用回数の降順で並べる。
// 末尾に「その他（入力）」と「不明」を常設する。
import { useMemo, useState } from 'react';

const TILE_LIMIT = 12;

/** 使用回数の降順（同数ならマスタの並び順）で上位12件を返す */
export function orderSpecies(master = [], usage = {}, limit = TILE_LIMIT) {
  return [...master]
    .map((name, i) => ({ name, count: usage[name] ?? 0, i }))
    .sort((a, b) => b.count - a.count || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.name);
}

export default function SpeciesTiles({ value, onChange, master = [], usage = {} }) {
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState('');

  const tiles = useMemo(() => orderSpecies(master, usage), [master, usage]);
  // 選択中の樹種が上位12件に入っていないときは、見失わないよう先頭に足す
  const shown = value && value !== '不明' && !tiles.includes(value) ? [value, ...tiles] : tiles;

  const commitOther = () => {
    const name = otherText.trim();
    if (!name) return;
    onChange(name);
    setOtherText('');
    setOtherOpen(false);
  };

  return (
    <section className="block">
      <h3 className="block-title">樹種</h3>
      <div className="tiles">
        {shown.map((name) => (
          <button
            type="button"
            key={name}
            className={`tile ${value === name ? 'tile-on' : ''}`}
            onClick={() => onChange(name)}
          >
            {name}
          </button>
        ))}
        <button
          type="button"
          className={`tile tile-sub ${otherOpen ? 'tile-on' : ''}`}
          onClick={() => setOtherOpen((v) => !v)}
        >
          その他（入力）
        </button>
        <button
          type="button"
          className={`tile tile-sub ${value === '不明' ? 'tile-on' : ''}`}
          onClick={() => onChange('不明')}
        >
          不明
        </button>
      </div>

      {otherOpen && (
        <div className="link-row">
          <input
            type="text"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitOther();
              }
            }}
            placeholder="樹種名を入力（例 クスノキ）"
            autoFocus
          />
          <button type="button" className="btn btn-ghost" onClick={commitOther}>
            決定
          </button>
        </div>
      )}

      {shown.length === 0 && !otherOpen && (
        <p className="hint">
          まだ樹種がありません。「その他（入力）」から入れると、次から樹種タイルに並びます。
        </p>
      )}
    </section>
  );
}
