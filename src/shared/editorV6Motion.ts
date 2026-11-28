import { editorV6IntroCharacterTrack } from './editorV6Intro'
/** V6 motion contract and frame scheduling. No dependency on either Dev animator. */
import type { CustomizerCharacter } from './customizer'
import type { EditorV6Asset, EditorV6Document, EditorV6Element, EditorV6FaceRenderMode, EditorV6TimelineBlock, EditorV6TimelineTrack } from './editorV6'
import type { CharacterRenderAssetProvider } from './characterRenderAssets'
import { isEditorV6CharacterSpeakingAtFrame } from './editorV6FaceSchedule'
import { orderedEditorV6TimelineBlocks } from './editorV6TimelineCore'
import { EDITOR_V6_TIMELINE_FPS } from './editorV6Timing'
export { editorV6MotionChannels } from './editorV6MotionChannels'

export const EDITOR_V6_MOTION_VERSION = 13
export const EDITOR_V6_MOTION_MS = 250
export type EditorV6MotionSprite = { x: number; y: number; width: number; height: number; atlasWidth: number; atlasHeight: number }
export type EditorV6FacePatch = { sprite: EditorV6MotionSprite; x: number; y: number; width: number; height: number; replace?: boolean; replaceBounds?: { x: number; y: number; width: number; height: number } }
export type EditorV6MotionFrame = { offset: number; sprite: EditorV6MotionSprite; x: number; y: number; width: number; height: number; rotation: number; flipX: boolean; facePatch?: EditorV6FacePatch }
export type EditorV6MotionAtlas = { version: 1; key: string; assetId: string; faceAssetId?: string; frames: EditorV6MotionFrame[] }
export type EditorV6MotionPlan = {
  blockId: string; elementId: string; characterId: string; key: string; startFrame: number; endFrame: number
  from: EditorV6Element; to: EditorV6Element; samples: Array<{ offset: number; progress: number; faceMode?: EditorV6FaceRenderMode }>
}
export type EditorV6MotionBakeRequest = { id: string; plan: EditorV6MotionPlan; character: CustomizerCharacter; mouthScaleSamples?: number[]; maxAtlasPixels?: number; /** Unique export-local cache scope. Scoped bakes never touch persistent cache. */ cacheScope?: string; /** Test-only A/B switch; never serialized into a project. */ diagnosticDisableScopedPreparationReuse?: boolean }
export type EditorV6MotionBakeProfile = {
  assetLoadingMs: number
  poseResolutionMs: number
  facePreparationMs: number
  endpointGeometryMs: number
  endpointGeometryCacheHits?: number
  endpointGeometryCacheMisses?: number
  rigBuildMs: number
  sampleRenderingMs: number
  cropDetectionMs: number
  facePatchPreparationMs: number
  atlasAssemblyMs: number
  faceAtlasMs: number
  atlasEncodingMs: number
  sampleRenderCalls: number
  providerReadCalls?: number
  providerCacheHits?: number
  providerCacheMisses?: number
  providerCacheEvictions?: number
  providerReadMs?: number
  servicePoolCapacity?: number
  serviceObservedPeakConcurrency?: number
  serviceActiveConcurrencyAtDispatch?: number
  /** Time queued behind another bake in the Electron motion-service lane. */
  serviceQueueWaitMs?: number
  /** Number of requests already queued on the selected lane when this bake arrived. */
  serviceQueueDepthAtEnqueue?: number
  ipcRoundTripMs?: number
  ipcOverheadMs?: number
  requestPayloadBytes?: number
  resultPayloadBytes?: number
}
export type EditorV6MotionBakeResult = {
  asset: EditorV6Asset
  faceAsset?: EditorV6Asset
  /** Export-only base variants keep the canonical face intact except for the separately drawn mouth. */
  mouthlessBaseAssets?: Array<{ faceMode: 'talk' | 'talk-blink'; asset: EditorV6Asset }>
  /** Pixel crop that defines the coordinate space of isolated mouth patches. */
  facePatchSourceCrop?: { left: number; top: number; width: number; height: number }
  /** The primary asset itself is a localized face-patch atlas, used only for static mouth loops. */
  assetRole?: 'face-atlas'
  /** Records whether the export loop contains only the catalog mouth or uses the compatible legacy patch. */
  mouthIsolationMode?: 'isolated-piece' | 'legacy-patch'
  motion: EditorV6MotionAtlas
  metrics: { milliseconds: number; preparedRigs: number; reusedRigs?: number; rigKeyLookups?: number; rigRebuilds?: number; rigBuildMilliseconds?: number; samples: number; atlasPixels: number; profile?: EditorV6MotionBakeProfile }
}
/** Static mouth cycles store their localized face atlas as the motion asset itself. */
export function editorV6UsesStaticMouthAtlas(request: EditorV6MotionBakeRequest): boolean {
  return Boolean(request.mouthScaleSamples
    && JSON.stringify(request.plan.from) === JSON.stringify(request.plan.to)
    && request.plan.samples.every((sample) => sample.faceMode === request.plan.from.activeFaceMode))
}
export function editorV6MotionRequiresFaceAsset(motion: Pick<EditorV6MotionAtlas, 'frames'> | undefined): boolean {
  return Boolean(motion?.frames.some((frame) => frame.facePatch))
}
export function editorV6MotionHasAvailableAssets(motion: EditorV6MotionAtlas | undefined, assets: ReadonlyMap<string, EditorV6Asset>): boolean {
  if (!motion || assets.get(motion.assetId)?.category !== 'character') return false
  if (motion.faceAssetId && assets.get(motion.faceAssetId)?.category !== 'character') return false
  return !editorV6MotionRequiresFaceAsset(motion) || Boolean(motion.faceAssetId)
}

