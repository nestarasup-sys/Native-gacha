import { useState } from 'react'
import type { CharacterPaletteOverrides, CharacterPaletteRole, HairColorOverrides } from '../../../../shared/customizer'
import { customizerSkinTonePresets } from './customizerFaceCatalogModel'
import { Icon } from '../../ui/components/Icon'

export const hairColorControls: Array<{ id: CharacterPaletteRole; label: string; fallback: string }> = [
  { id: 'outline', label: 'Contorno', fallback: '#2B2B2B' },
  { id: 'shadow', label: 'Sombra', fallback: '#6B6B6B' },
  { id: 'base', label: 'Cor base', fallback: '#A8A8A8' },
  { id: 'light', label: 'Cor secundária', fallback: '#55C5D4' },
  { id: 'detail', label: 'Cor de acessório/detalhe', fallback: '#8C7BFF' }
]

const originalHairPalettePresets: Array<{ name: string; colors: HairColorOverrides }> = [
  { name: 'Castanho', colors: { base: '#8e4b35', fade: '#613525', outline: '#33221f', highlight: '#c68156' } },
  { name: 'Loiro', colors: { base: '#d6b46e', fade: '#a8844b', outline: '#59422e', highlight: '#f4dea0' } },
  { name: 'Preto', colors: { base: '#343b49', fade: '#242733', outline: '#14151d', highlight: '#78889b' } },
  { name: 'Fantasia', colors: { base: '#8756b7', fade: '#593f88', outline: '#302548', highlight: '#c997df' } },
  { name: 'Chocolate', colors: { base: '#674433', fade: '#452e29', outline: '#261d1b', highlight: '#a27a55' } },
  { name: 'Cobre', colors: { base: '#b55a36', fade: '#783526', outline: '#40221e', highlight: '#e99661' } },
  { name: 'Ruivo', colors: { base: '#c65430', fade: '#86311f', outline: '#48251f', highlight: '#ed985b' } },
  { name: 'Mel', colors: { base: '#b78345', fade: '#7d5734', outline: '#473324', highlight: '#e5b96e' } },
  { name: 'Platinado', colors: { base: '#d5d0c9', fade: '#9f9ba4', outline: '#555467', highlight: '#f3eee5' } },
  { name: 'Branco', colors: { base: '#e0e2eb', fade: '#a7acbf', outline: '#54586f', highlight: '#fafaff' } },
  { name: 'Cinza', colors: { base: '#8c919c', fade: '#5b6272', outline: '#303543', highlight: '#c2c7d3' } },
  { name: 'Azul noite', colors: { base: '#3e5688', fade: '#29375e', outline: '#1b2340', highlight: '#7996c4' } },
  { name: 'Céu', colors: { base: '#63a9d5', fade: '#3d79a8', outline: '#294866', highlight: '#b8dff1' } },
  { name: 'Menta', colors: { base: '#70bea9', fade: '#408c83', outline: '#275457', highlight: '#c2e9cf' } },
  { name: 'Rosa', colors: { base: '#d778ac', fade: '#a65080', outline: '#68344f', highlight: '#f3b5d3' } },
  { name: 'Vinho', colors: { base: '#8d3f62', fade: '#5e2b49', outline: '#341d32', highlight: '#c4799e' } },
  { name: 'Lilás', colors: { base: '#ad88cf', fade: '#7961a5', outline: '#493b70', highlight: '#dcc3ed' } },
  { name: 'Pêssego', colors: { base: '#e89c88', fade: '#bb6b67', outline: '#70404c', highlight: '#ffd2ad' } },
  { name: 'Verde musgo', colors: { base: '#6e8556', fade: '#4a633e', outline: '#2c4130', highlight: '#a9bc7b' } },
  { name: 'Turquesa', colors: { base: '#399f9e', fade: '#2a7079', outline: '#204753', highlight: '#8bd8cf' } }
]

