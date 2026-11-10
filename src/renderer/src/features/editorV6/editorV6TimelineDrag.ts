import type {
  EditorV6MediaAsset,
  EditorV6Timeline as Timeline,
  EditorV6TimelineBlock as Block,
  EditorV6TimelineTrack as Track
} from '../../../../shared/editorV6'
import { compareEditorV6TimelineBlocks, MAX_TIMELINE_FRAME, normalizeEditorV6Timeline, timelineClips } from '../../../../shared/editorV6TimelineCore'
import { snapEditorV6Frame } from '../../../../shared/editorV6TimelineEdits'

export type EditorV6TimelineDragSnapshot = {
  track: Track
  block: Block
  mode: 'move' | 'resize'
  initial: Timeline
  previous?: Block
  next?: Block
  afterNext?: Block
  parent?: Block
  snapPoints: Array<{ frame: number; order: number }>
}

export type EditorV6TimelineDragPreview = {
  snapshot: EditorV6TimelineDragSnapshot
  deltaFrames: number
  playheadFrame: number
  pixelsPerSecond: number
  snap: boolean
  altKey: boolean
  media?: readonly EditorV6MediaAsset[]
}

/** Calculates a transient timeline drag without persisting or mutating its source. */
export function previewEditorV6TimelineDrag(input: EditorV6TimelineDragPreview): { timeline: Timeline; block: Block; guide?: number } {
  const { snapshot } = input
  const { block, track, mode, initial, previous, next, afterNext, parent, snapPoints } = snapshot
  let value = mode === 'move' ? block.startFrame + input.deltaFrames : block.startFrame + block.durationFrames + input.deltaFrames
  const snapped = input.snap && !input.altKey
    ? snapEditorV6Frame(initial, value, input.playheadFrame, block.id, 7 / input.pixelsPerSecond * 30, mode === 'move' ? block.durationFrames : 0, snapPoints)
    : { frame: Math.round(value), guide: undefined }
  value = Math.max(mode === 'resize' ? block.startFrame + 1 : 0, Math.min(MAX_TIMELINE_FRAME - (mode === 'move' ? block.durationFrames : 0), snapped.frame))

  let startFrame = mode === 'move' ? value : block.startFrame
  let durationFrames = mode === 'resize' ? value - block.startFrame : block.durationFrames
  const media = block.mediaId ? input.media?.find((item) => item.id === block.mediaId) : undefined
  if (mode === 'resize' && media) durationFrames = Math.min(durationFrames, media.sourceFrames - (block.mediaInFrame ?? 0))

  const persistent = track.kind === 'character' || Boolean(block.background)
  if (persistent) {
    if (mode === 'move') startFrame = Math.max(previous ? previous.startFrame + 1 : 0, Math.min(next ? next.startFrame - 1 : MAX_TIMELINE_FRAME - 1, startFrame))
    else durationFrames = Math.max(1, Math.min(next && afterNext ? afterNext.startFrame - block.startFrame - 1 : MAX_TIMELINE_FRAME - block.startFrame, durationFrames))
  }
  if (parent) {
    startFrame = Math.max(parent.startFrame, Math.min(parent.startFrame + parent.durationFrames - 1, startFrame))
    durationFrames = Math.max(1, Math.min(durationFrames, parent.startFrame + parent.durationFrames - startFrame))
  }

  const updated = { ...block, startFrame, durationFrames, ...(parent ? { relativeStartFrame: startFrame - parent.startFrame } : {}) }
  const timeline = normalizeEditorV6Timeline({
    ...initial,
    durationFrames: persistent && mode === 'resize' && !next
      ? startFrame + durationFrames
      : Math.max(initial.durationFrames, startFrame + durationFrames),
    tracks: initial.tracks.map((candidate) => candidate.id === track.id
      ? { ...candidate, blocks: candidate.blocks.map((clip) => clip.id === block.id
        ? updated
        : persistent && mode === 'resize' && clip.id === next?.id
          ? { ...clip, startFrame: block.startFrame + durationFrames }
          : clip) }
      : candidate)
  })
  const previewBlock = timeline.tracks.find((candidate) => candidate.id === track.id)?.blocks.find((clip) => clip.id === block.id) ?? updated
  return { timeline, block: previewBlock, guide: snapped.guide }
}

/** Precomputes stable neighbors and snap targets once when a pointer drag begins. */
export function createEditorV6TimelineDragSnapshot(input: {
  initial: Timeline
  track: Track
  block: Block
  mode: EditorV6TimelineDragSnapshot['mode']
}): EditorV6TimelineDragSnapshot {
  const { initial, track, block, mode } = input
  const sorted = track.blocks.filter((clip) => !block.background || clip.background).sort(compareEditorV6TimelineBlocks)
  const index = sorted.findIndex((candidate) => candidate.id === block.id)
  const blocksById = new Map(timelineClips(initial).map(({ block: clip }) => [clip.id, clip] as const))
  const snapPoints = timelineClips(initial)
    .flatMap(({ block: clip }, order) => clip.id === block.id || clip.parentBlockId === block.id
      ? []
      : [{ frame: clip.startFrame, order: order * 2 }, { frame: clip.startFrame + clip.durationFrames, order: order * 2 + 1 }])
    .sort((a, b) => a.frame - b.frame || a.order - b.order)

  return {
    initial,
    track,
    block,
    mode,
    previous: sorted[index - 1],
    next: sorted[index + 1],
    afterNext: sorted[index + 2],
    parent: block.parentBlockId ? blocksById.get(block.parentBlockId) : undefined,
    snapPoints
  }
}
