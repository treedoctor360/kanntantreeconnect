// 紙のチェックシートで「〇を付ける」欄にあたる部品。
// 選択肢を横に並べ、もう一度押すと選択を外せる（間違えて押したときに戻せるように）。
//
// 選択肢は { value, label, hint } を想定する。
//   value … 保存する値（画面比較にも使う）
//   label … ボタンに出す表示（value と別でよい。例: value '1' / label '濃'）
export default function ChoiceRow({ label, options, value, onChange, multi = false, isOn, hint }) {
  return (
    <div className="choice-row">
      <span className="choice-label">{label}</span>
      <div className="choice-opts">
        {options.map((opt) => {
          const on = multi ? isOn(opt.value) : value === opt.value;
          return (
            <button
              type="button"
              key={opt.value}
              className={`choice ${on ? 'choice-on' : ''}`}
              aria-pressed={on}
              title={opt.hint || undefined}
              onClick={() => onChange(multi ? opt.value : on ? '' : opt.value)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {hint && <span className="choice-hint">{hint}</span>}
    </div>
  );
}
