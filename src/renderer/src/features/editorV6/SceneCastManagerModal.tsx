import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Element } from '../../../../shared/editorV6'
import { SceneCastPanel } from '../../ui/components/SceneCastPanel'

type Props = {
  elements: readonly EditorV6Element[]
  characters: readonly CustomizerCharacter[]
  selectedElementId: string | null
  allPositionsLocked: boolean
  onAddCharacter: () => void
  onTogglePositionsLocked: () => void
  onSelectCharacter: (element: EditorV6Element) => void
  onRemoveCharacter: (element: EditorV6Element) => void
  onClose: () => void
}

export function SceneCastManagerModal({ onClose, ...panelProps }: Props) {
  return <div className="studio-cast-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="studio-cast-modal studio-cast-manager-modal" role="dialog" aria-modal="true" aria-labelledby="studio-cast-manager-title">
      <header>
        <span><small>EDITOR V6 · {panelProps.elements.length} NA CENA</small><h2 id="studio-cast-manager-title">Elenco</h2></span>
        <button className="studio-cast-manager-add" onClick={panelProps.onAddCharacter} type="button">+ Adicionar personagem</button>
        <button className="studio-cast-modal-close" onClick={onClose} aria-label="Fechar elenco" type="button">×</button>
      </header>
      <div className="studio-cast-manager-body"><SceneCastPanel {...panelProps} showHeader={false} /></div>
    </section>
  </div>
}
