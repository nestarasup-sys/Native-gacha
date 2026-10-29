import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from '../../ui/components/Icon'
import { registerPendingWriteFlusher } from '../../ui/pendingPersistence'
import { CharacterPortrait } from '../../ui/components/CharacterPortrait'
import { RenderedCharacterPortrait } from '../../ui/components/RenderedCharacterPortrait'
import { RoteiroWorkspace } from './RoteiroWorkspace'
import { emptyRoteiroContent } from './roteiroDefaults'

import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { RoteiroDocument, RoteiroReactionBlock, RoteiroVideoReference } from '../../../../shared/roteiros'
import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'

/** Catálogo de roteiros, seleção de projeto e persistência dos documentos. */

const roteiroAreas = [
  { id: 'roteiros', label: 'Roteiros', icon: 'message' },
  { id: 'fichas', label: 'Ficha dos personagens', icon: 'user' },
  { id: 'configuracoes', label: 'Configurações', icon: 'settings' }
] as const

type SidebarRoteiro = RoteiroDocument

const roteiroThumbnailColors = ['#dcecff', '#ffe3ec', '#e2f4df', '#fff0cf', '#e9e1ff', '#d9f2ef']

function roteiroThumbnailColor(id: string): string {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0
  return roteiroThumbnailColors[hash % roteiroThumbnailColors.length]
}

