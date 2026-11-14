/** Scene and background resolution at a frame. */
import type { EditorV6BackgroundState, EditorV6Document, EditorV6Element, EditorV6SceneElement, EditorV6Timeline, EditorV6TimelineBlock, EditorV6VideoLayout } from './editorV6'
import { editorV6DefaultVideoLayout, editorV6MediaUrl, videoCharacterTrackColor } from './editorV6'
import { editorV6MotionPlans, type EditorV6MotionPlan } from './editorV6Motion'
import { editorV6FaceModeAtFrame } from './editorV6FaceSchedule'
import { compareEditorV6TimelineBlocks, editorV6ClipAtFrame, resolveEditorV6StaticElementsAtFrame, timelineClips, type TimelineClip } from './editorV6TimelineCore'

export type EditorV6ResolvedScene = { frame: number; background: EditorV6BackgroundState; elements: EditorV6SceneElement[]; mediaVideo?: { blockId: string; mediaId: string; url: string; layout: EditorV6VideoLayout; startFrame: number; sourceInFrame: number; durationFrames: number; hasAudio: boolean; audioEnabled: boolean; gain: number } }
const backgroundsCache = new WeakMap<EditorV6Timeline, TimelineClip[]>()
const defaultBackgroundsCache = new WeakMap<EditorV6Document, EditorV6BackgroundState>()
type VideoClipIndex = { clips: TimelineClip[]; maximumEnds: number[] }
const videoClipsCache = new WeakMap<EditorV6Timeline, VideoClipIndex>()
type EditorV6MediaCollection = NonNullable<EditorV6Document['media']>
const videoMediaCache = new WeakMap<EditorV6MediaCollection, Map<string, EditorV6MediaCollection[number]>>()

function videoMediaIndex(media: EditorV6MediaCollection): Map<string, EditorV6MediaCollection[number]> {
  let index = videoMediaCache.get(media)
  if (index) return index
  index = new Map()
  for (const item of media) if (item.kind === 'video' && !index.has(item.id)) index.set(item.id, item)
  videoMediaCache.set(media, index)
  return index
}

export function resolveEditorV6BackgroundAtFrame(document: EditorV6Document, frame: number): EditorV6BackgroundState {
  let backgrounds = backgroundsCache.get(document.timeline)
  if (!backgrounds) {
    backgrounds = timelineClips(document.timeline).filter(({ track, block }) => block.background && !track.hidden && !track.muted).sort((a, b) => compareEditorV6TimelineBlocks(a.block, b.block))
    backgroundsCache.set(document.timeline, backgrounds)
  }
  let left = 0, right = backgrounds.length
  while (left < right) { const middle = (left + right) >>> 1; if (backgrounds[middle].block.startFrame <= frame) left = middle + 1; else right = middle }
  const background = backgrounds[left - 1]?.block.background
  if (background) return background
  const cachedDefault = defaultBackgroundsCache.get(document)
  if (cachedDefault
    && cachedDefault.backgroundColor === document.backgroundColor
    && cachedDefault.backgroundAssetId === document.backgroundAssetId
    && cachedDefault.backgroundX === document.backgroundX
    && cachedDefault.backgroundY === document.backgroundY
    && cachedDefault.backgroundWidth === document.backgroundWidth
    && cachedDefault.backgroundHeight === document.backgroundHeight
    && cachedDefault.backgroundRotation === document.backgroundRotation) return cachedDefault
  const resolvedDefault = {
    backgroundColor: document.backgroundColor, backgroundAssetId: document.backgroundAssetId,
    backgroundX: document.backgroundX, backgroundY: document.backgroundY,
    backgroundWidth: document.backgroundWidth, backgroundHeight: document.backgroundHeight, backgroundRotation: document.backgroundRotation
  }
  defaultBackgroundsCache.set(document, resolvedDefault)
  return resolvedDefault
}
export function resolveEditorV6SceneAtFrame(document: EditorV6Document, frame: number, options: { includeMotion?: boolean; includeVideo?: boolean } = {}): EditorV6ResolvedScene {
  const normalizedFrame = Math.min(Math.max(0, document.timeline.durationFrames - 1), Math.max(0, Math.round(frame)))
  let mediaVideo: EditorV6ResolvedScene['mediaVideo']
  if (options.includeVideo !== false) {
    let videoIndex = videoClipsCache.get(document.timeline)
    if (!videoIndex) {
      const clips = timelineClips(document.timeline).filter(({ track, block }) => track.kind === 'video' && !track.hidden && !track.muted && block.mediaId).sort((a, b) => compareEditorV6TimelineBlocks(a.block, b.block))
      let maximumEnd = 0
      const maximumEnds = clips.map(({ block }) => { maximumEnd = Math.max(maximumEnd, block.startFrame + block.durationFrames); return maximumEnd })
      videoIndex = { clips, maximumEnds }
      videoClipsCache.set(document.timeline, videoIndex)
    }
    let left = 0, right = videoIndex.clips.length
    while (left < right) { const middle = (left + right) >>> 1; if (videoIndex.clips[middle].block.startFrame <= normalizedFrame) left = middle + 1; else right = middle }
    let video: EditorV6TimelineBlock | undefined
    for (let index = left - 1; index >= 0; index--) {
      if (videoIndex.maximumEnds[index] <= normalizedFrame) break
      const candidate = videoIndex.clips[index].block
      if (normalizedFrame < candidate.startFrame + candidate.durationFrames) { video = candidate; break }
    }
    const media = video?.mediaId && document.media ? videoMediaIndex(document.media).get(video.mediaId) : undefined
    if (video && media) mediaVideo = { blockId: video.id, mediaId: media.id, url: editorV6MediaUrl(document.id, media.fileName, media.libraryVideoId), layout: video.mediaLayout ?? editorV6DefaultVideoLayout(media.width, media.height), startFrame: video.startFrame, sourceInFrame: video.mediaInFrame ?? 0, durationFrames: video.durationFrames, hasAudio: media.hasAudio, audioEnabled: video.audioEnabled !== false, gain: video.gain ?? 1 }
  }
  return { frame: normalizedFrame, background: resolveEditorV6BackgroundAtFrame(document, normalizedFrame), elements: resolveEditorV6ElementsAtFrame(document, normalizedFrame, options), ...(mediaVideo ? { mediaVideo } : {}) }
}

