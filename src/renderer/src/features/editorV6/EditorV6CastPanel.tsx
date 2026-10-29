import { Icon } from '../../ui/components/Icon'
import { CharacterPortrait } from '../../ui/components/CharacterPortrait'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6Element } from '../../../../shared/editorV6'

type Props = {
  elements: EditorV6Element[]
  characters: CustomizerCharacter[]
  selectedElementId: string | null
  allPositionsLocked: boolean
  onAddCharacter: () => void
  onTogglePositionsLocked: () => void
  onSelectCharacter: (element: EditorV6Element) => void
  onRemoveCharacter: (element: EditorV6Element) => void
}

export function EditorV6CastPanel({
  elements,
  characters,
  selectedElementId,
  allPositionsLocked,
  onAddCharacter,
  onTogglePositionsLocked,
  onSelectCharacter,
  onRemoveCharacter
}: Props) {
  return <div className="studio-cast-content">
    <header><span><h2>Elenco</h2><small>{elements.length} na cena</small></span><button className="studio-cast-add-button" onClick={onAddCharacter} type="button"><Icon name="plus" />Adicionar</button></header>
    <section className="studio-cast-section" aria-label="Personagens na cena">
      <header><h3>Na cena</h3><button className={`studio-cast-lock${allPositionsLocked ? ' active' : ''}`} onClick={onTogglePositionsLocked} disabled={!elements.length} aria-label={allPositionsLocked ? 'Desbloquear posição dos personagens' : 'Bloquear posição dos personagens'} title={allPositionsLocked ? 'Desbloquear posições' : 'Bloquear posições'} type="button"><Icon name={allPositionsLocked ? 'lock' : 'unlock'} /></button></header>
      {elements.length ? elements.map((element) => {
        const character = characters.find((item) => item.id === element.characterId)
        const firstName = (character?.name ?? element.text).trim().split(/\s+/)[0] || element.text
        return <article className={`studio-cast-item${selectedElementId === element.id ? ' selected' : ''}`} key={element.id}>
          <button className="studio-cast-select" onClick={() => onSelectCharacter(element)} type="button">
            {character ? <CharacterPortrait character={character} /> : <span className="studio-cast-fallback">{element.text.slice(0, 1)}</span>}
            <span>{firstName}</span>
          </button>
          <button className="studio-cast-remove" onClick={() => onRemoveCharacter(element)} aria-label={`Remover ${firstName} do elenco`} title="Remover da cena" type="button">×</button>
        </article>
      }) : <p className="studio-cast-empty">Adicione personagens para montar a cena.</p>}
    </section>
  </div>
}
