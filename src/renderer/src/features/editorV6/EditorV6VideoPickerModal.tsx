import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../ui/components/Icon'
import './editorV6VideoPicker.css'
import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'
import type { BaseVideoDetails } from '../../../../shared/baseVideos'
import { editorV6VideoPickerEmptyState, filterAndSortEditorV6Videos, type EditorV6VideoPickerSort, type EditorV6VideoPickerTimeline, type EditorV6VideoPickerView } from './editorV6VideoPickerModel'
import { recognizeEditorV6VideoDuration } from './editorV6VideoDuration'

const emptyDetails = (videoId: string): BaseVideoDetails => ({ videoId, categoryId: null, description: '', additionalContext: '', timeline: 'unspecified' })

const recognizeDuration = (item: VideoLibraryItem) => recognizeEditorV6VideoDuration(item, {
  createVideo: () => document.createElement('video'),
  finishImport: (videoId, durationFrames) => window.desktop.mediaLibrary.finishImport(videoId, durationFrames),
  setTimeout: (callback, milliseconds) => window.setTimeout(callback, milliseconds),
  clearTimeout: (timer) => window.clearTimeout(timer)
})

export function EditorV6VideoPickerModal({ onClose, onSelect }: { onClose: () => void; onSelect: (item: VideoLibraryItem) => Promise<void> }) {
  const [items, setItems] = useState<VideoLibraryItem[]>([])
  const [details, setDetails] = useState<Record<string, BaseVideoDetails>>({})
  const [view, setView] = useState<EditorV6VideoPickerView>('main')
  const [query, setQuery] = useState('')
  const [timeline, setTimeline] = useState<EditorV6VideoPickerTimeline>('all')
  const [sort, setSort] = useState<EditorV6VideoPickerSort>('number')
  const [previewId, setPreviewId] = useState<string | null>(null)
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return
      if (previewId) setPreviewId(null)
      else onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose, previewId])

  const visible = useMemo(() => filterAndSortEditorV6Videos(items, details, { view, query, timeline, sort }), [items, details, query, timeline, sort, view])
  const emptyState = editorV6VideoPickerEmptyState(items, details, view)
  const previewItem = previewId ? visible.find((item) => item.id === previewId) ?? null : null

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

  return createPortal(<div className="v6-library-picker-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="v6-video-picker v6-video-picker-gallery" role="dialog" aria-modal="true" aria-labelledby="v6-video-picker-title">
      <header><div><span>BASE DE VÍDEOS</span><h2 id="v6-video-picker-title">Selecionar vídeo para a timeline</h2><p>O Editor V6 vincula pelo ID da biblioteca; o arquivo original fica na Base de Vídeos.</p></div><button type="button" disabled={busy} aria-label="Fechar" onClick={onClose}>×</button></header>
      <nav className="v6-video-picker-tabs" aria-label="Seção da Base de vídeos">
        <button type="button" className={view === 'main' ? 'active' : ''} aria-pressed={view === 'main'} onClick={() => { setView('main'); setPreviewId(null) }}>Base de Vídeos</button>
        <button type="button" className={view === 'drafts' ? 'active' : ''} aria-pressed={view === 'drafts'} onClick={() => { setView('drafts'); setPreviewId(null) }}>Rascunhos</button>
      </nav>
      {previewItem ? <div className="v6-picker-focused">
        <button type="button" className="v6-picker-back" onClick={() => setPreviewId(null)}>← Voltar à galeria</button>
        <div className="v6-picker-large-preview"><video key={previewItem.id} src={`gacha-video://library/${previewItem.id}`} controls autoPlay playsInline preload="metadata" /></div>
        <div className="v6-picker-focus-info"><span className="v6-picker-number">{details[previewItem.id]?.videoNumber === undefined ? 'RASCUNHO' : `VÍDEO ${String(details[previewItem.id]?.videoNumber).padStart(2, '0')}`}</span><div><strong>{previewItem.name}</strong><small>{previewItem.durationFrames === null ? 'Duração pendente' : `${(previewItem.durationFrames / 30).toFixed(2)} s`} · {(previewItem.size / 1024 ** 2).toFixed(1)} MB · ID {previewItem.id.slice(0, 8).toUpperCase()}</small></div><button className="primary" type="button" disabled={busy} onClick={() => void choose(previewItem)}>{busy ? 'Aguarde…' : 'Usar este vídeo'}</button></div>
      </div> : <>
        <div className="v6-video-picker-filters">
          <label className="v6-picker-search"><Icon name="search" /><input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, número, ID ou descrição" aria-label="Buscar vídeos" /></label>
          <label><span>Linha do tempo</span><select value={timeline} onChange={(event) => setTimeline(event.target.value as typeof timeline)}><option value="all">Todas</option><option value="past">Passado</option><option value="present">Presente</option><option value="future">Futuro</option><option value="unspecified">Indefinido</option></select></label>
          <label><span>Ordenar</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="number">Número</option><option value="name">Nome</option><option value="duration">Duração</option><option value="newest">Mais recente</option></select></label>
          <span className="v6-picker-result-count">{visible.length} vídeo(s)</span>
          <button className="v6-picker-add" type="button" disabled={busy} onClick={() => void addVideo()}>＋ Adicionar vídeo</button>
        </div>
        {error && <p className="v6-library-picker-error" role="alert">{error}</p>}
        <div className="v6-video-picker-grid" aria-busy={loading || busy}>
          {loading ? <div className="v6-picker-skeleton-grid" aria-label="Carregando vídeos">{Array.from({ length: 6 }, (_, index) => <div className="v6-picker-skeleton" key={index}><i /><span /><span /></div>)}</div> : visible.length ? visible.map((item) => {
            const number = details[item.id]?.videoNumber
            return <article className="v6-picker-card" key={item.id} onDoubleClick={() => void choose(item)}>
              <button className="v6-picker-thumb" type="button" disabled={busy} onClick={() => setPreviewId(item.id)} aria-label={`Abrir prévia de ${item.name}`}><video src={`gacha-video://library/${item.id}`} muted playsInline preload="metadata" tabIndex={-1} /><span className="v6-picker-play">▶</span><small>{item.durationFrames === null ? '—' : `${(item.durationFrames / 30).toFixed(1)} s`}</small></button>
              <div className="v6-picker-card-info"><div><span className="v6-picker-number">{number === undefined ? 'RASCUNHO' : `VÍDEO ${String(number).padStart(2, '0')}`}</span><strong title={item.name}>{item.name}</strong></div><small>{item.durationFrames === null ? 'Duração pendente' : `${(item.durationFrames / 30).toFixed(2)} s`} · {(item.size / 1024 ** 2).toFixed(1)} MB · ID {item.id.slice(0, 8).toUpperCase()}</small><div className="v6-picker-card-actions"><button type="button" disabled={busy} onClick={() => setPreviewId(item.id)}>▶ Prévia</button><button className="primary" type="button" disabled={busy} onClick={() => void choose(item)}>{busy ? 'Aguarde…' : 'Selecionar'}</button></div></div>
            </article>
          }) : <div className="v6-picker-empty"><Icon name="frame" /><strong>{emptyState.title}</strong><span>{emptyState.hint}</span></div>}
        </div>
      </>}
      {error && previewItem && <p className="v6-library-picker-error" role="alert">{error}</p>}
      <footer><small>{visible.length} vídeo(s) nesta seção · itens importados aqui ficam em Rascunhos</small><button type="button" disabled={busy} onClick={onClose}>Fechar</button></footer>
    </section>
  </div>, document.body)
}