export const hairPalettePresets: Array<{ name: string; colors: CharacterPaletteOverrides }> = originalHairPalettePresets.map(({ name, colors }) => ({
  name,
  colors: { outline: colors.outline, shadow: colors.fade, base: colors.base, light: colors.highlight, detail: '#8C7BFF' }
}))

export function characterPaletteSwatchGradient(colors: CharacterPaletteOverrides): string {
  const outline = colors.outline ?? '#2B2B2B'
  const shadow = colors.shadow ?? '#6B6B6B'
  const base = colors.base ?? '#A8A8A8'
  const secondary = colors.light ?? '#55C5D4'
  const detail = colors.detail ?? '#8C7BFF'
  return `linear-gradient(115deg, ${outline} 0 16%, ${shadow} 16% 32%, ${base} 32% 56%, ${secondary} 56% 78%, ${detail} 78%)`
}

export function NoseOpacityControl({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {
  const [open, setOpen] = useState(false)
  const percentage = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return <>
    <button className="customizer-nose-opacity-button" type="button" aria-label={`Transparência do nariz: ${100 - percentage}%`} aria-expanded={open} title={`Transparência ${100 - percentage}%`} disabled={disabled} onClick={() => setOpen((current) => !current)}><Icon name="sliders" /><small>α</small></button>
    {open && <div className="customizer-nose-opacity-popover" role="group" aria-label="Transparência do nariz">
      <div className="customizer-nose-opacity-heading"><span>Transparência</span><output>{100 - percentage}%</output></div>
      <input type="range" min="0" max="100" step="1" value={100 - percentage} disabled={disabled} onChange={(event) => onChange(1 - Number(event.target.value) / 100)} aria-label="Transparência do nariz" />
    </div>}
  </>
}

export function MouthBlushControls({ color, opacity, disabled, onChange }: { color: string; opacity: number; disabled: boolean; onChange: (patch: { mouthBlushColor?: string; mouthBlushOpacity?: number }) => void }) {
  const [open, setOpen] = useState(false)
  const percentage = Math.round(Math.min(1, Math.max(0, opacity)) * 100)
  return <span className="customizer-mouth-blush-controls">
    <label className="customizer-mouth-blush-color" style={{ '--mouth-blush-color': color } as React.CSSProperties} title="Escolher cor do blush na boca">
      <input type="color" aria-label="Cor do blush na boca" value={color} disabled={disabled} onChange={(event) => onChange({ mouthBlushColor: event.target.value })} />
      <span aria-hidden="true" />
    </label>
    <button className="customizer-mouth-blush-opacity-button" type="button" aria-label={`Intensidade/transparência do blush na boca: ${percentage}%`} aria-expanded={open} title={`Intensidade do blush: ${percentage}%`} disabled={disabled} onClick={() => setOpen((current) => !current)}><Icon name="sliders" /><small>α</small></button>
    {open && <span className="customizer-mouth-blush-opacity-popover" role="group" aria-label="Intensidade e transparência do blush na boca">
      <span className="customizer-nose-opacity-heading"><span>Intensidade</span><output>{percentage}%</output></span>
      <input type="range" min="0" max="100" step="1" value={percentage} disabled={disabled} onChange={(event) => onChange({ mouthBlushOpacity: Number(event.target.value) / 100 })} aria-label="Intensidade e transparência do blush na boca" />
    </span>}
  </span>
}

export function NoseSkinTonePalette({ value, disabled, onSelect }: { value: string; disabled: boolean; onSelect: (tone: string) => void }) {
  return <div className="customizer-nose-skin-palette" aria-label="Paleta de cor de pele">
    <strong>Cor da pele</strong>
    <div className="customizer-nose-skin-options" role="group" aria-label="Escolher cor de pele para o nariz">
      {customizerSkinTonePresets.map((preset) => <button key={preset.id} className={'customizer-nose-skin-tone' + (value.toLowerCase() === preset.id ? ' selected' : '')} style={{ '--skin-tone': preset.id } as React.CSSProperties} type="button" disabled={disabled} aria-label={`Tom de pele ${preset.name}`} aria-pressed={value.toLowerCase() === preset.id} title={preset.name} onClick={() => onSelect(preset.id)}><span /></button>)}
      <label className={'customizer-nose-skin-picker' + (customizerSkinTonePresets.some((preset) => preset.id === value.toLowerCase()) ? '' : ' selected')} title="Escolher uma cor de pele personalizada">
        <input type="color" aria-label="Escolher uma cor de pele personalizada" value={value} disabled={disabled} onChange={(event) => onSelect(event.target.value)} />
        <span style={{ '--skin-tone': value } as React.CSSProperties}><Icon name="brush" /></span>
      </label>
    </div>
  </div>
}

export function PiecePaletteStrip({ label = 'Paleta da peça', colors, disabled, onSelect }: { label?: string; colors?: HairColorOverrides; disabled: boolean; onSelect: (colors: HairColorOverrides) => void }) {
  const scroll = (button: HTMLButtonElement, direction: number) => button.closest('.customizer-piece-palette')?.querySelector<HTMLElement>('.customizer-piece-palette-list')?.scrollBy({ left: direction * 150, behavior: 'smooth' })
  return <div className="customizer-piece-palette" aria-label={label}>
    <strong>{label}</strong>
    <div className="customizer-piece-palette-strip">
      <button className="customizer-hair-palette-scroll previous" type="button" aria-label="Paletas anteriores" onClick={(event) => scroll(event.currentTarget, -1)}><Icon name="chevronRight" /></button>
      <div className="customizer-hair-palette-preset-list customizer-piece-palette-list">
        {originalHairPalettePresets.map((preset) => <button key={preset.name} type="button" disabled={disabled} aria-pressed={Object.entries(preset.colors).every(([role, color]) => colors?.[role as keyof HairColorOverrides] === color)} onClick={() => onSelect(preset.colors)} title={`Aplicar ${preset.name}`}><span style={{ background: `linear-gradient(115deg, ${preset.colors.highlight} 0 23%, ${preset.colors.base} 23% 65%, ${preset.colors.fade} 65% 84%, ${preset.colors.outline} 84%)` }} />{preset.name}</button>)}
      </div>
      <button className="customizer-hair-palette-scroll" type="button" aria-label="Próximas paletas" onClick={(event) => scroll(event.currentTarget, 1)}><Icon name="chevronRight" /></button>
    </div>
  </div>
}

export function CharacterPaletteStrip({ label = 'Paleta da peça', colors, disabled, onSelect }: { label?: string; colors?: CharacterPaletteOverrides; disabled: boolean; onSelect: (colors: CharacterPaletteOverrides) => void }) {
  const scroll = (button: HTMLButtonElement, direction: number) => button.closest('.customizer-piece-palette')?.querySelector<HTMLElement>('.customizer-piece-palette-list')?.scrollBy({ left: direction * 150, behavior: 'smooth' })
  return <div className="customizer-piece-palette" aria-label={label}>
    <strong>{label}</strong>
    <div className="customizer-piece-palette-strip">
      <button className="customizer-hair-palette-scroll previous" type="button" aria-label="Paletas anteriores" onClick={(event) => scroll(event.currentTarget, -1)}><Icon name="chevronRight" /></button>
      <div className="customizer-hair-palette-preset-list customizer-piece-palette-list">
        {hairPalettePresets.map((preset) => <button key={preset.name} type="button" disabled={disabled} aria-pressed={hairColorControls.every((color) => colors?.[color.id] === preset.colors[color.id])} onClick={() => onSelect(preset.colors)} title={`Aplicar ${preset.name}`}><span style={{ background: characterPaletteSwatchGradient(preset.colors) }} />{preset.name}</button>)}
      </div>
      <button className="customizer-hair-palette-scroll" type="button" aria-label="Próximas paletas" onClick={(event) => scroll(event.currentTarget, 1)}><Icon name="chevronRight" /></button>
    </div>
  </div>
}
