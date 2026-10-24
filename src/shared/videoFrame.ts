import type { VideoMediaClip, VideoTimelineDocument } from './studio'

export type VideoFrameSelection = {
  hiddenCharacterIds: Set<string>
  textClipByElementId: Map<string, VideoTimelineDocument['textClips'][number]>
  videoClips: VideoMediaClip[]
}

type Interval = { startFrame: number; endFrame: number }
type IntervalEntry<T extends Interval> = Readonly<{ item: T; originalIndex: number }>
type IntervalIndex<T extends Interval> = Readonly<{
  entries: readonly IntervalEntry<T>[]
  prefixMaxEnd: readonly number[]
}>

/**
 * At 60 FPS, scanning ALL clips/gaps for every playhead update scales with the
 * total length of a project rather than what is visible now. Index immutable
 * timeline arrays once and query only intervals that can overlap the frame.
 * Original array order is restored because overlapping clips use first-wins
 * semantics for text, and clip order matters to the stage compositor.
 */
function buildIntervalIndex<T extends Interval>(items: readonly T[]): IntervalIndex<T> {
  const entries = items.flatMap((item, originalIndex) =>
    Number.isInteger(item.startFrame) && Number.isInteger(item.endFrame) && item.endFrame > item.startFrame
      ? [{ item, originalIndex }] : [],
  ).sort((left, right) => left.item.startFrame - right.item.startFrame || left.originalIndex - right.originalIndex)
  const prefixMaxEnd: number[] = []
  let latestEnd = -Infinity
  for (const entry of entries) {
    latestEnd = Math.max(latestEnd, entry.item.endFrame)
    prefixMaxEnd.push(latestEnd)
  }
  return { entries, prefixMaxEnd }
}

function intervalsAt<T extends Interval>(index: IntervalIndex<T>, frame: number): T[] {
  const { entries, prefixMaxEnd } = index
  let lo = 0, hi = entries.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (entries[mid].item.startFrame <= frame) lo = mid + 1
    else hi = mid
  }
  const matches: IntervalEntry<T>[] = []
  for (let pos = lo - 1; pos >= 0 && prefixMaxEnd[pos] > frame; pos--) {
    if (entries[pos].item.endFrame > frame) matches.push(entries[pos])
  }
  matches.sort((a, b) => a.originalIndex - b.originalIndex)
  return matches.map(entry => entry.item)
}

type SelectionIndex = Readonly<{
  gapsRef: VideoTimelineDocument['characterGaps']
  textRef: VideoTimelineDocument['textClips']
  clipsRef: VideoTimelineDocument['videoClips']
  gaps: IntervalIndex<NonNullable<VideoTimelineDocument['characterGaps']>[number]>
  text: IntervalIndex<VideoTimelineDocument['textClips'][number]>
  clips: IntervalIndex<VideoMediaClip>
}>
const selectionIndices = new WeakMap<VideoTimelineDocument, SelectionIndex>()

function selectionIndex(timeline: VideoTimelineDocument): SelectionIndex {
  const previous = selectionIndices.get(timeline)
  if (previous && previous.gapsRef === timeline.characterGaps
    && previous.textRef === timeline.textClips && previous.clipsRef === timeline.videoClips) return previous
  const next: SelectionIndex = {
    gapsRef: timeline.characterGaps,
    textRef: timeline.textClips,
    clipsRef: timeline.videoClips,
    gaps: buildIntervalIndex(timeline.characterGaps ?? []),
    text: buildIntervalIndex(timeline.textClips),
    clips: buildIntervalIndex(timeline.videoClips ?? []),
  }
  selectionIndices.set(timeline, next)
  return next
}

/** Resolve timeline visibility from an absolute frame, independent of playback state. */
export function resolveVideoFrameSelection(timeline: VideoTimelineDocument, frame: number): VideoFrameSelection {
  const hiddenCharacterIds = new Set<string>()
  const textClipByElementId = new Map<string, VideoTimelineDocument['textClips'][number]>()
  const videoClips: VideoMediaClip[] = []
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= timeline.durationFrames) {
    return { hiddenCharacterIds, textClipByElementId, videoClips }
  }
  const index = selectionIndex(timeline)
  for (const gap of intervalsAt(index.gaps, frame)) hiddenCharacterIds.add(gap.elementId)
  for (const clip of intervalsAt(index.text, frame)) {
    if (!textClipByElementId.has(clip.elementId)) textClipByElementId.set(clip.elementId, clip)
  }
  videoClips.push(...intervalsAt(index.clips, frame))
  return { hiddenCharacterIds, textClipByElementId, videoClips }
}

/** Deterministic facial animation helpers shared by preview and export. */
export function automaticBlinkFrameFor(frame: number, characterId: string, frameRate = 60): boolean {
  if (!Number.isSafeInteger(frame) || frame < 0 || !Number.isFinite(frameRate) || frameRate <= 0 || !characterId) return false
  let hash = 2166136261
  for (let index = 0; index < characterId.length; index++) {
    hash ^= characterId.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  const stable = hash >>> 0
  const period = Math.max(1, Math.round(frameRate * (3.2 + (stable % 1800) / 1000)))
  const offset = Math.floor(stable / 1800) % period
  const phase = ((frame + offset) % period + period) % period
  return phase < Math.max(1, Math.round(frameRate * 0.12))
}
