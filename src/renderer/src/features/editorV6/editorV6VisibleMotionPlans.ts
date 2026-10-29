import { EDITOR_V6_MOTION_MS, editorV6MotionPlan, type EditorV6MotionPlan } from '../../../../shared/editorV6Motion'
import type { EditorV6TimelineBlock, EditorV6TimelineTrack } from '../../../../shared/editorV6'

export type EditorV6FrameRange = readonly [startFrame: number, endFrame: number]
export type EditorV6MotionPair = readonly [previous: EditorV6TimelineBlock, next: EditorV6TimelineBlock]

const MOTION_WINDOW_FRAMES = EDITOR_V6_MOTION_MS * 30 / 1000

/** Select only adjacent character states whose short transition can touch the visible range. Blocks must be ordered by startFrame. */
export function selectEditorV6MotionPairsInRange(
  blocks: readonly EditorV6TimelineBlock[],
  [startFrame, endFrame]: EditorV6FrameRange
): EditorV6MotionPair[] {
  if (blocks.length < 2 || endFrame < startFrame) return []

  let first = 1, last = blocks.length
  while (first < last) {
    const middle = (first + last) >>> 1
    if (blocks[middle].startFrame < startFrame) first = middle + 1
    else last = middle
  }

  const firstNextIndex = first
  last = blocks.length
  while (first < last) {
    const middle = (first + last) >>> 1
    if (blocks[middle].startFrame <= endFrame + MOTION_WINDOW_FRAMES) first = middle + 1
    else last = middle
  }

  const pairs: EditorV6MotionPair[] = []
  for (let index = firstNextIndex; index < first; index++) {
    const previous = blocks[index - 1]
    const next = blocks[index]
    if (previous.startFrame <= endFrame) pairs.push([previous, next])
  }
  return pairs
}

/** Build expensive face signatures and samples only for transitions visible in the timeline viewport. */
export function editorV6VisibleMotionPlans(
  track: EditorV6TimelineTrack,
  blocks: readonly EditorV6TimelineBlock[],
  range: EditorV6FrameRange
): EditorV6MotionPlan[] {
  if (track.kind !== 'character') return []
  const [startFrame, endFrame] = range
  const plans: EditorV6MotionPlan[] = []
  for (const [previous, next] of selectEditorV6MotionPairsInRange(blocks, range)) {
    const plan = editorV6MotionPlan(track, previous, next)
    if (plan && plan.startFrame <= endFrame && plan.endFrame >= startFrame) plans.push(plan)
  }
  return plans
}
