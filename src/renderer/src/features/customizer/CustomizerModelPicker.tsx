import type { FabricatorSlotSummary } from '../../../../shared/fabricator'
import { Icon } from '../../ui/components/Icon'

type ModelSummary = NonNullable<FabricatorSlotSummary>

export function CustomizerModelPicker(props: {
  models: ModelSummary[]
  thumbnails: Record<number, string>
  selectedSlot: number | null
  loading: boolean
  onSelect: (model: ModelSummary) => void
}) {
  const { models, thumbnails, selectedSlot, loading, onSelect } = props

  return <section className="customizer-model-picker" aria-label="Modelos do Fabricador Dev">
    <header className="customizer-catalog-heading">
      <div><p className="eyebrow">CATÁLOGO</p><h2>Modelo base</h2></div>
      <small>{models.length} {models.length === 1 ? 'modelo' : 'modelos'}</small>
    </header>
    {loading ? <div className="customizer-catalog-empty">Carregando modelos…</div>
      : models.length === 0 ? <div className="customizer-catalog-empty">Nenhum modelo salvo ainda.</div>
        : <div className="customizer-catalog-grid customizer-model-catalog">
          {models.map((model) => <button
            className={'customizer-catalog-card model-catalog-card' + (selectedSlot === model.slot ? ' selected' : '') + (model.recoveryRequired ? ' recovery-required' : '')}
            key={model.slot}
            onClick={() => onSelect(model)}
            aria-label={model.recoveryRequired ? `Slot ${model.slot} com recuperação pendente` : `Selecionar ${model.name}`}
            aria-pressed={selectedSlot === model.slot}
            title={model.recoveryRequired ? `Slot ${model.slot}: resolva a recuperação em Modelos DEV` : model.name}
            disabled={Boolean(model.recoveryRequired)}
            type="button"
          >
            {thumbnails[model.slot] ? <img src={thumbnails[model.slot]} alt="" /> : <span className="customizer-catalog-placeholder"><Icon name="body" /></span>}
            <span className="customizer-model-catalog-name">{model.recoveryRequired ? 'Recuperação pendente' : model.name}</span>
          </button>)}
        </div>}
  </section>
}
