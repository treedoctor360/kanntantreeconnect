// 点検内容（紙の「樹木点検 現地チェックシート」1ページ目の各行の項目）。
// 並びは紙と同じにしてある。現場で紙と見比べながら入れられるようにするため。
import {
  CAVITY,
  FRASS,
  FUNGUS,
  FUNGUS_PART,
  LEAF_DENSITY,
  hasPart,
  togglePart,
} from '../../lib/inspection.js';
import ChoiceRow from './ChoiceRow.jsx';

/**
 * value: { tapeNo, leafDensity, fungus, fungusPart, cavity, frass, caution }
 * onChange: 上の形のオブジェクトを返す
 *
 * テープ番号は樹木番号を作る元なので、この部品ではなく樹木番号の欄に置いている
 * （紙のシートでも「テープ番号」→「樹木番号」の順に並んでいる）。
 */
export default function InspectionFields({ value, onChange }) {
  const set = (key, v) => onChange({ ...value, [key]: v });

  return (
    <section className="block">
      <h3 className="block-title">点検内容</h3>

      <ChoiceRow
        label="葉の茂り"
        options={LEAF_DENSITY}
        value={value.leafDensity}
        onChange={(v) => set('leafDensity', v)}
        hint="濃=茂っている / 普=普通 / ま=空が透けて見える / ほ=葉が殆どない"
      />

      <ChoiceRow
        label="キノコ"
        options={FUNGUS}
        value={value.fungus}
        onChange={(v) =>
          // 「無」「未」に変えたら部位は消す（紙でも部位は書かないため）
          onChange({ ...value, fungus: v, fungusPart: v === '有' ? value.fungusPart : '' })
        }
        hint="未=未確認（草や入りにくいところで見られなかった場合）"
      />

      {value.fungus === '有' && (
        <ChoiceRow
          label="キノコ部位"
          options={FUNGUS_PART}
          multi
          isOn={(code) => hasPart(value.fungusPart, code)}
          onChange={(code) => set('fungusPart', togglePart(value.fungusPart, code))}
          hint="複数選べます"
        />
      )}

      <ChoiceRow
        label="空洞・傷"
        options={CAVITY}
        value={value.cavity}
        onChange={(v) => set('cavity', v)}
      />

      <ChoiceRow
        label="フラス"
        options={FRASS}
        value={value.frass}
        onChange={(v) => set('frass', v)}
        hint="フラス=穿孔性害虫の食いかす"
      />

      <label className="field">
        <span className="field-label">注意</span>
        <input
          type="text"
          value={value.caution}
          onChange={(e) => set('caution', e.target.value)}
          placeholder="気になったこと（自由記入）"
        />
      </label>
    </section>
  );
}
