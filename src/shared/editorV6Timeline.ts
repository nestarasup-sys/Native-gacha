/** Frame-based timeline operations shared by preview, prints and persistence. */
import type { EditorV6Document, EditorV6Element, EditorV6Timeline, EditorV6TimelineBlock, EditorV6TimelineTrack } from './editorV6'
import { editorV6TrackKindForElement, editorV6TrackLabel } from './editorV6'

export type TimelineClip = { track: EditorV6TimelineTrack; block: EditorV6TimelineBlock }
export const MAX_TIMELINE_FRAME = 1_000_000
export const frameTimecode = (frame: number): string => {
  const seconds = Math.floor(frame / 30)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}:${String(frame % 30).padStart(2, '0')}`
}
const byTime = (a: EditorV6TimelineBlock, b: EditorV6TimelineBlock) => a.startFrame - b.startFrame || a.id.localeCompare(b.id)
export const timelineClips = (timeline: EditorV6Timeline): TimelineClip[] => timeline.tracks.flatMap((track) => track.blocks.map((block) => ({ track, block })))

export function addEditorV6ElementAtFrame(document: EditorV6Document, element: EditorV6Element, frame: number, blockId = crypto.randomUUID()): EditorV6Document {
  const kind = editorV6TrackKindForElement(element)
  const startFrame = Math.max(0, Math.min(MAX_TIMELINE_FRAME - 1, Math.round(frame)))
  const durationFrames = Math.min(150, MAX_TIMELINE_FRAME - startFrame)
  const existing = document.timeline.tracks.find((track) => track.kind === kind && (kind !== 'character' || track.characterId === element.characterId))
  if (existing?.locked) return document
  const track: EditorV6TimelineTrack = existing ?? { id: crypto.randomUUID(), kind, name: kind === 'character' ? element.text.slice(0, 80) || 'Personagem' : editorV6TrackLabel(kind), characterId: kind === 'character' ? element.characterId : undefined, muted: false, locked: false, blocks: [] }
  const block: EditorV6TimelineBlock = { id: blockId, elementId: element.id, state: { ...element }, label: element.text.trim().slice(0, 120) || track.name, startFrame, durationFrames }
  return { ...document, elements: document.elements.some((item) => item.id === element.id) ? document.elements : [...document.elements, element], timeline: normalizeEditorV6Timeline({ ...document.timeline, knownElementIds: [...new Set([...(document.timeline.knownElementIds ?? []), element.id])], durationFrames: Math.max(document.timeline.durationFrames, startFrame + durationFrames), tracks: existing ? document.timeline.tracks.map((candidate) => candidate.id === track.id ? { ...candidate, blocks: [...candidate.blocks, block] } : candidate) : [...document.timeline.tracks, { ...track, blocks: [block] }] }) }
}

/** Character states hold until the next state. Linked comments use video-relative time. */
export function normalizeEditorV6Timeline(timeline: EditorV6Timeline): EditorV6Timeline {
  const videoBlocks = new Map(timeline.tracks.filter((track) => track.kind === 'video').flatMap((track) => track.blocks.map((block) => [block.id, block] as const)))
  let tracks = timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.map((original) => {
    const startFrame = Math.min(MAX_TIMELINE_FRAME - 1, Math.max(0, Math.round(original.startFrame)))
    const block = { ...original, startFrame, durationFrames: Math.max(1, Math.min(Math.round(original.durationFrames), MAX_TIMELINE_FRAME - startFrame)) }
    const parent = block.parentBlockId ? videoBlocks.get(block.parentBlockId) : undefined
    if (!parent || track.kind === 'video' || track.kind === 'character') return block
    const relativeStartFrame = Math.min(parent.durationFrames - 1, Math.max(0, Math.round(block.relativeStartFrame ?? block.startFrame - parent.startFrame)))
    return { ...block, relativeStartFrame, startFrame: parent.startFrame + relativeStartFrame, durationFrames: Math.max(1, Math.min(block.durationFrames, parent.durationFrames - relativeStartFrame)) }
  }) }))
  const durationFrames = Math.min(MAX_TIMELINE_FRAME, tracks.reduce((end, track) => Math.max(end, ...track.blocks.map((block) => block.startFrame + (track.kind === 'character' ? 1 : block.durationFrames))), Math.max(1, timeline.durationFrames)))
  tracks = tracks.map((track) => track.kind !== 'character' ? track : { ...track, blocks: [...track.blocks].sort(byTime).map((block, index, blocks) => ({
    ...block, durationFrames: Math.max(1, (blocks[index + 1]?.startFrame ?? durationFrames) - block.startFrame)
  })) })
  return { ...timeline, durationFrames, tracks }
}

type ElementIndex = { clips: TimelineClip[]; maximumEnds: number[]; character: boolean }
type CompiledTimeline = { byElement: Map<string, ElementIndex>; managed: Set<string> }
const compiledCache = new WeakMap<EditorV6Timeline, CompiledTimeline>()
function compile(timeline: EditorV6Timeline): CompiledTimeline {
  const cached = compiledCache.get(timeline)
  if (cached) return cached
  const result: CompiledTimeline = { byElement: new Map(), managed: new Set(timeline.knownElementIds) }
  for (const track of timeline.tracks) {
    for (const block of [...track.blocks].sort(byTime)) {
      if (!block.elementId) continue
      const entry = result.byElement.get(block.elementId) ?? { clips: [], maximumEnds: [], character: track.kind === 'character' }
      entry.clips.push({ track, block })
      result.byElement.set(block.elementId, entry)
    }
  }
  for (const entry of result.byElement.values()) {
    entry.clips.sort((a, b) => byTime(a.block, b.block))
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

export function resolveEditorV6ElementsAtFrame(document: EditorV6Document, frame: number): EditorV6Element[] {
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

/** Make an inspector edit affect only its selected period; rendered images use copy-on-write. */
export function editEditorV6DocumentAtBlock(document: EditorV6Document, blockId: string | null, transform: (document: EditorV6Document) => EditorV6Document): EditorV6Document {
  const clip = blockId ? timelineClips(document.timeline).find(({ block }) => block.id === blockId) : undefined
  const base = clip?.block.elementId ? document.elements.find((element) => element.id === clip.block.elementId) : undefined
  if (!clip || !base) return transform(document)
  const before = clip.block.state ?? base
  const working = { ...document, elements: document.elements.map((element) => element.id === base.id ? before : element) }
  let next = transform(working)
  const edited = next.elements.find((element) => element.id === base.id)
  if (!edited) return clip.track.locked ? document : next
  const beforeAsset = document.assets.find((asset) => asset.id === before.assetId)
  const afterAsset = next.assets.find((asset) => asset.id === edited.assetId)
  const imageChanged = beforeAsset && afterAsset && beforeAsset.id === afterAsset.id && beforeAsset.dataUrl !== afterAsset.dataUrl
  if (clip.track.locked && (edited !== before || imageChanged)) return document
  if (edited === before && !imageChanged) return { ...next, elements: next.elements.map((element) => element.id === base.id ? base : element) }
  let state = { ...edited }
  if (imageChanged) {
    const snapshot = next.assets.find((asset) => asset.id !== beforeAsset.id && asset.timelineSnapshot && asset.dataUrl === afterAsset.dataUrl)
      ?? { ...afterAsset, id: crypto.randomUUID(), timelineSnapshot: true }
    state.assetId = snapshot.id
    next = { ...next, assets: [...next.assets.filter((asset) => asset.id !== beforeAsset.id && asset.id !== snapshot.id), beforeAsset, snapshot] }
  }
  next = { ...next, elements: next.elements.map((element) => element.id === base.id ? base : element), timeline: { ...next.timeline, tracks: next.timeline.tracks.map((track) => ({
    ...track, blocks: track.blocks.map((block) => block.id === blockId ? { ...block, state, label: state.text.trim().slice(0, 120) || block.label } : block)
  })) } }
  return pruneEditorV6TimelineSnapshots(next)
}

export function pruneEditorV6TimelineSnapshots(document: EditorV6Document): EditorV6Document {
  const referenced = new Set([document.backgroundAssetId, ...document.elements.map((element) => element.assetId), ...timelineClips(document.timeline).map(({ block }) => block.state?.assetId)])
  const assets = document.assets.filter((asset) => !asset.timelineSnapshot || referenced.has(asset.id))
  return assets.length === document.assets.length ? document : { ...document, assets }
}

/** Recover duplicate image IDs from a live editor session without dropping either image. */
export function repairEditorV6DuplicateAssets(document: EditorV6Document, selectedBlockId: string | null): EditorV6Document {
  const seen = new Set<string>(), replaced = new Map<string, string>()
  const assets = document.assets.map((asset) => {
    if (!seen.has(asset.id)) { seen.add(asset.id); return asset }
    const id = crypto.randomUUID()
    replaced.set(asset.id, id)
    return { ...asset, id, timelineSnapshot: true }
  })
  if (!replaced.size) return document
  return { ...document, assets, timeline: { ...document.timeline, tracks: document.timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => block.id === selectedBlockId && block.state?.assetId && replaced.has(block.state.assetId) ? { ...block, state: { ...block.state, assetId: replaced.get(block.state.assetId) } } : block) })) } }
}

export function snapEditorV6Frame(timeline: EditorV6Timeline, frame: number, cursor: number, excludeId: string, threshold: number, duration = 0): { frame: number; guide?: number } {
  const points = [0, timeline.durationFrames, cursor]
  for (const { block } of timelineClips(timeline)) if (block.id !== excludeId && block.parentBlockId !== excludeId) points.push(block.startFrame, block.startFrame + block.durationFrames)
  let best = Math.round(frame), distance = threshold + 1, guide: number | undefined
  for (const point of points) for (const edge of [0, duration]) {
    const candidate = point - edge
    if (candidate < 0) continue
    const delta = Math.abs(candidate - frame)
    if (delta <= threshold && delta < distance) { best = candidate; distance = delta; guide = point }
  }
  return { frame: Math.max(0, best), guide }
}

/** Numeric edits obey the same one-frame boundaries as dragging. */
export function setEditorV6BlockTiming(timeline: EditorV6Timeline, blockId: string, values: { startFrame?: number; durationFrames?: number }): EditorV6Timeline {
  const clip = timelineClips(timeline).find(({ block }) => block.id === blockId)
  if (!clip || clip.track.locked) return timeline
  const sorted = [...clip.track.blocks].sort(byTime), index = sorted.findIndex((block) => block.id === blockId)
  let startFrame = Math.max(0, Math.min(MAX_TIMELINE_FRAME - 1, Math.round(values.startFrame ?? clip.block.startFrame)))
  let durationFrames = Math.max(1, Math.min(MAX_TIMELINE_FRAME - startFrame, Math.round(values.durationFrames ?? clip.block.durationFrames)))
  let nextStart: number | undefined
  if (clip.track.kind === 'character') {
    startFrame = Math.max(sorted[index - 1] ? sorted[index - 1].startFrame + 1 : 0, Math.min(sorted[index + 1] ? sorted[index + 1].startFrame - 1 : MAX_TIMELINE_FRAME - 1, startFrame))
    durationFrames = Math.max(1, Math.min(durationFrames, MAX_TIMELINE_FRAME - startFrame))
    if (values.durationFrames !== undefined && sorted[index + 1]) nextStart = Math.max(startFrame + 1, Math.min(startFrame + durationFrames, sorted[index + 2] ? sorted[index + 2].startFrame - 1 : MAX_TIMELINE_FRAME - 1))
  }
  const parent = clip.block.parentBlockId ? timelineClips(timeline).find(({ block }) => block.id === clip.block.parentBlockId)?.block : undefined
  const tracks = timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => block.id === blockId ? { ...block, startFrame, durationFrames, ...(parent ? { relativeStartFrame: Math.max(0, startFrame - parent.startFrame) } : {}) } : block.id === sorted[index + 1]?.id && nextStart !== undefined ? { ...block, startFrame: nextStart } : block) }))
  return normalizeEditorV6Timeline({ ...timeline, tracks, durationFrames: clip.track.kind === 'character' && values.durationFrames !== undefined && !sorted[index + 1] ? startFrame + durationFrames : Math.max(timeline.durationFrames, startFrame + durationFrames) })
}

export function splitEditorV6Block(timeline: EditorV6Timeline, blockId: string, frame: number): EditorV6Timeline {
  const clip = timelineClips(timeline).find(({ block }) => block.id === blockId)
  if (!clip || clip.track.locked || frame <= clip.block.startFrame || frame >= clip.block.startFrame + clip.block.durationFrames) return timeline
  const cut = frame - clip.block.startFrame
  const right = { ...clip.block, id: crypto.randomUUID(), startFrame: frame, durationFrames: clip.block.durationFrames - cut,
    ...(clip.block.parentBlockId ? { relativeStartFrame: (clip.block.relativeStartFrame ?? 0) + cut } : {}),
    ...(clip.block.mediaInFrame !== undefined ? { mediaInFrame: clip.block.mediaInFrame + cut } : {}) }
  const tracks = timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.flatMap((block) => {
    if (block.id === blockId) return [{ ...block, durationFrames: cut }, right]
    if (block.parentBlockId !== blockId) return [block]
    const end = block.startFrame + block.durationFrames
    if (block.startFrame >= frame) return [{ ...block, parentBlockId: right.id, relativeStartFrame: block.startFrame - frame }]
    if (end <= frame) return [block]
    return [{ ...block, durationFrames: frame - block.startFrame }, { ...block, id: crypto.randomUUID(), parentBlockId: right.id, startFrame: frame, relativeStartFrame: 0, durationFrames: end - frame }]
  }) }))
  return normalizeEditorV6Timeline({ ...timeline, tracks })
}

export function duplicateEditorV6Block(timeline: EditorV6Timeline, blockId: string): EditorV6Timeline {
  const clip = timelineClips(timeline).find(({ block }) => block.id === blockId)
  if (!clip || clip.track.locked) return timeline
  const copyId = crypto.randomUUID(), startFrame = clip.block.startFrame + clip.block.durationFrames
  const copy = { ...clip.block, id: copyId, startFrame, ...(clip.block.parentBlockId ? { relativeStartFrame: (clip.block.relativeStartFrame ?? 0) + clip.block.durationFrames } : {}) }
  const tracks = timeline.tracks.map((track) => ({ ...track, blocks: [
    ...track.blocks.map((block) => track.id === clip.track.id && track.kind === 'character' && block.startFrame >= startFrame ? { ...block, startFrame: block.startFrame + copy.durationFrames } : block),
    ...(track.id === clip.track.id ? [copy] : []),
    ...track.blocks.filter((block) => block.parentBlockId === blockId).map((block) => ({ ...block, id: crypto.randomUUID(), parentBlockId: copyId, startFrame: startFrame + (block.relativeStartFrame ?? block.startFrame - clip.block.startFrame) }))
  ] }))
  return normalizeEditorV6Timeline({ ...timeline, durationFrames: Math.max(timeline.durationFrames + (clip.track.kind === 'character' ? copy.durationFrames : 0), startFrame + copy.durationFrames), tracks })
}
