import type { CustomizerFaceAppearance } from './customizer'
import type { FaceExpressionEffects } from './fabricator'
import { isSceneFaceExpressionEffects, isSceneFaceTransforms, type SceneExpressionBase, type SceneFaceMode, type SceneFaceTransform, type SceneFaceTransformCategory, type SceneFaceTransforms } from './sceneFaceValidation'
import type { EditorV6ExportAudio, EditorV6ExportOptions, EditorV6ExportStatus } from './editorV6Export'
import type { EditorV6MotionAtlas, EditorV6MotionBakeRequest, EditorV6MotionBakeResult, EditorV6MotionSprite } from './editorV6Motion'
export { resolveTalkMouthCatalogId as resolveEditorV6TalkMouthId } from './faceMouthSelection'

export type EditorV6Asset = {
  id: string
  category: 'background' | 'object' | 'character'
  name: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  dataUrl: string
  timelineSnapshot?: boolean
}
export type EditorV6MediaAsset = {
  id: string
  name: string
  fileName: string
  /** Existing video from the shared Base Videos catalog; never copied into this project. */
  libraryVideoId?: string
  kind: 'video' | 'audio'
  mimeType: string
  sourceFrames: number
  hasAudio: boolean
  width?: number
  height?: number
  sizeBytes: number
}
export function editorV6MediaUrl(projectId: string, fileName: string, libraryVideoId?: string): string {
  if (libraryVideoId) return `gacha-editor-media://library/${projectId}/${libraryVideoId}`
  return `gacha-editor-media://project/${projectId}/${fileName}`
}

/** EditorV6-local adjustment shared by a facial category and its variant frames. */
export type EditorV6FaceTransform = SceneFaceTransform
export type EditorV6FaceTransformCategory = SceneFaceTransformCategory
/** EditorV6-local playback state for the character's neutral, blink, or speaking face. */
export type EditorV6FaceMode = SceneFaceMode
export type EditorV6FaceRenderMode = EditorV6FaceMode | 'talk-blink'

/** Keys are category:itemId; bare category keys remain supported for older EditorV6 data. */
export type EditorV6FaceTransforms = SceneFaceTransforms
export type EditorV6ExpressionBase = SceneExpressionBase

/** Shared persistence boundary for manual and expression-specific transforms. */
export function isEditorV6ExpressionEffects(value: unknown): value is FaceExpressionEffects {
  return isSceneFaceExpressionEffects(value)
}

export function isEditorV6FaceTransforms(value: unknown): value is EditorV6FaceTransforms {
  return isSceneFaceTransforms(value)
}

export type EditorV6Element = {
  id: string
  /** Playback-only atlas crop; never written into an authored state. */
  motionSprite?: EditorV6MotionSprite
  visible?: boolean
  kind: 'image' | 'character' | 'narrator' | 'speech' | 'thought'
  assetId?: string
  characterId?: string
  /** Customizer revision used to compose this actor's stored image. */
  characterSourceUpdatedAt?: string
  /** Saved Fabricator pose revision used to compose this actor's stored image. */
  poseSourceRevision?: string
  flipX?: boolean
  /** Prevents mouse dragging this character inside this EditorV6. */
  positionLocked?: boolean
  /** Face choices made to this actor inside this EditorV6 only. */
  faceAppearance?: CustomizerFaceAppearance
  /** EditorV6-only facial playback state; does not modify the character's Customizer data. */
  activeFaceMode?: EditorV6FaceMode
  /** Pre-rendered alternatives selected by timeline playback without recomposing the character per frame. */
  faceModeAssetIds?: Partial<Record<EditorV6FaceRenderMode, string>>
  /** Face-piece transforms are stored per selected catalog sheet on this EditorV6 actor. */
  faceTransforms?: EditorV6FaceTransforms
  /** Character-specific neutral face, shared by every expression collection. */
  expressionBase?: EditorV6ExpressionBase
  /** PT looks left; ordinary expression looks right. Same preset, scene-only gaze. */
  activeExpressionGaze?: 'right' | 'left'
  activeExpressionPresetId?: string | null
  /** Saved preset revision currently composed into this EditorV6 actor. */
  activeExpressionPresetUpdatedAt?: string
  /** Renderer revision used to generate the actor's cached EditorV6 image. */
  faceRendererVersion?: number
  activeExpressionEffects?: FaceExpressionEffects
  /** Expression collection currently selected for this actor in the inspector. */
  activeExpressionCollectionId?: string
  /** Pose selected for this actor inside this EditorV6 only. */
  poseSlot?: number | null
  /** Uniform actor size and independent axis squeeze, in percent of its saved base size. */
  characterScale?: number
  characterWidthScale?: number
  characterHeightScale?: number
  /** Width of the untrimmed character artwork relative to the EditorV6 canvas. */
  characterCanvasWidth?: number
  text: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
}

