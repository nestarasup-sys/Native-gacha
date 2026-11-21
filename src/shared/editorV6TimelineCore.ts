/** Timeline structure, normalization, and indexed clip lookup. */
import type { EditorV6Document, EditorV6Element, EditorV6Timeline, EditorV6TimelineBlock, EditorV6TimelineTrack } from './editorV6'
import { editorV6TrackKindForElement, editorV6TrackLabel, orderEditorV6TimelineTracks } from './editorV6'

export type TimelineClip = { track: EditorV6TimelineTrack; block: EditorV6TimelineBlock }
export const MAX_TIMELINE_FRAME = 1_000_000
export const frameTimecode = (frame: number): string => {
  const seconds = Math.floor(frame / 30)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}:${String(frame % 30).padStart(2, '0')}`
}
export const compareEditorV6TimelineBlocks = (a: EditorV6TimelineBlock, b: EditorV6TimelineBlock) => a.startFrame - b.startFrame || a.id.localeCompare(b.id)
export function orderedEditorV6TimelineBlocks(blocks: EditorV6TimelineBlock[]): EditorV6TimelineBlock[] {
  for (let index = 1; index < blocks.length; index++) {
    if (compareEditorV6TimelineBlocks(blocks[index - 1], blocks[index]) > 0) {
      return [...blocks].sort(compareEditorV6TimelineBlocks)
    }
  }
  return blocks
}
export const timelineClips = (timeline: EditorV6Timeline): TimelineClip[] => timeline.tracks.flatMap((track) => track.blocks.map((block) => ({ track, block })))

/** Finds one block without allocating a flattened copy of the timeline. */
export function findEditorV6TimelineClip(timeline: EditorV6Timeline, blockId: string | null | undefined): TimelineClip | undefined {
  if (!blockId) return undefined
  for (const track of timeline.tracks) {
    const block = track.blocks.find((candidate) => candidate.id === blockId)
    if (block) return { track, block }
  }
  return undefined
}


export function addEditorV6ElementAtFrame(document: EditorV6Document, element: EditorV6Element, frame: number, blockId: string = crypto.randomUUID()): EditorV6Document {
  const kind = editorV6TrackKindForElement(element)
  const startFrame = Math.max(0, Math.min(MAX_TIMELINE_FRAME - 1, Math.round(frame)))
  const durationFrames = Math.min(kind === 'character' ? Math.max(1, document.timeline.durationFrames - startFrame) : 150, MAX_TIMELINE_FRAME - startFrame)
  const existing = document.timeline.tracks.find((track) => track.kind === kind && (kind !== 'character' || track.characterId === element.characterId))
  if (existing?.locked) return document
  const track: EditorV6TimelineTrack = existing ?? { id: crypto.randomUUID(), kind, name: kind === 'character' ? element.text.slice(0, 80) || 'Personagem' : editorV6TrackLabel(kind), characterId: kind === 'character' ? element.characterId : undefined, muted: false, locked: false, blocks: [] }
  const block: EditorV6TimelineBlock = { id: blockId, elementId: element.id, state: { ...element }, label: element.text.trim().slice(0, 120) || track.name, startFrame, durationFrames }
  let tracks = existing
    ? document.timeline.tracks.map((candidate) => candidate.id === track.id ? { ...candidate, blocks: [...candidate.blocks, block] } : candidate)
    : [...document.timeline.tracks]
  if (!existing) {
    if (kind === 'object') {
      const lastCharacter = tracks.reduce((last, candidate, index) => candidate.kind === 'character' ? index : last, -1)
      const audioIndex = tracks.findIndex((candidate) => candidate.kind === 'audio')
      const insertionIndex = Math.max(lastCharacter + 1, audioIndex >= 0 ? audioIndex : tracks.length)
      tracks.splice(insertionIndex, 0, { ...track, blocks: [block] })
    } else tracks.push({ ...track, blocks: [block] })
  }
  return { ...document, elements: document.elements.some((item) => item.id === element.id) ? document.elements : [...document.elements, element], timeline: normalizeEditorV6Timeline({ ...document.timeline, knownElementIds: [...new Set([...(document.timeline.knownElementIds ?? []), element.id])], durationFrames: Math.max(document.timeline.durationFrames, startFrame + durationFrames), tracks }) }
}
function updateTimelineBlocks(track: EditorV6TimelineTrack, update: (block: EditorV6TimelineBlock, index: number) => EditorV6TimelineBlock): EditorV6TimelineTrack {
  const source = track.blocks
  let blocks: EditorV6TimelineBlock[] | undefined
  for (let index = 0; index < source.length; index++) {
    const next = update(source[index], index)
    if (next !== source[index]) {
      blocks ??= source.slice()
      blocks[index] = next
    }
  }
  return blocks ? { ...track, blocks } : track
}

/** Character states hold until the next state. Linked comments use video-relative time. */
export function normalizeEditorV6Timeline(timeline: EditorV6Timeline): EditorV6Timeline {
  let end = Math.max(1, timeline.durationFrames)
  let tracks = timeline.tracks.map((track) => updateTimelineBlocks(track, (block) => {
    const startFrame = Math.min(MAX_TIMELINE_FRAME - 1, Math.max(0, Math.round(block.startFrame)))
    const durationFrames = Math.max(1, Math.min(Math.round(block.durationFrames), MAX_TIMELINE_FRAME - startFrame))
    end = Math.max(end, startFrame + (track.kind === 'character' || block.background ? 1 : durationFrames))
    return startFrame === block.startFrame && durationFrames === block.durationFrames ? block : { ...block, startFrame, durationFrames }
  }))
  const durationFrames = Math.min(MAX_TIMELINE_FRAME, end)
  tracks = tracks.map((track) => {
    if (track.kind !== 'character') return track
    const blocks = orderedEditorV6TimelineBlocks(track.blocks)
    const sorted = blocks === track.blocks ? track : { ...track, blocks }
    return updateTimelineBlocks(sorted, (block, index) => {
      const duration = Math.max(1, (sorted.blocks[index + 1]?.startFrame ?? durationFrames) - block.startFrame)
      return duration === block.durationFrames ? block : { ...block, durationFrames: duration }
    })
  })

  const backgrounds: EditorV6TimelineBlock[] = []
  for (const track of tracks) {
    for (const block of track.blocks) if (block.background) backgrounds.push(block)
  }
  if (backgrounds.length) {
    backgrounds.sort(compareEditorV6TimelineBlocks)
    const backgroundEnds = new Map(backgrounds.map((block, index) => [block.id, backgrounds[index + 1]?.startFrame ?? durationFrames]))
    tracks = tracks.map((track) => updateTimelineBlocks(track, (block) => {
      if (!block.background) return block
      const duration = Math.max(1, backgroundEnds.get(block.id)! - block.startFrame)
      return duration === block.durationFrames ? block : { ...block, durationFrames: duration }
    }))
  }

  const videoBlocks = new Map<string, EditorV6TimelineBlock>()
  for (const track of tracks) {
    if (track.kind === 'video') for (const block of track.blocks) videoBlocks.set(block.id, block)
  }
  if (videoBlocks.size) tracks = tracks.map((track) => {
    if (track.kind === 'video' || track.kind === 'character') return track
    return updateTimelineBlocks(track, (block) => {
      const parent = block.parentBlockId ? videoBlocks.get(block.parentBlockId) : undefined
      if (!parent) return block
      const relativeStartFrame = Math.min(parent.durationFrames - 1, Math.max(0, Math.round(block.relativeStartFrame ?? block.startFrame - parent.startFrame)))
      const startFrame = parent.startFrame + relativeStartFrame
      const duration = Math.max(1, Math.min(block.durationFrames, parent.durationFrames - relativeStartFrame))
      return relativeStartFrame === block.relativeStartFrame && startFrame === block.startFrame && duration === block.durationFrames
        ? block
        : { ...block, relativeStartFrame, startFrame, durationFrames: duration }
    })
  })
  return { ...timeline, durationFrames, tracks: orderEditorV6TimelineTracks(tracks) }
}

type ElementIndex = { clips: TimelineClip[]; maximumEnds: number[]; character: boolean }
type CompiledTimeline = { byElement: Map<string, ElementIndex>; managed: Set<string> }
const compiledCache = new WeakMap<EditorV6Timeline, CompiledTimeline>()
function compile(timeline: EditorV6Timeline): CompiledTimeline {
  const cached = compiledCache.get(timeline)
  if (cached) return cached
  const result: CompiledTimeline = { byElement: new Map(), managed: new Set(timeline.knownElementIds) }
  for (const track of timeline.tracks) {
    for (const block of track.blocks) {
      if (!block.elementId) continue
      const entry = result.byElement.get(block.elementId) ?? { clips: [], maximumEnds: [], character: track.kind === 'character' }
      entry.clips.push({ track, block })
      result.byElement.set(block.elementId, entry)
    }
  }
  for (const entry of result.byElement.values()) {
    if (entry.clips.some(({ block }, index, clips) => index > 0 && compareEditorV6TimelineBlocks(clips[index - 1].block, block) > 0)) {
      entry.clips.sort((a, b) => compareEditorV6TimelineBlocks(a.block, b.block))
    }
    if (entry.character) continue
    let end = 0
    entry.maximumEnds = entry.clips.map(({ block }) => { end = Math.max(end, block.startFrame + block.durationFrames); return end })
  }
  compiledCache.set(timeline, result)
  return result
}

export function editorV6ClipAtFrame(timeline: EditorV6Timeline, elementId: string, frame: number): TimelineClip | undefined {
  return clipAtFrame(compile(timeline).byElement.get(elementId), frame)
}

function clipAtFrame(entry: ElementIndex | undefined, frame: number): TimelineClip | undefined {
  if (!entry) return undefined
  let left = 0, right = entry.clips.length
  while (left < right) { const middle = (left + right) >>> 1; if (entry.clips[middle].block.startFrame <= frame) left = middle + 1; else right = middle }
  if (entry.character) return entry.clips[left - 1]
  for (let index = left - 1; index >= 0 && entry.maximumEnds[index] > frame; index--) {
    const clip = entry.clips[index]
    if (frame < clip.block.startFrame + clip.block.durationFrames) return clip
  }
  return undefined
}

export function resolveEditorV6StaticElementsAtFrame(document: EditorV6Document, frame: number): EditorV6Element[] {
  const compiled = compile(document.timeline)
  const resolved: EditorV6Element[] = []
  let ordered = true
  for (const base of document.elements) {
    const elementIndex = compiled.byElement.get(base.id)
    const clip = clipAtFrame(elementIndex, frame)
    if (clip?.track.muted || clip?.track.hidden) continue
    if (!clip && (compiled.managed.has(base.id) || elementIndex)) continue
    const state = clip?.block.state ?? base
    if (state.visible === false) continue
    const element = state.id === base.id ? state : { ...state, id: base.id }
    if (ordered && resolved.length && compareSceneElements(resolved[resolved.length - 1], element) > 0) ordered = false
    resolved.push(element)
  }
  return ordered ? resolved : resolved.sort(compareSceneElements)
}

const compareSceneElements = (a: EditorV6Element, b: EditorV6Element) => a.zIndex - b.zIndex || a.id.localeCompare(b.id)
