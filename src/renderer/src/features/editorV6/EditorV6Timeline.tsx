import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { EditorV6Document, EditorV6Element, EditorV6Timeline as Timeline, EditorV6TimelineBlock as Block, EditorV6TimelineTrack as Track } from '../../../../shared/editorV6'
import { editorV6MotionPlan } from '../../../../shared/editorV6Motion'
import { EDITOR_V6_DEFAULT_BLOCK_FRAMES, videoCharacterTrackColor } from '../../../../shared/editorV6'
import { duplicateEditorV6Block, editorV6ClipAtFrame, frameTimecode, MAX_TIMELINE_FRAME, normalizeEditorV6Timeline, pruneEditorV6TimelineSnapshots, setEditorV6BlockTiming, snapEditorV6Frame, splitEditorV6Block, timelineClips } from '../../../../shared/editorV6Timeline'
import { useEditorV6PlaybackFrame } from './editorV6PlaybackClock'

type Props = {
  document: EditorV6Document
  playing: boolean
  selectedId: string | null
  onSeek: (frame: number) => void
  onPlay: () => void
  onSelect: (block: Block) => void
  onChange: (update: (document: EditorV6Document) => EditorV6Document) => void
}
type Drag = { track: Track; block: Block; pointerId: number; x: number; mode: 'move' | 'resize'; initial: Timeline }
type TrackAction = 'motion' | 'add' | 'hidden' | 'locked' | 'collapsed' | 'up' | 'down' | 'rename'
const LABELS = { character: 'Personagem', speech: 'Fala', thought: 'Pensamento', video: 'Vídeo', audio: 'Áudio' }
const editableTarget = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest('input,textarea,select,[contenteditable=true],[role=dialog]'))

function FrameInput({ label, value, onCommit, disabled = false }: { label: string; value: number; onCommit: (value: number) => void; disabled?: boolean }) {
  const [text, setText] = useState(String(Number((value / 30).toFixed(4))))
  useEffect(() => setText(String(Number((value / 30).toFixed(4)))), [value])
  return <label>{label}<input type="number" min="0" max={MAX_TIMELINE_FRAME / 30} step={1 / 30} value={text} disabled={disabled} title={frameTimecode(value)} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} onBlur={() => {
    const number = Number(text)
    if (text.trim() && Number.isFinite(number) && number >= 0) onCommit(Math.min(MAX_TIMELINE_FRAME, Math.round(number * 30)))
    else setText(String(value / 30))
  }} /></label>
}

