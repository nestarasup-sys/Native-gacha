/** Timeline editing, position persistence, and asset repair operations. */
import type { EditorV6Asset, EditorV6Document, EditorV6Element, EditorV6Timeline } from './editorV6'
import { editorV6MotionPlans } from './editorV6Motion'
import { compareEditorV6TimelineBlocks, MAX_TIMELINE_FRAME, normalizeEditorV6Timeline, timelineClips } from './editorV6TimelineCore'

export function moveEditorV6ElementInPeriod(document: EditorV6Document, blockId: string, x: number, y: number): EditorV6Document {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return document
  const clip = timelineClips(document.timeline).find(({ block }) => block.id === blockId)
  if (!clip?.block.elementId || clip.track.kind !== 'character' || clip.track.locked) return document
  return editEditorV6DocumentAtBlock(document, blockId, (working) => ({ ...working, elements: working.elements.map((element) => element.id === clip.block.elementId ? { ...element, x, y } : element) }))
}

/** Aligns a legacy project's character blocks to the actor's earliest saved position. */
export function normalizeEditorV6CharacterPositions(document: EditorV6Document): EditorV6Document {
  const positions = new Map<string, { x: number; y: number }>()
  for (const track of document.timeline.tracks) {
    if (track.kind !== 'character' || !track.characterId || positions.has(track.characterId)) continue
    const first = [...track.blocks].filter((block) => block.state?.kind === 'character').sort(compareEditorV6TimelineBlocks)[0]
    const base = document.elements.find((element) => element.kind === 'character' && element.characterId === track.characterId)
    const source = first?.state ?? base
    if (source && Number.isFinite(source.x) && Number.isFinite(source.y)) positions.set(track.characterId, { x: source.x, y: source.y })
  }
  if (!positions.size) return document

  let changed = false
  const elements = document.elements.map((element) => {
    const position = element.kind === 'character' && element.characterId ? positions.get(element.characterId) : undefined
    if (!position || (element.x === position.x && element.y === position.y)) return element
    changed = true
    return { ...element, ...position }
  })
  const tracks = document.timeline.tracks.map((track) => {
    const position = track.kind === 'character' && track.characterId ? positions.get(track.characterId) : undefined
    if (!position) return track
    let trackChanged = false
    const blocks = track.blocks.map((block) => {
      const state = block.state
      if (!state || state.kind !== 'character' || (state.x === position.x && state.y === position.y)) return block
      trackChanged = true
      return { ...block, state: { ...state, ...position } }
    })
    if (!trackChanged) return track
    changed = true
    return { ...track, blocks }
  })
  return changed ? pruneEditorV6TimelineSnapshots({ ...document, elements, timeline: { ...document.timeline, tracks } }) : document
}

/** Position is actor-level data: every pose/expression block uses the same scene coordinates. */
export function setEditorV6CharacterPosition(document: EditorV6Document, elementId: string, position: { x?: number; y?: number }): EditorV6Document {
  if ((position.x !== undefined && !Number.isFinite(position.x)) || (position.y !== undefined && !Number.isFinite(position.y))) return document
  const clip = timelineClips(document.timeline).find(({ block }) => block.elementId === elementId && block.state?.kind === 'character')
  if (clip?.track.locked) return document
  const base = document.elements.find((element) => element.id === elementId && element.kind === 'character')
  const characterId = clip?.track.characterId ?? base?.characterId
  if (!characterId) return document
  const current = base ?? clip?.block.state
  if (!current) return document
  const x = position.x ?? current.x
  const y = position.y ?? current.y
  const elements = document.elements.map((element) => element.kind === 'character' && element.characterId === characterId
    ? { ...element, x, y }
    : element)
  const tracks = document.timeline.tracks.map((track) => {
    if (track.kind !== 'character' || track.characterId !== characterId) return track
    let trackChanged = false
    const blocks = track.blocks.map((block) => {
      const state = block.state
      if (state?.kind !== 'character' || (block.elementId !== elementId && state.characterId !== characterId)) return block
      if (state.x === x && state.y === y) return block
      trackChanged = true
      return { ...block, state: { ...state, x, y } }
    })
    return trackChanged ? { ...track, blocks } : track
  })
  const changed = elements.some((element, index) => element !== document.elements[index]) || tracks.some((track, index) => track !== document.timeline.tracks[index])
  return changed ? { ...document, elements, timeline: { ...document.timeline, tracks } } : document
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
  if (clip.track.kind === 'character' && state.kind === 'character' && (state.x !== before.x || state.y !== before.y)) {
    next = setEditorV6CharacterPosition(next, base.id, { x: state.x, y: state.y })
  }
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
  const assetsById = new Map<string, EditorV6Asset[]>()
  const uniqueIds = new Set(document.assets.map((asset) => asset.id))
  const duplicateIds = new Set<string>()
  const assets = document.assets.map((asset) => {
    const copies = assetsById.get(asset.id)
    if (!copies) { assetsById.set(asset.id, [asset]); return asset }
    duplicateIds.add(asset.id)
    let id = crypto.randomUUID()
    while (uniqueIds.has(id)) id = crypto.randomUUID()
    uniqueIds.add(id)
    const copy = { ...asset, id, timelineSnapshot: true }
    copies.push(copy)
    return copy
  })
  if (!duplicateIds.size) return document
  const resolveAssetId = (id: string | undefined, category?: EditorV6Asset['category'], preferLast = false) => {
    if (!id || !duplicateIds.has(id)) return id
    const copies = assetsById.get(id)!
    const matching = category ? copies.filter((asset) => asset.category === category) : copies
    const candidates = matching.length ? matching : copies
    return candidates[preferLast ? candidates.length - 1 : 0].id
  }
  const categoryForElement = (element: EditorV6Element): EditorV6Asset['category'] | undefined =>
    element.kind === 'character' ? 'character' : element.kind === 'image' ? 'object' : undefined
  const repairElement = (element: EditorV6Element, preferLast = false): EditorV6Element => ({
    ...element,
    ...(element.assetId ? { assetId: resolveAssetId(element.assetId, categoryForElement(element), preferLast) } : {}),
    ...(element.faceModeAssetIds ? { faceModeAssetIds: Object.fromEntries(Object.entries(element.faceModeAssetIds).map(([mode, id]) => [mode, resolveAssetId(id, 'character')])) as EditorV6Element['faceModeAssetIds'] } : {})
  })
  const elements = document.elements.map((element) => repairElement(element))
  const timeline = { ...document.timeline, tracks: document.timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => ({
    ...block,
    ...(block.state ? { state: repairElement(block.state, block.id === selectedBlockId) } : {}),
    ...(block.background ? { background: { ...block.background, backgroundAssetId: resolveAssetId(block.background.backgroundAssetId ?? undefined, 'background') ?? null } } : {}),
    ...(block.incomingMotion ? { incomingMotion: { ...block.incomingMotion, assetId: resolveAssetId(block.incomingMotion.assetId, 'character')! } } : {})
  })) })) }
  return { ...document, backgroundAssetId: resolveAssetId(document.backgroundAssetId ?? undefined, 'background') ?? null, assets, elements, timeline }
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
  const sorted = clip.track.blocks.filter((block) => !clip.block.background || block.background).sort(compareEditorV6TimelineBlocks), index = sorted.findIndex((block) => block.id === blockId)
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