/** Prepared atlases are derived data. An incomplete legacy atlas must be
 * regenerated from the preserved timeline states, never treated as ready. */
export function invalidateIncompleteEditorV6Motions(document: EditorV6Document): EditorV6Document {
  const assets = new Map(document.assets.map(asset => [asset.id, asset]))
  let changed = false
  const tracks = document.timeline.tracks.map(track => ({ ...track, blocks: track.blocks.map(block => {
    if (!block.incomingMotion || editorV6MotionHasAvailableAssets(block.incomingMotion, assets)) return block
    changed = true
    return { ...block, incomingMotion: undefined }
  }) }))
  return changed ? { ...document, timeline: { ...document.timeline, tracks } } : document
}
export type EditorV6MotionBridge = { payload: () => Promise<EditorV6MotionBakeRequest | null>; provider: CharacterRenderAssetProvider; complete: (result?: EditorV6MotionBakeResult, error?: string) => Promise<void> }

function faceSignature(element: EditorV6Element) {
  const entries = Object.entries(element.faceAppearance ?? {}).filter(([key, value]) => key !== 'eyeState' && key !== 'mouthOpen' && value !== undefined)
  const appearance = entries.length ? Object.fromEntries(entries) : undefined
  return JSON.stringify([element.poseSlot === undefined ? 'character-default' : element.poseSlot, element.activeExpressionPresetId ?? null, element.activeExpressionPresetUpdatedAt, element.activeExpressionGaze, appearance, element.faceTransforms, element.activeExpressionEffects])
}
function motionKey({ from, to, samples }: Omit<EditorV6MotionPlan, 'key'>) {
  const endpoint = (element: EditorV6Element) => [faceSignature(element), element.assetId, element.characterId, element.characterSourceUpdatedAt, element.modelSourceRevision, element.poseSourceRevision, element.wardrobeSourceRevision, element.hairSourceRevision, element.headExtraSourceRevision, element.eyeSourceRevision, element.activeFaceMode, element.faceRendererVersion, element.x, element.y, element.width, element.height, element.rotation, element.flipX, element.characterScale, element.characterWidthScale, element.characterHeightScale, element.characterCanvasWidth]
  return JSON.stringify([EDITOR_V6_MOTION_VERSION, endpoint(from), endpoint(to), samples])
}
export function editorV6MotionPlan(track: EditorV6TimelineTrack, previous: EditorV6TimelineBlock, next: EditorV6TimelineBlock): EditorV6MotionPlan | null {
  const plan = motionPlanWithoutKey(track, previous, next)
  return plan ? { ...plan, key: motionKey(plan) } : null
}

function motionPlanWithoutKey(track: EditorV6TimelineTrack, previous: EditorV6TimelineBlock, next: EditorV6TimelineBlock): Omit<EditorV6MotionPlan, 'key'> | null {
  const introStates = track.kind === 'intro' ? editorV6IntroCharacterTrack(track) : undefined
  if (introStates && (previous.startFrame + previous.durationFrames !== next.startFrame
    || previous.intro?.kind !== 'character' || next.intro?.kind !== 'character'
    || !previous.intro.portraitAspect || !next.intro.portraitAspect)) return null
  const from = introStates ? introStates.get(previous.id) : previous.state
  const to = introStates ? introStates.get(next.id) : next.state
  if ((track.kind !== 'character' && track.kind !== 'intro') || track.motionEnabled === false || next.motionEnabled === false || !from || !to || from.kind !== 'character' || to.kind !== 'character' || from.id !== to.id || !from.characterId || from.characterId !== to.characterId || from.visible === false || to.visible === false || next.startFrame <= previous.startFrame || faceSignature(from) === faceSignature(to)) return null
  // Material/source revisions are cuts; pose/expression motion belongs to one stable actor.
  if (from.characterSourceUpdatedAt && to.characterSourceUpdatedAt && from.characterSourceUpdatedAt !== to.characterSourceUpdatedAt) return null
  if (from.modelSourceRevision !== to.modelSourceRevision) return null
  if (from.wardrobeSourceRevision !== to.wardrobeSourceRevision) return null
  if (from.hairSourceRevision !== to.hairSourceRevision) return null
  if (from.headExtraSourceRevision !== to.headExtraSourceRevision) return null
  if (from.eyeSourceRevision !== to.eyeSourceRevision) return null
  const startFrame = Math.max(previous.startFrame, next.startFrame - EDITOR_V6_MOTION_MS * EDITOR_V6_TIMELINE_FPS / 1000)
  const samples = []
  for (let frame = Math.floor(startFrame) + 1; frame < next.startFrame; frame++) samples.push({ offset: frame - next.startFrame, progress: (frame - startFrame) / (next.startFrame - startFrame) })
  if (!samples.length) return null
  return { blockId: next.id, elementId: from.id, characterId: from.characterId, startFrame, endFrame: next.startFrame, from, to, samples }
}

