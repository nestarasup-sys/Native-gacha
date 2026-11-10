import { useEffect, useMemo, useState } from 'react'
import type { BaseVideoCategory, BaseVideoDetails } from '../../../../shared/baseVideos'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'
import type { CharacterSheet } from '../../../../shared/roteiros'
import { formatSimpleVideoExport, selectSimpleExportEntries } from './baseVideoSimpleExport'

type Props = {
  items: VideoLibraryItem[]
  detailsById: Record<string, BaseVideoDetails>
  categories: BaseVideoCategory[]
  onClose: () => void
  onExport: (text: string) => Promise<boolean>
}

export function BaseVideosExportModal({ items, detailsById, categories, onClose, onExport }: Props) {
  const [categoryId, setCategoryId] = useState<string | 'all' | 'uncategorized'>('all')
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [characters, setCharacters] = useState<CustomizerCharacter[]>([])
  const [characterSheets, setCharacterSheets] = useState<CharacterSheet[]>([])
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([])
  const [characterPickerOpen, setCharacterPickerOpen] = useState(false)
  const [charactersLoading, setCharactersLoading] = useState(true)
  const [characterLoadError, setCharacterLoadError] = useState<string | null>(null)
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories])
  const entries = useMemo(() => selectSimpleExportEntries(items.map((item) => ({
    item,
    details: detailsById[item.id] ?? { videoId: item.id, description: '', timeline: 'unspecified' },
    category: categoryById.get(detailsById[item.id]?.categoryId ?? '')
  })), categoryId), [items, detailsById, categoryById, categoryId])

  useEffect(() => {
    let cancelled = false
    void Promise.all([window.desktop.customizer.listCustomizerCharacters(), window.desktop.roteiros.listCharacterSheets()]).then(([loaded, sheets]) => {
      if (!cancelled) { setCharacters(loaded); setCharacterSheets(sheets) }
    }).catch((reason) => {
      if (!cancelled) setCharacterLoadError(reason instanceof Error ? reason.message : 'Não foi possível carregar os personagens do Customizador.')
    }).finally(() => { if (!cancelled) setCharactersLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !exporting) onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [exporting, onClose])

  const exportData = async () => {
    if (exporting || !entries.length) return
    setExporting(true); setError(null)
    try {
      const selectedCharacters = selectedCharacterIds.flatMap((id) => {
        const character = characters.find((item) => item.id === id)
        return character ? [character] : []
      })
      await onExport(formatSimpleVideoExport(entries, selectedCharacters, characterSheets))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível exportar os dados simples.')
    } finally { setExporting(false) }
  }

  return <div className="roteiro-modal-backdrop base-videos-export-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !exporting) onClose() }}>
    <section className="base-videos-export-modal" role="dialog" aria-modal="true" aria-labelledby="base-videos-export-title">
      <header><div><span className="base-videos-export-eyebrow">BASE DE VÍDEOS</span><h2 id="base-videos-export-title">Exports</h2><p>Escolha o formato e os vídeos que deseja levar para fora do aplicativo.</p></div><button type="button" aria-label="Fechar" disabled={exporting} onClick={onClose}>×</button></header>
      <div className="base-videos-export-body">
        <div className="base-videos-export-controls">
          <span className="base-videos-export-section-label">TIPO DE EXPORTAÇÃO</span>
          <button className="base-videos-export-type active" type="button"><span className="base-videos-export-type-icon">TXT</span><span><strong>Dados simples</strong><small>Descrição, tempos, categoria e contexto</small></span><i>✓</i></button>
          <button className="base-videos-export-characters-button" type="button" disabled={charactersLoading || Boolean(characterLoadError) || exporting} aria-expanded={characterPickerOpen} onClick={() => setCharacterPickerOpen((open) => !open)}>
            <span><strong>Selecionar personagens</strong><small>{selectedCharacterIds.length} selecionado{selectedCharacterIds.length === 1 ? '' : 's'}</small></span><i>{characterPickerOpen ? '−' : '+'}</i>
          </button>
          {characterPickerOpen && <div className="base-videos-export-character-list" aria-label="Personagens do Customizador">
            {charactersLoading ? <p>Carregando personagens…</p> : characterLoadError ? <p role="alert">{characterLoadError}</p> : characters.length ? characters.map((character) => {
              const checked = selectedCharacterIds.includes(character.id)
              return <label key={character.id} className="base-videos-export-character-option"><input type="checkbox" checked={checked} disabled={exporting} onChange={() => setSelectedCharacterIds((current) => checked ? current.filter((id) => id !== character.id) : [...current, character.id])} /><span><strong>{character.name}</strong><small>{characterSheets.some((sheet) => sheet.characterId === character.id) ? 'Ficha local incluída no TXT' : 'Sem ficha — será exportado com campos vazios'}</small></span></label>
            }) : <p>O Customizador ainda não tem personagens.</p>}
          </div>}
          <label className="base-videos-export-category"><span>Vídeos para exportar</span><select value={categoryId} disabled={exporting} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="all">Todos os vídeos</option>
            <option value="uncategorized">Sem categoria</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select></label>
          <p className="base-videos-export-count">{entries.length} vídeo{entries.length === 1 ? '' : 's'} publicado{entries.length === 1 ? '' : 's'} com descrição principal incluído{entries.length === 1 ? '' : 's'}.</p>
          {error && <p className="base-videos-export-error" role="alert">{error}</p>}
          <footer><button type="button" disabled={exporting} onClick={onClose}>Cancelar</button><button className="primary" type="button" disabled={exporting || !entries.length} onClick={() => void exportData()}>{exporting ? 'Preparando…' : 'Exportar TXT'}</button></footer>
        </div>
        <aside className="base-videos-export-info"><span className="base-videos-export-info-icon">i</span><h3>Sobre este export</h3><strong>Dados simples (.txt)</strong><p>Gera um arquivo de texto organizado para consulta e preparação de roteiros. Você pode exportar todos os vídeos ou somente os de uma categoria.</p><ul><li>Descrição e duração do vídeo</li><li>Tempos da cena e das reações</li><li>Categoria e linha do tempo</li><li>Contexto adicional para IA</li></ul><small>Somente vídeos publicados com descrição principal preenchida entram no TXT. O arquivo não inclui a mídia dos vídeos.</small></aside>
      </div>
    </section>
  </div>
}