export type EditorV6TrackKind = 'character' | 'speech' | 'thought' | 'object' | 'video' | 'audio'
export type EditorV6BackgroundState = {
  backgroundColor: string
  backgroundAssetId: string | null
  backgroundX: number
  backgroundY: number
  backgroundWidth: number
  backgroundHeight: number
  backgroundRotation: number
}
export type EditorV6VideoLayout = { x: number; y: number; width: number; height: number; rotation: number }
export const EDITOR_V6_DEFAULT_VIDEO_LAYOUT: EditorV6VideoLayout = { x: 0, y: 0, width: 40, height: 40, rotation: 0 }
export function editorV6DefaultVideoLayout(width?: number, height?: number): EditorV6VideoLayout {
  const aspect = width && height && width > 0 && height > 0 ? width / height : 16 / 9
  const stageAspect = 1920 / 1080
  return aspect >= stageAspect
    ? { ...EDITOR_V6_DEFAULT_VIDEO_LAYOUT, height: Math.round(40 * stageAspect / aspect * 10000) / 10000 }
    : { ...EDITOR_V6_DEFAULT_VIDEO_LAYOUT, width: Math.round(40 * aspect / stageAspect * 10000) / 10000 }
}
export type EditorV6TimelineBlock = {
  id: string
  /** Links a timeline clip to a layer in the scene when applicable. */
  elementId?: string
  label: string
  startFrame: number
  durationFrames: number
  /** Immutable visual/text state for this period, independent from other clips. */
  state?: EditorV6Element
  background?: EditorV6BackgroundState
  characterId?: string
  parentBlockId?: string
  relativeStartFrame?: number
  motionEnabled?: boolean
  incomingMotion?: EditorV6MotionAtlas
  mediaId?: string
  /** Position and size of the video layer on the 1920×1080 scene. */
  mediaLayout?: EditorV6VideoLayout
  mediaInFrame?: number
  audioEnabled?: boolean
  gain?: number
}
export type EditorV6TimelineTrack = {
  id: string
  kind: EditorV6TrackKind
  /** Set only on a character lane; all instances of the same character share it. */
  characterId?: string
  name: string
  muted: boolean
  locked: boolean
  hidden?: boolean
  collapsed?: boolean
  motionEnabled?: boolean
  blocks: EditorV6TimelineBlock[]
}
export type EditorV6Timeline = {
  fps: 30
  durationFrames: number
  tracks: EditorV6TimelineTrack[]
  knownElementIds?: string[]
}

export const EDITOR_V6_DEFAULT_DURATION_FRAMES = 300
export const EDITOR_V6_DEFAULT_BLOCK_FRAMES = 150

export function editorV6TrackKindForElement(element: EditorV6Element): EditorV6TrackKind {
  if (element.kind === 'character') return 'character'
  if (element.kind === 'speech') return 'speech'
  if (element.kind === 'thought') return 'thought'
  if (element.kind === 'image') return 'object'
  return 'video'
}

