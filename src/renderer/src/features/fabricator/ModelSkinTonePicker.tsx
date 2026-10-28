import type { CSSProperties } from 'react'
import { customizerSkinTonePresets, MODEL_SKIN_BASE_TONE, isValidSkinTone } from '../../../../shared/skinTones'
import { Icon } from '../../ui/components/Icon'

type Props = {
  value?: string
  disabled: boolean
  onSelect: (tone: string) => void
}

export function ModelSkinTonePicker({ value, disabled, onSelect }: Props) {
  const tone = isValidSkinTone(value) ? value : MODEL_SKIN_BASE_TONE
  const baseSelected = value === undefined || tone.toLowerCase() === MODEL_SKIN_BASE_TONE
  return <section className="model-skin-tone-bar" aria-label="Cor de pele padrão deste modelo">
    <strong>Cor de pele do modelo</strong>
    <div className="customizer-model-skin-tone-row" role="group" aria-label="Escolher cor de pele padrão para este modelo">
      <button className={'customizer-model-skin-tone' + (baseSelected ? ' selected' : '')} style={{ '--skin-tone': MODEL_SKIN_BASE_TONE } as CSSProperties} type="button" disabled={disabled} aria-label="Base fixa do modelo" aria-pressed={baseSelected} title="Base fixa (Porcelana)" onClick={() => onSelect(MODEL_SKIN_BASE_TONE)}><span />{baseSelected && <Icon name="check" />}</button>
      {customizerSkinTonePresets.map((preset) => {
        const selected = tone.toLowerCase() === preset.id
        return <button key={preset.id} className={'customizer-model-skin-tone' + (selected && !baseSelected ? ' selected' : '')} style={{ '--skin-tone': preset.id } as CSSProperties} type="button" disabled={disabled} aria-label={`Tom de pele ${preset.name}`} aria-pressed={selected && !baseSelected} title={preset.name} onClick={() => onSelect(preset.id)}><span />{selected && !baseSelected && <Icon name="check" />}</button>
      })}
      <label className={'customizer-model-skin-picker' + (!baseSelected && !customizerSkinTonePresets.some((preset) => preset.id === tone.toLowerCase()) ? ' selected' : '')} title="Escolher uma cor personalizada">
        <input type="color" aria-label="Escolher cor de pele personalizada para este modelo" value={tone} disabled={disabled} onChange={(event) => onSelect(event.target.value)} />
        <span className="customizer-model-skin-picker-swatch" style={{ '--skin-tone': tone } as CSSProperties}><Icon name="brush" /></span>
      </label>
    </div>
    <small>Base fixa para pele removida · salva neste modelo</small>
  </section>
}
