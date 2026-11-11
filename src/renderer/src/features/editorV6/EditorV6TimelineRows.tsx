import { memo, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { EditorV6Document, EditorV6Timeline as Timeline, EditorV6TimelineBlock as Block, EditorV6TimelineTrack as Track } from '../../../../shared/editorV6'
import type { TrackAction } from './editorV6TimelineTrackCommands'
import { EditorV6TimelineLane } from './EditorV6TimelineLane'
import { EditorV6TimelineTrackHeader } from './EditorV6TimelineTrackHeader'
import {
  createEditorV6TimelineDisplayRows,
  createEditorV6TimelineSortedBlocks,
  createEditorV6TimelineTransitionMap,
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
    <EditorV6TimelineLane
      track={track}
      backgroundLane={backgroundLane}
      blocks={sortedTracks.get(key)!}
      transitions={transitions.get(key)!}
      characterNameColors={characterNameColors}
      pixelsPerSecond={pps}
      width={width}
      range={range}
      selectedId={selectedId}
      onPointer={onPointer}
      onSelect={onSelect}
      onMenu={onMenu}
      onScrub={onScrub}
    />
  </div>})}</>
})
