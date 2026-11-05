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
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível gerar o pacote completo.') }
    finally { setBusy(false) }
  }
  return <div className="roteiro-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}><section className="base-videos-ai-modal" role="dialog" aria-modal="true" aria-labelledby="base-videos-ai-package-title"><header><div><span>PACOTE COMPLETO</span><h2 id="base-videos-ai-package-title">Preparar dados para IA</h2><p>O pacote reúne um guia de resposta, todos os vídeos da biblioteca e os personagens que você selecionar.</p></div><button type="button" aria-label="Fechar" disabled={busy} onClick={onClose}>×</button></header><div className="base-videos-ai-body"><div className="base-videos-ai-cast-heading"><strong>Personagens no pacote <small>· {selectedIds.length} selecionado(s)</small></strong><div><button type="button" disabled={busy || loading || !characters.length} onClick={() => setSelectedIds(characters.map((character) => character.id))}>Selecionar todos</button><button type="button" disabled={busy || !selectedIds.length} onClick={() => setSelectedIds([])}>Limpar</button></div></div>{loading ? <p>Carregando personagens…</p> : error ? <p role="alert">{error}</p> : <div className="base-videos-ai-cast">{characters.map((character) => <label key={character.id}><input type="checkbox" disabled={busy} checked={selectedIds.includes(character.id)} onChange={() => setSelectedIds((current) => current.includes(character.id) ? current.filter((id) => id !== character.id) : [...current, character.id])} /><span><b>{character.name}</b><small>{sheets.some((sheet) => sheet.characterId === character.id) ? 'Inclui ficha narrativa local' : 'Sem ficha narrativa'}</small></span></label>)}{characters.length === 0 && <p>Não há personagens salvos no Customizador.</p>}</div>}<p className="base-videos-ai-note">O arquivo inclui descrições, IDs, durações e tempos cadastrados. Nenhum vídeo é copiado para o TXT.</p>{error && !loading && <p className="base-videos-ai-error" role="alert">{error}</p>}</div><footer><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="primary" disabled={busy || loading || !items.length} onClick={() => void exportPackage()}>{busy ? 'Preparando…' : 'Exportar pacote TXT'}</button></footer></section></div>
}
