import { useEffect, useMemo, useRef, useState } from 'react'
import type { BaseVideoCategory, BaseVideoDetails, VideoTimeline } from '../../../../shared/baseVideos'
import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'
import { Icon } from '../../ui/components/Icon'
import { registerPendingWriteFlusher } from '../../ui/pendingPersistence'
import { createBaseVideoDetailsSaveQueue } from './baseVideoDetailsSaveQueue'
import { createBaseVideoCategory, deleteBaseVideoCategory, renameBaseVideoCategory } from './baseVideoCategoryCommands'
import { selectVisibleBaseVideos, type BaseVideoListSort, type BaseVideoTimelineFilter } from './baseVideoListModel'
import { publishBaseVideoDraft } from './publishBaseVideoDraft'
import { deleteBaseVideosSequentially } from './deleteBaseVideosSequentially'
import { createEmptyBaseVideoDetails } from './baseVideoDetailsModel'
import { loadBaseVideosSnapshot } from './loadBaseVideosSnapshot'
import { importBaseVideoDraft } from './importBaseVideoDraft'

const formatDuration = (frames: number | null) => {
  if (frames === null) return 'Duração não reconhecida'
  const seconds = Math.floor(frames / 60)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

async function recognizeDuration(item: VideoLibraryItem): Promise<VideoLibraryItem> {
  if (item.durationFrames !== null) return item
  const media = document.createElement('video')
  media.preload = 'metadata'
  media.muted = true
  try {
    const seconds = await new Promise<number>((resolve, reject) => {
      const timer = window.setTimeout(() => { cleanup(); reject(new Error(`Não foi possível reconhecer a duração de “${item.name}”.`)) }, 30000)
      const cleanup = () => { window.clearTimeout(timer); media.onloadedmetadata = null; media.onerror = null }
      media.onloadedmetadata = () => { cleanup(); resolve(media.duration) }
      media.onerror = () => { cleanup(); reject(new Error(`Não foi possível ler “${item.name}”.`)) }
      media.src = `gacha-video://library/${item.id}`
      media.load()
    })
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60 * 60 * 24) throw new Error(`A duração de “${item.name}” não é válida.`)
    return await window.desktop.mediaLibrary.finishImport(item.id, Math.max(1, Math.ceil(seconds * 60)))
  } finally {
    media.pause()
    media.removeAttribute('src')
    media.load()
  }
}

