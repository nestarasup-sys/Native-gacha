import type { ModelPart, WardrobeComponent } from '../../../../../shared/fabricator'
import type { WardrobeGlueState } from '../../../../../shared/wardrobeGlue'
import { Icon } from '../../../ui/components/Icon'

type Props = {
  component: WardrobeComponent
  target?: ModelPart
  suggested: ModelPart | null
  status: WardrobeGlueState
  onChooseTarget: (partId: string) => void
  onFix: () => void
  onRelease: () => void
}
const labels: Record<WardrobeGlueState, string> = {
  loose: 'Solta — posicione e clique em Fixar',
  fixed: 'Fixada — acompanha esta parte nas poses',
  stale: 'A origem mudou — revise e refixe',
  orphan: 'Parte correspondente ausente'
}

/** Only authoring controls; the character's PNG and saved pose remain untouched. */
export function WardrobeGlueControls({ component, target, suggested, status, onChooseTarget, onFix, onRelease }: Props) {
  return <section className="wardrobe-glue-controls" aria-label="Fixação da roupa">
    <strong>Grude da roupa</strong>
    <small role="status">{labels[status]}{target ? ` · ${target.name}` : ''}</small>
    {suggested && suggested.id !== component.attachedPartId && status === 'loose' && <button type="button" className="pose-button secondary" onClick={() => onChooseTarget(suggested.id)}>
      Usar alvo sugerido: {suggested.name}
    </button>}
    <div className="wardrobe-glue-actions">
      <button type="button" className="pose-button primary wardrobe-bind-button" onClick={onFix} disabled={!target}>
        <Icon name="link" />{status === 'fixed' ? 'Refixar' : 'Fixar nesta parte'}
      </button>
      {status !== 'loose' && <button type="button" className="pose-button secondary" onClick={onRelease}>
        Soltar
      </button>}
    </div>
    <small className="wardrobe-note">Arraste a roupa na folha original desmontada. Fixar guarda posição, escala e rotação relativas à parte escolhida. Soltar não desloca o PNG.</small>
  </section>
}
