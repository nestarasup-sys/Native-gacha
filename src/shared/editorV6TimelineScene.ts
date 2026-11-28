import { editorV6CardMatchesVideo, editorV6CardRoles } from './editorV6Cards'
/** Scene and background resolution at a frame. */
import type {
  EditorV6BackgroundState,
  EditorV6Document,
  EditorV6Element,
  EditorV6SceneElement,
  EditorV6Timeline,
  EditorV6TimelineBlock,
  EditorV6VideoLayout
} from './editorV6'
import { editorV6DefaultVideoLayout, editorV6MediaUrl, videoCharacterTrackColor } from './editorV6'
import { editorV6MotionPlans, type EditorV6MotionPlan } from './editorV6Motion'
import { editorV6BlinkEventAtFrame, editorV6FaceModeAtFrame } from './editorV6FaceSchedule'
import {
  compareEditorV6TimelineBlocks,
  editorV6ClipAtFrame,
  resolveEditorV6StaticElementsAtFrame,
  type TimelineClip
} from './editorV6TimelineCore'
import { editorV6UpperBound } from './editorV6SortedSearch'
import { fitEditorV6LinkedBalloon } from './editorV6LinkedBalloonLayout'
import { EDITOR_V6_VIDEO_LOADING_FRAMES, editorV6LoadingGifFrame, hasEditorV6VideoCards, resolveEditorV6VideoCards, type EditorV6VideoPresentation } from './editorV6VideoPresentation'
import { editorV6IntroCharacterTrack, type EditorV6IntroClip } from './editorV6Intro'

type ResolvedVideoCards = Pick<EditorV6VideoPresentation, 'bottomCard' | 'timeCard'> & {
  layout: EditorV6VideoLayout
  aspect?: number
}
export type EditorV6ResolvedVideoCard = { blockId: string; position: 'top' | 'english' | 'bottom'; text: string; layout: EditorV6VideoLayout; aspect?: number }

export type EditorV6ResolvedScene = {
  frame: number
  background: EditorV6BackgroundState
  elements: EditorV6SceneElement[]
  videoCards?: ResolvedVideoCards
  videoCardItems?: EditorV6ResolvedVideoCard[]
  loadingGifFrame?: number
  blinkElementId?: string
  intro?: EditorV6IntroClip
  introBlockId?: string
  introTrackLocked?: boolean
  mediaVideo?: {
    blockId: string
    mediaId: string
    libraryVideoId?: string
    url: string
    layout: EditorV6VideoLayout
    startFrame: number
    sourceInFrame: number
    durationFrames: number
    hasAudio: boolean
    audioEnabled: boolean
    gain: number
  }
}
const backgroundsCache = new WeakMap<EditorV6Timeline, TimelineClip[]>()
const introCache = new WeakMap<EditorV6Timeline, { clips: TimelineClip[]; maxEnds: number[] }>()
function introAtFrame(timeline: EditorV6Timeline, frame: number): TimelineClip | undefined {
  let index = introCache.get(timeline)
  if (!index) {
    const clips = timeline.tracks.filter(track => track.kind === 'intro' && !track.hidden && !track.muted)
      .flatMap(track => track.blocks.map(block => ({ track, block })))
      .sort((a, b) => compareEditorV6TimelineBlocks(a.block, b.block))
    let end = 0
    index = { clips, maxEnds: clips.map(({ block }) => end = Math.max(end, block.startFrame + block.durationFrames)) }
    introCache.set(timeline, index)
  }
  const { clips, maxEnds } = index
  for (let position = editorV6UpperBound(clips, frame, clip => clip.block.startFrame) - 1; position >= 0 && maxEnds[position] > frame; position--) {
    const { block } = clips[position]
    if (block.intro && frame < block.startFrame + block.durationFrames) return clips[position]
  }
}
const defaultBackgroundsCache = new WeakMap<EditorV6Document, EditorV6BackgroundState>()
type VideoClipIndex = { clips: TimelineClip[]; maximumEnds: number[]; hasPresentation: boolean }
const videoClipsCache = new WeakMap<EditorV6Timeline, VideoClipIndex>()
type CardClipIndex = { clips: TimelineClip[]; maximumEnds: number[] }
const cardClipsCache = new WeakMap<EditorV6Timeline, CardClipIndex>()
type EditorV6MediaCollection = NonNullable<EditorV6Document['media']>
const videoMediaCache = new WeakMap<EditorV6MediaCollection, Map<string, EditorV6MediaCollection[number]>>()
type TimelineSceneCacheName =
  'video-media' | 'background-clips' | 'video-clips' | 'motion-plans' | 'prepared-motion' | 'base-characters'
