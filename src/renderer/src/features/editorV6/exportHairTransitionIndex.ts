/**
 * Index the export-only hair atlas samples once per worker rather than scanning
 * every motion transition for every element and rendered/head-path frame.
 *
 * The first eligible transition wins exactly as Array.find did previously.
 * Boundary frames, unprepared atlases and missing from/to rigs remain excluded.
 * A plan sample may be missing even when an atlas sample exists; callers retain
 * the old guarded fallback in that case.
 */
type HairAtlasFrame = { offset: number }
type HairPoseSample = { offset: number; progress: number }
type HairIndexedTransition = {
  elementId: string
  startFrame: number
  endFrame: number
  from?: unknown
  to?: unknown
  samples: readonly HairPoseSample[]
  atlas?: { frames: readonly HairAtlasFrame[] }
}

export function createExportHairTransitionFrameIndex<T extends HairIndexedTransition>(transitions: readonly T[]) {
  type Entry = {
    transition: T
    poseSample: T['samples'][number] | undefined
    atlasFrame: NonNullable<T['atlas']>['frames'][number]
  }
  const byElement = new Map<string, Map<number, Entry>>()
  for (const transition of transitions) {
    if (!transition.atlas || !transition.from || !transition.to) continue
    let frames = byElement.get(transition.elementId)
    for (const atlasFrame of transition.atlas.frames) {
      const frame = transition.endFrame + atlasFrame.offset
      if (frame <= transition.startFrame || frame >= transition.endFrame) continue
      if (!frames) {
        frames = new Map()
        byElement.set(transition.elementId, frames)
      }
      if (frames.has(frame)) continue
      frames.set(frame, {
        transition,
        atlasFrame,
        poseSample: transition.samples.find(sample => transition.endFrame + sample.offset === frame)
      })
    }
  }
  return { get: (elementId: string, frame: number): Entry | undefined => byElement.get(elementId)?.get(frame) }
}
