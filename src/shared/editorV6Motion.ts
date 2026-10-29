/** V6 motion contract and frame scheduling. No dependency on either Dev animator. */
import type { CustomizerCharacter } from './customizer'
import type { EditorV6Asset, EditorV6Document, EditorV6Element, EditorV6FaceRenderMode, EditorV6TimelineBlock, EditorV6TimelineTrack } from './editorV6'
import type { CharacterRenderAssetProvider } from './characterRenderAssets'
import { editorV6FaceModeAtFrame, editorV6FaceModeDuringMotion } from './editorV6FaceSchedule'

export const EDITOR_V6_MOTION_VERSION = 1
export const EDITOR_V6_MOTION_MS = 250
export type EditorV6MotionSprite = { x: number; y: number; width: number; height: number; atlasWidth: number; atlasHeight: number }
export type EditorV6MotionFrame = { offset: number; sprite: EditorV6MotionSprite; x: number; y: number; width: number; height: number; rotation: number; flipX: boolean }
export type EditorV6MotionAtlas = { version: 1; key: string; assetId: string; frames: EditorV6MotionFrame[] }
export type EditorV6MotionPlan = {
  blockId: string; elementId: string; characterId: string; key: string; startFrame: number; endFrame: number
  from: EditorV6Element; to: EditorV6Element; samples: Array<{ offset: number; progress: number; faceMode?: EditorV6FaceRenderMode }>
}
export type EditorV6MotionBakeRequest = { id: string; plan: EditorV6MotionPlan; character: CustomizerCharacter; mouthScaleSamples?: number[]; maxAtlasPixels?: number }
export type EditorV6MotionBakeResult = { asset: EditorV6Asset; motion: EditorV6MotionAtlas; metrics: { milliseconds: number; preparedRigs: number; samples: number; atlasPixels: number } }
export const editorV6MotionChannels = { payload: 'editor-v6:motion-worker:payload', complete: 'editor-v6:motion-worker:complete' } as const
export type EditorV6MotionBridge = { payload: () => Promise<EditorV6MotionBakeRequest | null>; provider: CharacterRenderAssetProvider; complete: (result?: EditorV6MotionBakeResult, error?: string) => Promise<void> }

function faceSignature(element: EditorV6Element) {
  const entries = Object.entries(element.faceAppearance ?? {}).filter(([key, value]) => key !== 'eyeState' && key !== 'mouthOpen' && value !== undefined)
  const appearance = entries.length ? Object.fromEntries(entries) : undefined
  return JSON.stringify([element.poseSlot === undefined ? 'character-default' : element.poseSlot, element.activeExpressionPresetId ?? null, element.activeExpressionPresetUpdatedAt, element.activeExpressionGaze, appearance, element.faceTransforms, element.activeExpressionEffects])
}
function motionKey(from: EditorV6Element, to: EditorV6Element, samples: EditorV6MotionPlan['samples']) {
  const endpoint = (element: EditorV6Element) => [faceSignature(element), element.assetId, element.characterId, element.characterSourceUpdatedAt, element.poseSourceRevision, element.activeFaceMode, element.faceRendererVersion, element.x, element.y, element.width, element.height, element.rotation, element.flipX, element.characterScale, element.characterWidthScale, element.characterHeightScale, element.characterCanvasWidth]
  return JSON.stringify([EDITOR_V6_MOTION_VERSION, endpoint(from), endpoint(to), samples])
}
export function editorV6MotionPlan(track: EditorV6TimelineTrack, previous: EditorV6TimelineBlock, next: EditorV6TimelineBlock): EditorV6MotionPlan | null {
  const from = previous.state, to = next.state
  if (track.kind !== 'character' || track.motionEnabled === false || next.motionEnabled === false || !from || !to || from.kind !== 'character' || to.kind !== 'character' || from.id !== to.id || !from.characterId || from.characterId !== to.characterId || from.visible === false || to.visible === false || next.startFrame <= previous.startFrame || faceSignature(from) === faceSignature(to)) return null
  // Material/source revisions are cuts; pose/expression motion belongs to one stable actor.
  if (from.characterSourceUpdatedAt && to.characterSourceUpdatedAt && from.characterSourceUpdatedAt !== to.characterSourceUpdatedAt) return null
  const startFrame = Math.max(previous.startFrame, next.startFrame - EDITOR_V6_MOTION_MS * 30 / 1000)
  const samples = []
  for (let frame = Math.floor(startFrame) + 1; frame < next.startFrame; frame++) samples.push({ offset: frame - next.startFrame, progress: (frame - startFrame) / (next.startFrame - startFrame) })
  if (!samples.length) return null
  const key = motionKey(from, to, samples)
  return { blockId: next.id, elementId: from.id, characterId: from.characterId, key, startFrame, endFrame: next.startFrame, from, to, samples }
}
const plansCache = new WeakMap<EditorV6Document['timeline'], EditorV6MotionPlan[]>()
export function editorV6MotionPlans(document: EditorV6Document): EditorV6MotionPlan[] {
  const cached = plansCache.get(document.timeline)
  if (cached) return cached
  const plans: EditorV6MotionPlan[] = []
  for (const track of document.timeline.tracks) {
    if (track.kind !== 'character' || track.hidden || track.muted) continue
    const sorted = [...track.blocks].sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id))
    for (let index = 1; index < sorted.length; index++) {
      const plan = editorV6MotionPlan(track, sorted[index - 1], sorted[index])
      if (plan) {
        const samples = plan.samples.map((sample) => {
          const frame = plan.endFrame + sample.offset
          const faceMode = editorV6FaceModeDuringMotion(editorV6FaceModeAtFrame(document.id, document.timeline, plan.characterId, frame))
          return { ...sample, ...(faceMode ? { faceMode } : {}) }
        })
        plans.push({ ...plan, samples, key: motionKey(plan.from, plan.to, samples) })
      }
    }
  }
  plansCache.set(document.timeline, plans)
  return plans
}
export function missingEditorV6Motions(document: EditorV6Document, startFrame = 0, endFrame = document.timeline.durationFrames): EditorV6MotionPlan[] {
  const ids = new Set(document.assets.map((asset) => asset.id))
  const blocks = new Map(document.timeline.tracks.flatMap((track) => track.blocks.map((block) => [block.id, block] as const)))
  return editorV6MotionPlans(document).filter((plan) => plan.startFrame < endFrame && plan.endFrame > startFrame && (blocks.get(plan.blockId)?.incomingMotion?.key !== plan.key || !ids.has(blocks.get(plan.blockId)?.incomingMotion?.assetId ?? '')))
}
export function attachEditorV6Motion(document: EditorV6Document, blockId: string, result: Pick<EditorV6MotionBakeResult, 'asset' | 'motion'>): EditorV6Document {
  if (!editorV6MotionPlans(document).some((plan) => plan.blockId === blockId && plan.key === result.motion.key)) return document
  return { ...document, assets: document.assets.some((asset) => asset.id === result.asset.id) ? document.assets : [...document.assets, result.asset], timeline: { ...document.timeline, tracks: document.timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => block.id === blockId ? { ...block, incomingMotion: result.motion } : block) })) } }
}