let cacheBuildObserverForTests: ((name: TimelineSceneCacheName) => void) | undefined

/** Test-only hook used to prove identity cache rebuild behavior after immutable edits. */
export function setEditorV6TimelineSceneCacheBuildObserverForTests(
  observer?: (name: TimelineSceneCacheName) => void
): void {
  cacheBuildObserverForTests = observer
}
function reportCacheBuild(name: TimelineSceneCacheName): void {
  cacheBuildObserverForTests?.(name)
}

function videoMediaIndex(media: EditorV6MediaCollection): Map<string, EditorV6MediaCollection[number]> {
  let index = videoMediaCache.get(media)
  if (index) return index
  reportCacheBuild('video-media')
  index = new Map()
  for (const item of media) if (item.kind === 'video' && !index.has(item.id)) index.set(item.id, item)
  videoMediaCache.set(media, index)
  return index
}

function videoClipIndex(timeline: EditorV6Timeline): VideoClipIndex {
  let index = videoClipsCache.get(timeline)
  if (index) return index
  reportCacheBuild('video-clips')
  const clips = collectVisibleMediaClips(timeline, 'video')
  let maximumEnd = 0
  const maximumEnds = clips.map(({ block }) => maximumEnd = Math.max(maximumEnd, block.startFrame + block.durationFrames))
  index = { clips, maximumEnds, hasPresentation: clips.some(({ block }) => Boolean(block.videoPresentation)) }
  videoClipsCache.set(timeline, index)
  return index
}

function cardClipIndex(timeline: EditorV6Timeline): CardClipIndex {
  let index = cardClipsCache.get(timeline)
  if (index) return index
  const clips = timeline.tracks.filter(track => track.kind === 'card' && !track.hidden && !track.muted)
    .flatMap(track => track.blocks.filter(block => block.videoCard).map(block => ({ track, block })))
    .sort((a, b) => compareEditorV6TimelineBlocks(a.block, b.block))
  let end = 0
  index = { clips, maximumEnds: clips.map(({ block }) => end = Math.max(end, block.startFrame + block.durationFrames)) }
  cardClipsCache.set(timeline, index)
  return index
}

function upcomingLoadingGifFrame(
  document: EditorV6Document,
  frame: number,
  options: { includeVideo?: boolean; includeVideoPresentation?: boolean }
): number | undefined {
  if ((options.includeVideo === false && !options.includeVideoPresentation) || !document.media?.length) return
  const index = videoClipIndex(document.timeline)
  if (!index.hasPresentation) return
  const left = editorV6UpperBound(index.clips, frame, clip => clip.block.startFrame)
  const media = videoMediaIndex(document.media)
  for (let position = left; position < index.clips.length; position++) {
    const upcoming = index.clips[position].block
    const remaining = upcoming.startFrame - frame
    if (remaining > EDITOR_V6_VIDEO_LOADING_FRAMES) break
    if (!upcoming.videoPresentation?.loadingGif || !upcoming.mediaId || !media.has(upcoming.mediaId)) continue
    const firstFrame = Math.max(0, upcoming.startFrame - EDITOR_V6_VIDEO_LOADING_FRAMES)
    return editorV6LoadingGifFrame(frame - firstFrame)
  }
}

