import { useEffect, useState } from 'react'
import type { BaseVideoCategory, BaseVideoDetails } from '../../../../shared/baseVideos'
import type { CharacterSheet } from '../../../../shared/roteiros'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'
import { buildBaseVideosAiPackage } from './baseVideosAiPackage'

export function BaseVideosAiPackageModal({ items, detailsById, categories, onClose, onExport }: { items: VideoLibraryItem[]; detailsById: Record<string, BaseVideoDetails>; categories: BaseVideoCategory[]; onClose: () => void; onExport: (content: string) => Promise<boolean> }) {
  const [characters, setCharacters] = useState<CustomizerCharacter[]>([])
  const [sheets, setSheets] = useState<CharacterSheet[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const publishedVideoCount = items.filter((item) => detailsById[item.id]?.videoNumber !== undefined).length
  useEffect(() => {
    let cancelled = false
    void Promise.all([window.desktop.customizer.listCustomizerCharacters(), window.desktop.roteiros.listCharacterSheets()]).then(([loadedCharacters, loadedSheets]) => { if (!cancelled) { setCharacters(loadedCharacters); setSheets(loadedSheets) } }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os personagens.') }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const exportPackage = async () => {
    if (busy || !items.length) return
    setBusy(true); setError('')
    try {
      const selected = characters.filter((character) => selectedIds.includes(character.id))
      const saved = await onExport(buildBaseVideosAiPackage(items, detailsById, categories, selected, sheets))
      if (saved) onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível gerar o guia para o ROT export.') }
    finally { setBusy(false) }
  }

  return <div className="roteiro-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="base-videos-ai-modal base-videos-rot-modal" role="dialog" aria-modal="true" aria-labelledby="base-videos-ai-package-title">
      <header className="base-videos-rot-header"><div className="base-videos-rot-heading"><span className="base-videos-rot-mark">ROT</span><div><span>GUIA PARA O ROT EXPORT</span><h2 id="base-videos-ai-package-title">Prepare o material do roteiro</h2><p>Reúna os vídeos publicados e as referências dos personagens em um TXT pronto para usar.</p></div></div><button type="button" aria-label="Fechar" disabled={busy} onClick={onClose}>×</button></header>
      <div className="base-videos-ai-body base-videos-rot-body">
        <div className="base-videos-rot-summary"><span><b>{publishedVideoCount}</b><small>vídeos publicados</small></span><span><b>{selectedIds.length}</b><small>personagens no guia</small></span><span><b>.TXT</b><small>formato do arquivo</small></span></div>
        <section className="base-videos-rot-cast-section"><div className="base-videos-ai-cast-heading"><strong>Personagens para incluir <small>· escolha opcional</small></strong><div><button type="button" disabled={busy || loading || !characters.length} onClick={() => setSelectedIds(characters.map((character) => character.id))}>Selecionar todos</button><button type="button" disabled={busy || !selectedIds.length} onClick={() => setSelectedIds([])}>Limpar</button></div></div><p className="base-videos-rot-hint">As fichas narrativas locais dos personagens selecionados também serão adicionadas.</p>
          {loading ? <p className="base-videos-rot-state">Carregando personagens…</p> : error ? null : <div className="base-videos-ai-cast">{characters.map((character) => <label key={character.id}><input type="checkbox" disabled={busy} checked={selectedIds.includes(character.id)} onChange={() => setSelectedIds((current) => current.includes(character.id) ? current.filter((id) => id !== character.id) : [...current, character.id])} /><span><b>{character.name}</b><small>{sheets.some((sheet) => sheet.characterId === character.id) ? 'Ficha narrativa incluída' : 'Sem ficha narrativa'}</small></span><i>{selectedIds.includes(character.id) ? '✓' : '+'}</i></label>)}{characters.length === 0 && <p className="base-videos-rot-state">Não há personagens salvos no Customizador.</p>}</div>}
        </section>
        <div className="base-videos-rot-includes"><strong>O guia reúne</strong><span>Descrições, IDs, durações e tempos dos vídeos</span><span>Referências e fichas dos personagens escolhidos</span><small>Nenhum arquivo de vídeo é copiado. O nome sugerido será “Guia para o ROT export.txt”.</small></div>
        {error && !loading && <p className="base-videos-ai-error" role="alert">{error}</p>}
      </div>
      <footer className="base-videos-rot-footer"><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="primary" disabled={busy || loading || !items.length} onClick={() => void exportPackage()}>{busy ? 'Preparando guia…' : '↓  Gerar Guia para o ROT export'}</button></footer>
    </section>
  </div>
}
