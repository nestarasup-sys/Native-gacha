import type { CustomizerCharacter } from '../../../../shared/customizer'
import { CharacterPortrait } from './CharacterPortrait'

type SceneCastPickerModalProps = {
  title: string
  characters: CustomizerCharacter[]
  selection: string[]
  saving: boolean
  onToggle: (characterId: string, currentlySelected: boolean) => void
  onClose: () => void
  onSave: () => void
}

export function SceneCastPickerModal({ title, characters, selection, saving, onToggle, onClose, onSave }: SceneCastPickerModalProps) {
  return <div className="studio-cast-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}>
    <section className="studio-cast-modal" role="dialog" aria-modal="true" aria-labelledby="studio-cast-modal-title">
      <header><span><small>EDITAR ELENCO</small><h2 id="studio-cast-modal-title">{title}</h2></span><button className="studio-cast-modal-close" onClick={onClose} aria-label="Fechar" disabled={saving} type="button">×</button></header>
      <div className="studio-cast-modal-summary"><strong>Escolha os personagens</strong><span>{selection.length} selecionado{selection.length === 1 ? '' : 's'}</span></div>
      <div className="studio-cast-modal-list">
        {characters.length ? characters.map((character) => {
          const selected = selection.includes(character.id)
          return <button className={`studio-cast-modal-option${selected ? ' selected' : ''}`} key={character.id} onClick={() => onToggle(character.id, selected)} disabled={saving} type="button">
            <CharacterPortrait character={character} /><strong>{character.name}</strong><i>{selected ? '✓' : '+'}</i>
          </button>
        }) : <p className="studio-cast-modal-empty">Crie personagens em Customizar para adicioná-los ao elenco.</p>}
      </div>
      <footer><button className="studio-cast-modal-cancel" onClick={onClose} disabled={saving} type="button">Cancelar</button><button className="studio-cast-modal-save" onClick={onSave} disabled={saving} type="button">{saving ? 'Salvando…' : 'Salvar elenco'}</button></footer>
    </section>
  </div>
}
