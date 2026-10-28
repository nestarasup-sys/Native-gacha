import type { CSSProperties } from 'react'
import { customizerSkinTonePresets, MODEL_SKIN_BASE_TONE, isValidSkinTone } from '../../../../shared/skinTones'
import { Icon } from '../../ui/components/Icon'

type Props = {
  value?: string
  outlineColor?: string
  contourPartCount: number
  disabled: boolean
  showContourButton?: boolean
  thighDeformationActive?: boolean
  hasTemporaryThighDeformation?: boolean
  thighDeformationDisabled?: boolean
  thighDeformationRadius?: number
  thighDeformationStrength?: number
  onToggleThighDeformation?: () => void
  onResetTemporaryThighDeformation?: () => void
  onThighDeformationRadiusChange?: (radius: number) => void
  onThighDeformationStrengthChange?: (strength: number) => void
  onSelect: (tone: string) => void
  onOutlineSelect: (color: string | undefined) => void
  onEditContours: () => void
}

export function ModelSkinTonePicker({ value, outlineColor, contourPartCount, disabled, showContourButton = true, thighDeformationActive = false, hasTemporaryThighDeformation = false, thighDeformationDisabled = false, thighDeformationRadius = 28, thighDeformationStrength = 70, onToggleThighDeformation, onResetTemporaryThighDeformation, onThighDeformationRadiusChange, onThighDeformationStrengthChange, onSelect, onOutlineSelect, onEditContours }: Props) {
  const tone = isValidSkinTone(value) ? value : MODEL_SKIN_BASE_TONE
  const baseSelected = value === undefined || tone.toLowerCase() === MODEL_SKIN_BASE_TONE
  return <section className="model-skin-tone-bar" aria-label="Cores do corpo deste modelo">
    <div className="model-skin-tone-heading"><strong>Cor da pele</strong>{showContourButton && <button type="button" className="model-fake-contour-trigger" disabled={disabled} onClick={onEditContours} title="Desenhar contornos artificiais para fechar juntas abertas na recoloração"><Icon name="brush" />Contorno falso{contourPartCount ? ` · ${contourPartCount}` : ''}</button>}</div>
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
    <strong className="model-outline-label">Contorno</strong>
    <div className="model-outline-controls">
      <label className="customizer-model-skin-picker model-outline-color-picker" title="Escolher a cor dos contornos do corpo">
        <input type="color" aria-label="Escolher cor do contorno para este modelo" value={isValidSkinTone(outlineColor) ? outlineColor : '#70342c'} disabled={disabled} onChange={(event) => onOutlineSelect(event.target.value)} />
        <span className="customizer-model-skin-picker-swatch" style={{ '--skin-tone': isValidSkinTone(outlineColor) ? outlineColor : '#70342c' } as CSSProperties}><Icon name="brush" /></span>
      </label>
      <button className="model-outline-reset" type="button" title="Manter o contorno original" aria-label="Restaurar o contorno original do modelo" disabled={disabled || !isValidSkinTone(outlineColor)} onClick={() => onOutlineSelect(undefined)}>↺</button>
    </div>
    {onToggleThighDeformation ? <div className="model-thigh-deformation-controls" aria-label="Deformação temporária das coxas">
      <button className={`model-thigh-deform-button${thighDeformationActive ? ' active' : ''}`} type="button" aria-pressed={thighDeformationActive} disabled={disabled || thighDeformationDisabled} onClick={onToggleThighDeformation} title={thighDeformationActive ? 'Concluir deformação temporária' : 'Ativar pincel para deformar as coxas na prévia'}><Icon name="brush" /><span>{thighDeformationActive ? 'Concluir' : 'Deformar coxa'}</span></button>
      <button className="model-thigh-deform-reset" type="button" aria-label="Voltar as coxas ao normal" title="Voltar as coxas ao normal" disabled={disabled || !hasTemporaryThighDeformation} onClick={onResetTemporaryThighDeformation}><Icon name="undo" /></button>
      {thighDeformationActive && <label className="model-thigh-deform-radius"><span>Raio {thighDeformationRadius}px</span><input aria-label="Raio do pincel temporário das coxas" type="range" min="6" max="120" step="1" value={thighDeformationRadius} disabled={disabled} onChange={(event) => onThighDeformationRadiusChange?.(Number(event.target.value))} /></label>}
      {thighDeformationActive && <label className="model-thigh-deform-radius"><span>Força {thighDeformationStrength}%</span><input aria-label="Força do pincel temporário das coxas" type="range" min="10" max="100" step="1" value={thighDeformationStrength} disabled={disabled} onChange={(event) => onThighDeformationStrengthChange?.(Number(event.target.value))} /></label>}
      <small>{thighDeformationActive ? 'Arraste nas coxas · temporário' : hasTemporaryThighDeformation ? 'Prévia temporária ativa' : 'Só altera a prévia'}</small>
    </div> : <small>As cores são salvas por modelo e aplicadas a todas as peças do corpo.</small>}
  </section>
}
