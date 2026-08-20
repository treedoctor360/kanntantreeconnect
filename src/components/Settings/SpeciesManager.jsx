// 樹種マスタの管理（追加・削除・並び替え）
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSpeciesMaster, setSpeciesMaster } from '../../db/db.js';

export default function SpeciesManager({ onToast }) {
  const [text, setText] = useState('');
  const row = useLiveQuery(() => db.settings.get('speciesMaster'), [], null);
  const usageRow = useLiveQuery(() => db.settings.get('speciesUsage'), [], null);
  const master = row?.value ?? [];
  const usage = usageRow?.value ?? {};

  const add = async () => {
    const name = text.trim();
    if (!name) return;
    const cur = await getSpeciesMaster();
    if (cur.includes(name)) {
      onToast(`${name} はすでにあります`);
      setText('');
      return;
    }
    await setSpeciesMaster([...cur, name]);
    setText('');
  };

  const remove = async (name) => {
    if (!window.confirm(`樹種「${name}」をマスタから外します。\n登録済みの樹木の樹種はそのまま残ります。`)) {
      return;
    }
    const cur = await getSpeciesMaster();
    await setSpeciesMaster(cur.filter((n) => n !== name));
  };

  const move = async (index, delta) => {
    const cur = await getSpeciesMaster();
    const to = index + delta;
    if (to < 0 || to >= cur.length) return;
    const next = [...cur];
    [next[index], next[to]] = [next[to], next[index]];
    await setSpeciesMaster(next);
  };

  return (
    <section className="block">
      <h3 className="block-title">樹種マスタ</h3>
      <p className="hint">
        登録タブのタイルは「使用回数の降順」で上位12件を出します。並び順は回数が同じときに効きます。
      </p>

      <div className="link-row">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="樹種名を追加（例 クスノキ）"
        />
        <button type="button" className="btn btn-ghost" onClick={add}>
          追加
        </button>
      </div>

      {master.length === 0 && <p className="muted">まだ樹種がありません。</p>}

      <ul className="rows">
        {master.map((name, i) => (
          <li key={name} className="row">
            <span className="row-main">
              <strong>{name}</strong>
              <span className="muted">{usage[name] ?? 0} 回</span>
            </span>
            <span className="row-actions">
              <button type="button" className="btn btn-ghost" onClick={() => move(i, -1)} disabled={i === 0}>
                ↑
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => move(i, 1)}
                disabled={i === master.length - 1}
              >
                ↓
              </button>
              <button type="button" className="btn btn-danger" onClick={() => remove(name)}>
                削除
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
