/** Frame-based timeline operations shared by preview, prints and persistence. */
import type { EditorV6BackgroundState, EditorV6Document, EditorV6Element, EditorV6Timeline, EditorV6TimelineBlock, EditorV6TimelineTrack } from './editorV6'
import { editorV6MediaUrl, editorV6TrackKindForElement, editorV6TrackLabel } from './editorV6'
import { editorV6MotionPlans, type EditorV6MotionPlan } from './editorV6Motion'
import { editorV6FaceModeAtFrame } from './editorV6FaceSchedule'
export { isEditorV6BlinkFrame } from './editorV6FaceSchedule'

export type TimelineClip = { track: EditorV6TimelineTrack; block: EditorV6TimelineBlock }
export const MAX_TIMELINE_FRAME = 1_000_000
export const frameTimecode = (frame: number): string => {
  const seconds = Math.floor(frame / 30)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}:${String(frame % 30).padStart(2, '0')}`
}
const byTime = (a: EditorV6TimelineBlock, b: EditorV6TimelineBlock) => a.startFrame - b.startFrame || a.id.localeCompare(b.id)
export const timelineClips = (timeline: EditorV6Timeline): TimelineClip[] => timeline.tracks.flatMap((track) => track.blocks.map((block) => ({ track, block })))

export function addEditorV6ElementAtFrame(document: EditorV6Document, element: EditorV6Element, frame: number, blockId: string = crypto.randomUUID()): EditorV6Document {
  const kind = editorV6TrackKindForElement(element)
  const startFrame = Math.max(0, Math.min(MAX_TIMELINE_FRAME - 1, Math.round(frame)))
  const durationFrames = Math.min(kind === 'character' ? Math.max(1, document.timeline.durationFrames - startFrame) : 150, MAX_TIMELINE_FRAME - startFrame)
  const existing = document.timeline.tracks.find((track) => track.kind === kind && (kind !== 'character' || track.characterId === element.characterId))
  if (existing?.locked) return document
  const track: EditorV6TimelineTrack = existing ?? { id: crypto.randomUUID(), kind, name: kind === 'character' ? element.text.slice(0, 80) || 'Personagem' : editorV6TrackLabel(kind), characterId: kind === 'character' ? element.characterId : undefined, muted: false, locked: false, blocks: [] }
  const block: EditorV6TimelineBlock = { id: blockId, elementId: element.id, state: { ...element }, label: element.text.trim().slice(0, 120) || track.name, startFrame, durationFrames }
  return { ...document, elements: document.elements.some((item) => item.id === element.id) ? document.elements : [...document.elements, element], timeline: normalizeEditorV6Timeline({ ...document.timeline, knownElementIds: [...new Set([...(document.timeline.knownElementIds ?? []), element.id])], durationFrames: Math.max(document.timeline.durationFrames, startFrame + durationFrames), tracks: existing ? document.timeline.tracks.map((candidate) => candidate.id === track.id ? { ...candidate, blocks: [...candidate.blocks, block] } : candidate) : [...document.timeline.tracks, { ...track, blocks: [block] }] }) }
}

/** Character states hold until the next state. Linked comments use video-relative time. */
export function normalizeEditorV6Timeline(timeline: EditorV6Timeline): EditorV6Timeline {
  let tracks = timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.map((original) => {
    const startFrame = Math.min(MAX_TIMELINE_FRAME - 1, Math.max(0, Math.round(original.startFrame)))
    return { ...original, startFrame, durationFrames: Math.max(1, Math.min(Math.round(original.durationFrames), MAX_TIMELINE_FRAME - startFrame)) }
  }) }))
  const durationFrames = Math.min(MAX_TIMELINE_FRAME, tracks.reduce((end, track) => Math.max(end, ...track.blocks.map((block) => block.startFrame + (track.kind === 'character' || block.background ? 1 : block.durationFrames))), Math.max(1, timeline.durationFrames)))
  tracks = tracks.map((track) => track.kind !== 'character' ? track : { ...track, blocks: [...track.blocks].sort(byTime).map((block, index, blocks) => ({
    ...block, durationFrames: Math.max(1, (blocks[index + 1]?.startFrame ?? durationFrames) - block.startFrame)
  })) })
  const backgrounds = tracks.flatMap((track) => track.blocks.filter((block) => block.background)).sort(byTime)
  const backgroundEnds = new Map(backgrounds.map((block, index) => [block.id, backgrounds[index + 1]?.startFrame ?? durationFrames]))
  tracks = tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => block.background ? { ...block, durationFrames: Math.max(1, backgroundEnds.get(block.id)! - block.startFrame) } : block) }))
  const videoBlocks = new Map(tracks.filter((track) => track.kind === 'video').flatMap((track) => track.blocks.map((block) => [block.id, block] as const)))
  tracks = tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => {
    const parent = block.parentBlockId ? videoBlocks.get(block.parentBlockId) : undefined
    if (!parent || track.kind === 'video' || track.kind === 'character') return block
    const relativeStartFrame = Math.min(parent.durationFrames - 1, Math.max(0, Math.round(block.relativeStartFrame ?? block.startFrame - parent.startFrame)))
    return { ...block, relativeStartFrame, startFrame: parent.startFrame + relativeStartFrame, durationFrames: Math.max(1, Math.min(block.durationFrames, parent.durationFrames - relativeStartFrame)) }
  }) }))
  return { ...timeline, durationFrames, tracks }
}

export type EditorV6ResolvedScene = { frame: number; background: EditorV6BackgroundState; elements: EditorV6Element[]; mediaVideo?: { mediaId: string; url: string; startFrame: number; sourceInFrame: number; durationFrames: number; hasAudio: boolean; audioEnabled: boolean; gain: number } }
const backgroundsCache = new WeakMap<EditorV6Timeline, TimelineClip[]>()
export function resolveEditorV6BackgroundAtFrame(document: EditorV6Document, frame: number): EditorV6BackgroundState {
  let backgrounds = backgroundsCache.get(document.timeline)
  if (!backgrounds) {
    backgrounds = timelineClips(document.timeline).filter(({ track, block }) => block.background && !track.hidden && !track.muted).sort((a, b) => byTime(a.block, b.block))
    backgroundsCache.set(document.timeline, backgrounds)
  }
  let left = 0, right = backgrounds.length
  while (left < right) { const middle = (left + right) >>> 1; if (backgrounds[middle].block.startFrame <= frame) left = middle + 1; else right = middle }
  const background = backgrounds[left - 1]?.block.background
  return background ?? {
    backgroundColor: document.backgroundColor, backgroundAssetId: document.backgroundAssetId,
    backgroundX: document.backgroundX, backgroundY: document.backgroundY,
    backgroundWidth: document.backgroundWidth, backgroundHeight: document.backgroundHeight, backgroundRotation: document.backgroundRotation
  }
}

export function resolveEditorV6SceneAtFrame(document: EditorV6Document, frame: number, options: { includeMotion?: boolean } = {}): EditorV6ResolvedScene {
  const normalizedFrame = Math.min(Math.max(0, document.timeline.durationFrames - 1), Math.max(0, Math.round(frame)))
  let videoClips = videoClipsCache.get(document.timeline)
  if (!videoClips) {
    videoClips = timelineClips(document.timeline).filter(({ track, block }) => track.kind === 'video' && !track.hidden && !track.muted && block.mediaId).sort((a, b) => byTime(a.block, b.block))
    videoClipsCache.set(document.timeline, videoClips)
  }
  let left = 0, right = videoClips.length
  while (left < right) { const middle = (left + right) >>> 1; if (videoClips[middle].block.startFrame <= normalizedFrame) left = middle + 1; else right = middle }
  let video: EditorV6TimelineBlock | undefined
  for (let index = left - 1; index >= 0; index--) {
    const candidate = videoClips[index].block
    if (normalizedFrame < candidate.startFrame + candidate.durationFrames) { video = candidate; break }
  }
  const media = video ? document.media?.find((item) => item.id === video.mediaId && item.kind === 'video') : undefined
  return { frame: normalizedFrame, background: resolveEditorV6BackgroundAtFrame(document, normalizedFrame), elements: resolveEditorV6ElementsAtFrame(document, normalizedFrame, options), ...(video && media ? { mediaVideo: { mediaId: media.id, url: editorV6MediaUrl(document.id, media.fileName), startFrame: video.startFrame, sourceInFrame: video.mediaInFrame ?? 0, durationFrames: video.durationFrames, hasAudio: media.hasAudio, audioEnabled: video.audioEnabled !== false, gain: video.gain ?? 1 } } : {}) }
}
const videoClipsCache = new WeakMap<EditorV6Timeline, TimelineClip[]>()

/** Background changes are persistent states on the visual lane. */
export function editEditorV6BackgroundAtFrame(document: EditorV6Document, frame: number, values: Partial<EditorV6BackgroundState>, blockId: string = crypto.randomUUID()): EditorV6Document {
  const track = document.timeline.tracks.find((candidate) => candidate.kind === 'video')
  if (track?.locked) return document
  const startFrame = Math.min(document.timeline.durationFrames - 1, Math.max(0, Math.round(frame)))
  const background = { ...resolveEditorV6BackgroundAtFrame(document, startFrame), ...values }
  const existing = track?.blocks.find((block) => block.background && block.startFrame === startFrame)
  const name = document.assets.find((asset) => asset.id === background.backgroundAssetId)?.name
  const block: EditorV6TimelineBlock = { id: existing?.id ?? blockId, label: `Fundo: ${name ?? background.backgroundColor}`.slice(0, 120), startFrame, durationFrames: document.timeline.durationFrames - startFrame, background }
  const target: EditorV6TimelineTrack = track ?? { id: crypto.randomUUID(), kind: 'video', name: 'Vídeo', muted: false, locked: false, blocks: [] }
  const blocks = [...target.blocks.filter((item) => item.id !== block.id), block]
  return { ...document, timeline: normalizeEditorV6Timeline({ ...document.timeline, tracks: track ? document.timeline.tracks.map((item) => item.id === target.id ? { ...item, blocks } : item) : [...document.timeline.tracks, { ...target, blocks }] }) }
}

/** Prepare a character edit at the cursor without committing a click or a cancelled gesture. */
export function prepareEditorV6PositionAtFrame(document: EditorV6Document, elementId: string, frame: number): { document: EditorV6Document; blockId: string } | null {
  const scene = resolveEditorV6SceneAtFrame(document, frame)
  const element = resolveEditorV6StaticElementsAtFrame(document, scene.frame).find((item) => item.id === elementId)
  const clip = editorV6ClipAtFrame(document.timeline, elementId, scene.frame)
  if (!element || element.positionLocked || clip?.track.locked) return null
  if (element.kind !== 'character') return clip ? { document, blockId: clip.block.id } : null
  if (clip && clip.block.startFrame === scene.frame) return { document, blockId: clip.block.id }
  const blockId = crypto.randomUUID()
  return { document: addEditorV6ElementAtFrame(document, element, scene.frame, blockId), blockId }
}

export function moveEditorV6ElementInPeriod(document: EditorV6Document, blockId: string, x: number, y: number): EditorV6Document {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return document
  const clip = timelineClips(document.timeline).find(({ block }) => block.id === blockId)
  if (!clip?.block.elementId || clip.track.locked) return document
  return editEditorV6DocumentAtBlock(document, blockId, (working) => ({ ...working, elements: working.elements.map((element) => element.id === clip.block.elementId ? { ...element, x, y } : element) }))
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

const motionIndex = new WeakMap<EditorV6Document['timeline'], Map<string, Array<{ plan: EditorV6MotionPlan; block: EditorV6TimelineBlock }>>>()
export function resolveEditorV6ElementsAtFrame(document: EditorV6Document, frame: number, options: { includeMotion?: boolean } = {}): EditorV6Element[] {
  const resolved = resolveEditorV6StaticElementsAtFrame(document, frame)
  const applyAutomaticFace = (source: EditorV6Element) => {
    let element = source
    if (element.kind === 'character' && element.characterId) {
      const autoMode = editorV6FaceModeAtFrame(document.id, document.timeline, element.characterId, frame)
      const autoAssetId = autoMode === 'talk-blink'
        ? element.faceModeAssetIds?.['talk-blink'] ?? element.faceModeAssetIds?.talk
        : autoMode ? element.faceModeAssetIds?.[autoMode] : undefined
      if (autoAssetId) element = { ...element, assetId: autoAssetId, motionSprite: undefined }
    }
    return element
  }
  if (options.includeMotion === false) return resolved.map(applyAutomaticFace)
  let index = motionIndex.get(document.timeline)
  if (!index) {
    index = new Map()
    const blocks = new Map(document.timeline.tracks.flatMap((track) => track.blocks.map((block) => [block.id, block] as const)))
    for (const plan of editorV6MotionPlans(document)) {
      const entries = index.get(plan.elementId) ?? []
      entries.push({ plan, block: blocks.get(plan.blockId)! }); index.set(plan.elementId, entries)
    }
    for (const entries of index.values()) entries.sort((a, b) => a.plan.endFrame - b.plan.endFrame)
    motionIndex.set(document.timeline, index)
  }
  return resolved.map((source) => {
    let element = applyAutomaticFace(source)
    const entries = index!.get(element.id)
    if (!entries) return element
    let left = 0, right = entries.length
    while (left < right) { const middle = (left + right) >>> 1; if (entries[middle].plan.endFrame <= frame) left = middle + 1; else right = middle }
    const next = entries[left]
    if (!next || frame <= next.plan.startFrame || frame >= next.plan.endFrame || next.block.incomingMotion?.key !== next.plan.key) return element
    const sample = next.block.incomingMotion.frames.find((sample) => sample.offset === frame - next.plan.endFrame)
    if (!sample) return element
    return { ...element, assetId: next.block.incomingMotion.assetId, motionSprite: sample.sprite, x: sample.x, y: sample.y, width: sample.width, height: sample.height, rotation: sample.rotation, flipX: sample.flipX, characterScale: 100, characterWidthScale: 100, characterHeightScale: 100 }
  })
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
    if (state.faceModeAssetIds) state.faceModeAssetIds = Object.fromEntries(Object.entries(state.faceModeAssetIds).map(([mode, id]) => [mode, id === beforeAsset.id ? snapshot.id : id])) as EditorV6Element['faceModeAssetIds']
    next = { ...next, assets: [...next.assets.filter((asset) => asset.id !== beforeAsset.id && asset.id !== snapshot.id), beforeAsset, snapshot] }
  }
  next = { ...next, elements: next.elements.map((element) => element.id === base.id ? base : element), timeline: { ...next.timeline, tracks: next.timeline.tracks.map((track) => ({
    ...track, blocks: track.blocks.map((block) => block.id === blockId ? { ...block, state, label: state.text.trim().slice(0, 120) || block.label } : block)
  })) } }
  return pruneEditorV6TimelineSnapshots(next)
}

export function pruneEditorV6TimelineSnapshots(document: EditorV6Document): EditorV6Document {
  const keys = new Map(editorV6MotionPlans(document).map((plan) => [plan.blockId, plan.key]))
  if (timelineClips(document.timeline).some(({ block }) => block.incomingMotion && keys.get(block.id) !== block.incomingMotion.key)) {
    document = { ...document, timeline: { ...document.timeline, tracks: document.timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => block.incomingMotion && keys.get(block.id) !== block.incomingMotion.key ? { ...block, incomingMotion: undefined } : block) })) } }
  }
  const referenced = new Set([document.backgroundAssetId,
    ...document.elements.flatMap((element) => [element.assetId, ...Object.values(element.faceModeAssetIds ?? {})]),
    ...timelineClips(document.timeline).flatMap(({ block }) => [block.state?.assetId, ...Object.values(block.state?.faceModeAssetIds ?? {}), block.background?.backgroundAssetId, block.incomingMotion?.assetId])])
  const assets = document.assets.filter((asset) => !asset.timelineSnapshot || referenced.has(asset.id))
  return assets.length === document.assets.length ? document : { ...document, assets }
}

/** Drop optional facial mode links whose image was removed by an edit or legacy cleanup. */
export function repairEditorV6FaceModeAssetReferences(document: EditorV6Document): EditorV6Document {
  const characterAssets = new Set(document.assets.filter((asset) => asset.category === 'character').map((asset) => asset.id))
  const repairElement = (element: EditorV6Element): EditorV6Element => {
    if (!element.faceModeAssetIds) return element
    const previous = element.faceModeAssetIds
    const faceModeAssetIds = Object.fromEntries(Object.entries(previous).filter(([, assetId]) => assetId && characterAssets.has(assetId))) as NonNullable<EditorV6Element['faceModeAssetIds']>
    return Object.keys(faceModeAssetIds).length === Object.keys(previous).length ? element : { ...element, faceModeAssetIds }
  }
  const elements = document.elements.map(repairElement)
  let changed = elements.some((element, index) => element !== document.elements[index])
  const tracks = document.timeline.tracks.map((track) => {
    let trackChanged = false
    const blocks = track.blocks.map((block) => {
      if (!block.state) return block
      const state = repairElement(block.state)
      if (state === block.state) return block
      trackChanged = true
      return { ...block, state }
    })
    if (!trackChanged) return track
    changed = true
    return { ...track, blocks }
  })
  return changed ? { ...document, elements, timeline: { ...document.timeline, tracks } } : document
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
  const persistent = clip.track.kind === 'character' || Boolean(clip.block.background)
  const sorted = clip.track.blocks.filter((block) => !clip.block.background || block.background).sort(byTime), index = sorted.findIndex((block) => block.id === blockId)
  let startFrame = Math.max(0, Math.min(MAX_TIMELINE_FRAME - 1, Math.round(values.startFrame ?? clip.block.startFrame)))
  let durationFrames = Math.max(1, Math.min(MAX_TIMELINE_FRAME - startFrame, Math.round(values.durationFrames ?? clip.block.durationFrames)))
  let nextStart: number | undefined
  if (persistent) {
    startFrame = Math.max(sorted[index - 1] ? sorted[index - 1].startFrame + 1 : 0, Math.min(sorted[index + 1] ? sorted[index + 1].startFrame - 1 : MAX_TIMELINE_FRAME - 1, startFrame))
    durationFrames = Math.max(1, Math.min(durationFrames, MAX_TIMELINE_FRAME - startFrame))
    if (values.durationFrames !== undefined && sorted[index + 1]) nextStart = Math.max(startFrame + 1, Math.min(startFrame + durationFrames, sorted[index + 2] ? sorted[index + 2].startFrame - 1 : MAX_TIMELINE_FRAME - 1))
  }
  const parent = clip.block.parentBlockId ? timelineClips(timeline).find(({ block }) => block.id === clip.block.parentBlockId)?.block : undefined
  const tracks = timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => block.id === blockId ? { ...block, startFrame, durationFrames, ...(parent ? { relativeStartFrame: Math.max(0, startFrame - parent.startFrame) } : {}) } : block.id === sorted[index + 1]?.id && nextStart !== undefined ? { ...block, startFrame: nextStart } : block) }))
  return normalizeEditorV6Timeline({ ...timeline, tracks, durationFrames: persistent && values.durationFrames !== undefined && !sorted[index + 1] ? startFrame + durationFrames : Math.max(timeline.durationFrames, startFrame + durationFrames) })
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
  const persistent = clip.track.kind === 'character' || Boolean(clip.block.background)
  const copyId = crypto.randomUUID(), startFrame = clip.block.startFrame + clip.block.durationFrames
  const copy = { ...clip.block, id: copyId, startFrame, ...(clip.block.parentBlockId ? { relativeStartFrame: (clip.block.relativeStartFrame ?? 0) + clip.block.durationFrames } : {}) }
  const tracks = timeline.tracks.map((track) => ({ ...track, blocks: [
    ...track.blocks.map((block) => track.id === clip.track.id && persistent && (!clip.block.background || block.background) && block.startFrame >= startFrame ? { ...block, startFrame: block.startFrame + copy.durationFrames } : block),
    ...(track.id === clip.track.id ? [copy] : []),
    ...track.blocks.filter((block) => block.parentBlockId === blockId).map((block) => ({ ...block, id: crypto.randomUUID(), parentBlockId: copyId, startFrame: startFrame + (block.relativeStartFrame ?? block.startFrame - clip.block.startFrame) }))
  ] }))
  return normalizeEditorV6Timeline({ ...timeline, durationFrames: Math.max(timeline.durationFrames + (persistent ? copy.durationFrames : 0), startFrame + copy.durationFrames), tracks })
}