export function editorV6TrackLabel(kind: EditorV6TrackKind, index = 1): string {
  const labels: Record<EditorV6TrackKind, string> = { character: 'Personagem', speech: 'Fala', thought: 'Pensamento', object: 'Objetos', video: 'Vídeo', audio: 'Áudio' }
  return index === 1 ? labels[kind] : `${labels[kind]} ${index}`
}

const TIMELINE_TRACK_GROUP_ORDER: Record<EditorV6TrackKind, number> = { video: 0, speech: 0, thought: 0, character: 1, object: 2, audio: 3 }
export function orderEditorV6TimelineTracks(tracks: readonly EditorV6TimelineTrack[]): EditorV6TimelineTrack[] {
  return tracks.map((track, index) => ({ track, index }))
    .sort((left, right) => TIMELINE_TRACK_GROUP_ORDER[left.track.kind] - TIMELINE_TRACK_GROUP_ORDER[right.track.kind] || left.index - right.index)
    .map(({ track }) => track)
}

/** Creates shared lanes and character lanes in the default visual stacking order. */
export function createEditorV6Timeline(elements: readonly EditorV6Element[] = []): EditorV6Timeline {
  const kinds: EditorV6TrackKind[] = ['video', 'speech', 'thought']
  const tracks: EditorV6TimelineTrack[] = kinds.map((kind) => ({
    id: crypto.randomUUID(), kind, name: editorV6TrackLabel(kind), muted: false, locked: false, blocks: []
  }))
  for (const element of elements) {
    const kind = editorV6TrackKindForElement(element)
    let track = kind === 'character'
      ? tracks.find((candidate) => candidate.kind === 'character' && candidate.characterId === element.characterId)
      : tracks.find((candidate) => candidate.kind === kind)
    if (!track) {
      track = { id: crypto.randomUUID(), kind, ...(element.characterId ? { characterId: element.characterId } : {}), name: kind === 'character' ? element.text.trim() || editorV6TrackLabel(kind, tracks.filter((item) => item.kind === kind).length + 1) : editorV6TrackLabel(kind), muted: false, locked: false, blocks: [] }
      tracks.push(track)
    }
    track.blocks.push({
      id: crypto.randomUUID(), elementId: element.id,
      label: element.text.trim() || editorV6TrackLabel(kind),
      state: { ...element },
      startFrame: 0, durationFrames: kind === 'character' ? EDITOR_V6_DEFAULT_DURATION_FRAMES : EDITOR_V6_DEFAULT_BLOCK_FRAMES
    })
  }
  for (const kind of ['object', 'audio'] as const) if (!tracks.some((track) => track.kind === kind)) tracks.push({
    id: crypto.randomUUID(), kind, name: editorV6TrackLabel(kind), muted: false, locked: false, blocks: []
  })
  return { fps: 30, durationFrames: EDITOR_V6_DEFAULT_DURATION_FRAMES, tracks: orderEditorV6TimelineTracks(tracks), knownElementIds: elements.map((element) => element.id) }
}

