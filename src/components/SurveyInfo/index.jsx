// 調査情報（紙のチェックシートの表頭）。
// 「場所 / 調査日 / 調査者 / テープロール」は1枚のシートで共通なので、
// 1本ごとに入れ直さず、登録のたびに引き継ぐ（端末に覚えさせておく）。
// 場所は公園セレクタで選んでいるものをそのまま使う。
import { TAPE_ROLLS } from '../../lib/inspection.js';

export default function SurveyInfo({ value, onChange, parkName, open, onToggle }) {
  const set = (key, v) => onChange({ ...value, [key]: v });

  const summary = [
    parkName || '公園未選択',
    value.surveyDate || '調査日なし',
    value.surveyor || '調査者なし',
    value.tapeRoll ? `ロール${value.tapeRoll}` : '',
  ]
    .filter(Boolean)
    .join(' / ');

  return (
    <section className="block">
      <button type="button" className="disclosure" onClick={onToggle}>
        {open ? '▼' : '▶'} 調査情報
        {!open && <span className="muted survey-summary">{summary}</span>}
      </button>

      {open && (
        <>
          <p className="hint">
            1枚のチェックシートで共通の項目です。登録のたびに引き継ぎます。
            場所は上で選んでいる公園（{parkName || '未選択'}）を使います。
          </p>
          <div className="field-row">
            <label className="field">
              <span className="field-label">調査日</span>
              <input
                type="date"
                value={value.surveyDate}
                onChange={(e) => set('surveyDate', e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">調査者</span>
              <input
                type="text"
                value={value.surveyor}
                onChange={(e) => set('surveyor', e.target.value)}
                placeholder="例 橘川"
              />
            </label>
          </div>

          <div className="choice-row">
            <span className="choice-label">テープロール</span>
            <div className="choice-opts">
              {TAPE_ROLLS.map((code) => {
                const on = value.tapeRoll === code;
                return (
                  <button
                    type="button"
                    key={code}
                    className={`choice ${on ? 'choice-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => set('tapeRoll', on ? '' : code)}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