type RowsProps = {
  timeline: Timeline; pps: number; width: number; heading: number; range: [number, number]; selectedId: string | null
  onPointer: (event: ReactPointerEvent<HTMLElement>, track: Track, block: Block, mode: 'move' | 'resize') => void
  onSelect: (block: Block) => void; onMenu: (x: number, y: number, track: Track, block: Block) => void
  onTrack: (track: Track, action: TrackAction, name?: string) => void
  onScrub: (event: ReactPointerEvent<HTMLElement>) => void
}
/** Playback only moves the cursor overlay; these rows rerender on editing or scrolling. */
const TimelineRows = memo(function TimelineRows({ timeline, pps, width, heading, range, selectedId, onPointer, onSelect, onMenu, onTrack, onScrub }: RowsProps) {
  const sortedTracks = useMemo(() => new Map(timeline.tracks.map((track) => [track.id, [...track.blocks].sort((a, b) => a.startFrame - b.startFrame)])), [timeline])
  const transitions = useMemo(() => new Map(timeline.tracks.map((track) => { const blocks = sortedTracks.get(track.id)!; return [track.id, blocks.slice(1).flatMap((next, i) => { const plan = editorV6MotionPlan(track, blocks[i], next); return plan ? [plan] : [] })] })), [timeline, sortedTracks])
  const [renameId, setRenameId] = useState<string | null>(null)
  return <>{timeline.tracks.map((track, index) => <div className={`editor-v6-timeline-track${track.hidden || track.muted ? ' muted' : ''}${track.collapsed ? ' collapsed' : ''}`} key={track.id} style={{ gridTemplateColumns: `${heading}px ${width}px` }}>
    <div className="editor-v6-timeline-track-heading">
      <button type="button" className="v6-track-collapse" onClick={() => onTrack(track, 'collapsed')} title={track.collapsed ? 'Expandir faixa' : 'Recolher faixa'}>{track.collapsed ? '▸' : '▾'}</button>
      {renameId === track.id ? <input className="v6-track-name" autoFocus defaultValue={track.name} maxLength={80} onBlur={(event) => { const name = event.currentTarget.value.trim(); if (name && name !== track.name) onTrack(track, 'rename', name); setRenameId(null) }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenameId(null) }} /> : <strong title={`${track.name} · ${LABELS[track.kind]} · Duplo clique para renomear`} onDoubleClick={() => setRenameId(track.id)}>{track.name}</strong>}
      <div className="editor-v6-track-actions">
        {track.kind === 'character' && <button type="button" aria-pressed={track.motionEnabled !== false} disabled={track.locked} onClick={() => onTrack(track, 'motion')} title="Animar trocas de pose e expressão nesta faixa (250 ms)">{track.motionEnabled === false ? '◇' : '◆'}</button>}<button type="button" onClick={() => onTrack(track, 'add')} disabled={track.locked} title="Adicionar bloco no cursor">＋</button>
        <button type="button" onClick={() => onTrack(track, 'hidden')} title={track.hidden || track.muted ? 'Mostrar faixa' : 'Ocultar faixa'}>{track.hidden || track.muted ? '◌' : '◉'}</button>
        <button type="button" onClick={() => onTrack(track, 'locked')} title={track.locked ? 'Desbloquear faixa' : 'Bloquear faixa'}>{track.locked ? '▣' : '▢'}</button>
        <button type="button" onClick={() => onTrack(track, 'up')} disabled={index === 0 || track.locked} title="Mover faixa para cima">↑</button>
        <button type="button" onClick={() => onTrack(track, 'down')} disabled={index === timeline.tracks.length - 1 || track.locked} title="Mover faixa para baixo">↓</button>
      </div>
    </div>
    <div className="editor-v6-timeline-lane" style={{ width, backgroundSize: `${pps}px 100%` }} onPointerDown={onScrub}>
      {transitions.get(track.id)!.filter((plan) => plan.startFrame <= range[1] && plan.endFrame >= range[0]).map((plan) => <i key={`motion-${plan.blockId}`} className="v6-motion-range" style={{ left: plan.startFrame / 30 * pps, width: (plan.endFrame - plan.startFrame) / 30 * pps }} />)}
      {track.blocks.filter((block) => block.startFrame <= range[1] && block.startFrame + block.durationFrames >= range[0]).map((block) => <div key={block.id}
        className={`editor-v6-timeline-block kind-${track.kind}${selectedId === block.id ? ' selected' : ''}${track.locked ? ' locked' : ''}`}
        style={{ left: block.startFrame / 30 * pps, width: Math.max(3, block.durationFrames / 30 * pps), ...(track.characterId ? { borderColor: videoCharacterTrackColor(track.characterId) } : {}) }}
        tabIndex={0} role="button" aria-label={`${block.label}, ${frameTimecode(block.startFrame)}, duração ${frameTimecode(block.durationFrames)}`}
        title={`${block.label}\nInício ${frameTimecode(block.startFrame)} · Fim ${frameTimecode(block.startFrame + block.durationFrames)} · Duração ${frameTimecode(block.durationFrames)}`}
        onPointerDown={(event) => { if (event.button === 0) onPointer(event, track, block, 'move'); else event.stopPropagation() }}
        onClick={(event) => { event.stopPropagation(); onSelect(block) }} onKeyDown={(event) => { if (event.key === 'Enter') onSelect(block) }}
        onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onMenu(event.clientX, event.clientY, track, block) }}>
        <span>{block.state?.visible === false ? '◌ ' : ''}{block.parentBlockId ? '↳ ' : ''}{block.label}</span>
        {!track.collapsed && <small>{frameTimecode(block.durationFrames)}</small>}
        <i className="editor-v6-timeline-resize" onPointerDown={(event) => onPointer(event, track, block, 'resize')} aria-label="Alterar duração" />
      </div>)}
    </div>
  </div>)}</>
})