export function syncEditorV6TimelineElements(timeline: EditorV6Timeline, elements: readonly EditorV6Element[]): EditorV6Timeline {
  const elementsById = new Map(elements.map((element) => [element.id, element]))
  // Migrate old generic character/visual/audio rows while retaining clip IDs and timing.
  const reusableShared = new Map<EditorV6TrackKind, EditorV6TimelineTrack>()
  for (const track of timeline.tracks) {
    const previousKind = String(track.kind)
    const kind = previousKind === 'speech' || previousKind === 'thought' || previousKind === 'object' || previousKind === 'audio' ? previousKind : previousKind === 'video' || previousKind === 'visual' ? 'video' : undefined
    if (kind && !reusableShared.has(kind)) reusableShared.set(kind, { ...track, kind, characterId: undefined, blocks: [] })
  }
  const tracks: EditorV6TimelineTrack[] = (['video', 'speech', 'thought', 'object', 'audio'] as const).map((kind) => reusableShared.get(kind) ?? ({
    id: crypto.randomUUID(), kind, name: editorV6TrackLabel(kind), muted: false, locked: false, blocks: []
  }))
  if (!timeline.tracks.some((track) => track.kind === 'object')) {
    const previousVisualTrack = timeline.tracks.find((track) => track.kind === 'video')
    const objectTrack = tracks.find((track) => track.kind === 'object')
    if (previousVisualTrack && objectTrack) {
      objectTrack.muted = previousVisualTrack.muted
      objectTrack.locked = previousVisualTrack.locked
      objectTrack.hidden = previousVisualTrack.hidden
      objectTrack.collapsed = previousVisualTrack.collapsed
    }
  }
  const characterTracks = new Map<string, EditorV6TimelineTrack>()
  const activeCharacterIds = new Set(elements.filter((element) => element.kind === 'character' && element.characterId).map((element) => element.characterId!))
  for (const track of timeline.tracks) if (track.kind === 'character' && track.characterId && activeCharacterIds.has(track.characterId)) characterTracks.set(track.characterId, { ...track, blocks: [] })
  const destinationFor = (element: EditorV6Element): EditorV6TimelineTrack => {
    const kind = editorV6TrackKindForElement(element)
    if (kind !== 'character') return tracks.find((track) => track.kind === kind)!
    if (!element.characterId) return tracks[0]
    let track = characterTracks.get(element.characterId)
    if (!track) {
      const oldTrack = timeline.tracks.find((candidate) => candidate.kind === 'character' && candidate.blocks.some((block) => block.elementId === element.id))
      track = { id: oldTrack?.characterId === element.characterId ? oldTrack.id : crypto.randomUUID(), kind: 'character', characterId: element.characterId, name: element.text.trim() || editorV6TrackLabel('character', characterTracks.size + 1), muted: oldTrack?.muted ?? false, locked: oldTrack?.locked ?? false, blocks: [] }
      characterTracks.set(element.characterId, track)
    }
    return track
  }
  const placedBlocks = new Set<string>()
  const knownElementIds = new Set(timeline.knownElementIds ?? timeline.tracks.flatMap((track) => track.blocks.flatMap((block) => block.elementId ? [block.elementId] : [])))
  for (const oldTrack of timeline.tracks) for (const block of oldTrack.blocks) {
    const element = block.elementId ? elementsById.get(block.elementId) : undefined
    if (block.elementId && !element) continue
    const oldKind = String(oldTrack.kind)
    const destination = element ? destinationFor(element) : tracks.find((track) => track.kind === (oldKind === 'speech' || oldKind === 'thought' || oldKind === 'object' || oldKind === 'audio' ? oldKind : 'video'))!
    destination.blocks.push(element ? { ...block, state: block.state ?? { ...element }, label: block.state ? block.label : element.text.trim() || editorV6TrackLabel(editorV6TrackKindForElement(element)) } : block)
    if (block.elementId) placedBlocks.add(block.elementId)
  }
  for (const element of elements) {
    if (placedBlocks.has(element.id) || knownElementIds.has(element.id)) continue
    const kind = editorV6TrackKindForElement(element)
    const track = destinationFor(element)
    track.blocks.push({
      id: crypto.randomUUID(), elementId: element.id,
      label: element.text.trim() || editorV6TrackLabel(kind),
      state: { ...element },
      startFrame: 0, durationFrames: kind === 'character' ? timeline.durationFrames : EDITOR_V6_DEFAULT_BLOCK_FRAMES
    })
  }
  tracks.push(...characterTracks.values())
  const endFrame = tracks.flatMap((track) => track.blocks).reduce((end, block) => Math.max(end, block.startFrame + block.durationFrames), timeline.durationFrames)
  return { ...timeline, durationFrames: endFrame, tracks: orderEditorV6TimelineTracks(tracks), knownElementIds: elements.map((element) => element.id) }
}

