import type { EditorV6HairMotionBundle, EditorV6HairMotionTransition } from '../../../../shared/editorV6HairMotion'
import type { EditorV6MotionBakeResult, EditorV6MotionPlan } from '../../../../shared/editorV6Motion'
import type { EditorV6MotionLayerAtlasCapture } from './motion/motionLayerAtlasCapture'

export type EditorV6SerializedMotionLayerAtlas = Pick<EditorV6MotionLayerAtlasCapture, 'frames'> & {
  behindFaceDataUrl: string
  faceDataUrl: string
  eyesAboveRearHairDataUrl: string | null
  inFrontOfFaceDataUrl: string | null
}

/** Owns deterministic IDs and per-export deduplication for prepared hair surfaces and textures. */
export function createEditorV6HairMotionBundleAssets() {
  const surfaces: EditorV6HairMotionBundle['surfaces'] = []
  const textures: EditorV6HairMotionBundle['textures'] = []
  const motionTransitions: EditorV6HairMotionTransition[] = []
  const surfaceIds = new Map<string, string>(), textureIds = new Map<string, string>()

  const addSurface = (key: string, dataUrl: string) => {
    const existing = surfaceIds.get(key)
    if (existing) return existing
    const id = `surface-${surfaces.length + 1}`
    surfaceIds.set(key, id)
    surfaces.push({ id, dataUrl })
    return id
  }

  const addTexture = (key: string, dataUrl: string) => {
    const existing = textureIds.get(key)
    if (existing) return existing
    const id = `texture-${textures.length + 1}`
    textureIds.set(key, id)
    textures.push({ id, dataUrl })
    return id
  }

  const captureTransitionLayers = (
    plan: EditorV6MotionPlan,
    result: Pick<EditorV6MotionBakeResult, 'faceAsset'>,
    capture: EditorV6SerializedMotionLayerAtlas
  ) => {
    const behindFaceSurfaceId = addSurface(`motion:${plan.key}:behind-face`, capture.behindFaceDataUrl)
    const faceSurfaceId = addSurface(`motion:${plan.key}:face`, capture.faceDataUrl)
    const eyesAboveRearHairSurfaceId = capture.eyesAboveRearHairDataUrl ? addSurface(`motion:${plan.key}:raised-eyes`, capture.eyesAboveRearHairDataUrl) : null
    const overlaySurfaceId = capture.inFrontOfFaceDataUrl ? addSurface(`motion:${plan.key}:front-face`, capture.inFrontOfFaceDataUrl) : null
    const faceAtlasSurfaceId = result.faceAsset ? addSurface(`motion:${plan.key}:face-atlas`, result.faceAsset.dataUrl) : null
    motionTransitions.push({
      elementId: plan.elementId, key: plan.key, startFrame: plan.startFrame, endFrame: plan.endFrame,
      behindFaceSurfaceId, faceSurfaceId, eyesAboveRearHairSurfaceId, overlaySurfaceId, faceAtlasSurfaceId,
      frames: capture.frames
    })
  }

  return { surfaces, textures, motionTransitions, addSurface, addTexture, captureTransitionLayers }
}
