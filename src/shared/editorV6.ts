import type { CustomizerFaceAppearance } from './customizer'
import type { FaceCatalogItemSummary, FaceExpressionEffects, FaceTransform } from './fabricator'

export type EditorV6Asset = {
  id: string
  category: 'background' | 'object' | 'character'
  name: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  dataUrl: string
}

/** EditorV6-local adjustment shared by a facial category and its variant frames. */
export type EditorV6FaceTransform = { x: number; y: number; width: number; height: number; rotation: number; sourceTransformOverride?: FaceTransform }
export type EditorV6FaceTransformCategory = 'eyes' | 'eyebrows' | 'nose' | 'mouth'
/** EditorV6-local playback state for the character's neutral, blink, or speaking face. */
export type EditorV6FaceMode = 'idle' | 'blink' | 'talk'

/** Use the character's talk sheet, its legacy paired sheet, or the model's Dev default. */
export function resolveEditorV6TalkMouthId(
  appearance: Pick<CustomizerFaceAppearance, 'mouthOpenCatalogId' | 'mouthClosedCatalogId'> | undefined,
  catalog: readonly FaceCatalogItemSummary[]
): string | undefined {
  if (appearance?.mouthOpenCatalogId) return appearance.mouthOpenCatalogId
  const legacyClosed = appearance?.mouthClosedCatalogId?.match(/^legacy_(.+)_mouth-closed$/)
  const legacyTalkId = legacyClosed ? `legacy_${legacyClosed[1]}_mouth-open` : undefined
  const legacyTalk = legacyTalkId && catalog.find((item) => item.id === legacyTalkId && item.category === 'mouth-open')
  if (legacyTalk) return legacyTalk.id
  return catalog
    .filter((item) => item.category === 'mouth-open')
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR') || left.id.localeCompare(right.id))[0]?.id
}

/** Keys are category:itemId; bare category keys remain supported for older EditorV6 data. */
export type EditorV6FaceTransforms = Record<string, EditorV6FaceTransform>
export type EditorV6ExpressionBase = { appearance: CustomizerFaceAppearance; transforms: EditorV6FaceTransforms }

/** Shared persistence boundary for manual and expression-specific transforms. */
export function isEditorV6ExpressionEffects(value: unknown): value is FaceExpressionEffects {
  if (value === undefined) return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const effects = value as FaceExpressionEffects
  return (['shadow', 'blush', 'mouthBlush'] as const).every((key) => {
    const effect = effects[key]
    return Boolean(effect && typeof effect.enabled === 'boolean' && /^#[0-9a-f]{6}$/i.test(effect.color)
      && Number.isFinite(effect.opacity) && effect.opacity >= 0 && effect.opacity <= 1
      && Number.isFinite(effect.softness) && effect.softness >= 0 && effect.softness <= 1
      && Number.isFinite(effect.size) && effect.size >= 0.05 && effect.size <= 2
      && Number.isFinite(effect.offsetY) && effect.offsetY >= -0.5 && effect.offsetY <= 0.5
      && (effect.offsetX === undefined || Number.isFinite(effect.offsetX) && effect.offsetX >= -0.5 && effect.offsetX <= 0.5)
      && (effect.aspectRatio === undefined || Number.isFinite(effect.aspectRatio) && effect.aspectRatio >= 0.05 && effect.aspectRatio <= 2)
      && (effect.width === undefined || Number.isFinite(effect.width) && effect.width >= 0.01 && effect.width <= 2)
      && (effect.height === undefined || Number.isFinite(effect.height) && effect.height >= 0.01 && effect.height <= 2)
      && (effect.rotation === undefined || Number.isFinite(effect.rotation) && effect.rotation >= -180 && effect.rotation <= 180)
      && (effect.style === undefined || ['oval', 'cheeks', 'bands', 'diagonal', 'spot'].includes(effect.style)))
  })
}

export function isEditorV6FaceTransforms(value: unknown): value is EditorV6FaceTransforms {
  if (value === undefined) return true
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([key, entry]) => {
    const manual = /^(eyes|eyebrows|nose|mouth|mouth-closed|mouth-open)(:[^:]+)?$/i.test(key)
    const expression = /^expression-component:(eye|pupil|brow)-(left|right)$/.test(key)
      || /^expression:(eyes|eyebrows|eye-left|eye-right|brow-left|brow-right|nose|mouth-closed|mouth-open):[^:]+$/.test(key)
    if (!manual && !expression || !entry || typeof entry !== 'object') return false
    const transform = entry as Partial<EditorV6FaceTransform>
    if (![transform.x, transform.y, transform.width, transform.height, transform.rotation].every((number) => typeof number === 'number' && Number.isFinite(number))) return false
    const source = transform.sourceTransformOverride
    if (source === undefined) return true
    return Boolean(source) && typeof source === 'object' && [source.x, source.y, source.scaleX, source.scaleY, source.rotation].every(Number.isFinite)
      && source.scaleX > 0 && source.scaleY > 0 && (source.flipX === undefined || typeof source.flipX === 'boolean')
  })
}