const motionIndex = new WeakMap<EditorV6Document['timeline'], Map<string, Array<{ plan: EditorV6MotionPlan; block: EditorV6TimelineBlock }>>>()
type BaseCharacterIndex = { byElementId: Map<string, EditorV6Element>; byCharacterId: Map<string | undefined, EditorV6Element> }
const baseCharacterIndexCache = new WeakMap<EditorV6Document['elements'], BaseCharacterIndex>()

function baseCharacterIndex(elements: EditorV6Document['elements']): BaseCharacterIndex {
  let index = baseCharacterIndexCache.get(elements)
  if (index) return index
  const byElementId = new Map<string, EditorV6Element>()
  const byCharacterId = new Map<string | undefined, EditorV6Element>()
  for (const character of elements) {
    if (character.kind !== 'character') continue
    if (!byElementId.has(character.id)) byElementId.set(character.id, character)
    if (!byCharacterId.has(character.characterId)) byCharacterId.set(character.characterId, character)
  }
  index = { byElementId, byCharacterId }
  baseCharacterIndexCache.set(elements, index)
  return index
}

function indexLinkedCharacters(document: EditorV6Document, elements: EditorV6Element[]) {
  const charactersByElementId = new Map<string, EditorV6Element>()
  const charactersByCharacterId = new Map<string, EditorV6Element[]>()
  for (const character of elements) {
    if (character.kind !== 'character' || !character.characterId) continue
    charactersByElementId.set(character.id, character)
    const matches = charactersByCharacterId.get(character.characterId) ?? []
    matches.push(character)
    charactersByCharacterId.set(character.characterId, matches)
  }
  return { charactersByElementId, charactersByCharacterId, base: baseCharacterIndex(document.elements) }
}

