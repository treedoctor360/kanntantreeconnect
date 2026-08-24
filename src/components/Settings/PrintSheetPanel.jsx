// 紙の調査票を印刷する（アプリを使わない人に渡すため）。
// 用紙の中身は src/lib/printSheet.js が点検項目の定義から組み立てるので、
// アプリに項目を足せば紙にも自動でつく。
import { useEffect, useState } from 'react';
import { getSetting } from '../../db/db.js';
import { TAPE_ROLLS, toDateInput } from '../../lib/inspection.js';
import { buildSurveySheetHtml } from '../../lib/printSheet.js';

const ROW_CHOICES = [10, 14, 18];

export default function PrintSheetPanel({ parks = [], onToast }) {
  const [parkId, setParkId] = useState('');
  const [surveyDate, setSurveyDate] = useState('');
  const [surveyor, setSurveyor] = useState('');
  const [tapeRoll, setTapeRoll] = useState('');
  const [rows, setRows] = useState(14);
  const [blocked, setBlocked] = useState(false);

  // 前回の調査情報を初期値にする（登録タブと同じものを使い回す）
  useEffect(() => {
    getSetting('lastSurvey', null).then((v) => {
      if (!v) return;
      setSurveyDate(v.surveyDate ?? '');
      setSurveyor(v.surveyor ?? '');
      setTapeRoll(v.tapeRoll ?? '');
    });
  }, []);

  const html = () =>
    buildSurveySheetHtml({
      parkName: parks.find((p) => p.id === parkId)?.name ?? '',
      surveyDate,
      surveyor,
      tapeRoll,
      rows,
    });

  const openSheet = () => {
    setBlocked(false);
    const w = window.open('', '_blank');
    if (!w) {
      setBlocked(true); // ポップアップが止められた
      return;
    }
    w.document.write(html());
    w.document.close();
  };

  // ポップアップが使えない端末向け。ファイルとして保存してから開いてもらう
  const downloadSheet = () => {
    const blob = new Blob([html()], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `樹木点検チェックシート-${surveyDate || toDateInput()}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onToast?.('調査票を保存しました（開いて印刷してください）');
  };

  return (
    <section className="block">
      <h3 className="block-title">紙の調査票</h3>
      <p className="hint">
        アプリを使わない人に渡すための用紙です。<b>項目はアプリとまったく同じ</b>なので、
        書いてもらった紙をそのまま登録タブに転記できます。A4横・2枚（1枚目が記入表、
        2枚目が記入の凡例と運用のきまり）。
      </p>

      <label className="field">
        <span className="field-label">場所（公園）— 選ぶと用紙に印字されます</span>
        <select value={parkId} onChange={(e) => setParkId(e.target.value)}>
          <option value="">（手書きする）</option>
          {parks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <div className="field-row">
        <label className="field">
          <span className="field-label">調査日</span>
          <input type="date" value={surveyDate} onChange={(e) => setSurveyDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">調査者</span>
          <input
            type="text"
            value={surveyor}
            onChange={(e) => setSurveyor(e.target.value)}
            placeholder="（手書きする）"
          />
        </label>
      </div>

      <div className="choice-row">
        <span className="choice-label">テープロール</span>
        <div className="choice-opts">
          {TAPE_ROLLS.map((code) => {
            const on = tapeRoll === code;
            return (
              <button
                type="button"
                key={code}
                className={`choice ${on ? 'choice-on' : ''}`}
                aria-pressed={on}
                onClick={() => setTapeRoll(on ? '' : code)}
              >
                {code}
              </button>
            );
          })}
        </div>
      </div>

      <div className="choice-row">
        <span className="choice-label">1枚に入れる行数（＝本数）</span>
        <div className="choice-opts">
          {ROW_CHOICES.map((n) => (
            <button
              type="button"
              key={n}
              className={`choice ${rows === n ? 'choice-on' : ''}`}
              aria-pressed={rows === n}
              onClick={() => setRows(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="choice-hint">行を増やすと1行が細くなります。手書きなら14行が目安</span>
      </div>

      <div className="btn-row">
        <button type="button" className="btn btn-primary btn-wrap" onClick={openSheet}>
          🖨 調査票を開く（印刷）
        </button>
        <button type="button" className="btn btn-ghost btn-wrap" onClick={downloadSheet}>
          HTMLで保存
        </button>
      </div>

      {blocked && (
        <p className="status status-error">
          別タブが開けませんでした（ポップアップが止められています）。
          「HTMLで保存」から保存して、そのファイルを開いて印刷してください。
        </p>
      )}

      <p className="hint">
        印刷は開いた画面の「🖨 印刷する」から。用紙は<b>A4・横</b>、余白は既定のままで収まります。
      </p>
    </section>
  );
}
