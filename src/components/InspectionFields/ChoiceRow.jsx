// 紙のチェックシートで「〇を付ける」欄にあたる部品。
// 選択肢を横に並べ、もう一度押すと選択を外せる（間違えて押したときに戻せるように）。
export default function ChoiceRow({ label, options, value, onChange, multi = false, isOn, hint }) {
  return (
    <div className="choice-row">
      <span className="choice-label">{label}</span>
      <div className="choice-opts">
        {options.map((opt) => {
          const on = multi ? isOn(opt.code) : value === opt.code;
          return (
            <button
              type="button"
              key={opt.code}
              className={`choice ${on ? 'choice-on' : ''}`}
              aria-pressed={on}
              title={opt.hint || undefined}
              onClick={() => onChange(multi ? opt.code : on ? '' : opt.code)}
            >
              {opt.code}
            </button>
          );
        })}
      </div>
      {hint && <span className="choice-hint">{hint}</span>}
    </div>
  );
}
