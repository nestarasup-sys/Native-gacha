import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EditorV6Document, EditorV6Timeline as Timeline, EditorV6TimelineBlock as Block, EditorV6TimelineTrack as Track } from '../../../../shared/editorV6'
import { frameTimecode, normalizeEditorV6Timeline, timelineClips } from '../../../../shared/editorV6TimelineCore'
import { duplicateEditorV6Block, pruneEditorV6TimelineSnapshots, splitEditorV6Block } from '../../../../shared/editorV6TimelineEdits'
import { useEditorV6PlaybackFrame } from './editorV6PlaybackClock'
import { EditorV6TimelineRows, type EditorV6TimelineRowsProps } from './EditorV6TimelineRows'
import { createEditorV6TimelineTrackCommands } from './editorV6TimelineTrackCommands'
import { createEditorV6TimelinePointerCommands } from './editorV6TimelinePointerCommands'
import { resolveEditorV6TimelineKeyCommand } from './editorV6TimelineKeyboard'
import { clampEditorV6TimelineZoom, getEditorV6TimelineCenterSeconds, getEditorV6TimelineFitZoom, getEditorV6TimelineFollowScroll, getEditorV6TimelineScrollForZoom } from './editorV6TimelineViewport'
import { getEditorV6TimelineContentWidth, getEditorV6TimelineRulerTicks, getEditorV6TimelineTickSeconds, getEditorV6TimelineVisibleFrameRange } from './editorV6TimelineViewModel'
import { useEditorV6TimelineViewport } from './useEditorV6TimelineViewport'

type Props = {
  document: EditorV6Document
  playing: boolean
  selectedId: string | null
  onSeek: (frame: number) => void
  onPlay: () => void
  onSelect: (block: Block) => void
  onChange: (update: (document: EditorV6Document) => EditorV6Document) => void
}
const editableTarget = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest('input,textarea,select,[contenteditable=true],[role=dialog]'))

