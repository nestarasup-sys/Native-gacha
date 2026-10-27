import { useEffect, useMemo, useState } from 'react'
import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'
import type { BaseVideoDetails } from '../../../../shared/baseVideos'

const emptyDetails = (videoId: string): BaseVideoDetails => ({ videoId, categoryId: null, description: '', additionalContext: '', timeline: 'unspecified' })

async function recognizeDuration(item: VideoLibraryItem): Promise<VideoLibraryItem> {
  if (item.durationFrames !== null) return item
  const video = document.createElement('video')
  video.preload = 'metadata'
  video.muted = true
  try {
    const seconds = await new Promise<number>((resolve, reject) => {
      const timer = window.setTimeout(() => { cleanup(); reject(new Error(`Não foi possível reconhecer a duração de “${item.name}”.`)) }, 30000)
      const cleanup = () => { window.clearTimeout(timer); video.onloadedmetadata = null; video.onerror = null }
      video.onloadedmetadata = () => { cleanup(); resolve(video.duration) }
      video.onerror = () => { cleanup(); reject(new Error(`Não foi possível ler “${item.name}”.`)) }
      video.src = `gacha-video://library/${item.id}`
      video.load()
    })
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60 * 60 * 24) throw new Error(`A duração de “${item.name}” não é válida.`)
    return await window.desktop.mediaLibrary.finishImport(item.id, Math.max(1, Math.ceil(seconds * 30)))
  } finally { video.pause(); video.removeAttribute('src'); video.load() }
}

export function EditorV6VideoPickerModal({ onClose, onSelect }: { onClose: () => void; onSelect: (item: VideoLibraryItem) => Promise<void> }) {
  const [items, setItems] = useState<VideoLibraryItem[]>([])
  const [details, setDetails] = useState<Record<string, BaseVideoDetails>>({})
  const [view, setView] = useState<'main' | 'drafts'>('main')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = async () => {
    setLoading(true)
    try {
      const [library, savedDetails] = await Promise.all([window.desktop.mediaLibrary.list(), window.desktop.baseVideos.listDetails()])
      setItems(library)
      setDetails(Object.fromEntries(savedDetails.map((item) => [item.videoId, item])))
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a Base de vídeos.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('pt-BR')
    return items.filter((item) => {
      const isDraft = details[item.id]?.videoNumber === undefined
      return item.available && (view === 'drafts' ? isDraft : !isDraft)
        && (!search || item.name.toLocaleLowerCase('pt-BR').includes(search) || item.id.toLocaleLowerCase().includes(search) || String(details[item.id]?.videoNumber ?? '').includes(search))
    }).sort((a, b) => view === 'main'
      ? (details[a.id]?.videoNumber ?? Number.MAX_SAFE_INTEGER) - (details[b.id]?.videoNumber ?? Number.MAX_SAFE_INTEGER)
      : b.createdAt.localeCompare(a.createdAt))
  }, [items, details, query, view])

  const addVideo = async () => {
    setBusy(true); setError('')
    let imported: VideoLibraryItem | null = null
    try {
      imported = await window.desktop.mediaLibrary.import()
      if (!imported) return
      try {
        await window.desktop.baseVideos.saveDetails(emptyDetails(imported.id))
        setDetails((current) => ({ ...current, [imported!.id]: emptyDetails(imported!.id) }))
      } catch (reason) {
        await window.desktop.baseVideos.deleteVideo(imported.id).catch(() => undefined)
        throw reason
      }
      setItems((current) => [imported!, ...current.filter((item) => item.id !== imported!.id)])
      setView('drafts')
      try {
        const ready = await recognizeDuration(imported)
        setItems((current) => current.map((item) => item.id === ready.id ? ready : item))
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'O vídeo foi adicionado aos Rascunhos, mas sua duração não foi reconhecida.') }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível adicionar o vídeo à Base.') }
    finally { setBusy(false) }
  }

  const choose = async (item: VideoLibraryItem) => {
    setBusy(true); setError('')
    try { await onSelect(await recognizeDuration(item)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível vincular este vídeo.') }
    finally { setBusy(false) }
  }

  return <div className="roteiro-modal-backdrop v6-video-picker-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="v6-video-picker" role="dialog" aria-modal="true" aria-labelledby="v6-video-picker-title">
      <header><div><span>VÍDEOS COMPARTILHADOS POR ID</span><h2 id="v6-video-picker-title">Adicionar vídeo à timeline</h2><p>O Editor V6 cria uma referência ao vídeo da Base; não duplica o arquivo.</p></div><button type="button" disabled={busy} aria-label="Fechar" onClick={onClose}>×</button></header>
      <nav className="v6-video-picker-tabs" aria-label="Seção da Base de vídeos">
        <button type="button" className={view === 'main' ? 'active' : ''} aria-pressed={view === 'main'} onClick={() => setView('main')}>Base de Vídeos</button>
        <button type="button" className={view === 'drafts' ? 'active' : ''} aria-pressed={view === 'drafts'} onClick={() => setView('drafts')}>Rascunhos</button>
      </nav>
      <div className="v6-video-picker-toolbar"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, número ou ID" aria-label="Buscar vídeos" /><button type="button" disabled={busy} onClick={() => void addVideo()}>＋ Adicionar vídeo</button></div>
      {error && <p className="roteiro-editor-error" role="alert">{error}</p>}
      <div className="v6-video-picker-list" aria-busy={loading || busy}>
        {loading ? <p>Carregando vídeos…</p> : visible.length ? visible.map((item) => {
          const number = details[item.id]?.videoNumber
          return <button type="button" className="v6-video-picker-item" key={item.id} disabled={busy} onClick={() => void choose(item)}>
            <span className="v6-video-picker-badge">{number === undefined ? 'RASCUNHO' : `VÍDEO ${String(number).padStart(2, '0')}`}</span>
            <span className="v6-video-picker-info"><strong>{item.name}</strong><small>{item.durationFrames === null ? 'Duração pendente' : `${(item.durationFrames / 30).toFixed(1)} s`} · ID ${item.id.slice(0, 8).toUpperCase()}</small></span>
            <span className="v6-video-picker-action">{busy ? 'Aguarde…' : 'Selecionar →'}</span>
          </button>
        }) : <p>{view === 'main' ? 'Nenhum vídeo publicado na Base.' : 'Nenhum vídeo nos Rascunhos.'}</p>}
      </div>
      <footer><small>{visible.length} vídeo(s) · os vídeos importados por aqui entram em Rascunhos</small><button type="button" disabled={busy} onClick={onClose}>Cancelar</button></footer>
    </section>
  </div>
}