function collectVisibleMediaClips(timeline: EditorV6Timeline, kind: 'background' | 'video'): TimelineClip[] {
  const clips: TimelineClip[] = []
  for (const track of timeline.tracks) {
    if (track.hidden || track.muted || (kind === 'video' && track.kind !== 'video')) continue
    for (const block of track.blocks) {
      if (kind === 'background' ? block.background : block.mediaId) clips.push({ track, block })
    }
  }
  return clips.sort((a, b) => compareEditorV6TimelineBlocks(a.block, b.block))
}

export function resolveEditorV6BackgroundAtFrame(document: EditorV6Document, frame: number): EditorV6BackgroundState {
  let backgrounds = backgroundsCache.get(document.timeline)
  if (!backgrounds) {
    reportCacheBuild('background-clips')
    backgrounds = collectVisibleMediaClips(document.timeline, 'background')
    backgroundsCache.set(document.timeline, backgrounds)
  }
  const left = editorV6UpperBound(backgrounds, frame, (clip) => clip.block.startFrame)
  const background = backgrounds[left - 1]?.block.background
  if (background) return background
  const cachedDefault = defaultBackgroundsCache.get(document)
  if (
    cachedDefault &&
    cachedDefault.backgroundColor === document.backgroundColor &&
    cachedDefault.backgroundAssetId === document.backgroundAssetId &&
    cachedDefault.backgroundX === document.backgroundX &&
    cachedDefault.backgroundY === document.backgroundY &&
    cachedDefault.backgroundWidth === document.backgroundWidth &&
    cachedDefault.backgroundHeight === document.backgroundHeight &&
    cachedDefault.backgroundRotation === document.backgroundRotation
  )
    return cachedDefault
  const resolvedDefault = {
    backgroundColor: document.backgroundColor,
    backgroundAssetId: document.backgroundAssetId,
    backgroundX: document.backgroundX,
    backgroundY: document.backgroundY,
    backgroundWidth: document.backgroundWidth,
    backgroundHeight: document.backgroundHeight,
    backgroundRotation: document.backgroundRotation
  }
  defaultBackgroundsCache.set(document, resolvedDefault)
  return resolvedDefault
}
export function resolveEditorV6SceneAtFrame(
  document: EditorV6Document,
  frame: number,
  options: { includeMotion?: boolean; includeVideo?: boolean; includeVideoPresentation?: boolean; includeSpeechMouth?: boolean } = {}
): EditorV6ResolvedScene {
  const normalizedFrame = Math.min(Math.max(0, document.timeline.durationFrames - 1), Math.max(0, Math.round(frame)))
  const introClip = introAtFrame(document.timeline, normalizedFrame)
  const intro = introClip?.block.intro
  if (intro) {
    const loadingGifFrame = upcomingLoadingGifFrame(document, normalizedFrame, options)
    const character = editorV6IntroCharacterTrack(introClip.track).get(introClip.block.id)
    const blinkElementId = blinkTarget(document, normalizedFrame)
    return {
      frame: normalizedFrame,
      background: { backgroundColor: intro.kind === 'black' ? '#000000' : document.backgroundColor, backgroundAssetId: null,
        backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 },
      elements: character ? resolveCharacters(document, normalizedFrame, [character], blinkElementId, {
        ...options, includeSpeechMouth: false
      }) : [],
      blinkElementId,
      intro,
      introBlockId: introClip.block.id,
      introTrackLocked: introClip.track.locked,
      ...(loadingGifFrame !== undefined ? { loadingGifFrame } : {})
    }
  }
  let mediaVideo: EditorV6ResolvedScene['mediaVideo']
  let videoCards: ResolvedVideoCards | undefined
  const videoCardItems: EditorV6ResolvedVideoCard[] = []
  let loadingGifFrame: number | undefined
  const hasIndependentCards = document.timeline.tracks.some(track => track.kind === 'card' && track.blocks.length > 0)
  if (options.includeVideo !== false || (options.includeVideoPresentation && document.media?.length) || hasIndependentCards) {
    const videoIndex = videoClipIndex(document.timeline)
    const left = options.includeVideo !== false || videoIndex.hasPresentation || hasIndependentCards
      ? editorV6UpperBound(videoIndex.clips, normalizedFrame, (clip) => clip.block.startFrame)
      : 0
    let video: EditorV6TimelineBlock | undefined
    for (let index = left - 1; index >= 0; index--) {
      if (videoIndex.maximumEnds[index] <= normalizedFrame) break
      const candidate = videoIndex.clips[index].block
      if (normalizedFrame < candidate.startFrame + candidate.durationFrames) {
        video = candidate
        break
      }
    }
    const media = video?.mediaId && document.media ? videoMediaIndex(document.media).get(video.mediaId) : undefined
    if (video && media) {
      const layout = video.mediaLayout ?? editorV6DefaultVideoLayout(media.width, media.height)
      if (hasEditorV6VideoCards(video.videoPresentation)) videoCards = {
        layout, ...resolveEditorV6VideoCards(video.videoPresentation!, normalizedFrame - video.startFrame),
        ...(media.width && media.height ? { aspect: media.width / media.height } : {})
      }
      if (options.includeVideo !== false) mediaVideo = {
        blockId: video.id,
        mediaId: media.id,
        libraryVideoId: media.libraryVideoId,
        url: editorV6MediaUrl(document.id, media.fileName, media.libraryVideoId),
        layout,
        startFrame: video.startFrame,
        sourceInFrame: video.mediaInFrame ?? 0,
        durationFrames: video.durationFrames,
        hasAudio: media.hasAudio,
        audioEnabled: video.audioEnabled !== false,
        gain: video.gain ?? 1
      }
    }
    const cardIndex = hasIndependentCards ? cardClipIndex(document.timeline) : undefined
    const cardLeft = cardIndex ? editorV6UpperBound(cardIndex.clips, normalizedFrame, clip => clip.block.startFrame) : 0
    let mediaById: Map<string, EditorV6MediaCollection[number]> | undefined
    for (let position = cardLeft - 1; cardIndex && position >= 0 && cardIndex.maximumEnds[position] > normalizedFrame; position--) {
      const { block } = cardIndex.clips[position]
      if (normalizedFrame >= block.startFrame + block.durationFrames || !block.videoCard) continue
      const card = block.videoCard
      if (!video || !editorV6CardMatchesVideo(card, video)) continue
      mediaById ??= videoMediaIndex(document.media ?? [])
      const ownerMedia = video.mediaId ? mediaById.get(video.mediaId) : undefined
      const geometry = {
        layout: video.mediaLayout ?? card.fallbackLayout ?? (ownerMedia ? editorV6DefaultVideoLayout(ownerMedia.width, ownerMedia.height) : editorV6DefaultVideoLayout()),
        ...(ownerMedia?.width && ownerMedia.height ? { aspect: ownerMedia.width / ownerMedia.height } : card.aspect ? { aspect: card.aspect } : {})
      }
      if ('components' in card) {
        const relative = normalizedFrame - block.startFrame
        for (const role of editorV6CardRoles) {
          const item = card.components[role]
          if (item.enabled && item.text.trim() && relative >= item.startFrame && relative < item.endFrame)
            videoCardItems.push({ ...geometry, blockId: block.id, position: role === 'temporal' ? 'top' : role === 'english' ? 'english' : 'bottom', text: item.text })
        }
      } else videoCardItems.push({ ...geometry, blockId: block.id, position: card.position, text: card.text })
    }
    videoCardItems.reverse()
    for (const card of videoCardItems) {
      videoCards ??= { layout: card.layout, ...(card.aspect ? { aspect: card.aspect } : {}) }
      if (card.position === 'top') videoCards.timeCard = card.text as ResolvedVideoCards['timeCard']
      else if (card.position === 'bottom') videoCards.bottomCard = card.text
    }
    if (videoIndex.hasPresentation && document.media?.length) {
      const mediaIndex = videoMediaIndex(document.media)
      for (let index = left; index < videoIndex.clips.length; index++) {
        const upcoming = videoIndex.clips[index].block
        const remaining = upcoming.startFrame - normalizedFrame
        if (remaining > EDITOR_V6_VIDEO_LOADING_FRAMES) break
        if (!upcoming.videoPresentation?.loadingGif || !upcoming.mediaId || !mediaIndex.has(upcoming.mediaId)) continue
        const firstFrame = Math.max(0, upcoming.startFrame - EDITOR_V6_VIDEO_LOADING_FRAMES)
        loadingGifFrame = editorV6LoadingGifFrame(normalizedFrame - firstFrame)
        break
      }
    }
  }
  return {
    frame: normalizedFrame,
    background: resolveEditorV6BackgroundAtFrame(document, normalizedFrame),
    ...resolveSceneCharacters(document, normalizedFrame, options),
    ...(mediaVideo ? { mediaVideo } : {}),
    ...(videoCards ? { videoCards } : {}),
    ...(videoCardItems.length ? { videoCardItems } : {}),
    ...(loadingGifFrame !== undefined ? { loadingGifFrame } : {})
  }
}

