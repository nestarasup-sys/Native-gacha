import { useEffect, useState } from 'react'
import type { EditorV6LibraryMediaItem } from '../../../../shared/editorV6'

export function EditorV6AudioLibraryPicker({ onClose, onSelect }: { onClose: () => void; onSelect: (item: EditorV6LibraryMediaItem) => Promise<void> }) {
  const [items, setItems] = useState<EditorV6LibraryMediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const refresh = async () => { setLoading(true); try { setItems(await window.desktop.editorV6MediaLibrary.list('audio')); setError('') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os áudios.') } finally { setLoading(false) } }
  useEffect(() => { void refresh() }, [])
  const add = async () => {
    setBusy(true)
    try {
      const item = await window.desktop.editorV6MediaLibrary.import('audio')
      if (item) { await refresh(); await onSelect(item) }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível adicionar o áudio.') }
    finally { setBusy(false) }
  }
  return <div className="roteiro-modal-backdrop v6-video-picker-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="v6-video-picker" role="dialog" aria-modal="true" aria-labelledby="v6-audio-picker-title">
      <header><div><span>ÁUDIOS COMPARTILHADOS POR ID</span><h2 id="v6-audio-picker-title">Selecionar áudio</h2><p>Os roteiros guardam o ID; a biblioteca mantém o arquivo único.</p></div><button type="button" disabled={busy} aria-label="Fechar" onClick={onClose}>×</button></header>
      <div className="v6-audio-picker-actions"><button type="button" disabled={busy} onClick={() => void add()}>＋ Importar para a biblioteca</button></div>
      {error && <p className="roteiro-editor-error" role="alert">{error}</p>}
      <div className="v6-video-picker-list" aria-busy={loading || busy}>{loading ? <p>Carregando áudios…</p> : items.filter((item) => item.available).length ? items.filter((item) => item.available).map((item) => <button className="v6-video-picker-item" type="button" key={item.id} disabled={busy} onClick={() => { setBusy(true); void onSelect(item).catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível vincular o áudio.')).finally(() => setBusy(false)) }}><span className="v6-video-picker-badge">ÁUDIO</span><span className="v6-video-picker-info"><strong>{item.name}</strong><small>{(item.size / 1024 ** 2).toFixed(2)} MB · ID {item.id.slice(0, 8).toUpperCase()} · usado em {item.references.length} roteiro(s)</small></span><span className="v6-video-picker-action">Selecionar →</span></button>) : <p>Nenhum áudio disponível. Importe um arquivo para começar.</p>}</div>
      <footer><small>{items.filter((item) => item.available).length} áudio(s) disponíveis</small><button type="button" disabled={busy} onClick={onClose}>Cancelar</button></footer>
    </section>
  </div>
}
