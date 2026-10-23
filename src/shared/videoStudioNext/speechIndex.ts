import type { StudioElement, VideoTimelineDocument } from '../studio'

type TextClip = VideoTimelineDocument['textClips'][number]
type IndexedSpeech = Readonly<{
  clip: TextClip
  speakerId: string
  order: number
  startFrame: number
  endFrame: number
}>

export type VideoSpeechIndex = Readonly<{
  items: ReadonlyArray<IndexedSpeech>
  prefixMaxEnd: ReadonlyArray<number>
}>

export type VideoSpeechAtFrame = Readonly<{
  modes: ReadonlyMap<string, 'talk' | 'idle'>
  speechStartFrames: ReadonlyMap<string, number>
}>

/**
 * Build on timeline/element revision, never on each frame. The preview used to
 * scan every text clip at 60 FPS to resolve automatic mouth animation.
 * Resolve the speaker from the authored clip snapshot first, matching v1.
 */
export function compileVideoSpeechIndex(
  clips: ReadonlyArray<TextClip>,
  elements: ReadonlyArray<StudioElement>
): VideoSpeechIndex {
  const byId = new Map(elements.map((element) => [element.id, element]))
  const items = clips.flatMap((clip, order): IndexedSpeech[] => {
    if (!Number.isSafeInteger(clip.startFrame) || !Number.isSafeInteger(clip.endFrame)
      || clip.startFrame < 0 || clip.endFrame <= clip.startFrame) return []
    const speakerId = (clip.state ?? byId.get(clip.elementId))?.speakerCharacterId
    if (!speakerId) return []
    return [{ clip, speakerId, order, startFrame: clip.startFrame, endFrame: clip.endFrame }]
  }).sort((a, b) => a.startFrame - b.startFrame || a.order - b.order)

  let maxEnd = Number.NEGATIVE_INFINITY
  const prefixMaxEnd = items.map((entry) => {
    maxEnd = Math.max(maxEnd, entry.endFrame)
    return maxEnd
  })
  return { items, prefixMaxEnd }
}

/** Exact [start,end) semantics and original authored clip precedence. */
export function evaluateVideoSpeechIndex(index: VideoSpeechIndex, frame: number): VideoSpeechAtFrame {
  const modes = new Map<string, 'talk' | 'idle'>()
  const speechStartFrames = new Map<string, number>()
  if (!Number.isSafeInteger(frame) || frame < 0) return { modes, speechStartFrames }

  let low = 0
  let high = index.prefixMaxEnd.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (index.prefixMaxEnd[middle] <= frame) low = middle + 1
    else high = middle
  }
  const first = low
  high = index.items.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (index.items[middle].startFrame <= frame) low = middle + 1
    else high = middle
  }

  const active = index.items.slice(first, low)
    .filter((entry) => entry.endFrame > frame)
    .sort((a, b) => a.order - b.order)
  for (const { clip, speakerId } of active) {
    if (clip.kind === 'speech') {
      modes.set(speakerId, 'talk')
      const previousStart = speechStartFrames.get(speakerId)
      speechStartFrames.set(speakerId,
        previousStart === undefined ? clip.startFrame : Math.min(previousStart, clip.startFrame))
    } else if (modes.get(speakerId) !== 'talk') {
      modes.set(speakerId, 'idle')
    }
  }
  return { modes, speechStartFrames }
}
