import { memo, type PointerEvent as ReactPointerEvent } from 'react'
import type { EditorV6Document, EditorV6TimelineBlock as Block, EditorV6TimelineTrack as Track } from '../../../../shared/editorV6'
import type { EditorV6MotionPlan } from '../../../../shared/editorV6Motion'
import { videoCharacterTrackColor } from '../../../../shared/editorV6'
import { frameTimecode } from '../../../../shared/editorV6TimelineCore'
import {
  getEditorV6TimelineBlockPixels,
  getEditorV6TimelineMotionPixels,
  getEditorV6TimelineVisibleBlocks
} from './editorV6TimelineRowsModel'

type Props = {
  track: Track
  backgroundLane: boolean
  blocks: readonly Block[]
  transitions: readonly EditorV6MotionPlan[]
  characterNameColors?: EditorV6Document['characterNameColors']
  pixelsPerSecond: number
  width: number
  range: [number, number]
  selectedId: string | null
  onPointer: (event: ReactPointerEvent<HTMLElement>, track: Track, block: Block, mode: 'move' | 'resize') => void
  onSelect: (block: Block) => void
  onMenu: (x: number, y: number, track: Track, block: Block) => void
  onScrub: (event: ReactPointerEvent<HTMLElement>) => void
}

export const EditorV6TimelineLane = memo(function EditorV6TimelineLane({ track, backgroundLane, blocks, transitions, characterNameColors, pixelsPerSecond, width, range, selectedId, onPointer, onSelect, onMenu, onScrub }: Props) {
  return <div className="editor-v6-timeline-lane" style={{ width, backgroundSize: `${pixelsPerSecond}px 100%` }} onPointerDown={onScrub}>
    {transitions.map((plan) => <i key={`motion-${plan.blockId}`} className="v6-motion-range" style={getEditorV6TimelineMotionPixels(plan, pixelsPerSecond)} />)}
    {getEditorV6TimelineVisibleBlocks(blocks, range).map((block) => {
      const characterId = block.state?.characterId ?? block.characterId ?? track.characterId
      const characterColor = characterId ? characterNameColors?.[characterId] ?? videoCharacterTrackColor(characterId) : undefined
      const pixels = getEditorV6TimelineBlockPixels(block, pixelsPerSecond)
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
})
