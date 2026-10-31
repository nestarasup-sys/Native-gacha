import { characterProportionLimits } from '../../../../shared/customizer'
import type { CustomizerNewCharacterHeadSizePreference } from './customizerNewCharacterHeadSize'

export function CustomizerNewCharacterHeadSizeControl(props: {
  preference: CustomizerNewCharacterHeadSizePreference
  onChange: (preference: CustomizerNewCharacterHeadSizePreference) => void
}) {
  const { preference, onChange } = props
  const limits = characterProportionLimits.head

  return <section className="customizer-new-character-head-size" aria-label="Tamanho inicial da cabeça no Modelo 01">
    <label className="customizer-new-character-head-size-toggle">
      <input
        type="checkbox"
        checked={preference.enabled}
        onChange={(event) => onChange({ ...preference, enabled: event.target.checked })}
      />
      <span>
        <strong>Tamanho inicial da cabeça · Modelo 01</strong>
        <small>Aplicar somente aos novos personagens; os existentes não mudam.</small>
      </span>
    </label>
    <label className="customizer-new-character-head-size-slider">
      <span>Porcentagem <output>{preference.value}%</output></span>
      <input
        type="range"
        min={limits.min}
        max={limits.max}
        step="1"
        value={preference.value}
        disabled={!preference.enabled}
        aria-label="Tamanho inicial da cabeça para novos personagens do Modelo 01"
        onChange={(event) => onChange({ ...preference, value: Number(event.target.value) })}
      />
    </label>
  </section>
}
