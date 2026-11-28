import { memo, useMemo, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { EditorV6Document, EditorV6TimelineBlock as Block, EditorV6TimelineTrack as Track } from '../../../../shared/editorV6'
import type { EditorV6MotionPlan } from '../../../../shared/editorV6Motion'
import { videoCharacterTrackColor } from '../../../../shared/editorV6'
import { frameTimecode } from '../../../../shared/editorV6TimelineCore'
import {
  getEditorV6TimelineBlockPixels,
  getEditorV6TimelineBlockSeekFrame,
  getEditorV6TimelineMotionPixels,
  getEditorV6TimelineVisibleBlocks,
  resolveEditorV6TimelineBlockHit,
  type EditorV6TimelineBlockHitCycle
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
  onSelect: (block: Block, seekToFrame?: number) => void
  onMenu: (x: number, y: number, track: Track, block: Block) => void
  onScrub: (event: ReactPointerEvent<HTMLElement>) => void
}

export const EditorV6TimelineLane = memo(function EditorV6TimelineLane({ track, backgroundLane, blocks, transitions, characterNameColors, pixelsPerSecond, width, range, selectedId, onPointer, onSelect, onMenu, onScrub }: Props) {
  const visibleBlocks = useMemo(() => getEditorV6TimelineVisibleBlocks(blocks, range), [blocks, range])
  const overlapCycle = useRef<EditorV6TimelineBlockHitCycle | undefined>(undefined)
  const pointerSelection = useRef<{ blockId: string; x: number } | undefined>(undefined)
  const resolveHit = (event: { currentTarget: Element; clientX: number }, target: Block, repeat: boolean) => {
    const lane = event.currentTarget.closest('.editor-v6-timeline-lane')
    if (!lane) return target
    const x = event.clientX - lane.getBoundingClientRect().left
    const result = resolveEditorV6TimelineBlockHit({ blocks: visibleBlocks, targetBlockId: target.id, x, pixelsPerSecond,
      ...(repeat ? { previous: overlapCycle.current } : {}) })
    if (repeat) overlapCycle.current = result?.cycle
    return result?.block ?? target
  }
  const handlePointer = (event: ReactPointerEvent<HTMLElement>, block: Block, mode: 'move' | 'resize') => {
    if (event.button !== 0) { onPointer(event, track, block, mode); return }
    const hit = resolveHit(event, block, true)
    pointerSelection.current = { blockId: hit.id, x: event.clientX }
    onPointer(event, track, hit, mode)
  }
  const handleClick = (event: ReactMouseEvent<HTMLElement>, block: Block) => {
    event.stopPropagation()
    let hit = block
    const pending = pointerSelection.current
    if (event.detail > 0 && pending && Math.abs(pending.x - event.clientX) <= 6) {
      hit = visibleBlocks.find((candidate) => candidate.id === pending.blockId) ?? block
    } else if (event.detail > 0) {
      hit = resolveHit(event, block, true)
    }
    pointerSelection.current = undefined
    const lane = event.currentTarget.closest('.editor-v6-timeline-lane')
    const laneLeft = lane?.getBoundingClientRect().left ?? 0
    const hitLeft = laneLeft + getEditorV6TimelineBlockPixels(hit, pixelsPerSecond).left
    const seekToFrame = getEditorV6TimelineBlockSeekFrame(hit, event.detail, event.clientX, hitLeft, pixelsPerSecond)
    onSelect(hit, seekToFrame)
  }
  const handleContextMenu = (event: ReactMouseEvent<HTMLElement>, block: Block) => {
    event.preventDefault()
    event.stopPropagation()
    const hit = resolveHit(event, block, true)
    onMenu(event.clientX, event.clientY, track, hit)
  }
  return <div className="editor-v6-timeline-lane" style={{ width, backgroundSize: `${pixelsPerSecond}px 100%` }} onPointerDown={onScrub}>
    {transitions.map((plan) => <i key={`motion-${plan.blockId}`} className="v6-motion-range" style={getEditorV6TimelineMotionPixels(plan, pixelsPerSecond)} />)}
    {visibleBlocks.map((block) => {
      const characterId = block.state?.characterId ?? block.characterId ?? track.characterId
      const characterColor = characterId ? characterNameColors?.[characterId] ?? videoCharacterTrackColor(characterId) : undefined
      const durationLabel = frameTimecode(block.durationFrames)
      const startLabel = frameTimecode(block.startFrame)
      const pixels = getEditorV6TimelineBlockPixels(block, pixelsPerSecond)
      return <div key={block.id}
        className={`editor-v6-timeline-block kind-${backgroundLane ? 'background' : track.kind}${selectedId === block.id ? ' selected' : ''}${track.locked ? ' locked' : ''}`}
        style={{ ...pixels, ...(characterColor ? { borderColor: characterColor, background: `linear-gradient(180deg, ${characterColor}28, ${characterColor}16)` } : {}) }}
        tabIndex={0} role="button" aria-label={`${block.label}, ${startLabel}, duração ${durationLabel}`}
        title={`${block.label}\nInício ${startLabel} · Fim ${frameTimecode(block.startFrame + block.durationFrames)} · Duração ${durationLabel}`}
        onPointerDown={(event) => { if (event.button === 0) handlePointer(event, block, 'move'); else event.stopPropagation() }}
        onClick={(event) => handleClick(event, block)} onKeyDown={(event) => { if (event.key === 'Enter') onSelect(block) }}
        onContextMenu={(event) => handleContextMenu(event, block)}>
        <span>{block.state?.visible === false ? '◌ ' : ''}{block.parentBlockId ? '↳ ' : ''}{block.label}</span>
        {(backgroundLane || !track.collapsed) && <small>{durationLabel}</small>}
        <i className="editor-v6-timeline-resize" onPointerDown={(event) => handlePointer(event, block, 'resize')} aria-label="Alterar duração" />
      </div>
    })}
  </div>
})