/** Hair-layer transitions are required for pose or actor geometry changes,
 * but a facial preset transition uses the regular character motion atlas and
 * must not warp the hair/body layers along with it. */
export function editorV6MotionChangesHairGeometry(plan: Pick<EditorV6MotionPlan, 'from' | 'to'>): boolean {
  const signature = (element: EditorV6Element) => JSON.stringify([
    // assetId changes for expression snapshots too; compare the actual actor geometry.
    element.poseSlot ?? null,
    element.x, element.y, element.width, element.height, element.rotation, Boolean(element.flipX),
    element.characterScale ?? null, element.characterWidthScale ?? null,
    element.characterHeightScale ?? null, element.characterCanvasWidth ?? null,
    element.characterSourceUpdatedAt ?? null, element.modelSourceRevision ?? null,
    element.poseSourceRevision ?? null, element.wardrobeSourceRevision ?? null,
    element.hairSourceRevision ?? null, element.headExtraSourceRevision ?? null
  ])
  return signature(plan.from) !== signature(plan.to)
}

const plansCache = new WeakMap<EditorV6Document['timeline'], Map<boolean, EditorV6MotionPlan[]>>()
export function editorV6MotionPlans(document: EditorV6Document, options: { includeSpeechMouth?: boolean; preparedOnly?: boolean } = {}): EditorV6MotionPlan[] {
  const includeSpeechMouth = options.includeSpeechMouth !== false
  const cached = plansCache.get(document.timeline)?.get(includeSpeechMouth)
  if (cached && !options.preparedOnly) return cached
  const plans: EditorV6MotionPlan[] = []
  for (const track of document.timeline.tracks) {
    if ((track.kind !== 'character' && track.kind !== 'intro') || track.hidden || track.muted || track.motionEnabled === false) continue
    const sorted = orderedEditorV6TimelineBlocks(track.blocks)
    for (let index = 1; index < sorted.length; index++) {
      if (options.preparedOnly && !sorted[index].incomingMotion) continue
      const plan = motionPlanWithoutKey(track, sorted[index - 1], sorted[index])
      if (!plan) continue
      // Baked transitions keep eyes open. Their only automatic face mode is speech.
      if (includeSpeechMouth && track.kind === 'character') {
        for (const sample of plan.samples) {
          const frame = plan.endFrame + sample.offset
          if (isEditorV6CharacterSpeakingAtFrame(document.timeline, plan.characterId, frame)) sample.faceMode = 'talk'
        }
      }
      plans.push({ ...plan, key: motionKey(plan) })
    }
  }
  if (options.preparedOnly) return plans
  const variants = plansCache.get(document.timeline) ?? new Map<boolean, EditorV6MotionPlan[]>()
  variants.set(includeSpeechMouth, plans)
  plansCache.set(document.timeline, variants)
  return plans
}
export function missingEditorV6Motions(document: EditorV6Document, startFrame = 0, endFrame = document.timeline.durationFrames, options: { includeSpeechMouth?: boolean } = {}): EditorV6MotionPlan[] {
  const assets = new Map(document.assets.map((asset) => [asset.id, asset]))
  const blocks = new Map(document.timeline.tracks.flatMap((track) => track.blocks.map((block) => [block.id, block] as const)))
  return editorV6MotionPlans(document, options).filter((plan) => {
    if (plan.startFrame >= endFrame || plan.endFrame <= startFrame) return false
    const motion = blocks.get(plan.blockId)?.incomingMotion
    return motion?.key !== plan.key || !editorV6MotionHasAvailableAssets(motion, assets)
  })
}
export function attachEditorV6Motion(document: EditorV6Document, blockId: string, result: Pick<EditorV6MotionBakeResult, 'asset' | 'faceAsset' | 'motion'>): EditorV6Document {
  if (!editorV6MotionPlans(document).some((plan) => plan.blockId === blockId && plan.key === result.motion.key)) return document
  const assets = [result.asset, ...(result.faceAsset ? [result.faceAsset] : [])]
  return { ...document, assets: assets.reduce((current, asset) => current.some((item) => item.id === asset.id) ? current : [...current, asset], document.assets), timeline: { ...document.timeline, tracks: document.timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => block.id === blockId ? { ...block, incomingMotion: result.motion } : block) })) } }
}
