import type { EditorV6Timeline as Timeline, EditorV6TimelineBlock as Block, EditorV6TimelineTrack as Track } from '../../../../shared/editorV6'
import type { EditorV6MotionPlan } from '../../../../shared/editorV6Motion'
import { orderEditorV6TimelineTracks } from '../../../../shared/editorV6'
import { editorV6VisibleMotionPlans } from './editorV6VisibleMotionPlans'
import { editorV6TimelineTrackFixedToBottom, editorV6TimelineTrackGroup } from './editorV6TimelineTrackCommands'

export type EditorV6TimelineDisplayRow = { key: string; track: Track; blocks: Block[]; backgroundLane: boolean; index: number }
export type EditorV6TimelineBlockPixels = { left: number; width: number }

export function createEditorV6TimelineDisplayRows(timeline: Timeline): EditorV6TimelineDisplayRow[] {
  const rows = orderEditorV6TimelineTracks(timeline.tracks).map((track, index) => ({
    key: track.id,
    track,
    blocks: track.blocks.filter((block) => !block.background),
    backgroundLane: false,
    index
  }))
  const videoTrack = timeline.tracks.find((candidate) => candidate.kind === 'video') ?? {
    id: 'editor-v6-background-source', kind: 'video' as const, name: 'Vídeo', muted: false, locked: false, blocks: []
  }
  rows.push({
    key: `background:${videoTrack.id}`,
    track: videoTrack,
    blocks: videoTrack.blocks.filter((block) => Boolean(block.background)),
    backgroundLane: true,
    index: timeline.tracks.length
  })
  return rows
}

export function createEditorV6TimelineSortedBlocks(rows: readonly EditorV6TimelineDisplayRow[]) {
  return new Map(rows.map(({ key, blocks }) => [key, [...blocks].sort((left, right) => left.startFrame - right.startFrame)]))
}

export function createEditorV6TimelineTransitionMap(
  rows: readonly EditorV6TimelineDisplayRow[],
  sortedBlocks: ReadonlyMap<string, Block[]>,
  range: [number, number]
) {
  return new Map(rows.map(({ key, track }) => [key, editorV6VisibleMotionPlans(track, sortedBlocks.get(key)!, range)]))
}

const maximumBlockEnds = new WeakMap<readonly Block[], number[]>()

/** Blocks are sorted by start frame. The prefix maximum includes long overlapping clips. */
export function getEditorV6TimelineVisibleBlocks(blocks: readonly Block[], [startFrame, endFrame]: [number, number]) {
  if (endFrame < startFrame) return []
  let ends = maximumBlockEnds.get(blocks)
  if (!ends) {
    let maximumEnd = -Infinity
    ends = blocks.map((block) => {
      if (!block.emptyGap) maximumEnd = Math.max(maximumEnd, block.startFrame + block.durationFrames)
      return maximumEnd
    })
    maximumBlockEnds.set(blocks, ends)
  }

  let left = 0, right = blocks.length
  while (left < right) {
    const middle = (left + right) >>> 1
    if (ends[middle] < startFrame) left = middle + 1
    else right = middle
  }

  const visible: Block[] = []
  for (let index = left; index < blocks.length && blocks[index].startFrame <= endFrame; index++) {
    const block = blocks[index]
    if (!block.emptyGap && block.startFrame + block.durationFrames >= startFrame) visible.push(block)
  }
  return visible
}

export function getEditorV6TimelineBlockPixels(block: Block, pixelsPerSecond: number): EditorV6TimelineBlockPixels {
  return { left: block.startFrame / 30 * pixelsPerSecond, width: Math.max(3, block.durationFrames / 30 * pixelsPerSecond) }
}

/** A block's first click selects it; a repeated click seeks within its frame range. */
export function getEditorV6TimelineBlockSeekFrame(block: Block, clickCount: number, clientX: number, boundsLeft: number, pixelsPerSecond: number): number | undefined {
  if (clickCount < 2 || !Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) return undefined
  const offsetFrames = Math.round((clientX - boundsLeft) / pixelsPerSecond * 30)
  return Math.min(block.startFrame + block.durationFrames, Math.max(block.startFrame, block.startFrame + offsetFrames))
}

export function getEditorV6TimelineMotionPixels(plan: EditorV6MotionPlan, pixelsPerSecond: number): EditorV6TimelineBlockPixels {
  return { left: plan.startFrame / 30 * pixelsPerSecond, width: (plan.endFrame - plan.startFrame) / 30 * pixelsPerSecond }
}

export function canMoveEditorV6TimelineTrack(rows: readonly EditorV6TimelineDisplayRow[], index: number, direction: -1 | 1) {
  const row = rows[index]
  if (!row || editorV6TimelineTrackFixedToBottom(row.track)) return false
  const neighbor = rows[index + direction]
  return Boolean(neighbor && editorV6TimelineTrackGroup(row.track) === editorV6TimelineTrackGroup(neighbor.track))
}
