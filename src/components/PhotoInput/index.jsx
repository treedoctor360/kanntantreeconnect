// 写真の撮影・選択。保存前に長辺1280 / 品質0.7へ縮小する。1本あたり最大3枚。
import { useRef, useState } from 'react';
import { resizePhoto } from '../../lib/image.js';

const MAX_PHOTOS = 3;

export default function PhotoInput({ photos = [], onChange }) {
  const cameraRef = useRef(null); // capture付き = その場で撮影
  const albumRef = useRef(null); // capture無し = アルバム／ファイルから選ぶ
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // 同じ写真をもう一度選べるようにする
    if (!files.length) return;
    setBusy(true);
    setError('');
    try {
      const room = MAX_PHOTOS - photos.length;
      const added = [];
      for (const file of files.slice(0, room)) {
        added.push(await resizePhoto(file));
      }
      onChange([...photos, ...added]);
      if (files.length > room) setError(`写真は${MAX_PHOTOS}枚までです。`);
    } catch (err) {
      setError(err.message ?? '写真を読み込めませんでした。');
    } finally {
      setBusy(false);
    }
  };

  const removeAt = (i) => onChange(photos.filter((_, idx) => idx !== i));

  return (
    <section className="block">
      <h3 className="block-title">
        写真 <span className="muted">（{photos.length}/{MAX_PHOTOS}）</span>
      </h3>

      {/* 撮影用（背面カメラが直接開く） */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handleFiles}
      />
      {/* アルバム用（capture を付けない。iOSでは「フォトライブラリ」等が選べる） */}
      <input ref={albumRef} type="file" accept="image/*" multiple hidden onChange={handleFiles} />

      <div className="btn-row">
        <button
          type="button"
          className="btn"
          onClick={() => cameraRef.current?.click()}
          disabled={busy || photos.length >= MAX_PHOTOS}
        >
          {busy ? '処理中…' : '📷 撮影'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => albumRef.current?.click()}
          disabled={busy || photos.length >= MAX_PHOTOS}
        >
          🖼 アルバムから
        </button>
      </div>

      {photos.length > 0 && (
        <div className="thumbs">
          {photos.map((src, i) => (
            <button
              type="button"
              key={i}
              className="thumb"
              onClick={() => removeAt(i)}
              title="タップで削除"
            >
              <img src={src} alt={`写真${i + 1}`} />
              <span className="thumb-x">×</span>
            </button>
          ))}
        </div>
      )}

      {photos.length > 0 && <p className="hint">サムネイルをタップすると削除します。</p>}
      {error && <p className="status status-error">{error}</p>}
    </section>
  );
}