export function EditorV6Timeline(props: Props) {
  const playbackFrame = useEditorV6PlaybackFrame()
  const latest = useRef<Props & { frame: number }>({ ...props, frame: playbackFrame })
  latest.current = { ...props, frame: playbackFrame }
  const [pps, setPps] = useState(72)
  const [snap, setSnap] = useState(true)
  const [compact, setCompact] = useState(false)
  const [viewport, setViewport] = useState({ left: 0, width: 800 })
  const [draft, setDraft] = useState<Timeline | null>(null)
  const [guide, setGuide] = useState<number | undefined>()
  const [readout, setReadout] = useState<Block | null>(null)
  const [inspector, setInspector] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; track: Track; block: Block } | null>(null)
  const [notice, setNotice] = useState('')
  const scroll = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLElement>(null)
  const drag = useRef<Drag | null>(null)
  const scrub = useRef<number | null>(null)
  const draftRef = useRef<Timeline | null>(null)
  const didDrag = useRef(false)
  const previousZoom = useRef(72)
  const fitActive = useRef(false)
  const settings = useRef({ pps, snap, heading: compact ? 116 : 210 })
  settings.current = { pps, snap, heading: compact ? 116 : 210 }
  const heading = settings.current.heading
  const timeline = draft ?? props.document.timeline
  const width = Math.max(viewport.width - heading, timeline.durationFrames / 30 * pps)
  const selected = useMemo(() => timelineClips(timeline).find(({ block }) => block.id === props.selectedId), [timeline, props.selectedId])
  const selectedMedia = selected?.block.mediaId ? props.document.media?.find((media) => media.id === selected.block.mediaId) : undefined
  const range = useMemo<[number, number]>(() => [Math.max(0, (viewport.left - heading - 160) / pps * 30), (viewport.left + viewport.width + 160) / pps * 30], [viewport, heading, pps])

  const changeTimeline = useCallback((update: (timeline: Timeline) => Timeline) => {
    latest.current.onChange((document) => pruneEditorV6TimelineSnapshots({ ...document, timeline: normalizeEditorV6Timeline(update(document.timeline)), updatedAt: new Date().toISOString() }))
  }, [])
  const select = useCallback((block: Block) => {
    if (didDrag.current) { didDrag.current = false; return }
    latest.current.onSeek(block.startFrame)
    latest.current.onSelect(block)
    setInspector(true)
  }, [])
  const commitBlock = (values: Partial<Block>) => {
    if (!selected || selected.track.locked) return
    changeTimeline((current) => ({ ...current, tracks: current.tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => block.id === selected.block.id ? { ...block, ...values } : block) })) }))
  }
  const remove = useCallback((id: string) => {
    const found = timelineClips(latest.current.document.timeline).find(({ block }) => block.id === id)
    if (!found || found.track.locked) return
    changeTimeline((current) => ({ ...current, tracks: current.tracks.map((track) => ({ ...track, blocks: track.blocks.filter((block) => block.id !== id && block.parentBlockId !== id) })) }))
    setMenu(null)
  }, [changeTimeline])
  const split = useCallback((id: string) => { changeTimeline((current) => splitEditorV6Block(current, id, latest.current.frame)); setMenu(null) }, [changeTimeline])
  const duplicate = useCallback((id: string) => { changeTimeline((current) => duplicateEditorV6Block(current, id)); setMenu(null) }, [changeTimeline])
  const zoomTo = useCallback((next: number) => {
    const node = scroll.current
    const old = settings.current.pps
    const center = node ? (node.scrollLeft + Math.max(0, node.clientWidth - settings.current.heading) / 2) / old : 0
    const value = Math.min(960, Math.max(.25, next))
    setPps(value)
    requestAnimationFrame(() => { if (node) node.scrollLeft = Math.max(0, center * value - (node.clientWidth - settings.current.heading) / 2) })
  }, [])
  const fit = useCallback(() => {
    if (fitActive.current) { zoomTo(previousZoom.current); fitActive.current = false; return }
    previousZoom.current = settings.current.pps
    fitActive.current = true
    zoomTo(Math.max(1, (scroll.current?.clientWidth ?? 800) - settings.current.heading - 12) / (latest.current.document.timeline.durationFrames / 30))
    requestAnimationFrame(() => { if (scroll.current) scroll.current.scrollLeft = 0 })
  }, [zoomTo])

  const onTrack = useCallback((track: Track, action: TrackAction, name?: string) => {
    if (action !== 'hidden' && action !== 'locked' && action !== 'collapsed' && track.locked) return
    if (action === 'add') {
      const { document, frame } = latest.current
      latest.current.onSeek(frame)
      if (track.kind === 'audio') { setNotice('Use Importar áudio para copiar uma mídia para o projeto e criar um bloco.'); return }
      if (track.kind === 'character' && track.blocks.some((block) => block.startFrame === frame)) { select(track.blocks.find((block) => block.startFrame === frame)!); return }
      const base = track.kind === 'character' ? document.elements.find((element) => element.characterId === track.characterId && element.kind === 'character') : track.kind === 'video' ? document.elements.find((element) => element.kind === 'image' || element.kind === 'narrator') : undefined
      if (track.kind === 'video' && !base) { setNotice('Adicione uma imagem em Objetos para criar um bloco visual.'); return }
      const element: EditorV6Element = base ? { ...(editorV6ClipAtFrame(document.timeline, base.id, frame)?.block.state ?? base) } : {
        id: crypto.randomUUID(), kind: track.kind === 'thought' ? 'thought' : 'speech', text: 'Digite aqui', x: 0, y: 0, width: 28, height: 16, rotation: 0, zIndex: Math.max(0, ...document.elements.map((item) => item.zIndex)) + 1
      }
      const block: Block = { id: crypto.randomUUID(), elementId: element.id, state: { ...element }, label: element.text || track.name, startFrame: frame, durationFrames: EDITOR_V6_DEFAULT_BLOCK_FRAMES }
      latest.current.onChange((current) => ({ ...current, elements: base ? current.elements : [...current.elements, element], timeline: normalizeEditorV6Timeline({ ...current.timeline, durationFrames: Math.max(current.timeline.durationFrames, frame + block.durationFrames), knownElementIds: [...new Set([...(current.timeline.knownElementIds ?? []), element.id])], tracks: current.timeline.tracks.map((candidate) => candidate.id === track.id ? { ...candidate, blocks: [...candidate.blocks, block] } : candidate) }) }))
      latest.current.onSelect(block)
      setInspector(true)
      return
    }
    changeTimeline((current) => {
      const tracks = current.tracks.map((candidate) => candidate.id !== track.id ? candidate : action === 'rename' ? { ...candidate, name: name ?? candidate.name } : action === 'hidden' ? { ...candidate, hidden: !(candidate.hidden || candidate.muted), muted: false } : action === 'motion' ? { ...candidate, motionEnabled: candidate.motionEnabled === false } : action === 'locked' || action === 'collapsed' ? { ...candidate, [action]: !candidate[action] } : candidate)
      const index = tracks.findIndex((candidate) => candidate.id === track.id)
      const next = action === 'up' ? index - 1 : action === 'down' ? index + 1 : index
      if (next >= 0 && next < tracks.length && next !== index) [tracks[index], tracks[next]] = [tracks[next], tracks[index]]
      return { ...current, tracks }
    })
  }, [changeTimeline, select])

  const onPointer = useCallback<RowsProps['onPointer']>((event, track, block, mode) => {
    event.stopPropagation()
    if (event.button !== 0 || track.locked) return
    latest.current.onSeek(block.startFrame)
    latest.current.onSelect(block)
    setMenu(null)
    didDrag.current = false
    drag.current = { track, block, pointerId: event.pointerId, x: event.clientX, mode, initial: latest.current.document.timeline }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])
  const onScrub = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.type === 'pointerdown' && event.button !== 0) return
    scrub.current = event.pointerId
    if (event.type === 'pointerdown') event.currentTarget.setPointerCapture(event.pointerId)
    const node = scroll.current
    if (!node) return
    latest.current.onSeek(Math.min(latest.current.document.timeline.durationFrames, Math.max(0, Math.round((event.clientX - node.getBoundingClientRect().left + node.scrollLeft - settings.current.heading) / settings.current.pps * 30))))
  }, [])
  const cancel = useCallback(() => { drag.current = null; scrub.current = null; draftRef.current = null; setDraft(null); setGuide(undefined); setReadout(null) }, [])
  const movePointer = (event: ReactPointerEvent<HTMLElement>) => {
    if (scrub.current === event.pointerId) { onScrub(event); return }
    const operation = drag.current
    if (!operation || operation.pointerId !== event.pointerId) return
    const delta = Math.round((event.clientX - operation.x) / pps * 30)
    if (!delta && !didDrag.current) return
    didDrag.current = true
    const { block, track, mode, initial } = operation
    let value = mode === 'move' ? block.startFrame + delta : block.startFrame + block.durationFrames + delta
    const snapped = snap && !event.altKey ? snapEditorV6Frame(initial, value, latest.current.frame, block.id, 7 / pps * 30, mode === 'move' ? block.durationFrames : 0) : { frame: Math.round(value), guide: undefined }
    value = Math.max(mode === 'resize' ? block.startFrame + 1 : 0, Math.min(MAX_TIMELINE_FRAME - (mode === 'move' ? block.durationFrames : 0), snapped.frame))
    let startFrame = mode === 'move' ? value : block.startFrame
    let durationFrames = mode === 'resize' ? value - block.startFrame : block.durationFrames
    const media = block.mediaId ? latest.current.document.media?.find((item) => item.id === block.mediaId) : undefined
    if (mode === 'resize' && media) durationFrames = Math.min(durationFrames, media.sourceFrames - (block.mediaInFrame ?? 0))
    const persistent = track.kind === 'character' || Boolean(block.background)
    const sorted = track.blocks.filter((clip) => !block.background || clip.background).sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id))
    const index = sorted.findIndex((candidate) => candidate.id === block.id)
    const next = sorted[index + 1], previous = sorted[index - 1]
    if (persistent) {
      if (mode === 'move') startFrame = Math.max(previous ? previous.startFrame + 1 : 0, Math.min(next ? next.startFrame - 1 : MAX_TIMELINE_FRAME - 1, startFrame))
      else durationFrames = Math.max(1, Math.min(next && sorted[index + 2] ? sorted[index + 2].startFrame - block.startFrame - 1 : MAX_TIMELINE_FRAME - block.startFrame, durationFrames))
    }
    const parent = block.parentBlockId ? timelineClips(initial).find((clip) => clip.block.id === block.parentBlockId)?.block : undefined
    if (parent) { startFrame = Math.max(parent.startFrame, Math.min(parent.startFrame + parent.durationFrames - 1, startFrame)); durationFrames = Math.max(1, Math.min(durationFrames, parent.startFrame + parent.durationFrames - startFrame)) }
    const updated = { ...block, startFrame, durationFrames, ...(parent ? { relativeStartFrame: startFrame - parent.startFrame } : {}) }
    const timeline = normalizeEditorV6Timeline({ ...initial, durationFrames: persistent && mode === 'resize' && !next ? startFrame + durationFrames : Math.max(initial.durationFrames, startFrame + durationFrames), tracks: initial.tracks.map((candidate) => candidate.id === track.id ? { ...candidate, blocks: candidate.blocks.map((clip) => clip.id === block.id ? updated : persistent && mode === 'resize' && clip.id === next?.id ? { ...clip, startFrame: block.startFrame + durationFrames } : clip) } : candidate) })
    draftRef.current = timeline
    setDraft(timeline)
    setGuide(snapped.guide)
    setReadout(timeline.tracks.find((candidate) => candidate.id === track.id)?.blocks.find((clip) => clip.id === block.id) ?? updated)
  }
  const endPointer = (event: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId === event.pointerId && draftRef.current) { const value = draftRef.current; changeTimeline(() => value) }
    cancel()
  }
  const onMenu = useCallback<RowsProps['onMenu']>((x, y, track, block) => { if (latest.current.selectedId !== block.id) select(block); setMenu({ x: Math.min(x, window.innerWidth - 195), y: Math.max(8, Math.min(y, window.innerHeight - 225)), track, block }) }, [select])

  useEffect(() => {
    const node = scroll.current
    if (!node) return
    const observer = new ResizeObserver(() => setViewport({ left: node.scrollLeft, width: node.clientWidth }))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!props.playing || !scroll.current) return
    const node = scroll.current, x = heading + playbackFrame / 30 * pps
    if (x > node.scrollLeft + node.clientWidth * .8 || x < node.scrollLeft + heading) node.scrollLeft = Math.max(0, x - node.clientWidth * .5)
  }, [playbackFrame, props.playing, heading, pps])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (editableTarget(event.target) || event.defaultPrevented) return
      const key = event.key.toLowerCase(), current = latest.current
      if (key === 'escape') { cancel(); setMenu(null); return }
      if (event.ctrlKey || event.metaKey) {
        if (key === 'k' && current.selectedId) { event.preventDefault(); split(current.selectedId) }
        else if (key === 'd' && current.selectedId) { event.preventDefault(); duplicate(current.selectedId) }
        return
      }
      if (key === 's') { event.preventDefault(); setSnap((value) => !value) }
      else if (key === '+' || key === '=') { event.preventDefault(); fitActive.current = false; zoomTo(settings.current.pps * 1.25) }
      else if (key === '-') { event.preventDefault(); fitActive.current = false; zoomTo(settings.current.pps / 1.25) }
      else if (key === 'z' && event.shiftKey) { event.preventDefault(); fit() }
      else if (key === 'arrowleft' || key === 'arrowright') { event.preventDefault(); current.onSeek(Math.max(0, Math.min(current.document.timeline.durationFrames, current.frame + (key === 'arrowright' ? 1 : -1) * (event.shiftKey ? 5 : 1)))) }
      else if (key === 'home' || key === 'end') { event.preventDefault(); current.onSeek(key === 'home' ? 0 : current.document.timeline.durationFrames) }
      else if (key === ' ') { event.preventDefault(); current.onPlay() }
      else if ((key === 'delete' || key === 'backspace') && current.selectedId) { event.preventDefault(); remove(current.selectedId) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel, duplicate, fit, remove, split, zoomTo])
  useEffect(() => {
    if (!menu) return
    const close = (event: PointerEvent) => { if (!(event.target instanceof HTMLElement) || !event.target.closest('.v6-timeline-menu')) setMenu(null) }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])

  const tickSeconds = pps >= 120 ? .5 : pps >= 35 ? 1 : pps >= 8 ? 5 : pps >= 2 ? 30 : 120
  const ticks = []
  for (let second = Math.max(0, Math.floor(range[0] / 30 / tickSeconds) * tickSeconds); second <= Math.min(timeline.durationFrames / 30, range[1] / 30); second += tickSeconds) ticks.push(second)
  const characters = props.document.elements.filter((element) => element.kind === 'character')
  const parentOptions = timelineClips(timeline).filter(({ track, block }) => track.kind === 'video' && block.id !== selected?.block.id)
  const patchState = (values: Partial<EditorV6Element>) => {
    if (!selected) return
    const base = selected.block.state ?? props.document.elements.find((element) => element.id === selected.block.elementId)
    if (!base) return
    commitBlock({ state: { ...base, ...values }, ...(values.text !== undefined ? { label: values.text.trim().slice(0, 120) || LABELS[selected.track.kind] } : {}) })
  }
  return <section ref={root} className={`editor-v6-timeline v6-timeline-pro${inspector && selected ? ' with-inspector' : ''}`} aria-label="Timeline do Editor V6" onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={cancel}>
    <header className="editor-v6-timeline-toolbar">
      <div className="editor-v6-timeline-title"><strong>Timeline</strong><span>{frameTimecode(playbackFrame)} / {frameTimecode(timeline.durationFrames)}</span><small>30 FPS</small></div>
      <div className="editor-v6-timeline-actions">
        <button type="button" onClick={props.onPlay} title="Reproduzir / Pausar (Espaço)" aria-label={props.playing ? 'Pausar' : 'Reproduzir'}>{props.playing ? 'Ⅱ' : '▶'}</button>
        <button type="button" className={snap ? 'active' : ''} aria-pressed={snap} onClick={() => setSnap(!snap)} title="Magnetismo (S). Alt ignora temporariamente.">Snap</button>
        <button type="button" onClick={() => { fitActive.current = false; zoomTo(pps / 1.25) }} title="Diminuir zoom (-)">−</button><button type="button" onClick={() => { fitActive.current = false; zoomTo(pps * 1.25) }} title="Aumentar zoom (+)">＋</button>
        <button type="button" onClick={fit} title="Encaixar timeline / restaurar zoom (Shift+Z)">Fit</button>
        <button type="button" onClick={() => setCompact(!compact)} title="Compactar nomes das faixas">{compact ? '↔' : '⇤'}</button>
        <button type="button" disabled={!selected || selected.track.locked || playbackFrame <= selected.block.startFrame || playbackFrame >= selected.block.startFrame + selected.block.durationFrames} onClick={() => selected && split(selected.block.id)} title="Dividir bloco no cursor (Ctrl+K)">✂ Dividir</button>
      </div>
    </header>
    <div className="editor-v6-timeline-scroll" ref={scroll} onScroll={(event) => setViewport({ left: event.currentTarget.scrollLeft, width: event.currentTarget.clientWidth })}>
      <div className="editor-v6-timeline-content" style={{ width: heading + width }}>
        <div className="editor-v6-timeline-ruler-row" style={{ gridTemplateColumns: `${heading}px ${width}px` }}>
          <div className="editor-v6-timeline-track-heading">FAIXAS <span>{timeline.tracks.length}</span></div>
          <div className="editor-v6-timeline-ruler" style={{ width, backgroundSize: `${pps}px 100%` }} onPointerDown={onScrub}>{ticks.map((second) => <span key={second} style={{ left: second * pps }}>{second}s</span>)}</div>
        </div>
        <TimelineRows timeline={timeline} pps={pps} width={width} heading={heading} range={range} selectedId={props.selectedId} onPointer={onPointer} onSelect={select} onMenu={onMenu} onTrack={onTrack} onScrub={onScrub} />
        <div className="v6-cursor-overlay" style={{ left: heading, width, clipPath: `inset(0 0 0 ${viewport.left}px)` }}><i className="v6-main-playhead" style={{ transform: `translateX(${playbackFrame / 30 * pps}px)` }} />{guide !== undefined && <i className="v6-snap-guide" style={{ left: guide / 30 * pps }} />}</div>
      </div>
    </div>
    {readout && <div className="v6-drag-readout" role="status">Início {frameTimecode(readout.startFrame)} · Fim {frameTimecode(readout.startFrame + readout.durationFrames)} · Duração {frameTimecode(readout.durationFrames)} <kbd>Esc cancela</kbd></div>}
    {notice && <button type="button" className="v6-timeline-notice" onClick={() => setNotice('')}>{notice} ×</button>}
    {inspector && selected && <div className="v6-clip-inspector" aria-label="Inspector do bloco">
      <strong title={selected.block.label}>{selected.track.name}</strong>
      <FrameInput label="Início (s)" value={selected.block.startFrame} disabled={selected.track.locked} onCommit={(value) => changeTimeline((current) => setEditorV6BlockTiming(current, selected.block.id, { startFrame: value }))} />
      <FrameInput label="Duração (s)" value={selected.block.durationFrames} disabled={selected.track.locked} onCommit={(value) => {
        if (value < 1) return
        const bounded = selectedMedia ? Math.min(value, selectedMedia.sourceFrames - (selected.block.mediaInFrame ?? 0)) : value
        changeTimeline((current) => setEditorV6BlockTiming(current, selected.block.id, { durationFrames: bounded }))
      }} />
      {selectedMedia && <FrameInput label="Início da mídia (s)" value={selected.block.mediaInFrame ?? 0} disabled={selected.track.locked} onCommit={(value) => {
        const mediaInFrame = Math.max(0, Math.min(selectedMedia.sourceFrames - 1, value))
        commitBlock({ mediaInFrame, durationFrames: Math.min(selected.block.durationFrames, selectedMedia.sourceFrames - mediaInFrame) })
      }} />}
      {(selected.track.kind === 'speech' || selected.track.kind === 'thought') && <><label>Personagem<select value={selected.block.characterId ?? ''} disabled={selected.track.locked} onChange={(event) => commitBlock({ characterId: event.target.value || undefined })}><option value="">Sem personagem</option>{characters.map((element) => <option value={element.characterId} key={element.id}>{element.text}</option>)}</select></label><label className="v6-clip-text">Texto<input value={selected.block.state?.text ?? selected.block.label} maxLength={5000} disabled={selected.track.locked} onChange={(event) => patchState({ text: event.target.value })} /></label><label>Vincular a visual<select value={selected.block.parentBlockId ?? ''} disabled={selected.track.locked} onChange={(event) => { const parent = parentOptions.find(({ block }) => block.id === event.target.value)?.block; commitBlock({ parentBlockId: parent?.id, relativeStartFrame: parent ? Math.max(0, selected.block.startFrame - parent.startFrame) : undefined }) }}><option value="">Independente</option>{parentOptions.map(({ block }) => <option key={block.id} value={block.id}>{block.label}</option>)}</select></label></>}
      {selected.block.mediaId && <><label><input type="checkbox" checked={selected.block.audioEnabled !== false} disabled={selected.track.locked || !selectedMedia?.hasAudio} onChange={(event) => commitBlock({ audioEnabled: event.target.checked })} />{selectedMedia?.hasAudio ? selected.track.kind === 'video' ? 'Áudio do vídeo ativado' : 'Áudio ativado' : 'Arquivo sem áudio'}</label><label>Volume<input type="range" min="0" max="1" step="0.05" value={Math.min(1, selected.block.gain ?? 1)} disabled={selected.track.locked || selected.block.audioEnabled === false || !selectedMedia?.hasAudio} onChange={(event) => commitBlock({ gain: Number(event.target.value) })} /></label></>}
      {selected.track.kind === 'character' && <label><input type="checkbox" checked={selected.block.motionEnabled !== false} disabled={selected.track.locked || selected.track.motionEnabled === false} onChange={(event) => commitBlock({ motionEnabled: event.target.checked })} />Animar entrada (250 ms antes)</label>}
      {selected.track.kind === 'character' && <label className="v6-clip-visible"><input type="checkbox" checked={selected.block.state?.visible !== false} disabled={selected.track.locked} onChange={(event) => patchState({ visible: event.target.checked })} />Visível neste período</label>}
      <button type="button" disabled={selected.track.locked} onClick={() => duplicate(selected.block.id)} title="Duplicar (Ctrl+D)">Duplicar</button>
      <button type="button" disabled={selected.track.locked} onClick={() => remove(selected.block.id)} title="Excluir apenas este bloco">Excluir</button>
      <button type="button" onClick={() => setInspector(false)} aria-label="Fechar Inspector do bloco">×</button>
    </div>}
    {menu && <div className="v6-timeline-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
      <button type="button" role="menuitem" onClick={() => { setInspector(true); latest.current.onSelect(menu.block); setMenu(null) }}>Abrir Inspector</button>
      <button type="button" role="menuitem" onClick={() => { latest.current.onSeek(menu.block.startFrame); setMenu(null) }}>Ir ao início</button>
      <button type="button" role="menuitem" onClick={() => { latest.current.onSeek(menu.block.startFrame + menu.block.durationFrames); setMenu(null) }}>Ir ao fim</button>
      <button type="button" role="menuitem" disabled={menu.track.locked} onClick={() => duplicate(menu.block.id)}>Duplicar <kbd>Ctrl+D</kbd></button>
      <button type="button" role="menuitem" disabled={menu.track.locked || playbackFrame <= menu.block.startFrame || playbackFrame >= menu.block.startFrame + menu.block.durationFrames} onClick={() => split(menu.block.id)}>Dividir no cursor <kbd>Ctrl+K</kbd></button>
      <button type="button" role="menuitem" disabled={menu.track.locked} onClick={() => remove(menu.block.id)}>Excluir <kbd>Del</kbd></button>
    </div>}
  </section>
}