function attachLinkedBalloons(document: EditorV6Document, elements: EditorV6Element[], frame: number): EditorV6SceneElement[] {
  let characterIndexes: ReturnType<typeof indexLinkedCharacters> | undefined
  return elements.map((element): EditorV6SceneElement => {
    if (element.kind !== 'speech' && element.kind !== 'thought') return element
    const balloonScalePercent = document.balloonScalePercent ?? 100
    const balloonOffsetY = document.balloonOffsetY ?? 0
    if (!element.characterId && !element.attachedCharacterElementId) return { ...element, balloonScalePercent, balloonOffsetY }
    const indexes = characterIndexes ??= indexLinkedCharacters(document, elements)
    const exactTarget = element.attachedCharacterElementId ? indexes.charactersByElementId.get(element.attachedCharacterElementId) : undefined
    const linkedTargets = element.characterId ? indexes.charactersByCharacterId.get(element.characterId) ?? [] : []
    const target = exactTarget ?? linkedTargets.reduce<EditorV6Element | undefined>((nearest, character) => {
      if (!nearest) return character
      const distance = (character.x - element.x) ** 2 + (character.y - element.y) ** 2
      const nearestDistance = (nearest.x - element.x) ** 2 + (nearest.y - element.y) ** 2
      return distance < nearestDistance ? character : nearest
    }, undefined)
    if (!target) return { ...element, balloonScalePercent, balloonOffsetY }
    const balloonClip = editorV6ClipAtFrame(document.timeline, element.id, frame)
    const attachmentFrame = balloonClip?.block.startFrame ?? frame
    const anchorCharacterState = editorV6ClipAtFrame(document.timeline, target.id, attachmentFrame)?.block.state
    const baseCharacter = indexes.base.byElementId.get(target.id)
      ?? indexes.base.byCharacterId.get(target.characterId)
    const originX = element.attachmentOriginX ?? anchorCharacterState?.x ?? baseCharacter?.x ?? target.x
    const originY = element.attachmentOriginY ?? anchorCharacterState?.y ?? baseCharacter?.y ?? target.y
    const characterId = target.characterId ?? element.characterId
    return {
      ...element,
      balloonScalePercent,
      balloonOffsetY,
      x: element.x + target.x - originX,
      y: element.y + target.y - originY,
      speakerName: target.text.trim() || undefined,
      speakerColor: characterId ? document.characterNameColors?.[characterId] ?? videoCharacterTrackColor(characterId) : undefined
    }
  })
}

export function resolveEditorV6ElementsAtFrame(document: EditorV6Document, frame: number, options: { includeMotion?: boolean } = {}): EditorV6SceneElement[] {
  const resolved = resolveEditorV6StaticElementsAtFrame(document, frame)
  const applyAutomaticFace = (source: EditorV6Element) => {
    let element = source
    if (element.kind === 'character' && element.characterId) {
      const faceModeAssetIds = element.faceModeAssetIds
      if (faceModeAssetIds?.blink || faceModeAssetIds?.talk || faceModeAssetIds?.['talk-blink']) {
        const autoMode = editorV6FaceModeAtFrame(document.id, document.timeline, element.characterId, frame)
        const autoAssetId = autoMode === 'talk-blink'
          ? faceModeAssetIds['talk-blink'] ?? faceModeAssetIds.talk
          : autoMode ? faceModeAssetIds[autoMode] : undefined
        if (autoAssetId) element = { ...element, assetId: autoAssetId, motionSprite: undefined }
      }
    }
    return element
  }
  if (options.includeMotion === false) return attachLinkedBalloons(document, resolved.map(applyAutomaticFace), frame)
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
  return attachLinkedBalloons(document, resolved.map((source) => {
    let element = applyAutomaticFace(source)
    const entries = index!.get(element.id)
    if (!entries) return element
    let left = 0, right = entries.length
    while (left < right) { const middle = (left + right) >>> 1; if (entries[middle].plan.endFrame <= frame) left = middle + 1; else right = middle }
    const next = entries[left]
    if (!next || frame <= next.plan.startFrame || frame >= next.plan.endFrame || next.block.incomingMotion?.key !== next.plan.key) return element
    const sample = next.block.incomingMotion.frames.find((sample) => sample.offset === frame - next.plan.endFrame)
    if (!sample) return element
    const faceAssetId = next.block.incomingMotion.faceAssetId
    return { ...element, assetId: next.block.incomingMotion.assetId, motionSprite: sample.sprite, ...(faceAssetId && sample.facePatch ? { mouthPatch: { assetId: faceAssetId, ...sample.facePatch } } : { mouthPatch: undefined }), x: sample.x, y: sample.y, width: sample.width, height: sample.height, rotation: sample.rotation, flipX: sample.flipX, characterScale: 100, characterWidthScale: 100, characterHeightScale: 100 }
  }), frame)
}
