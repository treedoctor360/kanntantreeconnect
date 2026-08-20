// 点検内容（紙の「樹木点検 現地チェックシート」1ページ目の各行の項目）。
// 並びは紙と同じにしてある。現場で紙と見比べながら入れられるようにするため。
import {
  CAVITY,
  CAVITY_PART,
  ENV_ITEMS,
  ENV_PRESENCE,
  FRASS,
  FUNGUS,
  FUNGUS_PART,
  HEIGHT_PRESETS,
  LEAF_DENSITY,
  hasPart,
  togglePart,
  urgentNotes,
} from '../../lib/inspection.js';
import ChoiceRow from './ChoiceRow.jsx';

/**
 * value: 点検内容ぜんぶ（emptyInspection の形）
 * onChange: 上の形のオブジェクトを返す
 *
 * テープ番号は樹木番号を作る元なので、この部品ではなく樹木番号の欄に置いている
 * （紙のシートでも「テープ番号」→「樹木番号」の順に並んでいる）。
 */
export default function InspectionFields({ value, onChange }) {
  const set = (key, v) => onChange({ ...value, [key]: v });
  const urgent = urgentNotes(value);

  // 周辺環境をまとめて「無」にする（何も無い場所が続くときの手数を減らす）
  const setEnvAllNone = () =>
    onChange({ ...value, envRoad: '無', envWire: '無', envBuilding: '無' });
  const envAllNone = ENV_ITEMS.every((item) => value[item.key] === '無');

  return (
    <section className="block">
      <h3 className="block-title">点検内容</h3>

      {/* 樹高。現場では測らないので、よく使う高さを押すだけで入る */}
      <div className="choice-row">
        <span className="choice-label">樹高 (m)</span>
        <div className="choice-opts">
          {HEIGHT_PRESETS.map((m) => {
            const on = String(value.height) === String(m);
            return (
              <button
                type="button"
                key={m}
                className={`choice ${on ? 'choice-on' : ''}`}
                aria-pressed={on}
                onClick={() => set('height', on ? '' : m)}
              >
                {m}
              </button>
            );
          })}
        </div>
        <div className="height-free">
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            value={value.height}
            onChange={(e) => set('height', e.target.value)}
            placeholder="他"
            aria-label="樹高（自由入力）"
          />
          <span className="choice-hint">m — 上に無い高さはここへ。目分量でよい（巻尺は使わない）</span>
        </div>
      </div>

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
        onChange={(v) =>
          // 「無」に変えたら位置は消す（キノコ部位と同じ考え方）
          onChange({ ...value, cavity: v, cavityPart: v === '有' ? value.cavityPart : '' })
        }
        hint="穴・樹皮の広範囲な剥離・割れ目。大きさの基準はなし。気になったら「有」"
      />

      {value.cavity === '有' && (
        <ChoiceRow
          label="空洞・傷の位置"
          options={CAVITY_PART}
          multi
          isOn={(code) => hasPart(value.cavityPart, code, CAVITY_PART)}
          onChange={(code) => set('cavityPart', togglePart(value.cavityPart, code, CAVITY_PART))}
          hint="複数選べます"
        />
      )}

      <ChoiceRow
        label="フラス"
        options={FRASS}
        value={value.frass}
        onChange={(v) => set('frass', v)}
        hint="木くずとフンが混ざったうどん状・かりんとう状の排出物。サクラ・ウメ・モモを重点確認"
      />

      {/* 周辺環境。倒れたときに何にかかるかの目安 */}
      <div className="env-block">
        <div className="env-head">
          <span className="choice-label">周辺環境</span>
          <button
            type="button"
            className={`btn btn-ghost btn-small ${envAllNone ? 'btn-on' : ''}`}
            onClick={setEnvAllNone}
          >
            すべて無
          </button>
        </div>
        {ENV_ITEMS.map((item) => (
          <ChoiceRow
            key={item.key}
            label={item.label}
            options={ENV_PRESENCE}
            value={value[item.key]}
            onChange={(v) => set(item.key, v)}
          />
        ))}
        <label className="field">
          <span className="field-label">周辺環境の備考</span>
          <input
            type="text"
            value={value.envNote}
            onChange={(e) => set('envNote', e.target.value)}
            placeholder="例 園路に張り出し（自由記入）"
          />
        </label>
      </div>

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
