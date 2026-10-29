import type { CustomizerFaceAppearance } from './customizer'
import type { FaceExpressionEffects } from './fabricator'
import { isSceneFaceExpressionEffects, isSceneFaceTransforms, type SceneExpressionBase, type SceneFaceMode, type SceneFaceTransform, type SceneFaceTransformCategory, type SceneFaceTransforms } from './sceneFaceValidation'
export { resolveTalkMouthCatalogId as resolveStudioTalkMouthId } from './faceMouthSelection'

export type StudioAsset = {
  id: string
  category: 'background' | 'object' | 'character'
  name: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  dataUrl: string
}

/** Studio-local adjustment shared by a facial category and its variant frames. */
export type StudioFaceTransform = SceneFaceTransform
export type StudioFaceTransformCategory = SceneFaceTransformCategory
/** Studio-local playback state for the character's neutral, blink, or speaking face. */
export type StudioFaceMode = SceneFaceMode

/** Keys are category:itemId; bare category keys remain supported for older Studio data. */
export type StudioFaceTransforms = SceneFaceTransforms
export type StudioExpressionBase = SceneExpressionBase

/** Shared persistence boundary for manual and expression-specific transforms. */
export function isStudioExpressionEffects(value: unknown): value is FaceExpressionEffects {
  return isSceneFaceExpressionEffects(value)
}

export function isStudioFaceTransforms(value: unknown): value is StudioFaceTransforms {
  return isSceneFaceTransforms(value)
}

export type StudioElement = {
  id: string
  kind: 'image' | 'character' | 'narrator' | 'speech' | 'thought'
  assetId?: string
  characterId?: string
  /** Customizer revision used to compose this actor's stored image. */
  characterSourceUpdatedAt?: string
  flipX?: boolean
  /** Prevents mouse dragging this character inside this Studio. */
  positionLocked?: boolean
  /** Face choices made to this actor inside this Studio only. */
  faceAppearance?: CustomizerFaceAppearance
  /** Studio-only facial playback state; does not modify the character's Customizer data. */
  activeFaceMode?: StudioFaceMode
  /** Face-piece transforms are stored per selected catalog sheet on this Studio actor. */
  faceTransforms?: StudioFaceTransforms
  /** Character-specific neutral face, shared by every expression collection. */
  expressionBase?: StudioExpressionBase
  /** PT looks left; ordinary expression looks right. Same preset, scene-only gaze. */
  activeExpressionGaze?: 'right' | 'left'
  activeExpressionPresetId?: string | null
  /** Saved preset revision currently composed into this Studio actor. */
  activeExpressionPresetUpdatedAt?: string
  /** Renderer revision used to generate the actor's cached Studio image. */
  faceRendererVersion?: number
  activeExpressionEffects?: FaceExpressionEffects
  /** Expression collection currently selected for this actor in the inspector. */
  activeExpressionCollectionId?: string
  /** Pose selected for this actor inside this Studio only. */
  poseSlot?: number | null
  /** Uniform actor size and independent axis squeeze, in percent of its saved base size. */
  characterScale?: number
  characterWidthScale?: number
  characterHeightScale?: number
  /** Width of the untrimmed character artwork relative to the Studio canvas. */
  characterCanvasWidth?: number
  text: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  zIndex: number
}

export const VIDEO_CHARACTER_TRACK_COLORS = ['#7768c8', '#5277b8', '#aa8264', '#478f83', '#b47a43', '#bd6386', '#4b91ad', '#8b6c9c'] as const

export function videoCharacterTrackColor(id: string, selected?: string): string {
  if (selected && /^#[0-9a-f]{6}$/i.test(selected)) return selected
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0
  return VIDEO_CHARACTER_TRACK_COLORS[Math.abs(hash) % VIDEO_CHARACTER_TRACK_COLORS.length]
}

export type StudioDocument = {
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
  /** Compressed snapshot of the latest saved composition, shown on the Studio card. */
  thumbnailDataUrl?: string
  assets: StudioAsset[]
  elements: StudioElement[]
}

export type VideoBackgroundLibraryItem = {
  id: string
  name: string
  mimeType: StudioAsset['mimeType']
  extension: 'png' | 'jpg' | 'jpeg' | 'webp'
  size: number
  createdAt: string
  available: boolean
  studios: Array<{ id: string; title: string }>
}

export type StudioDesktopApi = {
  flushPendingWrites: () => Promise<void>
  listStudios: () => Promise<StudioDocument[]>
  saveStudio: (studio: StudioDocument) => Promise<void>
  deleteStudio: (id: string) => Promise<void>
  getStudioFolder: () => Promise<string>
  importStudioImage: (category: StudioAsset['category']) => Promise<StudioAsset | null>
  saveStudioPrint: (studioId: string, dataUrl: string) => Promise<string | null>
  openStudioPrints: (studioId: string) => Promise<void>
}

/** Background media library used by Roteiros. Video files have their own mediaLibrary API. */
export type VideoBackgroundLibraryDesktopApi = {
  listVideoBackgroundLibrary: () => Promise<VideoBackgroundLibraryItem[]>
  importVideoBackground: () => Promise<VideoBackgroundLibraryItem | null>
  deleteVideoBackground: (id: string) => Promise<void>
}
