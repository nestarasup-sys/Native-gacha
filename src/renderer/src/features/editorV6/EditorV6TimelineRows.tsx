import { memo, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { EditorV6Document, EditorV6Timeline as Timeline, EditorV6TimelineBlock as Block, EditorV6TimelineTrack as Track } from '../../../../shared/editorV6'
import { videoCharacterTrackColor } from '../../../../shared/editorV6'
import { frameTimecode } from '../../../../shared/editorV6TimelineCore'
import type { TrackAction } from './editorV6TimelineTrackCommands'
import { EditorV6TimelineTrackHeader } from './EditorV6TimelineTrackHeader'
import {
  createEditorV6TimelineDisplayRows,
  createEditorV6TimelineSortedBlocks,
  createEditorV6TimelineTransitionMap,
  getEditorV6TimelineBlockPixels,
  getEditorV6TimelineMotionPixels,
  getEditorV6TimelineVisibleBlocks,
  type EditorV6TimelineDisplayRow
} from './editorV6TimelineRowsModel'

export type EditorV6TimelineRowsProps = {
  timeline: Timeline
  characterNameColors?: EditorV6Document['characterNameColors']
  pps: number
  width: number
  heading: number
  range: [number, number]
  selectedId: string | null
  onPointer: (event: ReactPointerEvent<HTMLElement>, track: Track, block: Block, mode: 'move' | 'resize') => void
  onSelect: (block: Block) => void
  onMenu: (x: number, y: number, track: Track, block: Block) => void
  onTrack: (track: Track, action: TrackAction, name?: string) => void
  onScrub: (event: ReactPointerEvent<HTMLElement>) => void
}

/** Playback only moves the cursor overlay; these rows rerender on editing or scrolling. */
export const EditorV6TimelineRows = memo(function EditorV6TimelineRows({ timeline, characterNameColors, pps, width, heading, range, selectedId, onPointer, onSelect, onMenu, onTrack, onScrub }: EditorV6TimelineRowsProps) {
  const displayRows = useMemo<EditorV6TimelineDisplayRow[]>(() => createEditorV6TimelineDisplayRows(timeline), [timeline])
  const sortedTracks = useMemo(() => createEditorV6TimelineSortedBlocks(displayRows), [displayRows])
  const transitions = useMemo(() => createEditorV6TimelineTransitionMap(displayRows, sortedTracks, range), [displayRows, sortedTracks, range])
  const [renameId, setRenameId] = useState<string | null>(null)

  return <>{displayRows.map((row) => {
    const { key, track, backgroundLane } = row
    return <div className={`editor-v6-timeline-track${track.hidden || track.muted ? ' muted' : ''}${!backgroundLane && track.collapsed ? ' collapsed' : ''}`} key={key} style={{ gridTemplateColumns: `${heading}px ${width}px` }}>
    <EditorV6TimelineTrackHeader row={row} rows={displayRows} renameId={renameId} setRenameId={setRenameId} onTrack={onTrack} />
    <div className="editor-v6-timeline-lane" style={{ width, backgroundSize: `${pps}px 100%` }} onPointerDown={onScrub}>
      {transitions.get(key)!.map((plan) => <i key={`motion-${plan.blockId}`} className="v6-motion-range" style={getEditorV6TimelineMotionPixels(plan, pps)} />)}
      {getEditorV6TimelineVisibleBlocks(sortedTracks.get(key)!, range).map((block) => {
        const characterId = block.state?.characterId ?? block.characterId ?? track.characterId
        const characterColor = characterId ? characterNameColors?.[characterId] ?? videoCharacterTrackColor(characterId) : undefined
        const pixels = getEditorV6TimelineBlockPixels(block, pps)
        return <div key={block.id}
        className={`editor-v6-timeline-block kind-${backgroundLane ? 'background' : track.kind}${selectedId === block.id ? ' selected' : ''}${track.locked ? ' locked' : ''}`}
        style={{ ...pixels, ...(characterColor ? { borderColor: characterColor, background: `linear-gradient(180deg, ${characterColor}28, ${characterColor}16)` } : {}) }}
        tabIndex={0} role="button" aria-label={`${block.label}, ${frameTimecode(block.startFrame)}, duração ${frameTimecode(block.durationFrames)}`}
        title={`${block.label}\nInício ${frameTimecode(block.startFrame)} · Fim ${frameTimecode(block.startFrame + block.durationFrames)} · Duração ${frameTimecode(block.durationFrames)}`}
        onPointerDown={(event) => { if (event.button === 0) onPointer(event, track, block, 'move'); else event.stopPropagation() }}
        onClick={(event) => { event.stopPropagation(); onSelect(block) }} onKeyDown={(event) => { if (event.key === 'Enter') onSelect(block) }}
        onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onMenu(event.clientX, event.clientY, track, block) }}>
        <span>{block.state?.visible === false ? '◌ ' : ''}{block.parentBlockId ? '↳ ' : ''}{block.label}</span>
        {(backgroundLane || !track.collapsed) && <small>{frameTimecode(block.durationFrames)}</small>}
        <i className="editor-v6-timeline-resize" onPointerDown={(event) => onPointer(event, track, block, 'resize')} aria-label="Alterar duração" />
      </div>
      })}
    </div>
  </div>})}</>
})