const motionIndex = new WeakMap<
  EditorV6Document['timeline'],
  Map<boolean, Map<string, Array<{ plan: EditorV6MotionPlan; block: EditorV6TimelineBlock }>>>
>()
const hasPreparedMotion = new WeakMap<EditorV6Timeline, boolean>()
type BaseCharacterIndex = {
  byElementId: Map<string, EditorV6Element>
  byCharacterId: Map<string | undefined, EditorV6Element>
}
const baseCharacterIndexCache = new WeakMap<EditorV6Document['elements'], BaseCharacterIndex>()

function baseCharacterIndex(elements: EditorV6Document['elements']): BaseCharacterIndex {
  let index = baseCharacterIndexCache.get(elements)
  if (index) return index
  reportCacheBuild('base-characters')
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

function attachLinkedBalloons(
  document: EditorV6Document,
  elements: EditorV6Element[],
  frame: number,
  logicalElements: EditorV6Element[] = elements
): EditorV6SceneElement[] {
  let characterIndexes: ReturnType<typeof indexLinkedCharacters> | undefined
  return elements.map((element): EditorV6SceneElement => {
    if (element.kind !== 'speech' && element.kind !== 'thought') return element
    const balloonScalePercent = document.balloonScalePercent ?? 100
    const balloonOffsetY = document.balloonOffsetY ?? 0
    if (!element.characterId && !element.attachedCharacterElementId)
      return { ...element, balloonScalePercent, balloonOffsetY }
    const indexes = (characterIndexes ??= indexLinkedCharacters(document, logicalElements))
    const exactTarget = element.attachedCharacterElementId
      ? indexes.charactersByElementId.get(element.attachedCharacterElementId)
      : undefined
    const linkedTargets = element.characterId ? (indexes.charactersByCharacterId.get(element.characterId) ?? []) : []
    const target =
      exactTarget ??
      linkedTargets.reduce<EditorV6Element | undefined>((nearest, character) => {
        if (!nearest) return character
        const distance = (character.x - element.x) ** 2 + (character.y - element.y) ** 2
        const nearestDistance = (nearest.x - element.x) ** 2 + (nearest.y - element.y) ** 2
        return distance < nearestDistance ? character : nearest
      }, undefined)
    if (!target && element.englishText === undefined) return { ...element, balloonScalePercent, balloonOffsetY }
    const balloonClip = editorV6ClipAtFrame(document.timeline, element.id, frame)
    const attachmentFrame = balloonClip?.block.startFrame ?? frame
    const anchorCharacterState = target && editorV6ClipAtFrame(document.timeline, target.id, attachmentFrame)?.block.state
    const baseCharacter = target && (indexes.base.byElementId.get(target.id) ?? indexes.base.byCharacterId.get(target.characterId))
    const originX = element.attachmentOriginX ?? anchorCharacterState?.x ?? baseCharacter?.x ?? target?.x ?? element.x
    const originY = element.attachmentOriginY ?? anchorCharacterState?.y ?? baseCharacter?.y ?? target?.y ?? element.y
    const x = target ? element.x + target.x - originX : element.x
    const y = target ? element.y + target.y - originY : element.y
    const characterId = target?.characterId ?? element.characterId
    const paired = element.englishText !== undefined
    const pairOffsetY = paired
      ? element.height / 2 * Math.max(1, Math.min(2.5, balloonScalePercent / 100))
      : 0
    const radians = element.rotation * Math.PI / 180
    const layout = fitEditorV6LinkedBalloon(
      x - Math.sin(radians) * pairOffsetY * 10.8 / 19.2,
      y + balloonOffsetY + Math.cos(radians) * pairOffsetY,
      element.width, paired ? element.height * 2 : element.height, element.rotation, balloonScalePercent
    )
    if (!target) return { ...element, balloonScalePercent, balloonOffsetY, balloonLayout: layout }
    const characterHeight = target.height * (target.characterScale ?? 100) / 100 * (target.characterHeightScale ?? 100) / 100
    const faceX = target.x
    const faceY = target.y - characterHeight * 0.38
    const sceneDx = (faceX - layout.x) * 19.2
    const sceneDy = (faceY - layout.y) * 10.8
    const speakerAnchorX = sceneDx * Math.cos(radians) + sceneDy * Math.sin(radians)
    const speakerAnchorY = -sceneDx * Math.sin(radians) + sceneDy * Math.cos(radians)
    return {
      ...element,
      balloonScalePercent,
      balloonOffsetY,
      x,
      y,
      balloonLayout: layout,
      speakerName: target.text.trim() || undefined,
      speakerColor: characterId
        ? (document.characterNameColors?.[characterId] ?? videoCharacterTrackColor(characterId))
        : undefined,
      speakerAnchorX,
      speakerAnchorY
    }
  })
}

/** A blink chooses from the cast at its onset. A cut never retargets it mid-blink. */
function blinkTarget(document: EditorV6Document, frame: number, current?: EditorV6Element[]) {
  const event = editorV6BlinkEventAtFrame(document.id, frame)
  if (!event) return undefined
  const intro = introAtFrame(document.timeline, event.start)
  if (intro) {
    const portrait = editorV6IntroCharacterTrack(intro.track).get(intro.block.id)
    return portrait?.faceModeAssetIds?.blink ? portrait.id : undefined
  }
  const elements = frame === event.start && current ? current : resolveEditorV6StaticElementsAtFrame(document, event.start)
  const candidates = elements.filter(item => item.kind === 'character' && item.assetId && item.faceModeAssetIds?.blink)
    .map(item => item.id).sort()
  return candidates[Math.floor(event.roll * candidates.length)]
}

type FaceOptions = { includeMotion?: boolean; includeSpeechMouth?: boolean }
function resolveSceneCharacters(document: EditorV6Document, frame: number, options: FaceOptions) {
  const resolved = resolveEditorV6StaticElementsAtFrame(document, frame)
  const blinkElementId = blinkTarget(document, frame, resolved)
  return { elements: resolveCharacters(document, frame, resolved, blinkElementId, options), blinkElementId }
}

export function resolveEditorV6ElementsAtFrame(document: EditorV6Document, frame: number, options: FaceOptions = {}): EditorV6SceneElement[] {
  return resolveSceneCharacters(document, frame, options).elements
}

function resolveCharacters(
  document: EditorV6Document,
  frame: number,
  resolved: EditorV6Element[],
  blinkElementId: string | undefined,
  options: FaceOptions
): EditorV6SceneElement[] {
  const applyAutomaticFace = (source: EditorV6Element) => {
    let element = source
    if (element.kind === 'character' && element.characterId) {
      const faceModeAssetIds = element.faceModeAssetIds
      if (faceModeAssetIds?.blink || faceModeAssetIds?.talk || faceModeAssetIds?.['talk-blink']) {
        const autoMode = editorV6FaceModeAtFrame(document.timeline, element.characterId, frame, {
          blinking: element.id === blinkElementId,
          includeSpeechMouth: options.includeSpeechMouth
        })
        const autoAssetId =
          autoMode === 'talk-blink'
            ? (faceModeAssetIds['talk-blink'] ?? faceModeAssetIds.talk)
            : autoMode
              ? faceModeAssetIds[autoMode]
              : undefined
        if (autoAssetId) element = { ...element, assetId: autoAssetId, motionSprite: undefined }
      }
    }
    return element
  }
  if (options.includeMotion === false) return attachLinkedBalloons(document, resolved.map(applyAutomaticFace), frame)
  let prepared = hasPreparedMotion.get(document.timeline)
  if (prepared === undefined) {
    reportCacheBuild('prepared-motion')
    prepared = document.timeline.tracks.some((track) => track.blocks.some((block) => Boolean(block.incomingMotion)))
    hasPreparedMotion.set(document.timeline, prepared)
  }
  // Preview can still show authored poses before any transition atlas is ready.
  if (!prepared) return attachLinkedBalloons(document, resolved.map(applyAutomaticFace), frame)
  const includeSpeechMouth = options.includeSpeechMouth !== false
  const indexes =
    motionIndex.get(document.timeline) ??
    new Map<boolean, Map<string, Array<{ plan: EditorV6MotionPlan; block: EditorV6TimelineBlock }>>>()
  let index = indexes.get(includeSpeechMouth)
  if (!index) {
    reportCacheBuild('motion-plans')
    index = new Map()
    const blocks = new Map(
      document.timeline.tracks.flatMap((track) => track.blocks.map((block) => [block.id, block] as const))
    )
    for (const plan of editorV6MotionPlans(document, { includeSpeechMouth })) {
      const entries = index.get(plan.elementId) ?? []
      entries.push({ plan, block: blocks.get(plan.blockId)! })
      index.set(plan.elementId, entries)
    }
    for (const entries of index.values()) entries.sort((a, b) => a.plan.endFrame - b.plan.endFrame)
    indexes.set(includeSpeechMouth, index)
    motionIndex.set(document.timeline, indexes)
  }
  return attachLinkedBalloons(
    document,
    resolved.map((source) => {
      let element = applyAutomaticFace(source)
      const entries = index!.get(element.id)
      if (!entries) return element
      const left = editorV6UpperBound(entries, frame, (entry) => entry.plan.endFrame)
      const next = entries[left]
      if (
        !next ||
        frame <= next.plan.startFrame ||
        frame >= next.plan.endFrame ||
        next.block.incomingMotion?.key !== next.plan.key
      )
        return element
      const sample = next.block.incomingMotion.frames.find((sample) => sample.offset === frame - next.plan.endFrame)
      if (!sample) return element
      const faceAssetId = next.block.incomingMotion.faceAssetId
      return {
        ...element,
        assetId: next.block.incomingMotion.assetId,
        motionSprite: sample.sprite,
        ...(faceAssetId && sample.facePatch
          ? { mouthPatch: { assetId: faceAssetId, ...sample.facePatch } }
          : { mouthPatch: undefined }),
        x: sample.x,
        y: sample.y,
        width: sample.width,
        height: sample.height,
        rotation: sample.rotation,
        flipX: sample.flipX,
        characterScale: 100,
        characterWidthScale: 100,
        characterHeightScale: 100
      }
    }),
    frame,
    // Atlas sample coordinates describe a texture crop. Attach balloons to
    // the authored character rectangle just as the unprepared preview does.
    resolved
  )
}
