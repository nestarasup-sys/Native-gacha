import type { FabricatorPoseSummary } from '../../../../../shared/fabricator'
import { Icon } from '../../../ui/components/Icon'

type PoseSummary = NonNullable<FabricatorPoseSummary>

type Props = {
  poses: readonly PoseSummary[]
  loading: boolean
  onClose: () => void
  onSelect: (slot: number) => void
}

export function WardrobeTestPosePicker({ poses, loading, onClose, onSelect }: Props) {
  return <div className="pose-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="pose-model-picker" role="dialog" aria-modal="true" aria-labelledby="wardrobe-test-picker-title">
      <header>
        <span><small>TESTE DE ROUPA</small><strong id="wardrobe-test-picker-title">Escolha uma pose</strong></span>
        <button onClick={onClose} aria-label="Fechar" type="button">×</button>
      </header>
      <p>A roupa será exibida sobre uma cópia visual da pose. A pose salva não será modificada.</p>
      <div className="pose-model-options">
        {loading && <div className="pose-model-none">Carregando poses…</div>}
        {poses.map((pose) => <button key={`pose-${pose.slot}`} className="pose-model-option" disabled={loading} onClick={() => onSelect(pose.slot)} type="button">
          <span className="pose-model-number">{String(pose.slot).padStart(2, '0')}</span>
          <span><b>{pose.name}</b><small>{pose.partCount} peças · {new Date(pose.updatedAt).toLocaleDateString('pt-BR')}</small></span>
          <Icon name="chevronRight" />
        </button>)}
        {!loading && poses.length === 0 && <div className="pose-model-none">Este modelo ainda não tem poses salvas.</div>}
      </div>
    </section>
  </div>
}