export function RoteirosPage() {
  const [activeArea, setActiveArea] = useState<(typeof roteiroAreas)[number]['id']>('roteiros')
  const [roteiros, setRoteiros] = useState<SidebarRoteiro[]>([])
  const [roteirosLoaded, setRoteirosLoaded] = useState(false)
  const [roteirosLoadError, setRoteirosLoadError] = useState('')
  const [characters, setCharacters] = useState<CustomizerCharacter[]>([])
  const [selectedRoteiroId, setSelectedRoteiroId] = useState<string | null>(null)
  const [openedRoteiroId, setOpenedRoteiroId] = useState<string | null>(null)
  const [deleteMode, setDeleteMode] = useState(false)
  const [deleteSelection, setDeleteSelection] = useState<string[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [roteiroSearch, setRoteiroSearch] = useState('')
  const [roteiroSaveStatus, setRoteiroSaveStatus] = useState<'saving' | 'saved' | 'error'>('saved')
  const [libraryItems, setLibraryItems] = useState<VideoLibraryItem[]>([])
  const [libraryLoaded, setLibraryLoaded] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newCharacterIds, setNewCharacterIds] = useState<string[]>([])
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null)
  const [editingVideoTitle, setEditingVideoTitle] = useState('')
  const [editingCharacterIds, setEditingCharacterIds] = useState<string[]>([])
  const roteiroListRef = useRef<HTMLDivElement>(null)
  const roteiroListScroll = useRef(0)
  const saveRevision = useRef(0)
  const roteirosRef = useRef(roteiros)
  const lastRequestedRoteiros = useRef<SidebarRoteiro[] | null>(null)
  const persistedRoteiros = useRef<SidebarRoteiro[] | null>(null)
  const persistedRoteirosRevision = useRef(0)
  const roteiroSaveWrites = useRef(new Set<Promise<void>>())
  const active = roteiroAreas.find((area) => area.id === activeArea) ?? roteiroAreas[0]
  const openedRoteiro = roteiros.find((roteiro) => roteiro.id === openedRoteiroId) ?? null

  useLayoutEffect(() => { roteirosRef.current = roteiros }, [roteiros])

  const saveRoteirosSnapshot = useCallback((snapshot: SidebarRoteiro[]) => {
    const revision = ++saveRevision.current
    lastRequestedRoteiros.current = snapshot
    setRoteiroSaveStatus('saving')
    const write = Promise.resolve().then(() => window.desktop.roteiros.saveRoteiros(snapshot)).then(() => {
      if (revision >= persistedRoteirosRevision.current) {
        persistedRoteirosRevision.current = revision
        persistedRoteiros.current = snapshot
      }
      if (revision === saveRevision.current) setRoteiroSaveStatus('saved')
    }, (error: unknown) => {
      if (revision === saveRevision.current) setRoteiroSaveStatus('error')
      if (lastRequestedRoteiros.current === snapshot) lastRequestedRoteiros.current = null
      console.error('Não foi possível salvar os roteiros.', error)
      throw error
    })
    roteiroSaveWrites.current.add(write)
    void write.then(() => roteiroSaveWrites.current.delete(write), () => roteiroSaveWrites.current.delete(write))
    return write
  }, [])

  const flushRoteirosWrites = useCallback(async () => {
    if (!roteirosLoaded) return
    while (true) {
      const pending = [...roteiroSaveWrites.current]
      if (pending.length > 0) await Promise.allSettled(pending)
      const latest = roteirosRef.current
      if (persistedRoteiros.current === latest && roteiroSaveWrites.current.size === 0) return
      if (lastRequestedRoteiros.current === latest && roteiroSaveWrites.current.size > 0) continue
      await saveRoteirosSnapshot(latest)
    }
  }, [roteirosLoaded, saveRoteirosSnapshot])

  useEffect(() => registerPendingWriteFlusher(flushRoteirosWrites), [flushRoteirosWrites])

  useEffect(() => {
    let cancelled = false
    void window.desktop.customizer.listCustomizerCharacters().then((items) => { if (!cancelled) setCharacters(items) }).catch(() => undefined)
    void window.desktop.mediaLibrary.list().then((items) => { if (!cancelled) { setLibraryItems(items); setLibraryLoaded(true) } }).catch(() => { if (!cancelled) setLibraryLoaded(true) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    void window.desktop.roteiros.listRoteiros().then((items) => {
      if (!cancelled) {
        setRoteiros(items)
        setRoteirosLoaded(true)
        setRoteirosLoadError('')
      }
    }).catch((error) => { if (!cancelled) { console.error('Não foi possível carregar os roteiros salvos.', error); setRoteirosLoadError(error instanceof Error ? error.message : 'Não foi possível carregar os roteiros salvos.') } })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!roteirosLoaded || lastRequestedRoteiros.current === roteiros) return
    void saveRoteirosSnapshot(roteiros).catch(() => undefined)
  }, [roteiros, roteirosLoaded, saveRoteirosSnapshot])

  useEffect(() => {
    if (!openedRoteiroId && roteiroListRef.current) roteiroListRef.current.scrollTop = roteiroListScroll.current
  }, [openedRoteiroId])

  useEffect(() => {
    if (!deleteMode) return
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { if (deleteDialogOpen) setDeleteDialogOpen(false); else { setDeleteMode(false); setDeleteSelection([]) } }
    }
    window.addEventListener('keydown', cancelOnEscape)
    return () => window.removeEventListener('keydown', cancelOnEscape)
  }, [deleteMode, deleteDialogOpen])

  const createRoteiro = () => {
    const title = newTitle.trim()
    if (!roteirosLoaded || !title) return
    const roteiro: SidebarRoteiro = { id: crypto.randomUUID(), title, videoTitle: 'Vídeo 01', characterIds: newCharacterIds, tiktoks: [] }
    setRoteiros((current) => [roteiro, ...current])
    setSelectedRoteiroId(roteiro.id)
    setOpenedRoteiroId(roteiro.id)
    setNewTitle(''); setNewCharacterIds([]); setCreateOpen(false)
  }

  const deleteDraftVideoFromRoteiro = async (updatedRoteiro: SidebarRoteiro, videoId: string) => {
    const nextRoteiros = roteirosRef.current.map((item) => item.id === updatedRoteiro.id ? updatedRoteiro : item)
    setRoteiros(nextRoteiros)
    await saveRoteirosSnapshot(nextRoteiros)
    const stillReferenced = nextRoteiros.some((item) => item.opening?.video?.id === videoId || item.tiktoks.some((tiktok) => tiktok.video?.id === videoId))
    if (stillReferenced) return false
    await window.desktop.baseVideos.deleteVideo(videoId)
    return true
  }

  const duplicateRoteiro = (source: SidebarRoteiro) => {
    const remapBlocks = (blocks: RoteiroReactionBlock[] = []) => blocks.map((block) => ({ ...block, id: crypto.randomUUID() }))
    const copy: SidebarRoteiro = {
      ...source,
      id: crypto.randomUUID(),
      title: `${source.title.slice(0, 92)} (cópia)`,
      opening: source.opening ? { ...source.opening, blocks: remapBlocks(source.opening.blocks) } : emptyRoteiroContent(),
      tiktoks: source.tiktoks.map((item) => ({ ...item, id: crypto.randomUUID(), blocks: remapBlocks(item.blocks) }))
    }
    setRoteiros((current) => [copy, ...current])
    setSelectedRoteiroId(copy.id)
  }

  const handleDeleteButton = () => {
    if (!deleteMode) {
      setDeleteSelection([])
      setDeleteMode(true)
      return
    }
    if (deleteSelection.length === 0) {
      setDeleteSelection([])
      setDeleteMode(false)
      return
    }
    setDeleteDialogOpen(true)
  }

  const confirmDeleteRoteiros = () => {
    if (deleteSelection.length === 0) return
    setRoteiros((current) => current.filter((roteiro) => !deleteSelection.includes(roteiro.id)))
    if (selectedRoteiroId && deleteSelection.includes(selectedRoteiroId)) setSelectedRoteiroId(null)
    if (openedRoteiroId && deleteSelection.includes(openedRoteiroId)) setOpenedRoteiroId(null)
    setDeleteSelection([])
    setDeleteMode(false)
    setDeleteDialogOpen(false)
  }

  const toggleRoteiroSelection = (roteiroId: string) => {
    if (!deleteMode) {
      setSelectedRoteiroId(roteiroId)
      return
    }
    setDeleteSelection((current) => current.includes(roteiroId) ? current.filter((id) => id !== roteiroId) : [...current, roteiroId])
  }

  const saveVideoTitle = () => {
    if (!editingVideoId || !editingVideoTitle.trim()) return
    setRoteiros((current) => current.map((roteiro) => roteiro.id === editingVideoId ? { ...roteiro, videoTitle: editingVideoTitle.trim(), characterIds: editingCharacterIds } : roteiro))
    setEditingVideoId(null); setEditingVideoTitle(''); setEditingCharacterIds([])
  }

  const visibleRoteiros = roteiros.filter((roteiro) => !roteiroSearch.trim() || roteiro.title.toLocaleLowerCase('pt-BR').includes(roteiroSearch.trim().toLocaleLowerCase('pt-BR')) || roteiro.videoTitle.toLocaleLowerCase('pt-BR').includes(roteiroSearch.trim().toLocaleLowerCase('pt-BR')))
  const availableVideoIds = new Set(libraryItems.filter((item) => item.available).map((item) => item.id))

  if (openedRoteiro) return <RoteiroWorkspace roteiro={openedRoteiro} characters={characters} onBack={() => setOpenedRoteiroId(null)} onUpdate={(updated) => setRoteiros((current) => current.map((item) => item.id === updated.id ? updated : item))} onDeleteDraftVideo={deleteDraftVideoFromRoteiro} />

  return <div className="roteiros-layout">
    <aside className="roteiros-sidebar-empty" aria-label="Navegação de roteiros">
      <nav className="roteiros-subnav" aria-label="Subáreas de Roteiros">
        {roteiroAreas.map((area) => <button key={area.id} className={`roteiros-subnav-button${activeArea === area.id ? ' active' : ''}`} onClick={() => { setActiveArea(area.id); setDeleteMode(false); setDeleteSelection([]) }} aria-current={activeArea === area.id ? 'page' : undefined} type="button"><Icon name={area.icon} /><span>{area.label}</span></button>)}
      </nav>
    </aside>
    <section className="roteiros-main-empty" aria-label={`Área ${active.label}`}>
      <header className="roteiros-area-titlebar"><div className="roteiros-title-content">{activeArea === 'roteiros' && <div className="roteiros-title-actions"><button className="add" onClick={() => { setDeleteMode(false); setDeleteSelection([]); setNewTitle(''); setNewCharacterIds([]); setCreateOpen(true) }} disabled={!roteirosLoaded} title="Adicionar roteiro" type="button">Adicionar</button><button className={deleteMode ? deleteSelection.length ? 'confirm-delete' : 'cancel-delete' : 'delete'} onClick={handleDeleteButton} disabled={!roteirosLoaded || (!deleteMode && roteiros.length === 0)} title={deleteMode ? deleteSelection.length ? `Confirmar exclusão de ${deleteSelection.length} roteiro(s)` : 'Voltar sem excluir roteiros' : 'Selecionar roteiros para excluir'} type="button">{deleteMode ? deleteSelection.length ? 'Confirmar' : 'Voltar' : 'Excluir'}</button></div>}<h1>{active.label}</h1></div></header>
      {activeArea === 'roteiros' && <div className="roteiro-main-library" aria-label="Lista de roteiros" ref={roteiroListRef}><div className="roteiro-library-toolbar"><label><Icon name="search" /><input value={roteiroSearch} onChange={(event) => setRoteiroSearch(event.target.value)} placeholder="Buscar roteiro…" /></label><span className={`roteiro-save-indicator ${roteirosLoadError ? 'error' : roteiroSaveStatus}`} role="status">{roteirosLoadError ? 'Falha ao carregar' : !roteirosLoaded ? 'Carregando roteiros…' : roteiroSaveStatus === 'saving' ? 'Salvando…' : roteiroSaveStatus === 'error' ? 'Falha ao salvar' : 'Tudo salvo'}</span>{roteirosLoadError && <button className="roteiro-save-retry" type="button" onClick={() => { setRoteirosLoadError(''); void window.desktop.roteiros.listRoteiros().then((items) => { setRoteiros(items); setRoteirosLoaded(true) }).catch((reason: unknown) => setRoteirosLoadError(reason instanceof Error ? reason.message : 'Não foi possível carregar os roteiros salvos.')) }}>Tentar carregar</button>}{roteiroSaveStatus === 'error' && !roteirosLoadError && <button className="roteiro-save-retry" type="button" onClick={() => { void saveRoteirosSnapshot(roteiros).catch(() => undefined) }}>Tentar novamente</button>}</div>{roteirosLoaded && <div className="roteiro-main-cards">{visibleRoteiros.map((roteiro) => {
        const roteiroCharacters = roteiro.characterIds.map((id) => characters.find((character) => character.id === id)).filter((character): character is CustomizerCharacter => Boolean(character))
        const markedForDelete = deleteSelection.includes(roteiro.id)
        const refs = [roteiro.opening?.video, ...roteiro.tiktoks.map((item) => item.video)].filter((item): item is RoteiroVideoReference => Boolean(item))
        const hasUnavailableVideo = libraryLoaded && refs.some((item) => !availableVideoIds.has(item.id))
        return <article className={`roteiro-main-card${selectedRoteiroId === roteiro.id && !deleteMode ? ' selected' : ''}${deleteMode ? ' delete-mode' : ''}${markedForDelete ? ' delete-selected' : ''}`} key={roteiro.id}>
          <div className="roteiro-main-video-strip"><span title={roteiro.videoTitle}>{roteiro.videoTitle}</span><div><button className="roteiro-card-duplicate" onClick={() => duplicateRoteiro(roteiro)} disabled={deleteMode} type="button">Duplicar</button><button onClick={() => { setEditingVideoId(roteiro.id); setEditingVideoTitle(roteiro.videoTitle); setEditingCharacterIds([...roteiro.characterIds]) }} disabled={deleteMode} aria-label={`Editar roteiro ${roteiro.title}`} title="Editar roteiro e elenco" type="button"><Icon name="edit" /></button></div></div>
          <button className="roteiro-main-thumbnail" onClick={() => { if (deleteMode) toggleRoteiroSelection(roteiro.id); else { setSelectedRoteiroId(roteiro.id); roteiroListScroll.current = roteiroListRef.current?.scrollTop ?? 0; setOpenedRoteiroId(roteiro.id) } }} aria-pressed={deleteMode ? markedForDelete : selectedRoteiroId === roteiro.id} type="button">{roteiroCharacters.length ? <span className="roteiro-character-strip" style={{ backgroundColor: roteiroThumbnailColor(roteiro.id) }} aria-label={`Personagens de ${roteiro.title}`}>{roteiroCharacters.map((character) => <span className="roteiro-character-mini" key={character.id} title={character.name}><RenderedCharacterPortrait className="roteiro-character-mini-portrait" character={character} /></span>)}</span> : <span className="roteiro-thumbnail-placeholder" style={{ backgroundColor: roteiroThumbnailColor(roteiro.id) }}><Icon name="message" /></span>}<span className="roteiro-thumbnail-details"><span className="roteiro-thumbnail-info"><strong title={roteiro.title}>{roteiro.title}</strong><small>{roteiro.tiktoks.length} TikTok(s) · {roteiro.characterIds.length} personagem(ns)</small></span>{hasUnavailableVideo && <em className="roteiro-missing-video"><Icon name="warning" /> Vídeo indisponível</em>}</span></button>
        </article>
      })}{visibleRoteiros.length === 0 && <div className="roteiro-library-empty"><Icon name="message" /><strong>{roteiros.length ? 'Nenhum roteiro encontrado' : 'Crie seu primeiro roteiro'}</strong><span>{roteiros.length ? 'Tente outra busca.' : 'Adicione um roteiro para organizar abertura, TikToks e reações.'}</span>{!roteiros.length && <button type="button" onClick={() => setCreateOpen(true)}>Adicionar roteiro</button>}</div>}</div>}{!roteirosLoaded && !roteirosLoadError && <div className="roteiro-library-empty"><strong>Carregando seus roteiros…</strong><span>Os dados locais estão sendo lidos.</span></div>}</div>}
    </section>
    {createOpen && <div className="roteiro-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setCreateOpen(false) }}><section className="roteiro-create-modal" role="dialog" aria-modal="true" aria-labelledby="roteiro-create-title"><header><div><span>NOVO ROTEIRO</span><h2 id="roteiro-create-title">Criar roteiro</h2></div><button onClick={() => setCreateOpen(false)} aria-label="Fechar" type="button">×</button></header><label className="roteiro-modal-name">Nome do roteiro<input autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Digite o nome do roteiro" maxLength={100} /></label><div className="roteiro-modal-cast-heading"><strong>Seleção de elenco</strong><span>{newCharacterIds.length} selecionado(s)</span></div><div className="roteiro-modal-cast-list">{characters.length ? characters.map((character) => { const checked = newCharacterIds.includes(character.id); return <button className={checked ? 'selected' : ''} key={character.id} onClick={() => setNewCharacterIds((current) => checked ? current.filter((id) => id !== character.id) : [...current, character.id])} type="button"><CharacterPortrait character={character} /><span>{character.name}</span><i>{checked ? '✓' : '+'}</i></button> }) : <p>Não há personagens disponíveis no Customizador.</p>}</div><footer><button onClick={() => setCreateOpen(false)} type="button">Cancelar</button><button className="roteiro-create-confirm" onClick={createRoteiro} disabled={!newTitle.trim()} type="button"><Icon name="check" />Criar roteiro</button></footer></section></div>}
    {editingVideoId && <div className="roteiro-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setEditingVideoId(null) }}><section className="roteiro-video-title-modal" role="dialog" aria-modal="true" aria-labelledby="roteiro-video-title-heading"><header><strong id="roteiro-video-title-heading">Editar roteiro e elenco</strong><button onClick={() => setEditingVideoId(null)} aria-label="Fechar" type="button">×</button></header><label>Título do vídeo<input autoFocus value={editingVideoTitle} onChange={(event) => setEditingVideoTitle(event.target.value)} maxLength={100} /></label><div className="roteiro-modal-cast-heading"><strong>Elenco</strong><span>{editingCharacterIds.length} selecionado(s)</span></div><div className="roteiro-modal-cast-list">{characters.length ? characters.map((character) => { const checked = editingCharacterIds.includes(character.id); return <button className={checked ? 'selected' : ''} key={character.id} onClick={() => setEditingCharacterIds((current) => checked ? current.filter((id) => id !== character.id) : [...current, character.id])} type="button"><CharacterPortrait character={character} /><span>{character.name}</span><i>{checked ? '✓' : '+'}</i></button> }) : <p>Não há personagens disponíveis no Customizador.</p>}</div><footer><button onClick={() => setEditingVideoId(null)} type="button">Cancelar</button><button className="roteiro-create-confirm" onClick={saveVideoTitle} disabled={!editingVideoTitle.trim()} type="button"><Icon name="check" />Salvar</button></footer></section></div>}
    {deleteDialogOpen && <div className="roteiro-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) setDeleteDialogOpen(false) }}><section className="roteiro-delete-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="roteiro-delete-confirm-title"><span className="roteiro-delete-confirm-icon"><Icon name="trash" /></span><h2 id="roteiro-delete-confirm-title">Excluir {deleteSelection.length} roteiro(s)?</h2><p>O conteúdo desses roteiros será removido do armazenamento local. Os vídeos publicados na Base continuam preservados.</p><footer><button type="button" onClick={() => setDeleteDialogOpen(false)}>Cancelar</button><button type="button" className="danger" onClick={confirmDeleteRoteiros}>Excluir roteiro(s)</button></footer></section></div>}
  </div>
}

