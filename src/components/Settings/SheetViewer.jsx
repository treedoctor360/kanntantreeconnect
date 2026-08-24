// 紙の調査票を「アプリの中で」開くための重ね表示。
//
// 別タブ（window.open）で開くと、ホーム画面から起動したiPhoneには戻るボタンが無く、
// アプリへ帰れなくなる。そのためアプリの上に重ねて出し、[✕ 閉じる] で戻す。
//
// 印刷はこの画面の [🖨 印刷する] から window.print() を呼ぶだけ。
// アプリ本体を隠して用紙だけを出す指定は app.css の `@media print` にある。
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildSurveySheetFragment } from '../../lib/printSheet.js';

export default function SheetViewer({ options, onClose }) {
  const bodyRef = useRef(null);
  const docRef = useRef(null);
  // 用紙は横281mm。スマホの画面には入らないので、最初は全体が見えるように縮めておく
  const [fit, setFit] = useState(true);
  const [zoom, setZoom] = useState(1);

  // 印刷のときにアプリ本体を隠すための目印。閉じたら必ず外す
  useEffect(() => {
    document.body.classList.add('sheet-open');
    return () => document.body.classList.remove('sheet-open');
  }, []);

  // Escキーでも閉じられるようにする（パソコンで見るとき用）
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 画面幅にちょうど収まる倍率を決める。
  // 用紙の実寸（281mm＋余白）は変わらないので、縮める前に一度だけ測って覚えておく。
  // 縮めたあとに測り直すと、縮んだ寸法をもとに計算してしまい合わなくなる。
  const naturalW = useRef(0);

  const measure = useCallback(() => {
    const box = bodyRef.current;
    if (!box || !naturalW.current) return;
    setZoom(Math.min(1, box.clientWidth / naturalW.current));
  }, []);

  useLayoutEffect(() => {
    const box = bodyRef.current;
    const doc = docRef.current;
    if (!box || !doc) return undefined;
    // この時点ではまだ縮めていない（zoom=1）ので、これが実寸
    naturalW.current = doc.scrollWidth;
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // body直下に出す。アプリ本体（#root）と兄弟にしておくと、
  // 印刷のときに #root だけを隠せる
  return createPortal(
    <div
      className={`sheet-viewer ${fit ? 'is-fit' : ''}`}
      style={{ '--sheet-zoom': zoom }}
      role="dialog"
      aria-modal="true"
      aria-label="紙の調査票"
    >
      <div className="sheet-viewer-bar">
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          ✕ 閉じる
        </button>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          🖨 印刷する
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          aria-pressed={!fit}
          onClick={() => setFit((v) => !v)}
        >
          {fit ? '🔍 拡大' : '⤢ 全体'}
        </button>
      </div>
      <div className="sheet-viewer-body" ref={bodyRef}>
        <div
          className="sheetdoc"
          ref={docRef}
          dangerouslySetInnerHTML={{ __html: buildSurveySheetFragment(options) }}
        />
      </div>
      <p className="sheet-viewer-hint">
        画面の見え方にかかわらず、印刷は<b>A4・横</b>の原寸で出ます
      </p>
    </div>,
    document.body,
  );
}
