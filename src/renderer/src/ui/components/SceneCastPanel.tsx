import { useMemo } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import { CharacterPortrait } from './CharacterPortrait'
import { Icon } from './Icon'
import { projectSceneCastItems, type SceneCastElement } from './sceneCastPanelModel'

type SceneCastPanelProps<Element extends SceneCastElement> = {
  elements: readonly Element[]
  characters: readonly CustomizerCharacter[]
  selectedElementId: string | null
  allPositionsLocked: boolean
  onAddCharacter: () => void
  onTogglePositionsLocked: () => void
  onSelectCharacter: (element: Element) => void
  onRemoveCharacter: (element: Element) => void
}

/** Apresenta personagens da cena; cada editor continua dono das ações e do estado. */
export function SceneCastPanel<Element extends SceneCastElement>({
  elements,
  characters,
  selectedElementId,
  allPositionsLocked,
  onAddCharacter,
  onTogglePositionsLocked,
  onSelectCharacter,
  onRemoveCharacter
}: SceneCastPanelProps<Element>) {
  const castItems = useMemo(
    () => projectSceneCastItems(elements, characters),
    [elements, characters]
  )

  return <div className="studio-cast-content">
    <header><span><h2>Elenco</h2><small>{elements.length} na cena</small></span><button className="studio-cast-add-button" onClick={onAddCharacter} type="button"><Icon name="plus" />Adicionar</button></header>
    <section className="studio-cast-section" aria-label="Personagens na cena">
      <header><h3>Na cena</h3><button className={`studio-cast-lock${allPositionsLocked ? ' active' : ''}`} onClick={onTogglePositionsLocked} disabled={!elements.length} aria-label={allPositionsLocked ? 'Desbloquear posição dos personagens' : 'Bloquear posição dos personagens'} title={allPositionsLocked ? 'Desbloquear posições' : 'Bloquear posições'} type="button"><Icon name={allPositionsLocked ? 'lock' : 'unlock'} /></button></header>
      {castItems.length ? castItems.map(({ element, character, firstName }) => <article className={`studio-cast-item${selectedElementId === element.id ? ' selected' : ''}`} key={element.id}>
        <button className="studio-cast-select" onClick={() => onSelectCharacter(element)} type="button">
          {character ? <CharacterPortrait character={character} /> : <span className="studio-cast-fallback">{element.text.slice(0, 1)}</span>}
          <span>{firstName}</span>
        </button>
        <button className="studio-cast-remove" onClick={() => onRemoveCharacter(element)} aria-label={`Remover ${firstName} do elenco`} title="Remover da cena" type="button">×</button>
      </article>) : <p className="studio-cast-empty">Adicione personagens para montar a cena.</p>}
    </section>
  </div>
}
