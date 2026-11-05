/** Scene and background resolution at a frame. */
import type { EditorV6BackgroundState, EditorV6Document, EditorV6Element, EditorV6SceneElement, EditorV6Timeline, EditorV6TimelineBlock, EditorV6TimelineTrack, EditorV6VideoLayout } from './editorV6'
import { editorV6DefaultVideoLayout, editorV6MediaUrl, videoCharacterTrackColor } from './editorV6'
import { editorV6MotionPlans, type EditorV6MotionPlan } from './editorV6Motion'
import { editorV6FaceModeAtFrame } from './editorV6FaceSchedule'
import { addEditorV6ElementAtFrame, compareEditorV6TimelineBlocks, editorV6ClipAtFrame, normalizeEditorV6Timeline, resolveEditorV6StaticElementsAtFrame, timelineClips, type TimelineClip } from './editorV6TimelineCore'

export type EditorV6ResolvedScene = { frame: number; background: EditorV6BackgroundState; elements: EditorV6SceneElement[]; mediaVideo?: { blockId: string; mediaId: string; url: string; layout: EditorV6VideoLayout; startFrame: number; sourceInFrame: number; durationFrames: number; hasAudio: boolean; audioEnabled: boolean; gain: number } }
const backgroundsCache = new WeakMap<EditorV6Timeline, TimelineClip[]>()
export function resolveEditorV6BackgroundAtFrame(document: EditorV6Document, frame: number): EditorV6BackgroundState {
  let backgrounds = backgroundsCache.get(document.timeline)
  if (!backgrounds) {
    backgrounds = timelineClips(document.timeline).filter(({ track, block }) => block.background && !track.hidden && !track.muted).sort((a, b) => compareEditorV6TimelineBlocks(a.block, b.block))
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
    videoClips = timelineClips(document.timeline).filter(({ track, block }) => track.kind === 'video' && !track.hidden && !track.muted && block.mediaId).sort((a, b) => compareEditorV6TimelineBlocks(a.block, b.block))
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
  return { frame: normalizedFrame, background: resolveEditorV6BackgroundAtFrame(document, normalizedFrame), elements: resolveEditorV6ElementsAtFrame(document, normalizedFrame, options), ...(video && media ? { mediaVideo: { blockId: video.id, mediaId: media.id, url: editorV6MediaUrl(document.id, media.fileName, media.libraryVideoId), layout: video.mediaLayout ?? editorV6DefaultVideoLayout(media.width, media.height), startFrame: video.startFrame, sourceInFrame: video.mediaInFrame ?? 0, durationFrames: video.durationFrames, hasAudio: media.hasAudio, audioEnabled: video.audioEnabled !== false, gain: video.gain ?? 1 } } : {}) }
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

const motionIndex = new WeakMap<EditorV6Document['timeline'], Map<string, Array<{ plan: EditorV6MotionPlan; block: EditorV6TimelineBlock }>>>()
function attachLinkedBalloons(document: EditorV6Document, elements: EditorV6Element[], frame: number): EditorV6SceneElement[] {
  const characters = elements.filter((element) => element.kind === 'character' && element.characterId)
  return elements.map((element): EditorV6SceneElement => {
    if (element.kind !== 'speech' && element.kind !== 'thought') return element
    const balloonScalePercent = document.balloonScalePercent ?? 100
    if (!element.characterId && !element.attachedCharacterElementId) return { ...element, balloonScalePercent }
    const exactTarget = element.attachedCharacterElementId ? characters.find((character) => character.id === element.attachedCharacterElementId) : undefined
    const linkedTargets = element.characterId ? characters.filter((character) => character.characterId === element.characterId) : []
    const target = exactTarget ?? linkedTargets.reduce<EditorV6Element | undefined>((nearest, character) => {
      if (!nearest) return character
      const distance = (character.x - element.x) ** 2 + (character.y - element.y) ** 2
      const nearestDistance = (nearest.x - element.x) ** 2 + (nearest.y - element.y) ** 2
      return distance < nearestDistance ? character : nearest
    }, undefined)
    if (!target) return { ...element, balloonScalePercent }
    const balloonClip = editorV6ClipAtFrame(document.timeline, element.id, frame)
    const attachmentFrame = balloonClip?.block.startFrame ?? frame
    const anchorCharacterState = editorV6ClipAtFrame(document.timeline, target.id, attachmentFrame)?.block.state
    const baseCharacter = document.elements.find((candidate) => candidate.kind === 'character' && candidate.id === target.id)
      ?? document.elements.find((candidate) => candidate.kind === 'character' && candidate.characterId === target.characterId)
    const originX = element.attachmentOriginX ?? anchorCharacterState?.x ?? baseCharacter?.x ?? target.x
    const originY = element.attachmentOriginY ?? anchorCharacterState?.y ?? baseCharacter?.y ?? target.y
    const characterId = target.characterId ?? element.characterId
    return {
      ...element,
      balloonScalePercent,
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
      const autoMode = editorV6FaceModeAtFrame(document.id, document.timeline, element.characterId, frame)
      const autoAssetId = autoMode === 'talk-blink'
        ? element.faceModeAssetIds?.['talk-blink'] ?? element.faceModeAssetIds?.talk
        : autoMode ? element.faceModeAssetIds?.[autoMode] : undefined
      if (autoAssetId) element = { ...element, assetId: autoAssetId, motionSprite: undefined }
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