export const VIDEO_CHARACTER_TRACK_COLORS = ['#7768c8', '#5277b8', '#aa8264', '#478f83', '#b47a43', '#bd6386', '#4b91ad', '#8b6c9c'] as const

export function videoCharacterTrackColor(id: string, selected?: string): string {
  if (selected && /^#[0-9a-f]{6}$/i.test(selected)) return selected
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0
  return VIDEO_CHARACTER_TRACK_COLORS[Math.abs(hash) % VIDEO_CHARACTER_TRACK_COLORS.length]
}

export type EditorV6Document = {
  schemaVersion: 1
  id: string
  title: string
  color: string
  createdAt: string
  updatedAt: string
  backgroundColor: string
  backgroundAssetId: string | null
  backgroundX: number
  backgroundY: number
  backgroundWidth: number
  backgroundHeight: number
  backgroundRotation: number
  /** Compressed snapshot of the latest saved composition, shown on the EditorV6 card. */
  thumbnailDataUrl?: string
  assets: EditorV6Asset[]
  media?: EditorV6MediaAsset[]
  elements: EditorV6Element[]
  timeline: EditorV6Timeline
  exportAudio?: EditorV6ExportAudio[]
}

/** Metadados leves usados para montar a biblioteca sem carregar os PNGs do projeto. */
export type EditorV6ProjectSummary = Pick<EditorV6Document, 'id' | 'title' | 'color' | 'createdAt' | 'updatedAt' | 'thumbnailDataUrl'>

export function editorV6ProjectSummary(document: EditorV6Document): EditorV6ProjectSummary {
  const { id, title, color, createdAt, updatedAt, thumbnailDataUrl } = document
  return { id, title, color, createdAt, updatedAt, ...(thumbnailDataUrl ? { thumbnailDataUrl } : {}) }
}

export type EditorV6DesktopApi = {
  listEditorV6Projects: () => Promise<EditorV6ProjectSummary[]>
  loadEditorV6Project: (id: string) => Promise<EditorV6Document | null>
  saveEditorV6Project: (editorV6: EditorV6Document) => Promise<void>
  deleteEditorV6Project: (id: string) => Promise<void>
  getEditorV6Folder: () => Promise<string>
  importEditorV6Image: (category: EditorV6Asset['category']) => Promise<EditorV6Asset | null>
  saveEditorV6Print: (editorV6Id: string, dataUrl: string) => Promise<string | null>
  openEditorV6Prints: (editorV6Id: string) => Promise<void>
  startEditorV6Export: (project: EditorV6Document, options: EditorV6ExportOptions) => Promise<EditorV6ExportStatus | null>
  getEditorV6ExportStatus: (jobId: string) => Promise<EditorV6ExportStatus>
  cancelEditorV6Export: (jobId: string) => Promise<void>
  revealEditorV6Export: (jobId: string, showReport?: boolean) => Promise<void>
  importEditorV6ExportAudio: (projectId: string) => Promise<EditorV6ExportAudio | null>
  cloneEditorV6ExportAudio: (sourceId: string, targetId: string, clips: EditorV6ExportAudio[]) => Promise<void>
  importEditorV6Media: (projectId: string, kind: EditorV6MediaAsset['kind']) => Promise<EditorV6MediaAsset | null>
  linkEditorV6LibraryVideo: (projectId: string, libraryVideoId: string) => Promise<EditorV6MediaAsset>
  cloneEditorV6Media: (sourceId: string, targetId: string, media: EditorV6MediaAsset[]) => Promise<void>
  bakeEditorV6Motion: (request: EditorV6MotionBakeRequest) => Promise<EditorV6MotionBakeResult>
  prepareEditorV6Motion: (request: EditorV6MotionBakeRequest) => Promise<void>
  cancelEditorV6Motion: (requestId: string) => Promise<void>
}