export function EditorV6Timeline(props: Props) {
  const playbackFrame = useEditorV6PlaybackFrame()
  const latest = useRef<Props & { frame: number }>({ ...props, frame: playbackFrame })
  latest.current = { ...props, frame: playbackFrame }
  const [pps, setPps] = useState(72)
  const [snap, setSnap] = useState(true)
  const [compact, setCompact] = useState(false)
  const [draft, setDraft] = useState<Timeline | null>(null)
  const [guide, setGuide] = useState<number | undefined>()
  const [readout, setReadout] = useState<Block | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; track: Track; block: Block } | null>(null)
  const [notice, setNotice] = useState('')
  const scroll = useRef<HTMLDivElement>(null)
  const { viewport, onScroll } = useEditorV6TimelineViewport(scroll)
  const root = useRef<HTMLElement>(null)
  const didDrag = useRef(false)
  const previousZoom = useRef(72)
  const fitActive = useRef(false)
  const settings = useRef({ pps, snap, heading: compact ? 116 : 210 })
  settings.current = { pps, snap, heading: compact ? 116 : 210 }
  const heading = settings.current.heading
  const timeline = draft ?? props.document.timeline
  const width = getEditorV6TimelineContentWidth({ viewportWidth: viewport.width, heading, durationFrames: timeline.durationFrames, pixelsPerSecond: pps })
  const selected = useMemo(() => timelineClips(timeline).find(({ block }) => block.id === props.selectedId), [timeline, props.selectedId])
  const range = useMemo<[number, number]>(() => getEditorV6TimelineVisibleFrameRange({ scrollLeft: viewport.left, viewportWidth: viewport.width, heading, pixelsPerSecond: pps, durationFrames: timeline.durationFrames }), [viewport, heading, pps, timeline.durationFrames])

  const changeTimeline = useCallback((update: (timeline: Timeline) => Timeline) => {
    latest.current.onChange((document) => pruneEditorV6TimelineSnapshots({ ...document, timeline: normalizeEditorV6Timeline(update(document.timeline)), updatedAt: new Date().toISOString() }))
  }, [])
  const pointerCommands = useMemo(() => createEditorV6TimelinePointerCommands({
    scrollNode: () => scroll.current,
    document: () => latest.current.document,
    frame: () => latest.current.frame,
    settings: () => settings.current,
    didDrag,
    seek: (frame) => latest.current.onSeek(frame),
    select: (block) => { latest.current.onSeek(block.startFrame); latest.current.onSelect(block) },
    changeTimeline,
    closeMenu: () => setMenu(null),
    setDraft,
    setGuide,
    setReadout
  }), [changeTimeline])
  const select = useCallback((block: Block) => {
    if (didDrag.current) { didDrag.current = false; return }
    latest.current.onSeek(block.startFrame)
    latest.current.onSelect(block)
  }, [])
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
    const viewport = node ? { scrollLeft: node.scrollLeft, clientWidth: node.clientWidth, heading: settings.current.heading } : null
    const center = viewport ? getEditorV6TimelineCenterSeconds(viewport, old) : 0
    const value = clampEditorV6TimelineZoom(next)
    setPps(value)
    requestAnimationFrame(() => {
      if (node && viewport) node.scrollLeft = getEditorV6TimelineScrollForZoom({ ...viewport, clientWidth: node.clientWidth, heading: settings.current.heading }, center, value)
    })
  }, [])
  const fit = useCallback(() => {
    if (fitActive.current) { zoomTo(previousZoom.current); fitActive.current = false; return }
    previousZoom.current = settings.current.pps
    fitActive.current = true
    zoomTo(getEditorV6TimelineFitZoom(scroll.current?.clientWidth ?? 800, settings.current.heading, latest.current.document.timeline.durationFrames))
    requestAnimationFrame(() => { if (scroll.current) scroll.current.scrollLeft = 0 })
  }, [zoomTo])

  const { onTrack } = useMemo(() => createEditorV6TimelineTrackCommands({
    getDocument: () => latest.current.document,
    getFrame: () => latest.current.frame,
    changeTimeline,
    changeDocument: (update) => latest.current.onChange(update),
    seek: (frame) => latest.current.onSeek(frame),
    select,
    setNotice,
    createId: () => crypto.randomUUID()
  }), [changeTimeline, select])

  const { onPointer, onScrub, cancel, movePointer, endPointer } = pointerCommands
  const onMenu = useCallback<EditorV6TimelineRowsProps['onMenu']>((x, y, track, block) => { if (latest.current.selectedId !== block.id) select(block); setMenu({ x: Math.min(x, window.innerWidth - 195), y: Math.max(8, Math.min(y, window.innerHeight - 225)), track, block }) }, [select])

  useEffect(() => {
    if (!props.playing || !scroll.current) return
    const node = scroll.current
    const nextScroll = getEditorV6TimelineFollowScroll({ scrollLeft: node.scrollLeft, clientWidth: node.clientWidth, heading }, pps, playbackFrame)
    if (nextScroll !== null) node.scrollLeft = nextScroll
  }, [playbackFrame, props.playing, heading, pps])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const current = latest.current
      const command = resolveEditorV6TimelineKeyCommand({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        editableTarget: editableTarget(event.target),
        defaultPrevented: event.defaultPrevented,
        selectedId: current.selectedId,
        frame: current.frame,
        durationFrames: current.document.timeline.durationFrames
      })
      if (!command) return
      if (command.preventDefault) event.preventDefault()
      switch (command.action) {
        case 'cancel': cancel(); setMenu(null); break
        case 'split': if (current.selectedId) split(current.selectedId); break
        case 'duplicate': if (current.selectedId) duplicate(current.selectedId); break
        case 'toggle-snap': setSnap((value) => !value); break
        case 'zoom-in': fitActive.current = false; zoomTo(settings.current.pps * 1.25); break
        case 'zoom-out': fitActive.current = false; zoomTo(settings.current.pps / 1.25); break
        case 'fit': fit(); break
        case 'seek': current.onSeek(command.frame); break
        case 'play': current.onPlay(); break
        case 'remove': remove(command.blockId); break
      }
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

  const tickSeconds = getEditorV6TimelineTickSeconds(pps)
  const ticks = useMemo(() => getEditorV6TimelineRulerTicks(range, timeline.durationFrames, tickSeconds), [range, timeline.durationFrames, tickSeconds])
  return <section ref={root} className="editor-v6-timeline v6-timeline-pro" aria-label="Timeline do Editor V6" onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={cancel}>
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
    <div className="editor-v6-timeline-scroll" ref={scroll} onScroll={onScroll}>
      <div className="editor-v6-timeline-content" style={{ width: heading + width }}>
        <div className="editor-v6-timeline-ruler-row" style={{ gridTemplateColumns: `${heading}px ${width}px` }}>
          <div className="editor-v6-timeline-track-heading">FAIXAS <span>{timeline.tracks.length + 1}</span></div>
          <div className="editor-v6-timeline-ruler" style={{ width, backgroundSize: `${pps}px 100%` }} onPointerDown={onScrub}>{ticks.map((second) => <span key={second} style={{ left: second * pps }}>{second}s</span>)}</div>
        </div>
        <EditorV6TimelineRows timeline={timeline} characterNameColors={props.document.characterNameColors} pps={pps} width={width} heading={heading} range={range} selectedId={props.selectedId} onPointer={onPointer} onSelect={select} onMenu={onMenu} onTrack={onTrack} onScrub={onScrub} />
        <div className="v6-cursor-overlay" style={{ left: heading, width, clipPath: `inset(0 0 0 ${viewport.left}px)` }}><i className="v6-main-playhead" style={{ transform: `translateX(${playbackFrame / 30 * pps}px)` }} />{guide !== undefined && <i className="v6-snap-guide" style={{ left: guide / 30 * pps }} />}</div>
      </div>
    </div>
    {readout && <div className="v6-drag-readout" role="status">Início {frameTimecode(readout.startFrame)} · Fim {frameTimecode(readout.startFrame + readout.durationFrames)} · Duração {frameTimecode(readout.durationFrames)} <kbd>Esc cancela</kbd></div>}
    {notice && <button type="button" className="v6-timeline-notice" onClick={() => setNotice('')}>{notice} ×</button>}
    {menu && <div className="v6-timeline-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
      <button type="button" role="menuitem" onClick={() => { latest.current.onSeek(menu.block.startFrame); setMenu(null) }}>Ir ao início</button>
      <button type="button" role="menuitem" onClick={() => { latest.current.onSeek(menu.block.startFrame + menu.block.durationFrames); setMenu(null) }}>Ir ao fim</button>
      <button type="button" role="menuitem" disabled={menu.track.locked} onClick={() => duplicate(menu.block.id)}>Duplicar <kbd>Ctrl+D</kbd></button>
      <button type="button" role="menuitem" disabled={menu.track.locked || playbackFrame <= menu.block.startFrame || playbackFrame >= menu.block.startFrame + menu.block.durationFrames} onClick={() => split(menu.block.id)}>Dividir no cursor <kbd>Ctrl+K</kbd></button>
      <button type="button" role="menuitem" disabled={menu.track.locked} onClick={() => remove(menu.block.id)}>Excluir <kbd>Del</kbd></button>
    </div>}
  </section>
}
