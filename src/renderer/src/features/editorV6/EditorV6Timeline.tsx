import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EditorV6Document, EditorV6Timeline as Timeline, EditorV6TimelineBlock as Block } from '../../../../shared/editorV6'
import { frameTimecode, timelineClips } from '../../../../shared/editorV6TimelineCore'
import { useEditorV6PlaybackFrame } from './editorV6PlaybackClock'
import { EditorV6TimelineRows, type EditorV6TimelineRowsProps } from './EditorV6TimelineRows'
import { createEditorV6TimelineTrackCommands } from './editorV6TimelineTrackCommands'
import { createEditorV6TimelineBlockCommands } from './editorV6TimelineBlockCommands'
import { applyEditorV6TimelineUpdate } from './editorV6TimelineDocumentUpdate'
import { EditorV6TimelineContextMenu } from './EditorV6TimelineContextMenu'
import { getEditorV6TimelineContextMenuPosition, type EditorV6TimelineContextMenuState } from './editorV6TimelineContextMenuModel'
import { createEditorV6TimelinePointerCommands } from './editorV6TimelinePointerCommands'
import { resolveEditorV6TimelineKeyCommand } from './editorV6TimelineKeyboard'
import { executeEditorV6TimelineKeyCommand } from './editorV6TimelineKeyboardActions'
import { createEditorV6TimelineZoomCommands } from './editorV6TimelineZoomCommands'
import { getEditorV6TimelineContentWidth, getEditorV6TimelineVisibleFrameRange } from './editorV6TimelineViewModel'
import { useEditorV6TimelineViewport } from './useEditorV6TimelineViewport'
import { EditorV6TimelineToolbar } from './EditorV6TimelineToolbar'
import { EditorV6TimelineRuler } from './EditorV6TimelineRuler'
import { canSplitEditorV6TimelineBlock } from './editorV6TimelineContextMenuModel'

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
  const [menu, setMenu] = useState<EditorV6TimelineContextMenuState | null>(null)
  const [notice, setNotice] = useState('')
  const scroll = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLElement>(null)
  const didDrag = useRef(false)
  const settings = useRef({ pps, snap, heading: compact ? 116 : 156 })
  settings.current = { pps, snap, heading: compact ? 116 : 156 }
  const heading = settings.current.heading
  const { viewport, onScroll } = useEditorV6TimelineViewport(scroll, { playing: props.playing, playbackFrame, pixelsPerSecond: pps, heading })
  const timeline = draft ?? props.document.timeline
  const { zoomIn, zoomOut, fit } = useMemo(() => createEditorV6TimelineZoomCommands({
    getScrollNode: () => scroll.current,
    getPixelsPerSecond: () => settings.current.pps,
    setPixelsPerSecond: setPps,
    getHeading: () => settings.current.heading,
    getDurationFrames: () => latest.current.document.timeline.durationFrames,
    requestFrame: (callback) => { requestAnimationFrame(callback) }
  }), [])
  const width = getEditorV6TimelineContentWidth({ viewportWidth: viewport.width, heading, durationFrames: timeline.durationFrames, pixelsPerSecond: pps })
  const selected = useMemo(() => timelineClips(timeline).find(({ block }) => block.id === props.selectedId), [timeline, props.selectedId])
  const range = useMemo<[number, number]>(() => getEditorV6TimelineVisibleFrameRange({ scrollLeft: viewport.left, viewportWidth: viewport.width, heading, pixelsPerSecond: pps, durationFrames: timeline.durationFrames }), [viewport, heading, pps, timeline.durationFrames])

  const changeTimeline = useCallback((update: (timeline: Timeline) => Timeline) => {
    latest.current.onChange((document) => applyEditorV6TimelineUpdate(document, update, new Date().toISOString()))
  }, [])
  const pointerCommands = useMemo(() => createEditorV6TimelinePointerCommands({
    scrollNode: () => scroll.current,
    document: () => latest.current.document,
    frame: () => latest.current.frame,
    settings: () => settings.current,
    didDrag,
    seek: (frame) => latest.current.onSeek(frame),
    select: (block) => latest.current.onSelect(block),
    changeTimeline,
    closeMenu: () => setMenu(null),
    setDraft,
    setGuide,
    setReadout
  }), [changeTimeline])
  const select = useCallback((block: Block, seekToStart = false) => {
    if (didDrag.current) { didDrag.current = false; return }
    if (seekToStart) latest.current.onSeek(block.startFrame)
    latest.current.onSelect(block)
  }, [])
  const { remove, split, duplicate } = useMemo(() => createEditorV6TimelineBlockCommands({
    getTimeline: () => latest.current.document.timeline,
    getFrame: () => latest.current.frame,
    changeTimeline,
    closeMenu: () => setMenu(null)
  }), [changeTimeline])
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
  const onMenu = useCallback<EditorV6TimelineRowsProps['onMenu']>((x, y, track, block) => {
    if (latest.current.selectedId !== block.id) select(block)
    setMenu({ ...getEditorV6TimelineContextMenuPosition(x, y, window.innerWidth, window.innerHeight), track, block })
  }, [select])

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
      executeEditorV6TimelineKeyCommand(command, {
        selectedId: current.selectedId,
        cancelDrag: cancel,
        closeMenu: () => setMenu(null),
        split,
        duplicate,
        toggleSnap: () => setSnap((value) => !value),
        zoomIn,
        zoomOut,
        fit,
        seek: (frame) => current.onSeek(frame),
        play: () => current.onPlay(),
        remove
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel, duplicate, fit, remove, split, zoomIn, zoomOut])
  useEffect(() => {
    if (!menu) return
    const close = (event: PointerEvent) => { if (!(event.target instanceof HTMLElement) || !event.target.closest('.v6-timeline-menu')) setMenu(null) }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])

  return <section ref={root} className="editor-v6-timeline v6-timeline-pro" aria-label="Timeline do Editor V6" onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={cancel}>
    <EditorV6TimelineToolbar
      playbackFrame={playbackFrame}
      durationFrames={timeline.durationFrames}
      playing={props.playing}
      snap={snap}
      compact={compact}
      canSplit={Boolean(selected && canSplitEditorV6TimelineBlock(selected.track, selected.block, playbackFrame))}
      onPlay={props.onPlay}
      onToggleSnap={() => setSnap(!snap)}
      onZoomOut={zoomOut}
      onZoomIn={zoomIn}
      onFit={fit}
      onToggleCompact={() => setCompact(!compact)}
      onSplit={() => selected && split(selected.block.id)}
    />
    <div className="editor-v6-timeline-scroll" ref={scroll} onScroll={onScroll}>
      <div className="editor-v6-timeline-content" style={{ width: heading + width }}>
        <EditorV6TimelineRuler timeline={timeline} pixelsPerSecond={pps} width={width} heading={heading} range={range} onScrub={onScrub} />
        <EditorV6TimelineRows timeline={timeline} characterNameColors={props.document.characterNameColors} pps={pps} width={width} heading={heading} range={range} selectedId={props.selectedId} onPointer={onPointer} onSelect={select} onMenu={onMenu} onTrack={onTrack} onScrub={onScrub} />
        <div className="v6-cursor-overlay" style={{ left: heading, width, clipPath: `inset(0 0 0 ${viewport.left}px)` }}><i className="v6-main-playhead" style={{ transform: `translateX(${playbackFrame / 30 * pps}px)` }} />{guide !== undefined && <i className="v6-snap-guide" style={{ left: guide / 30 * pps }} />}</div>
      </div>
    </div>
    {readout && <div className="v6-drag-readout" role="status">Início {frameTimecode(readout.startFrame)} · Fim {frameTimecode(readout.startFrame + readout.durationFrames)} · Duração {frameTimecode(readout.durationFrames)} <kbd>Esc cancela</kbd></div>}
    {notice && <button type="button" className="v6-timeline-notice" onClick={() => setNotice('')}>{notice} ×</button>}
    {menu && <EditorV6TimelineContextMenu
      menu={menu}
      frame={playbackFrame}
      onSeekAndClose={(frame) => { latest.current.onSeek(frame); setMenu(null) }}
      onDuplicate={duplicate}
      onSplit={split}
      onRemove={remove}
    />}
  </section>
}
