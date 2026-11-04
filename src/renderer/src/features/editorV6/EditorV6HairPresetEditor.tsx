import type { HairMotionPreset } from '../../../../shared/hairMotionEngine'
import { HAIR_MOTION_LAYER_CONTROLS, HAIR_MOTION_PHYSICS_CONTROLS } from '../../../../shared/hairMotionPresetControls'

type Props = {
  slot: number
  preset: HairMotionPreset
  onChange: (preset: HairMotionPreset) => void
  onSave: () => void
  onDiscard: () => void
}

export function EditorV6HairPresetEditor({ slot, preset, onChange, onSave, onDiscard }: Props) {
  return <section className="v6-hair-preset-editor" aria-label="Editar animação de cabelo no Editor V6">
    <strong>Controles do Preset {slot}</strong>
    <small>O rascunho pode ser usado na próxima exportação. Salvar atualiza o mesmo preset do Fabricador DEV.</small>
    <div className="v6-hair-preset-physics">
      {HAIR_MOTION_PHYSICS_CONTROLS.map(({ key, label, min, max }) =>
        <label key={key} className="v6-hair-preset-range">
          <span>{label}<output>{preset.physics[key]}{key === 'wind' ? '' : '%'}</output></span>
          <input type="range" aria-label={label} min={min} max={max} value={preset.physics[key]}
            onChange={(event) => onChange({ ...preset, physics: { ...preset.physics, [key]: Number(event.target.value) } })} />
        </label>
      )}
    </div>
    <strong>Força por camada</strong>
    <div className="v6-hair-preset-layers">
      {HAIR_MOTION_LAYER_CONTROLS.map(({ id, label }) => <div key={id}>
        <label className="v6-hair-preset-toggle">
          <input type="checkbox" checked={preset.enabled[id]} onChange={(event) => onChange({ ...preset, enabled: { ...preset.enabled, [id]: event.target.checked } })} />
          {label}
        </label>
        <label className="v6-hair-preset-range">
          <span>Intensidade de {label.toLowerCase()}<output>{preset.intensity[id]}%</output></span>
          <input type="range" min="0" max="150" aria-label={`Intensidade de ${label.toLowerCase()}`}
            value={preset.intensity[id]} disabled={!preset.enabled[id]}
            onChange={(event) => onChange({ ...preset, intensity: { ...preset.intensity, [id]: Number(event.target.value) } })} />
        </label>
      </div>)}
    </div>
    <div className="v6-hair-preset-actions">
      <button type="button" onClick={onSave}>Salvar Preset {slot}</button>
      <button type="button" onClick={onDiscard}>Descartar rascunho</button>
    </div>
  </section>
}