export function BaseVideosPage() {
  const [items, setItems] = useState<VideoLibraryItem[]>([])
  const [detailsById, setDetailsById] = useState<Record<string, BaseVideoDetails>>({})
  const [categories, setCategories] = useState<BaseVideoCategory[]>([])
  const [loaded, setLoaded] = useState(false)
  const [activeView, setActiveView] = useState<'main' | 'drafts'>('main')
  const [busy, setBusy] = useState(false)
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleteMode, setDeleteMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [visibleCount, setVisibleCount] = useState(18)
  const [search, setSearch] = useState('')
  const [timelineFilter, setTimelineFilter] = useState<BaseVideoTimelineFilter>('all')
  const [sort, setSort] = useState<BaseVideoListSort>('order')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<VideoLibraryItem | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [categoryVideoId, setCategoryVideoId] = useState<string | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [categoryEditingId, setCategoryEditingId] = useState<string | null>(null)
  const [categoryEditValue, setCategoryEditValue] = useState('')
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [saveStatusById, setSaveStatusById] = useState<Record<string, 'saving' | 'saved' | 'error'>>({})
  const saveQueue = useMemo(() => createBaseVideoDetailsSaveQueue({
    saveDetails: (details) => window.desktop.baseVideos.saveDetails(details),
    setStatus: (videoId, status) => setSaveStatusById((current) => ({ ...current, [videoId]: status })),
    setError: (reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível salvar este vídeo.'),
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: (timer) => window.clearTimeout(timer)
  }), [])
  const recognizingDurations = useRef(new Set<string>())

  useEffect(() => {
    let cancelled = false
    void loadBaseVideosSnapshot({
      listLibrary: () => window.desktop.mediaLibrary.list(),
      listDetails: () => window.desktop.baseVideos.listDetails(),
      listCategories: () => window.desktop.baseVideos.listCategories()
    }).then((snapshot) => {
      if (cancelled) return
      setItems(snapshot.items)
      setDetailsById(snapshot.detailsById)
      setCategories(snapshot.categories)
      setLoaded(true)
    }).catch((reason: unknown) => {
      if (!cancelled) { setLoadError(reason instanceof Error ? reason.message : 'Não foi possível abrir a Base de vídeos.'); setLoaded(true) }
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (deleteConfirmOpen) { setDeleteConfirmOpen(false); return }
      if (renameTarget) { setRenameTarget(null); return }
      if (categoryVideoId) { setCategoryVideoId(null); setCategoryError(null); return }
      if (deleteMode) { setDeleteMode(false); setSelectedIds([]) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteConfirmOpen, renameTarget, categoryVideoId, deleteMode])

  useEffect(() => registerPendingWriteFlusher(saveQueue.flushPendingSaves), [saveQueue])

  const updateDetails = (videoId: string, patch: Partial<BaseVideoDetails>) => {
    const next = { ...(detailsById[videoId] ?? createEmptyBaseVideoDetails(videoId)), ...patch, videoId }
    saveQueue.scheduleSave(next)
    setDetailsById((current) => ({ ...current, [videoId]: next }))
  }

  const createCategory = async () => {
    if (!categoryVideoId || !categoryName.trim() || busy) return
    setBusy(true); setCategoryError(null)
    try {
      await createBaseVideoCategory({
        name: categoryName,
        videoId: categoryVideoId,
        createCategory: (name) => window.desktop.baseVideos.createCategory(name),
        appendCategory: (category) => setCategories((current) => [...current, category].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))),
        assignCategory: (videoId, categoryId) => updateDetails(videoId, { categoryId }),
        clearName: () => setCategoryName('')
      })
    } catch (reason) { setCategoryError(reason instanceof Error ? reason.message : 'Não foi possível criar a categoria.') }
    finally { setBusy(false) }
  }

  const renameCategory = async (id: string) => {
    if (!categoryEditValue.trim() || busy) return
    setBusy(true); setCategoryError(null)
    try {
      await renameBaseVideoCategory({
        categoryId: id,
        name: categoryEditValue,
        renameCategory: (categoryId, name) => window.desktop.baseVideos.renameCategory(categoryId, name),
        replaceCategory: (renamed) => setCategories((current) => current.map((category) => category.id === id ? renamed : category).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))),
        finishEditing: () => setCategoryEditingId(null)
      })
    } catch (reason) { setCategoryError(reason instanceof Error ? reason.message : 'Não foi possível renomear a categoria.') }
    finally { setBusy(false) }
  }

  const deleteCategory = async (category: BaseVideoCategory) => {
    if (busy) return
    setBusy(true); setCategoryError(null)
    try {
      await deleteBaseVideoCategory({
        categoryId: category.id,
        detailsById,
        flushPendingSave,
        deleteCategory: (categoryId) => window.desktop.baseVideos.deleteCategory(categoryId),
        clearCategoryAssignment: (videoId) => updateDetails(videoId, { categoryId: null })
      })
      setCategories((current) => current.filter((entry) => entry.id !== category.id))
      if (categoryEditingId === category.id) setCategoryEditingId(null)
    } catch (reason) { setCategoryError(reason instanceof Error ? reason.message : 'Não foi possível excluir a categoria.') }
    finally { setBusy(false) }
  }

  const flushPendingSave = (videoId: string) => saveQueue.flushPendingSave(videoId)

  const visibleItems = useMemo(() => selectVisibleBaseVideos(items, detailsById, {
    activeView,
    search,
    timelineFilter,
    sort
  }), [items, detailsById, activeView, search, timelineFilter, sort])

  useEffect(() => { setVisibleCount(18) }, [activeView])

  const addVideo = async () => {
    setBusy(true); setError(null)
    try {
      await importBaseVideoDraft({
        importVideo: () => window.desktop.mediaLibrary.import(),
        saveDetails: (details) => window.desktop.baseVideos.saveDetails(details),
        publishToSession: (item, details) => {
          setItems((current) => [item, ...current.filter((entry) => entry.id !== item.id)])
          setDetailsById((current) => ({ ...current, [item.id]: details }))
          setActiveView('drafts')
        },
        recognizeDuration,
        updateSessionItem: (ready) => setItems((current) => current.map((item) => item.id === ready.id ? ready : item)),
        deleteIncompleteImport: (videoId) => window.desktop.baseVideos.deleteVideo(videoId),
        setError,
        logCleanupFailure: (reason) => console.error('Falha ao limpar a importação incompleta do vídeo.', reason)
      })
    } finally { setBusy(false) }
  }

  const sendToBase = async (videoId: string) => {
    setBusy(true); setError(null)
    setPublishErrors((current) => ({ ...current, [videoId]: '' }))
    try {
      const videoNumber = await publishBaseVideoDraft({
        videoId,
        flushPendingSave,
        publish: (id) => window.desktop.baseVideos.publish(id)
      })
      setDetailsById((current) => ({ ...current, [videoId]: { ...(current[videoId] ?? createEmptyBaseVideoDetails(videoId)), videoNumber } }))
      setActiveView('main')
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Não foi possível enviar o vídeo para a Base.'
      setPublishErrors((current) => ({ ...current, [videoId]: message }))
    } finally { setBusy(false) }
  }

  const handleDelete = async () => {
    if (!deleteMode) { setDeleteMode(true); setSelectedIds([]); return }
    if (!selectedIds.length || busy) return
    setDeleteConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!selectedIds.length || busy) return
    setBusy(true); setError(null)
    const deletedIds: string[] = []
    try {
      await deleteBaseVideosSequentially({
        videoIds: selectedIds,
        flushPendingSave,
        deleteVideo: (id) => window.desktop.baseVideos.deleteVideo(id),
        onDeleted: (id) => deletedIds.push(id)
      })
      setItems((current) => current.filter((item) => !deletedIds.includes(item.id)))
      setDetailsById((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !deletedIds.includes(id))))
      setDeleteMode(false); setSelectedIds([]); setDeleteConfirmOpen(false)
    } catch (reason) {
      setItems((current) => current.filter((item) => !deletedIds.includes(item.id)))
      setDetailsById((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !deletedIds.includes(id))))
      setSelectedIds((current) => current.filter((id) => !deletedIds.includes(id)))
      setError(reason instanceof Error ? reason.message : 'Não foi possível excluir os vídeos selecionados.')
    } finally { setBusy(false) }
  }

  const renameVideo = async () => {
    if (!renameTarget || !renameValue.trim() || busy) return
    setBusy(true); setError(null)
    try {
      const renamed = await window.desktop.mediaLibrary.rename(renameTarget.id, renameValue)
      setItems((current) => current.map((item) => item.id === renamed.id ? { ...item, name: renamed.name } : item))
      setRenameTarget(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível renomear o vídeo.')
    } finally { setBusy(false) }
  }

  const updateSeconds = (videoId: string, field: 'sceneEndSeconds' | 'firstGroupReactionSeconds' | 'secondGroupReactionSeconds', value: string) => {
    const seconds = value === '' ? undefined : Number(value)
    if (seconds !== undefined && (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400)) return
    updateDetails(videoId, { [field]: seconds })
  }

  const captureTime = (videoId: string, field: 'firstGroupReactionSeconds' | 'secondGroupReactionSeconds', element: HTMLVideoElement | null) => {
    const time = element?.currentTime
    if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) { setError('Não foi possível capturar o tempo da prévia.'); return }
    updateDetails(videoId, { [field]: Number(time.toFixed(2)) })
  }

  const recognizeCardDuration = (item: VideoLibraryItem, element: HTMLVideoElement) => {
    if (item.durationFrames !== null || recognizingDurations.current.has(item.id)) return
    const seconds = element.duration
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60 * 60 * 24) {
      setPublishErrors((current) => ({ ...current, [item.id]: 'Não foi possível reconhecer a duração. Confira se o arquivo está íntegro e usa um formato compatível.' }))
      return
    }
    recognizingDurations.current.add(item.id)
    void window.desktop.mediaLibrary.finishImport(item.id, Math.max(1, Math.ceil(seconds * 60))).then((ready) => {
      setItems((current) => current.map((candidate) => candidate.id === item.id ? ready : candidate))
      setPublishErrors((current) => ({ ...current, [item.id]: '' }))
    }).catch((reason) => setPublishErrors((current) => ({ ...current, [item.id]: reason instanceof Error ? reason.message : 'Não foi possível salvar a duração do vídeo.' }))).finally(() => recognizingDurations.current.delete(item.id))
  }

  const retryLoad = async () => {
    if (busy) return
    setBusy(true); setLoaded(false); setLoadError(null)
    try {
      const snapshot = await loadBaseVideosSnapshot({
        listLibrary: () => window.desktop.mediaLibrary.list(),
        listDetails: () => window.desktop.baseVideos.listDetails(),
        listCategories: () => window.desktop.baseVideos.listCategories()
      })
      setItems(snapshot.items)
      setDetailsById(snapshot.detailsById)
      setCategories(snapshot.categories)
    } catch (reason) { setLoadError(reason instanceof Error ? reason.message : 'Não foi possível abrir a Base de vídeos.') }
    finally { setLoaded(true); setBusy(false) }
  }

  return <main className="base-videos-page">
    <header className="base-videos-subbar">
      <div className="base-videos-heading"><span className="base-videos-heading-icon"><Icon name="frame" /></span><div><h1>Base de vídeos</h1><small>Descrições e tempos compartilhados com os roteiros</small></div></div>
      <div className="base-videos-actions">
        <button className="base-videos-add" type="button" onClick={() => void addVideo()} disabled={busy || !loaded || Boolean(loadError)}>{busy ? 'Importando…' : 'Adicionar'}</button>
        <button className={deleteMode ? 'base-videos-cancel-delete' : 'base-videos-delete'} type="button" onClick={() => void handleDelete()} disabled={!loaded || Boolean(loadError) || busy || (!deleteMode && !items.length) || (deleteMode && !selectedIds.length)}>{deleteMode ? `Confirmar (${selectedIds.length})` : 'Excluir'}</button>
        {deleteMode && <button className="base-videos-cancel" type="button" disabled={busy || !loaded} onClick={() => { setDeleteMode(false); setSelectedIds([]) }}>Cancelar</button>}
        <span className="base-videos-action-divider" />
        <button className={`base-videos-view${activeView === 'drafts' ? ' active' : ''}`} type="button" disabled={!loaded} onClick={() => { setActiveView((view) => view === 'main' ? 'drafts' : 'main'); setDeleteMode(false); setSelectedIds([]) }}>{activeView === 'drafts' ? 'Vídeos' : 'Rascunhos'} <span>{items.filter((item) => detailsById[item.id]?.videoNumber === undefined).length}</span></button>
      </div>
    </header>
    <div className="base-videos-content">
      {error && <div className="base-videos-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError(null)}>Fechar</button></div>}
      <div className="base-videos-filters"><label className="base-videos-search"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, ID, número ou descrição" /></label><label><span>Linha do tempo</span><select value={timelineFilter} onChange={(event) => setTimelineFilter(event.target.value as BaseVideoTimelineFilter)}><option value="all">Todas</option><option value="past">Passado</option><option value="present">Presente</option><option value="future">Futuro</option><option value="unspecified">Indefinido</option></select></label><label><span>Ordenar</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="order">Ordem padrão</option><option value="name">Nome</option><option value="duration">Duração</option><option value="newest">Mais recente</option></select></label>{deleteMode && <strong className="base-videos-selection-count">{selectedIds.length} selecionado(s)</strong>}</div>
      <div className="base-videos-view-heading"><div><h2>{activeView === 'main' ? 'Vídeos' : 'Rascunhos'}</h2><p>{activeView === 'main' ? 'Vídeos enviados para a Base, em ordem de identificação.' : 'Vídeos aguardando envio para a Base de vídeos.'}</p></div><span>{visibleItems.length} vídeo{visibleItems.length === 1 ? '' : 's'}</span></div>
      {!loaded ? <div className="base-videos-grid base-videos-skeleton-grid" aria-label="Carregando vídeos">{Array.from({ length: 6 }, (_, index) => <div className="base-videos-skeleton-card" key={index}><i /><b /><span /><span /></div>)}</div> : loadError ? <div className="base-videos-empty"><span className="base-videos-empty-icon"><Icon name="warning" /></span><strong>Não foi possível carregar a Base de vídeos</strong><span>{loadError}</span><button type="button" disabled={busy} onClick={() => void retryLoad()}>{busy ? 'Carregando…' : 'Tentar novamente'}</button></div> : visibleItems.length ? <><div className="base-videos-grid">{visibleItems.slice(0, visibleCount).map((item) => {
        const details = detailsById[item.id] ?? createEmptyBaseVideoDetails(item.id)
        const selected = selectedIds.includes(item.id)
        const currentCategory = categories.find((category) => category.id === details.categoryId)
        return <article className={`base-video-card${deleteMode ? ' selecting' : ''}${selected ? ' selected' : ''}`} key={item.id}>
          {deleteMode && <button className="base-video-select" type="button" aria-pressed={selected} onClick={() => setSelectedIds((current) => selected ? current.filter((id) => id !== item.id) : [...current, item.id])}><span>{selected ? '✓' : ''}</span>{selected ? 'Selecionado' : 'Selecionar'}</button>}
          <div className="roteiro-video-preview-panel base-video-notes-panel">
            <header className="base-video-card-heading"><div><strong title={item.name}>{item.name}</strong><small>{details.videoNumber === undefined ? 'RASCUNHO' : `VÍDEO ${String(details.videoNumber).padStart(2, '0')}`} · {formatDuration(item.durationFrames)} · {(item.size / 1024 ** 2).toFixed(1)} MB</small></div><button type="button" disabled={busy} onClick={() => { setRenameTarget(item); setRenameValue(item.name) }} aria-label={`Renomear ${item.name}`} title="Renomear vídeo"><Icon name="edit" /></button></header>
            <div className="roteiro-video-stage"><video src={`gacha-video://library/${item.id}`} controls playsInline preload="metadata" onLoadedMetadata={(event) => recognizeCardDuration(item, event.currentTarget)} aria-label={`Prévia de ${item.name}`} />{details.videoNumber !== undefined && <span className="base-video-number" title={`ID ${item.id}`}>VÍDEO {String(details.videoNumber).padStart(2, '0')}</span>}<span className="base-video-duration-overlay">{formatDuration(item.durationFrames)}</span></div>
            {item.durationFrames === null && <p className="base-video-duration-warning" role="status"><Icon name="warning" /> Duração não reconhecida; carregue a prévia para tentar identificá-la automaticamente.</p>}
            <div className="base-video-category-row"><span className={`base-video-category-current${saveStatusById[item.id] === 'error' ? ' save-error' : ''}`} role="status">{saveStatusById[item.id] === 'saving' ? 'Salvando alterações…' : saveStatusById[item.id] === 'error' ? 'Erro ao salvar' : <><span className="base-video-category-dot" style={{ backgroundColor: currentCategory?.color ?? '#b6aebd' }} />{currentCategory?.name ?? 'Sem categoria'}</>}</span><div className="base-video-category-row-actions">{saveStatusById[item.id] === 'error' && saveQueue.hasPending(item.id) && <button className="base-video-save-retry" type="button" onClick={() => void saveQueue.persistPendingSave(item.id).catch(() => undefined)}>Tentar salvar</button>}<button className="base-video-category-button" type="button" disabled={busy} onClick={() => { setCategoryVideoId(item.id); setCategoryName(''); setCategoryEditingId(null); setCategoryError(null) }}>Categoria</button></div></div>
            <label className="roteiro-video-description"><span>Descrição do que acontece no vídeo</span><textarea value={details.description} disabled={busy} onChange={(event) => updateDetails(item.id, { description: event.target.value })} placeholder="Descreva o que acontece neste vídeo…" maxLength={20000} /></label>
            <div className="roteiro-scene-settings">
              <label className="roteiro-timeline-field"><span>Linha do tempo</span><select disabled={busy} value={details.timeline} onChange={(event) => updateDetails(item.id, { timeline: event.target.value as VideoTimeline })}><option value="unspecified">Indefinido</option><option value="past">Passado</option><option value="present">Presente</option><option value="future">Futuro</option></select></label>
              <label className="roteiro-scene-end-field"><span>Fim da cena da descrição</span><div className="roteiro-timing-input"><input disabled={busy} aria-label={`Fim da descrição de ${item.name} em segundos`} type="number" min="0" max="86400" step="0.01" value={details.sceneEndSeconds ?? ''} onChange={(event) => updateSeconds(item.id, 'sceneEndSeconds', event.target.value)} placeholder="0" /><small>segundos</small></div></label>
              <section className="roteiro-group-reaction first"><header><strong>Primeira reação em grupo</strong><span>REAÇÃO 1</span></header><div className="roteiro-timing-input"><input disabled={busy} aria-label={`Primeira reação de ${item.name} em segundos`} type="number" min="0" max="86400" step="0.01" value={details.firstGroupReactionSeconds ?? ''} onChange={(event) => updateSeconds(item.id, 'firstGroupReactionSeconds', event.target.value)} placeholder="0" /><button disabled={busy} type="button" onClick={(event) => captureTime(item.id, 'firstGroupReactionSeconds', event.currentTarget.closest('.base-video-card')?.querySelector('video') ?? null)}>Tempo real</button><small>segundos</small></div></section>
              <section className="roteiro-group-reaction second"><header><strong>Segunda reação em grupo</strong><span>REAÇÃO 2</span></header><div className="roteiro-timing-input"><input disabled={busy} aria-label={`Segunda reação de ${item.name} em segundos`} type="number" min="0" max="86400" step="0.01" value={details.secondGroupReactionSeconds ?? ''} onChange={(event) => updateSeconds(item.id, 'secondGroupReactionSeconds', event.target.value)} placeholder="0" /><button disabled={busy} type="button" onClick={(event) => captureTime(item.id, 'secondGroupReactionSeconds', event.currentTarget.closest('.base-video-card')?.querySelector('video') ?? null)}>Tempo real</button><small>segundos</small></div></section>
            </div>
            <label className="roteiro-additional-context"><span>Contexto adicional para IA</span><textarea value={details.additionalContext ?? ''} disabled={busy} onChange={(event) => updateDetails(item.id, { additionalContext: event.target.value })} placeholder="Adicione informações, regras ou detalhes que a IA deve considerar…" maxLength={20000} /></label>
            {activeView === 'drafts' && !deleteMode && <><button className="base-video-send" type="button" disabled={busy} onClick={() => void sendToBase(item.id)}>{busy ? 'Enviando…' : 'Enviar para base de vídeos'}</button>{publishErrors[item.id] && <p className="base-video-publish-error" role="alert">{publishErrors[item.id]}</p>}</>}
          </div>
        </article>
      })}</div>{visibleItems.length > visibleCount && <button className="base-videos-load-more" type="button" onClick={() => setVisibleCount((current) => current + 18)}>Carregar mais vídeos ({visibleItems.length - visibleCount} restantes)</button>}</> : <div className="base-videos-empty"><span className="base-videos-empty-icon"><Icon name={activeView === 'main' ? 'frame' : 'edit'} /></span><strong>{items.length === 0 ? activeView === 'main' ? 'A Base de vídeos está vazia' : 'Nenhum rascunho' : 'Nenhum vídeo encontrado'}</strong><span>{items.length === 0 ? activeView === 'main' ? 'Envie vídeos a partir da área Rascunhos para gerar a numeração permanente.' : 'Adicione um vídeo para começar a organizar os rascunhos.' : 'Tente outro termo ou remova filtros para ver mais resultados.'}</span></div>}
    </div>
    {deleteConfirmOpen && <div className="roteiro-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDeleteConfirmOpen(false) }}><section className="base-video-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="base-video-confirm-title"><span className="base-video-confirm-icon"><Icon name="trash" /></span><h2 id="base-video-confirm-title">Excluir {selectedIds.length} vídeo(s)?</h2><p>Os arquivos selecionados e seus dados da Base serão removidos. Vídeos ainda usados em roteiros não poderão ser excluídos.</p><footer><button type="button" disabled={busy} onClick={() => setDeleteConfirmOpen(false)}>Cancelar</button><button className="danger" type="button" disabled={busy} onClick={() => void confirmDelete()}>{busy ? 'Excluindo…' : `Excluir ${selectedIds.length} vídeo(s)`}</button></footer></section></div>}
    {renameTarget && <div className="roteiro-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setRenameTarget(null) }}><section className="base-video-confirm-modal rename" role="dialog" aria-modal="true" aria-labelledby="base-video-rename-title"><h2 id="base-video-rename-title">Renomear vídeo</h2><p>Isso altera apenas o nome mostrado no app; o arquivo original permanece intacto.</p><label>Novo nome<input autoFocus maxLength={255} value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void renameVideo() }} /></label><footer><button type="button" disabled={busy} onClick={() => setRenameTarget(null)}>Cancelar</button><button className="primary" type="button" disabled={busy || !renameValue.trim()} onClick={() => void renameVideo()}>{busy ? 'Salvando…' : 'Salvar nome'}</button></footer></section></div>}
    {categoryVideoId && <div className="roteiro-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) { setCategoryVideoId(null); setCategoryError(null) } }}><section className="base-video-category-modal" role="dialog" aria-modal="true" aria-labelledby="base-video-category-title"><header><div><span className="base-video-category-modal-icon"><Icon name="frame" /></span><div><h2 id="base-video-category-title">Categoria do vídeo</h2><p>{items.find((item) => item.id === categoryVideoId)?.name ?? 'Organize este vídeo em uma categoria.'}</p></div></div><button type="button" aria-label="Fechar" disabled={busy} onClick={() => { setCategoryVideoId(null); setCategoryError(null) }}>×</button></header><div className="base-video-category-create"><label htmlFor="base-video-category-name">Nova categoria</label><div><input id="base-video-category-name" autoFocus maxLength={60} value={categoryName} placeholder="Ex.: Reações, Aberturas, Humor" onChange={(event) => setCategoryName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createCategory() }} /><button type="button" disabled={busy || !categoryName.trim()} onClick={() => void createCategory()}>{busy ? 'Salvando…' : 'Criar'}</button></div><small>Cada categoria recebe uma cor exclusiva e o vídeo recebe automaticamente a categoria criada.</small></div>{categoryError && <p className="base-video-category-error" role="alert">{categoryError}</p>}<div className="base-video-category-list"><button className={`base-video-category-option${!detailsById[categoryVideoId]?.categoryId ? ' active' : ''}`} type="button" disabled={busy} onClick={() => updateDetails(categoryVideoId, { categoryId: null })}><span><i className="uncategorized" />Sem categoria</span>{!detailsById[categoryVideoId]?.categoryId && <b>Selecionada</b>}</button>{categories.map((category) => <div className={`base-video-category-option${detailsById[categoryVideoId]?.categoryId === category.id ? ' active' : ''}`} key={category.id} style={{ borderLeftColor: category.color }}><div className="base-video-category-option-main">{categoryEditingId === category.id ? <div className="base-video-category-rename"><input autoFocus maxLength={60} value={categoryEditValue} onChange={(event) => setCategoryEditValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void renameCategory(category.id); if (event.key === 'Escape') setCategoryEditingId(null) }} /><button type="button" disabled={busy || !categoryEditValue.trim()} onClick={() => void renameCategory(category.id)}>Salvar</button><button type="button" disabled={busy} onClick={() => setCategoryEditingId(null)}>Cancelar</button></div> : <><button className="base-video-category-assign" type="button" disabled={busy} onClick={() => updateDetails(categoryVideoId, { categoryId: category.id })}><span><i style={{ backgroundColor: category.color }} />{category.name}</span>{detailsById[categoryVideoId]?.categoryId === category.id && <b>Selecionada</b>}</button><div className="base-video-category-tools"><button type="button" title="Renomear categoria" aria-label={`Renomear ${category.name}`} disabled={busy} onClick={() => { setCategoryEditingId(category.id); setCategoryEditValue(category.name) }}><Icon name="edit" /></button><button className="danger" type="button" title="Excluir categoria" aria-label={`Excluir ${category.name}`} disabled={busy} onClick={() => void deleteCategory(category)}><Icon name="trash" /></button></div></>}</div></div>)}</div><footer><span>{categories.length} categoria{categories.length === 1 ? '' : 's'}</span><button type="button" disabled={busy} onClick={() => { setCategoryVideoId(null); setCategoryError(null) }}>Concluir</button></footer></section></div>}
  </main>
}
