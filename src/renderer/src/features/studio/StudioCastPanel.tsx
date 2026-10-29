import { useMemo } from 'react'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { StudioElement } from '../../../../shared/studio'
import { CharacterPortrait } from '../../ui/components/CharacterPortrait'
import { Icon } from '../../ui/components/Icon'
import { projectStudioCastItems } from './studioCastPanelModel'

type StudioCastPanelProps = {
  stageCharacters: readonly StudioElement[]
  availableCharacters: readonly CustomizerCharacter[]
  selectedElementId: string | null
  allCharactersLocked: boolean
  onAddCharacter: () => void
  onTogglePositionLock: () => void
  onSelectCharacter: (element: StudioElement) => void
  onRemoveCharacter: (element: StudioElement) => void
}

/** Apresenta o elenco do Studio; alterações de cena continuam sob responsabilidade da página. */
export function StudioCastPanel({
  stageCharacters,
  availableCharacters,
  selectedElementId,
  allCharactersLocked,
  onAddCharacter,
  onTogglePositionLock,
  onSelectCharacter,
  onRemoveCharacter
}: StudioCastPanelProps) {
  const castItems = useMemo(
    () => projectStudioCastItems(stageCharacters, availableCharacters),
    [stageCharacters, availableCharacters]
  )

  return <div className="studio-cast-content">
    <header><span><h2>Elenco</h2><small>{stageCharacters.length} na cena</small></span><button className="studio-cast-add-button" onClick={onAddCharacter} type="button"><Icon name="plus" />Adicionar</button></header>
    <section className="studio-cast-section" aria-label="Personagens na cena">
      <header><h3>Na cena</h3><button className={`studio-cast-lock${allCharactersLocked ? ' active' : ''}`} onClick={onTogglePositionLock} disabled={!stageCharacters.length} aria-label={allCharactersLocked ? 'Desbloquear posição dos personagens' : 'Bloquear posição dos personagens'} title={allCharactersLocked ? 'Desbloquear posições' : 'Bloquear posições'} type="button"><Icon name={allCharactersLocked ? 'lock' : 'unlock'} /></button></header>
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
