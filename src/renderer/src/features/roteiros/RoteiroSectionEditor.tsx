/** Editor isolado de uma seção de roteiro, com seleção de vídeo e blocos de reação. */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../../ui/components/Icon'
import { RenderedCharacterPortrait } from '../../ui/components/RenderedCharacterPortrait'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { RoteiroReactionBlock, RoteiroSectionContent, RoteiroVideoReference } from '../../../../shared/roteiros'
import type { BaseVideoDetails } from '../../../../shared/baseVideos'
import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'

function roteiroVideoReference(item: VideoLibraryItem): RoteiroVideoReference {
  if (item.durationFrames === null) throw new Error('A duração do vídeo ainda não foi reconhecida.')
  return { id: item.id, name: item.name, mimeType: item.mimeType, extension: item.extension, size: item.size, durationFrames: item.durationFrames }
}

export function RoteiroSectionEditor({ title, content, characters, characterIds, previewDetailsCollapsed, onTogglePreviewDetails, onUpdate, onDeleteDraftVideo }: {
  title: string
  content: RoteiroSectionContent
  characters: CustomizerCharacter[]
  characterIds: string[]
  previewDetailsCollapsed: boolean
  onTogglePreviewDetails: () => void
  onUpdate: (content: RoteiroSectionContent) => void
  onDeleteDraftVideo: (videoId: string, content: RoteiroSectionContent) => Promise<boolean>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [libraryActionMessage, setLibraryActionMessage] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerItems, setPickerItems] = useState<Array<VideoLibraryItem & { durationFrames: number }>>([])
  const [pickerNumbers, setPickerNumbers] = useState<Record<string, number>>({})
  const [pickerDetails, setPickerDetails] = useState<Record<string, BaseVideoDetails>>({})
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerTimeline, setPickerTimeline] = useState('all')
  const [pickerSort, setPickerSort] = useState<'number' | 'name' | 'duration' | 'newest'>('number')
  const [pickerPreviewId, setPickerPreviewId] = useState<string | null>(null)
  const [blocksCollapsed, setBlocksCollapsed] = useState(false)
  const previewRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (!pickerOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (pickerPreviewId) setPickerPreviewId(null)
        else setPickerOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pickerOpen, pickerPreviewId])
  const addVideo = async () => {
    setBusy(true)
    setError(null)
    try {
      const imported = await window.desktop.mediaLibrary.import()
      if (!imported) return
      let ready = imported
      if (ready.durationFrames === null) {
        const media = document.createElement('video')
        media.preload = 'metadata'
        media.muted = true
        try {
          const seconds = await new Promise<number>((resolve, reject) => {
            const timer = window.setTimeout(() => { cleanup(); reject(new Error('Não foi possível reconhecer a duração do vídeo.')) }, 30000)
            const cleanup = () => { window.clearTimeout(timer); media.onloadedmetadata = null; media.onerror = null }
            media.onloadedmetadata = () => { cleanup(); resolve(media.duration) }
            media.onerror = () => { cleanup(); reject(new Error('Não foi possível abrir esse vídeo para a prévia.')) }
            media.src = `gacha-video://library/${ready.id}`
            media.load()
          })
          if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60 * 60 * 24) throw new Error('A duração do vídeo não é válida.')
          ready = await window.desktop.mediaLibrary.finishImport(ready.id, Math.max(1, Math.ceil(seconds * 60)))
        } finally { media.pause(); media.removeAttribute('src'); media.load() }
      }
      onUpdate({ ...content, video: roteiroVideoReference(ready) })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível adicionar o vídeo.')
    } finally { setBusy(false) }
  }
  const openVideoPicker = async () => {
    setPickerOpen(true)
    setPickerLoading(true)
    setPickerItems([])
    setPickerQuery(''); setPickerTimeline('all'); setPickerSort('number'); setPickerPreviewId(null)
    try {
      const [library, details] = await Promise.all([window.desktop.mediaLibrary.list(), window.desktop.baseVideos.listDetails()])
      const numberById = Object.fromEntries(details.flatMap((item: BaseVideoDetails) => item.videoNumber === undefined ? [] : [[item.videoId, item.videoNumber]])) as Record<string, number>
      setPickerDetails(Object.fromEntries(details.map((item) => [item.videoId, item])))
      setPickerNumbers(numberById)
      setPickerItems(library.filter((item): item is VideoLibraryItem & { durationFrames: number } => item.available && item.durationFrames !== null && numberById[item.id] !== undefined)
        .sort((a, b) => numberById[a.id] - numberById[b.id]))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os vídeos da Base.')
      setPickerOpen(false)
    } finally { setPickerLoading(false) }
  }
  const selectBaseVideo = (item: VideoLibraryItem) => {
    onUpdate({ ...content, video: roteiroVideoReference(item) })
    setPickerOpen(false)
    setLibraryActionMessage(`Vídeo ${String(pickerNumbers[item.id]).padStart(2, '0')} vinculado ao roteiro pelo ID.`)
  }
  const filteredPickerItems = useMemo(() => pickerItems.filter((item) => {
    const details = pickerDetails[item.id]
    const query = pickerQuery.trim().toLocaleLowerCase('pt-BR')
    const matchesQuery = !query || item.name.toLocaleLowerCase('pt-BR').includes(query)
      || item.id.toLocaleLowerCase().includes(query)
      || String(pickerNumbers[item.id] ?? '').includes(query)
      || (details?.description ?? '').toLocaleLowerCase('pt-BR').includes(query)
    return matchesQuery && (pickerTimeline === 'all' || details?.timeline === pickerTimeline)
  }).sort((a, b) => {
    if (pickerSort === 'name') return a.name.localeCompare(b.name, 'pt-BR')
    if (pickerSort === 'duration') return (a.durationFrames ?? 0) - (b.durationFrames ?? 0)
    if (pickerSort === 'newest') return b.createdAt.localeCompare(a.createdAt)
    return (pickerNumbers[a.id] ?? Number.MAX_SAFE_INTEGER) - (pickerNumbers[b.id] ?? Number.MAX_SAFE_INTEGER)
  }), [pickerItems, pickerDetails, pickerQuery, pickerTimeline, pickerSort, pickerNumbers])
  const removeVideo = async () => {
    if (!video) return
    setBusy(true)
    setError(null)
    setLibraryActionMessage(null)
    const nextContent = { ...content, video: null }
    try {
      const details = await window.desktop.baseVideos.listDetails()
      const existing = details.find((item) => item.videoId === video.id)
      if (existing?.videoNumber !== undefined) {
        onUpdate(nextContent)
        setLibraryActionMessage(`Referência do VÍDEO ${String(existing.videoNumber).padStart(2, '0')} removida deste roteiro. O vídeo continua na Base.`)
      } else {
        const deleted = await onDeleteDraftVideo(video.id, nextContent)
        setLibraryActionMessage(deleted
          ? 'Vídeo não publicado removido deste roteiro e dos Rascunhos.'
          : 'Referência removida. O vídeo foi mantido porque outro roteiro ainda o utiliza.')
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível remover o vídeo do roteiro.')
    } finally { setBusy(false) }
  }
  const updateBlock = (id: string, patch: Partial<RoteiroReactionBlock>) => onUpdate({ ...content, blocks: content.blocks.map((block) => block.id === id ? { ...block, ...patch } : block) })
  const moveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= content.blocks.length) return
    const blocks = [...content.blocks]
    ;[blocks[index], blocks[target]] = [blocks[target], blocks[index]]
    onUpdate({ ...content, blocks })
  }
  const addBlock = () => onUpdate({ ...content, blocks: [...content.blocks, {
    id: crypto.randomUUID(), characterId: characterIds[0] ?? '', kind: 'fala', expression: '', textPortuguese: '', textEnglish: ''
  }] })
  const video = content.video
  const captureReactionTime = (field: 'firstGroupReactionSeconds' | 'secondGroupReactionSeconds') => {
    const currentTime = previewRef.current?.currentTime
    if (typeof currentTime !== 'number' || !Number.isFinite(currentTime) || currentTime < 0) {
      setError('Adicione um vídeo e pause na posição desejada para registrar o tempo real.')
      return
    }
    setError(null)
    onUpdate({ ...content, [field]: Number(currentTime.toFixed(2)) })
  }
  const updateSeconds = (field: 'sceneEndSeconds' | 'firstGroupReactionSeconds' | 'secondGroupReactionSeconds', value: string) => {
    const seconds = value === '' ? undefined : Number(value)
    if (seconds !== undefined && (!Number.isFinite(seconds) || seconds < 0 || seconds > 86400)) return
    onUpdate({ ...content, [field]: seconds })
  }
  const saveVideoDestination = async (destination: 'base' | 'draft') => {
    if (!video) { setError('Adicione um vídeo antes de enviá-lo.'); return }
    setBusy(true)
    setError(null)
    setLibraryActionMessage(null)
    const details = {
      videoId: video.id,
      description: content.description ?? '',
      additionalContext: content.additionalContext ?? '',
      timeline: content.timeline ?? 'unspecified',
      sceneEndSeconds: content.sceneEndSeconds,
      firstGroupReactionSeconds: content.firstGroupReactionSeconds,
      secondGroupReactionSeconds: content.secondGroupReactionSeconds
    }
    try {
      await window.desktop.baseVideos.saveDetails(details)
      const saved = await window.desktop.baseVideos.listDetails()
      const existing = saved.find((item) => item.videoId === video.id)
      const hasFilledContent = Boolean(details.description.trim()
        || details.additionalContext.trim()
        || details.timeline !== 'unspecified'
        || details.sceneEndSeconds !== undefined
        || details.firstGroupReactionSeconds !== undefined
        || details.secondGroupReactionSeconds !== undefined
        || content.blocks.some((block) => block.expression.trim() || block.textPortuguese.trim() || block.textEnglish.trim()))
      if (destination === 'base' && !hasFilledContent) {
        setLibraryActionMessage(existing?.videoNumber === undefined
          ? 'Sem conteúdo preenchido: o vídeo ficou em Rascunhos.'
          : `Este vídeo já está na Base como VÍDEO ${String(existing.videoNumber).padStart(2, '0')}.`)
        return
      }
      if (destination === 'base') {
        const number = await window.desktop.baseVideos.publish(video.id)
        setLibraryActionMessage(`Enviado para a Base de vídeos como VÍDEO ${String(number).padStart(2, '0')}.`)
      } else {
        setLibraryActionMessage(existing?.videoNumber === undefined
          ? 'Vídeo salvo em Rascunhos.'
          : `Este vídeo já está na Base como VÍDEO ${String(existing.videoNumber).padStart(2, '0')}.`)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar a Base de vídeos.')
    } finally { setBusy(false) }
  }

  return <><main className="roteiro-workspace-editor" aria-label={'Área de edição: ' + title}>
    {error && <p className="roteiro-editor-error" role="alert">{error}</p>}
    <section className="roteiro-video-stage-wrap" aria-label="Preview 1920 por 1080">
      <div className="roteiro-video-preview-panel">
        <div className="roteiro-library-actions" aria-label="Destino do vídeo">
          <button type="button" onClick={() => void addVideo()} disabled={busy}>{busy ? 'Importando…' : 'Adicionar vídeo'}</button>
          <button type="button" className="danger" onClick={() => void removeVideo()} disabled={!video || busy}>Excluir vídeo</button>
          <button type="button" onClick={() => void openVideoPicker()} disabled={busy}>Selecionar da base de vídeos</button>
          <button type="button" className="primary" onClick={() => void saveVideoDestination('base')} disabled={busy || !video}>{busy ? 'Salvando…' : 'Enviar para base de vídeos'}</button>
          <button type="button" onClick={() => void saveVideoDestination('draft')} disabled={busy || !video}>Salvar como rascunho</button>
          {libraryActionMessage && <span role="status">{libraryActionMessage}</span>}
          <button className="roteiro-preview-toggle" type="button" aria-expanded={!previewDetailsCollapsed} onClick={onTogglePreviewDetails}>{previewDetailsCollapsed ? 'Mostrar' : 'Ocultar'}</button>
        </div>
        <div className="roteiro-video-stage">
          {video ? <video ref={previewRef} key={video.id} src={`gacha-video://library/${video.id}`} controls playsInline preload="metadata" aria-label={'Prévia de ' + video.name} /> : <div className="roteiro-video-placeholder"><Icon name="camera" /><strong>Preview 1920 × 1080</strong><span>Adicione um vídeo para visualizar esta seção.</span></div>}
        </div>
        {!previewDetailsCollapsed && <>
        <label className="roteiro-video-description"><span>Descrição do que acontece no vídeo</span><textarea value={content.description ?? ''} onChange={(event) => onUpdate({ ...content, description: event.target.value })} placeholder="Descreva o que acontece neste vídeo…" maxLength={20000} /></label>
        <div className="roteiro-scene-settings">
          <label className="roteiro-timeline-field"><span>Linha do tempo</span><select value={content.timeline ?? 'unspecified'} onChange={(event) => onUpdate({ ...content, timeline: event.target.value as RoteiroSectionContent['timeline'] })}><option value="unspecified">Indefinido</option><option value="past">Passado</option><option value="present">Presente</option><option value="future">Futuro</option></select></label>
          <label className="roteiro-scene-end-field"><span>Fim da cena da descrição</span><div className="roteiro-timing-input"><input aria-label="Fim da cena da descrição em segundos" type="number" min="0" max="86400" step="0.01" value={content.sceneEndSeconds ?? ''} onChange={(event) => updateSeconds('sceneEndSeconds', event.target.value)} placeholder="0" /><small>segundos</small></div></label>
          <section className="roteiro-group-reaction first"><header><strong>Primeira reação em grupo</strong><span>REAÇÃO 1</span></header><div className="roteiro-timing-input"><input aria-label="Primeira reação em grupo em segundos" type="number" min="0" max="86400" step="0.01" value={content.firstGroupReactionSeconds ?? ''} onChange={(event) => updateSeconds('firstGroupReactionSeconds', event.target.value)} placeholder="0" /><button type="button" onClick={() => captureReactionTime('firstGroupReactionSeconds')}>Tempo real</button><small>segundos</small></div></section>
          <section className="roteiro-group-reaction second"><header><strong>Segunda reação em grupo</strong><span>REAÇÃO 2</span></header><div className="roteiro-timing-input"><input aria-label="Segunda reação em grupo em segundos" type="number" min="0" max="86400" step="0.01" value={content.secondGroupReactionSeconds ?? ''} onChange={(event) => updateSeconds('secondGroupReactionSeconds', event.target.value)} placeholder="0" /><button type="button" onClick={() => captureReactionTime('secondGroupReactionSeconds')}>Tempo real</button><small>segundos</small></div></section>
        </div>
        {video && [content.sceneEndSeconds, content.firstGroupReactionSeconds, content.secondGroupReactionSeconds].some((seconds) => seconds !== undefined && seconds > video.durationFrames / 60) && <p className="roteiro-time-warning" role="status"><Icon name="warning" /> Um ou mais tempos ultrapassam a duração do vídeo ({(video.durationFrames / 60).toFixed(2)} s).</p>}
        <label className="roteiro-additional-context"><span>Contexto adicional para IA</span><textarea value={content.additionalContext ?? ''} onChange={(event) => onUpdate({ ...content, additionalContext: event.target.value })} placeholder="Adicione informações, regras ou detalhes que a IA deve considerar…" maxLength={20000} /></label>
        </>}
      </div>
    </section>
    <section className="roteiro-reaction-sequence" aria-label="Sequência de reações">
      <header><div><button className="roteiro-sequence-collapse" type="button" onClick={() => setBlocksCollapsed((collapsed) => !collapsed)} aria-label={blocksCollapsed ? 'Expandir sequência de reações' : 'Recolher sequência de reações'} aria-expanded={!blocksCollapsed}><Icon name="chevronDown" /></button><span>{content.blocks.length}</span><h2>Sequência de reações</h2></div><button className="roteiro-add-block" type="button" onClick={addBlock}><Icon name="plus" />Adicionar bloco</button></header>
      {!blocksCollapsed && <div className="roteiro-reaction-blocks">{content.blocks.map((block, index) => <article className={`roteiro-reaction-block tone-${index % 3}`} key={block.id}>
        <div className="roteiro-reaction-identity">{(() => { const character = characters.find((item) => item.id === block.characterId); return character ? <RenderedCharacterPortrait className="roteiro-reaction-avatar" character={character} /> : <span className="roteiro-reaction-avatar-empty"><Icon name="user" /></span> })()}<span className="roteiro-reaction-index">{String(index + 1).padStart(2, '0')}</span></div>
        <div className="roteiro-reaction-fields">
          <label>Personagem<select value={block.characterId} onChange={(event) => updateBlock(block.id, { characterId: event.target.value })}><option value="">Selecione personagem</option>{characters.filter((character) => characterIds.includes(character.id)).map((character) => <option value={character.id} key={character.id}>{character.name}</option>)}</select></label>
          <label>Tipo<select value={block.kind} onChange={(event) => updateBlock(block.id, { kind: event.target.value as RoteiroReactionBlock['kind'] })}><option value="fala">Fala</option><option value="pensamento">Pensamento</option></select></label>
          <label>Expressão ou emoção<input value={block.expression} onChange={(event) => updateBlock(block.id, { expression: event.target.value })} placeholder="Ex.: sério, desviando o olhar" maxLength={500} /></label>
          <label className="roteiro-reaction-text">{block.kind === 'pensamento' ? 'Pensamento em português' : 'Fala em português'}<textarea value={block.textPortuguese} onChange={(event) => updateBlock(block.id, { textPortuguese: event.target.value })} placeholder="Escreva o texto em português…" maxLength={10000} /></label>
          <label className="roteiro-reaction-text">Versão em inglês<textarea value={block.textEnglish} onChange={(event) => updateBlock(block.id, { textEnglish: event.target.value })} placeholder="A tradução aparecerá aqui…" maxLength={10000} /></label>
        </div>
        <div className="roteiro-reaction-actions">
          <button type="button" onClick={() => moveBlock(index, -1)} disabled={index === 0}>↑ Subir</button><button type="button" onClick={() => moveBlock(index, 1)} disabled={index === content.blocks.length - 1}>↓ Descer</button>
          <button type="button" disabled title="Ação de IA ainda não configurada">✦ Melhorar frase</button><button type="button" disabled title="Ação de IA ainda não configurada">✎ Refazer frase</button><button type="button" disabled title="Ação de tradução ainda não configurada">◎ Traduzir</button>
          <button type="button" onClick={() => onUpdate({ ...content, blocks: [...content.blocks.slice(0, index + 1), { ...block, id: crypto.randomUUID() }, ...content.blocks.slice(index + 1)] })}>⊞ Duplicar</button>
          <button type="button" className="danger" onClick={() => onUpdate({ ...content, blocks: content.blocks.filter((item) => item.id !== block.id) })}>Excluir</button>
        </div>
      </article>)}</div>}
    </section>
  </main>{pickerOpen && <div className="roteiro-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPickerOpen(false) }}>
    <section className="roteiro-video-picker-modal" role="dialog" aria-modal="true" aria-labelledby="roteiro-video-picker-title">
      <header><div><span>BASE DE VÍDEOS</span><h2 id="roteiro-video-picker-title">Selecionar vídeo</h2><p>Escolha um vídeo publicado para vincular a esta seção.</p></div><button type="button" aria-label="Fechar" onClick={() => setPickerOpen(false)}>×</button></header>
      {pickerPreviewId ? (() => {
        const item = pickerItems.find((candidate) => candidate.id === pickerPreviewId)
        if (!item) return null
        return <div className="roteiro-picker-focused"><button type="button" className="roteiro-picker-back" onClick={() => setPickerPreviewId(null)}>← Voltar à galeria</button><div className="roteiro-picker-large-preview"><video key={item.id} src={`gacha-video://library/${item.id}`} controls autoPlay playsInline preload="metadata" /></div><div className="roteiro-picker-focus-info"><span className="roteiro-video-picker-number">VÍDEO {String(pickerNumbers[item.id]).padStart(2, '0')}</span><div><strong>{item.name}</strong><small>{(item.durationFrames / 60).toFixed(2)} s · {(item.size / 1024 ** 2).toFixed(1)} MB · ID {item.id.slice(0, 8).toUpperCase()}</small></div><button className="primary" type="button" onClick={() => selectBaseVideo(item)}>{content.video?.id === item.id ? 'Manter este vídeo' : 'Usar este vídeo'}</button></div></div>
      })() : <>
        <div className="roteiro-video-picker-filters"><label className="roteiro-picker-search"><Icon name="search" /><input autoFocus value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} placeholder="Buscar por nome, número, ID ou descrição" /></label><label><span>Linha do tempo</span><select value={pickerTimeline} onChange={(event) => setPickerTimeline(event.target.value)}><option value="all">Todas</option><option value="past">Passado</option><option value="present">Presente</option><option value="future">Futuro</option><option value="unspecified">Indefinido</option></select></label><label><span>Ordenar</span><select value={pickerSort} onChange={(event) => setPickerSort(event.target.value as typeof pickerSort)}><option value="number">Número</option><option value="name">Nome</option><option value="duration">Duração</option><option value="newest">Mais recente</option></select></label><span className="roteiro-picker-result-count">{filteredPickerItems.length} vídeo(s)</span></div>
        <div className="roteiro-video-picker-list">{pickerLoading ? <div className="roteiro-picker-skeleton-grid" aria-label="Carregando vídeos">{Array.from({ length: 6 }, (_, index) => <div className="roteiro-picker-skeleton" key={index}><i /><span /><span /></div>)}</div> : filteredPickerItems.length ? filteredPickerItems.map((item) => <article className={`roteiro-video-picker-card${content.video?.id === item.id ? ' linked' : ''}`} key={item.id} onDoubleClick={() => selectBaseVideo(item)}>
          <button className="roteiro-picker-thumb" type="button" onClick={() => setPickerPreviewId(item.id)} aria-label={`Abrir prévia de ${item.name}`}><video src={`gacha-video://library/${item.id}`} muted playsInline preload="metadata" tabIndex={-1} /><span className="roteiro-picker-play">▶</span><small>{(item.durationFrames / 60).toFixed(2)} s</small></button>
          <div className="roteiro-picker-card-info"><div><span className="roteiro-video-picker-number">VÍDEO {String(pickerNumbers[item.id]).padStart(2, '0')}</span><strong title={item.name}>{item.name}</strong>{content.video?.id === item.id && <span className="roteiro-picker-linked-badge">Vinculado</span>}</div><small>{(item.size / 1024 ** 2).toFixed(1)} MB · ID {item.id.slice(0, 8).toUpperCase()}</small><div className="roteiro-picker-card-actions"><button type="button" onClick={() => setPickerPreviewId(item.id)}>▶ Prévia</button><button className="primary" type="button" onClick={() => selectBaseVideo(item)}>{content.video?.id === item.id ? 'Selecionado' : 'Selecionar'}</button></div></div>
        </article>) : <div className="roteiro-picker-empty"><Icon name="frame" /><strong>{pickerItems.length ? 'Nenhum resultado para esse filtro' : 'A Base de vídeos está vazia'}</strong><span>{pickerItems.length ? 'Tente outro nome ou ajuste os filtros.' : 'Os rascunhos não aparecem aqui. Publique um vídeo na Base para selecioná-lo.'}</span></div>}</div>
      </>}
      <footer><button type="button" onClick={() => setPickerOpen(false)}>Fechar</button></footer>
    </section>
  </div>}</>
}

