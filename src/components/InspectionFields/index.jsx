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
  urgentNotes,
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
  const urgent = urgentNotes(value);

  return (
    <section className="block">
      <h3 className="block-title">点検内容</h3>

      <ChoiceRow
        label="葉の茂り"
        options={LEAF_DENSITY}
        value={value.leafDensity}
        onChange={(v) => set('leafDensity', v)}
        hint="濃=枝先まで密 / 普=ふつう / ま=まばら（空が透ける）/ ほ=ほとんどない　※迷ったら「普」"
      />

      <ChoiceRow
        label="キノコ"
        options={FUNGUS}
        value={value.fungus}
        onChange={(v) =>
          // 「無」「未」に変えたら部位は消す（紙でも部位は書かないため）
          onChange({ ...value, fungus: v, fungusPart: v === '有' ? value.fungusPart : '' })
        }
        hint="無=見たが無かった / 未=見ていない・見えない　※必ず区別する"
      />

      {value.fungus === '有' && (
        <ChoiceRow
          label="キノコ部位"
          options={FUNGUS_PART}
          multi
          isOn={(code) => hasPart(value.fungusPart, code)}
          onChange={(code) => set('fungusPart', togglePart(value.fungusPart, code))}
          hint="複数選べます（根=根元 / 幹=生きた幹 / 枝=枝の付け根 / 枯=枯枝・枯幹 / 不=不明）"
        />
      )}

      <ChoiceRow
        label="空洞・傷"
        options={CAVITY}
        value={value.cavity}
        onChange={(v) => set('cavity', v)}
        hint="穴・樹皮の広範囲な剥離・割れ目。大きさの基準はなし。気になったら「有」"
      />

      <ChoiceRow
        label="フラス"
        options={FRASS}
        value={value.frass}
        onChange={(v) => set('frass', v)}
        hint="木くずとフンが混ざったうどん状・かりんとう状の排出物。サクラ・ウメ・モモを重点確認"
      />

      <label className="field">
        <span className="field-label">注意</span>
        <input
          type="text"
          value={value.caution}
          onChange={(e) => set('caution', e.target.value)}
          placeholder="気になった木に印（自由記入）"
        />
      </label>

      {/* 紙の運用ルール4「見つけたらすぐ連絡すること」。その場で気づけるよう出す */}
      {urgent.map((note) => (
        <p key={note} className="status status-error">
          ⚠ {note}
        </p>
      ))}
    </section>
  );
}
