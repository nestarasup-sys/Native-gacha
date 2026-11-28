import { EDITOR_V6_TIMELINE_FPS } from './editorV6Timing'
import type { EditorV6FaceRenderMode, EditorV6Timeline } from './editorV6'
import { editorV6UpperBound } from './editorV6SortedSearch'

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
  const left = editorV6UpperBound(intervals, frame, interval => interval.start)
  return Boolean(intervals[left - 1] && frame < intervals[left - 1].end)
}

/** Binary-search the merged per-character speech intervals for an overlapping export range. */
export function hasEditorV6CharacterSpeechOverlap(timeline: EditorV6Timeline, characterId: string, startFrame: number, endFrame: number): boolean {
  if (endFrame <= startFrame) return false
  const intervals = speechIntervals(timeline).get(characterId)
  if (!intervals?.length) return false
  const left = editorV6UpperBound(intervals, startFrame, interval => interval.end)
  return Boolean(intervals[left] && intervals[left].start < endFrame)
}

/** The project clock is independent of playback order and export worker ranges. */
const schedules = new Map<string, { state: number; events: Array<{ start: number; roll: number }> }>()
export function editorV6BlinkEventAtFrame(projectId: string, frame: number) {
  const fps = EDITOR_V6_TIMELINE_FPS
  const minimum = Math.ceil(2.5 * fps), maximum = Math.floor(3.5 * fps)
  const duration = 4
  if (frame < minimum) return undefined
  let schedule = schedules.get(projectId)
  if (!schedule) {
    let seed = 2166136261
    for (const character of projectId) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619)
    schedule = { state: seed, events: [] }
    schedules.set(projectId, schedule)
    if (schedules.size > 8) schedules.delete(schedules.keys().next().value!)
  }
  const { events } = schedule
  const random = () => {
    let value = schedule.state = (schedule.state + 0x6d2b79f5) | 0
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 0x100000000
  }
  while (!events.length || events[events.length - 1].start <= frame) {
    const previous = events.at(-1)
    const start = (previous?.start ?? 0) + minimum + Math.floor(random() * (maximum - minimum + 1))
    events.push({ start, roll: random() })
  }
  const event = events[editorV6UpperBound(events, frame, item => item.start) - 1]
  return event && frame < event.start + duration ? event : undefined
}

export function editorV6FaceModeAtFrame(timeline: EditorV6Timeline, characterId: string, frame: number, options: { includeSpeechMouth?: boolean; blinking?: boolean } = {}): EditorV6FaceRenderMode | undefined {
  const talking = options.includeSpeechMouth !== false && isEditorV6CharacterSpeakingAtFrame(timeline, characterId, frame)
  return talking ? options.blinking ? 'talk-blink' : 'talk' : options.blinking ? 'blink' : undefined
}
