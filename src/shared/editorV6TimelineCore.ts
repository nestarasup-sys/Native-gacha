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
export const timelineClips = (timeline: EditorV6Timeline): TimelineClip[] => timeline.tracks.flatMap((track) => track.blocks.map((block) => ({ track, block })))

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
/** Character states hold until the next state. Linked comments use video-relative time. */
export function normalizeEditorV6Timeline(timeline: EditorV6Timeline): EditorV6Timeline {
  let tracks = timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.map((original) => {
    const startFrame = Math.min(MAX_TIMELINE_FRAME - 1, Math.max(0, Math.round(original.startFrame)))
    return { ...original, startFrame, durationFrames: Math.max(1, Math.min(Math.round(original.durationFrames), MAX_TIMELINE_FRAME - startFrame)) }
  }) }))
  const durationFrames = Math.min(MAX_TIMELINE_FRAME, tracks.reduce((end, track) => Math.max(end, ...track.blocks.map((block) => block.startFrame + (track.kind === 'character' || block.background ? 1 : block.durationFrames))), Math.max(1, timeline.durationFrames)))
  tracks = tracks.map((track) => track.kind !== 'character' ? track : { ...track, blocks: [...track.blocks].sort(compareEditorV6TimelineBlocks).map((block, index, blocks) => ({
    ...block, durationFrames: Math.max(1, (blocks[index + 1]?.startFrame ?? durationFrames) - block.startFrame)
  })) })
  const backgrounds = tracks.flatMap((track) => track.blocks.filter((block) => block.background)).sort(compareEditorV6TimelineBlocks)
  const backgroundEnds = new Map(backgrounds.map((block, index) => [block.id, backgrounds[index + 1]?.startFrame ?? durationFrames]))
  tracks = tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => block.background ? { ...block, durationFrames: Math.max(1, backgroundEnds.get(block.id)! - block.startFrame) } : block) }))
  const videoBlocks = new Map(tracks.filter((track) => track.kind === 'video').flatMap((track) => track.blocks.map((block) => [block.id, block] as const)))
  tracks = tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => {
    const parent = block.parentBlockId ? videoBlocks.get(block.parentBlockId) : undefined
    if (!parent || track.kind === 'video' || track.kind === 'character') return block
    const relativeStartFrame = Math.min(parent.durationFrames - 1, Math.max(0, Math.round(block.relativeStartFrame ?? block.startFrame - parent.startFrame)))
    return { ...block, relativeStartFrame, startFrame: parent.startFrame + relativeStartFrame, durationFrames: Math.max(1, Math.min(block.durationFrames, parent.durationFrames - relativeStartFrame)) }
  }) }))
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
    for (const block of [...track.blocks].sort(compareEditorV6TimelineBlocks)) {
      if (!block.elementId) continue
      const entry = result.byElement.get(block.elementId) ?? { clips: [], maximumEnds: [], character: track.kind === 'character' }
      entry.clips.push({ track, block })
      result.byElement.set(block.elementId, entry)
    }
  }
  for (const entry of result.byElement.values()) {
    entry.clips.sort((a, b) => compareEditorV6TimelineBlocks(a.block, b.block))
    let end = 0
    entry.maximumEnds = entry.clips.map(({ block }) => { end = Math.max(end, block.startFrame + block.durationFrames); return end })
  }
  compiledCache.set(timeline, result)
  return result
}

export function editorV6ClipAtFrame(timeline: EditorV6Timeline, elementId: string, frame: number): TimelineClip | undefined {
  const entry = compile(timeline).byElement.get(elementId)
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
  for (const base of document.elements) {
    const clip = editorV6ClipAtFrame(document.timeline, base.id, frame)
    if (clip?.track.muted || clip?.track.hidden) continue
    if (!clip && (compiled.managed.has(base.id) || compiled.byElement.has(base.id))) continue
    const state = clip?.block.state ?? base
    if (state.visible === false) continue
    resolved.push(state.id === base.id ? state : { ...state, id: base.id })
  }
  return resolved.sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id))
}
