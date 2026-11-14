import type { EditorV6FaceRenderMode, EditorV6Timeline } from './editorV6'

export function isEditorV6BlinkRenderMode(mode: EditorV6FaceRenderMode | undefined): boolean {
  return mode === 'blink' || mode === 'talk-blink'
}

/** Keep eyes open throughout a baked pose/expression transition, even while speech continues. */
export function editorV6FaceModeDuringMotion(mode: EditorV6FaceRenderMode | undefined): EditorV6FaceRenderMode | undefined {
  if (mode === 'talk-blink') return 'talk'
  if (mode === 'blink') return undefined
  return mode
}

const speechIndex = new WeakMap<EditorV6Timeline, Map<string, Array<{ start: number; end: number }>>>()

function speechIntervals(timeline: EditorV6Timeline): Map<string, Array<{ start: number; end: number }>> {
  let index = speechIndex.get(timeline)
  if (!index) {
    index = new Map()
    for (const track of timeline.tracks) {
      if (track.kind !== 'speech' || track.hidden || track.muted) continue
      for (const block of track.blocks) {
        const characterId = block.characterId ?? block.state?.characterId
        if (!characterId) continue
        const intervals = index.get(characterId) ?? []
        intervals.push({ start: block.startFrame, end: block.startFrame + block.durationFrames })
        index.set(characterId, intervals)
      }
    }
    for (const [characterId, intervals] of index) {
      intervals.sort((a, b) => a.start - b.start)
      const merged: typeof intervals = []
      for (const interval of intervals) {
        const previous = merged.at(-1)
        // Binary search requires disjoint intervals; nested balloons must not
        // hide the remaining duration of a longer speech interval.
        if (previous && interval.start <= previous.end) previous.end = Math.max(previous.end, interval.end)
        else merged.push({ ...interval })
      }
      index.set(characterId, merged)
    }
    speechIndex.set(timeline, index)
  }
  return index
}

export function isEditorV6CharacterSpeakingAtFrame(timeline: EditorV6Timeline, characterId: string, frame: number): boolean {
  const intervals = speechIntervals(timeline).get(characterId)
  if (!intervals?.length) return false
  let left = 0, right = intervals.length
  while (left < right) { const middle = (left + right) >>> 1; if (intervals[middle].start <= frame) left = middle + 1; else right = middle }
  return Boolean(intervals[left - 1] && frame < intervals[left - 1].end)
}

/** Binary-search the merged per-character speech intervals for an overlapping export range. */
export function hasEditorV6CharacterSpeechOverlap(timeline: EditorV6Timeline, characterId: string, startFrame: number, endFrame: number): boolean {
  if (endFrame <= startFrame) return false
  const intervals = speechIntervals(timeline).get(characterId)
  if (!intervals?.length) return false
  let left = 0, right = intervals.length
  while (left < right) { const middle = (left + right) >>> 1; if (intervals[middle].end <= startFrame) left = middle + 1; else right = middle }
  return Boolean(intervals[left] && intervals[left].start < endFrame)
}

/** Stable per-character schedule: a brief blink every 2.7–3.7 seconds. */
const blinkScheduleCache = new Map<string, { period: number; phase: number; length: number; secondBlink: boolean }>()
export function isEditorV6BlinkFrame(projectId: string, characterId: string, frame: number): boolean {
  const key = `${projectId}:${characterId}`
  let schedule = blinkScheduleCache.get(key)
  if (!schedule) {
    let hash = 2166136261
    for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0
    schedule = { period: 82 + hash % 31, phase: hash % (82 + hash % 31), length: 3 + (hash >>> 8) % 2, secondBlink: hash % 5 === 0 }
    blinkScheduleCache.set(key, schedule)
    if (blinkScheduleCache.size > 2048) blinkScheduleCache.delete(blinkScheduleCache.keys().next().value!)
  }
  const cycleFrame = ((frame + schedule.phase) % schedule.period + schedule.period) % schedule.period
  return cycleFrame < schedule.length || schedule.secondBlink && cycleFrame >= schedule.period - 3
}

export function editorV6FaceModeAtFrame(projectId: string, timeline: EditorV6Timeline, characterId: string, frame: number): EditorV6FaceRenderMode | undefined {
  const talking = isEditorV6CharacterSpeakingAtFrame(timeline, characterId, frame)
  const blinking = isEditorV6BlinkFrame(projectId, characterId, frame)
  return talking ? blinking ? 'talk-blink' : 'talk' : blinking ? 'blink' : undefined
}