export type EditorV6Element = {
  id: string
  kind: 'image' | 'character' | 'narrator' | 'speech' | 'thought'
  assetId?: string
  characterId?: string
  /** Customizer revision used to compose this actor's stored image. */
  characterSourceUpdatedAt?: string
  flipX?: boolean
  /** Prevents mouse dragging this character inside this EditorV6. */
  positionLocked?: boolean
  /** Face choices made to this actor inside this EditorV6 only. */
  faceAppearance?: CustomizerFaceAppearance
  /** EditorV6-only facial playback state; does not modify the character's Customizer data. */
  activeFaceMode?: EditorV6FaceMode
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

export type EditorV6TrackKind = 'character' | 'speech' | 'thought' | 'visual' | 'video' | 'audio'
export type EditorV6TimelineBlock = {
  id: string
  /** Links a timeline clip to a layer in the scene when applicable. */
  elementId?: string
  label: string
  startFrame: number
  durationFrames: number
}
export type EditorV6TimelineTrack = {
  id: string
  kind: EditorV6TrackKind
  name: string
  muted: boolean
  locked: boolean
  blocks: EditorV6TimelineBlock[]
}
export type EditorV6Timeline = {
  fps: 30
  durationFrames: number
  tracks: EditorV6TimelineTrack[]
}

export const EDITOR_V6_DEFAULT_DURATION_FRAMES = 300
export const EDITOR_V6_DEFAULT_BLOCK_FRAMES = 150

export function editorV6TrackKindForElement(element: EditorV6Element): EditorV6TrackKind {
  if (element.kind === 'character') return 'character'
  if (element.kind === 'speech') return 'speech'
  if (element.kind === 'thought') return 'thought'
  return 'visual'
}

export function editorV6TrackLabel(kind: EditorV6TrackKind, index = 1): string {
  const labels: Record<EditorV6TrackKind, string> = {
    character: 'Personagem', speech: 'Fala', thought: 'Pensamento', visual: 'Imagem', video: 'Vídeo', audio: 'Áudio'
  }
  return `${labels[kind]} ${index}`
}

/** Creates an initial set of rows and one still-image block for each scene layer. */
export function createEditorV6Timeline(elements: readonly EditorV6Element[] = []): EditorV6Timeline {
  const kinds: EditorV6TrackKind[] = ['character', 'speech', 'thought', 'visual', 'video', 'audio']
  const tracks: EditorV6TimelineTrack[] = kinds.map((kind) => ({
    id: crypto.randomUUID(), kind, name: editorV6TrackLabel(kind), muted: false, locked: false, blocks: []
  }))
  for (const element of elements) {
    const kind = editorV6TrackKindForElement(element)
    const track = tracks.find((candidate) => candidate.kind === kind)!
    track.blocks.push({
      id: crypto.randomUUID(), elementId: element.id,
      label: element.text.trim() || editorV6TrackLabel(kind),
      startFrame: 0, durationFrames: EDITOR_V6_DEFAULT_BLOCK_FRAMES
    })
  }
  return { fps: 30, durationFrames: EDITOR_V6_DEFAULT_DURATION_FRAMES, tracks }
}

export function syncEditorV6TimelineElements(timeline: EditorV6Timeline, elements: readonly EditorV6Element[]): EditorV6Timeline {
  const elementsById = new Map(elements.map((element) => [element.id, element]))
  const tracks = timeline.tracks.map((track) => ({
    ...track,
    blocks: track.blocks.filter((block) => !block.elementId || elementsById.has(block.elementId)).map((block) => {
      const element = block.elementId ? elementsById.get(block.elementId) : undefined
      if (!element) return block
      const kind = editorV6TrackKindForElement(element)
      return { ...block, label: element.text.trim() || editorV6TrackLabel(kind) }
    })
  }))
  for (const element of elements) {
    if (tracks.some((track) => track.blocks.some((block) => block.elementId === element.id))) continue
    const kind = editorV6TrackKindForElement(element)
    let track = tracks.find((candidate) => candidate.kind === kind)
    if (!track) {
      track = { id: crypto.randomUUID(), kind, name: editorV6TrackLabel(kind), muted: false, locked: false, blocks: [] }
      tracks.push(track)
    }
    track.blocks.push({
      id: crypto.randomUUID(), elementId: element.id,
      label: element.text.trim() || editorV6TrackLabel(kind),
      startFrame: 0, durationFrames: EDITOR_V6_DEFAULT_BLOCK_FRAMES
    })
  }
  const endFrame = tracks.flatMap((track) => track.blocks).reduce((end, block) => Math.max(end, block.startFrame + block.durationFrames), timeline.durationFrames)
  return { ...timeline, durationFrames: endFrame, tracks }
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
  elements: EditorV6Element[]
  timeline: EditorV6Timeline
}

export type EditorV6DesktopApi = {
  listEditorV6Projects: () => Promise<EditorV6Document[]>
  saveEditorV6Project: (editorV6: EditorV6Document) => Promise<void>
  deleteEditorV6Project: (id: string) => Promise<void>
  getEditorV6Folder: () => Promise<string>
  importEditorV6Image: (category: EditorV6Asset['category']) => Promise<EditorV6Asset | null>
  saveEditorV6Print: (editorV6Id: string, dataUrl: string) => Promise<string | null>
  openEditorV6Prints: (editorV6Id: string) => Promise<void>
}

