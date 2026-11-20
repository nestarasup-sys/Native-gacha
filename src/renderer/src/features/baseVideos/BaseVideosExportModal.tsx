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
      <header className="base-videos-export-header">
        <div className="base-videos-export-heading">
          <span className="base-videos-export-mark">TXT</span>
          <div><span className="base-videos-export-eyebrow">BASE DE VÍDEOS · EXPORTAÇÃO</span><h2 id="base-videos-export-title">Dados simples</h2><p>Monte um arquivo organizado com os dados que você quer levar.</p></div>
        </div>
        <button type="button" aria-label="Fechar" disabled={exporting} onClick={onClose}>×</button>
      </header>
      <div className="base-videos-export-body">
        <div className="base-videos-export-controls">
          <div className="base-videos-export-file-card"><span className="base-videos-export-file-icon">TXT</span><span><strong>Dados simples.txt</strong><small>Arquivo de texto · pronto para compartilhar</small></span><i>✓</i></div>

          <section className="base-videos-export-section">
            <div className="base-videos-export-section-heading"><span className="base-videos-export-step">1</span><div><strong>Escolha os vídeos</strong><small>Filtre por categoria ou leve todos.</small></div></div>
            <label className="base-videos-export-category"><span>Categoria</span><select value={categoryId} disabled={exporting} onChange={(event) => setCategoryId(event.target.value)}>
              <option value="all">Todas as categorias</option>
              <option value="uncategorized">Sem categoria</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select></label>
            <div className="base-videos-export-count"><strong>{entries.length}</strong><span>vídeo{entries.length === 1 ? '' : 's'} incluído{entries.length === 1 ? '' : 's'}<small>Somente vídeos publicados com descrição principal.</small></span></div>
          </section>

          <section className="base-videos-export-section">
            <div className="base-videos-export-section-heading"><span className="base-videos-export-step">2</span><div><strong>Personagens <small>opcional</small></strong><small>Inclua fichas narrativas no arquivo.</small></div></div>
            <button className="base-videos-export-characters-button" type="button" disabled={charactersLoading || Boolean(characterLoadError) || exporting} aria-expanded={characterPickerOpen} onClick={() => setCharacterPickerOpen((open) => !open)}>
              <span><strong>{selectedCharacterIds.length ? `${selectedCharacterIds.length} personagem(ns) selecionado(s)` : 'Nenhum personagem selecionado'}</strong><small>{characterLoadError || (charactersLoading ? 'Carregando lista…' : characters.length ? 'Clique para escolher personagens' : 'Não há personagens no Customizador')}</small></span><i>{characterPickerOpen ? '−' : '+'}</i>
            </button>
            {characterPickerOpen && <div className="base-videos-export-character-list" aria-label="Personagens do Customizador">
              {charactersLoading ? <p>Carregando personagens…</p> : characterLoadError ? <p role="alert">{characterLoadError}</p> : characters.length ? characters.map((character) => {
                const checked = selectedCharacterIds.includes(character.id)
                return <label key={character.id} className="base-videos-export-character-option"><input type="checkbox" checked={checked} disabled={exporting} onChange={() => setSelectedCharacterIds((current) => checked ? current.filter((id) => id !== character.id) : [...current, character.id])} /><span><strong>{character.name}</strong><small>{characterSheets.some((sheet) => sheet.characterId === character.id) ? 'Ficha narrativa será incluída' : 'Sem ficha narrativa salva'}</small></span></label>
              }) : <p>O Customizador ainda não tem personagens.</p>}
            </div>}
          </section>
          {error && <p className="base-videos-export-error" role="alert">{error}</p>}
        </div>
        <aside className="base-videos-export-info"><span className="base-videos-export-info-eyebrow">O ARQUIVO VAI INCLUIR</span><h3>Informações úteis, em um só lugar.</h3><ul><li><i>✓</i><span><strong>Dados do vídeo</strong><small>Descrição e duração</small></span></li><li><i>✓</i><span><strong>Tempos de cena</strong><small>Reações e linha do tempo</small></span></li><li><i>✓</i><span><strong>Contexto</strong><small>Categoria e observações adicionais</small></span></li><li><i>＋</i><span><strong>Fichas de personagens</strong><small>Quando selecionadas acima</small></span></li></ul><div className="base-videos-export-info-note">Os arquivos dos vídeos não são copiados para o TXT.</div></aside>
      </div>
      <footer className="base-videos-export-footer"><span>O arquivo será salvo com o nome <strong>Dados simples.txt</strong>.</span><div><button type="button" disabled={exporting} onClick={onClose}>Cancelar</button><button className="primary" type="button" disabled={exporting || !entries.length} onClick={() => void exportData()}>{exporting ? 'Preparando arquivo…' : '↓  Exportar TXT'}</button></div></footer>
    </section>
  </div>
}
