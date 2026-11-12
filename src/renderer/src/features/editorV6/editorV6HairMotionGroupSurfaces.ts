import type { EditorV6ExportOptions } from '../../../../shared/editorV6Export'
import type { EditorV6HairMotionLayer, EditorV6HairMotionRig } from '../../../../shared/editorV6HairMotion'
import type { EditorV6HairMotionTarget } from './editorV6HairMotionTargets'
import type { PreparedEditorV6HairMotionCharacterGroup } from './editorV6HairMotionCharacterGroup'
import { editorV6HairFaceSurfaceKey } from './motion/hairPreparationReuse'

type MeasureFaceModeCrop = typeof import('./faceModeAssets').measureFaceModeCrop
type CanvasEncoder = (canvas: HTMLCanvasElement) => string

export type EditorV6HairMotionGroupSurfaceDependencies = {
  group: PreparedEditorV6HairMotionCharacterGroup
  targets: readonly EditorV6HairMotionTarget[]
  layers: EditorV6HairMotionLayer[]
  mouthLoop: EditorV6ExportOptions['mouthLoop']
  encodeFaceCropPng: boolean
  addSurface: (key: string, dataUrl: string) => string
  encodeCanvas: CanvasEncoder
  measureFaceModeCrop: MeasureFaceModeCrop
  reportStage: (stage: string, startedAt: number) => void
  isCancelled: () => boolean
  now?: () => number
}

/** Bake and reuse the face/base/overlay surfaces for every state in one character/pose group. */
export async function prepareEditorV6HairMotionGroupSurfaces(
  dependencies: EditorV6HairMotionGroupSurfaceDependencies
): Promise<EditorV6HairMotionRig[]> {
  const { group, targets, layers, addSurface, encodeCanvas, measureFaceModeCrop, reportStage, isCancelled } = dependencies
  const { groupKey, character, appearance, sourceHeadPart, targetHeadPart, originalRenderer, hairlessRenderer } = group
  const now = dependencies.now ?? (() => performance.now())
  const poseSurfaceKey = JSON.stringify([groupKey, character.updatedAt, appearance.modelSlot, appearance.parts, character.customization.partOverrides])
  let baseSurfaceId: string | undefined
  const cropByFace = new Map<string, { left: number; top: number; width: number; height: number }>()
  // Encoded surfaces are immutable and reusable only within this pose group.
  const faceSurfacesByInput = new Map<string, string>()
  const overlaySurfacesByInput = new Map<string, string | null>()
  const eyesSurfacesByInput = new Map<string, string | null>()
  let preparedGeometry: Pick<EditorV6HairMotionRig, 'artworkWidth' | 'artworkHeight' | 'outputWidth' | 'outputHeight' | 'shapeScaleX' | 'shapeScaleY'> | undefined
  const rigs: EditorV6HairMotionRig[] = []

  for (const target of targets) {
    if (isCancelled()) throw Error('Preparação da animação de cabelo cancelada.')
    const state = target.state
    const currentAppearance = state.faceAppearance ?? state.expressionBase?.appearance ?? character.customization.faceAppearance
    const faceTransforms = state.faceTransforms ?? state.expressionBase?.transforms
    const effects = state.activeExpressionEffects
    const mode = target.faceMode
    const hideMouthForExportLoop = Boolean(dependencies.mouthLoop && (mode === 'talk' || mode === 'talk-blink') && hairlessRenderer.canIsolateMouth(currentAppearance))
    const faceKey = JSON.stringify([currentAppearance, faceTransforms, effects])
    const faceRenderKey = editorV6HairFaceSurfaceKey(faceKey, mode, hideMouthForExportLoop)
    const poseKey = JSON.stringify([poseSurfaceKey, state.poseSlot, sourceHeadPart.width, sourceHeadPart.height, targetHeadPart.x, targetHeadPart.y, targetHeadPart.width, targetHeadPart.height, targetHeadPart.rotation])
    const faceSurfaceKey = JSON.stringify([poseKey, faceRenderKey])
    const existingFaceSurfaceId = faceSurfacesByInput.get(faceSurfaceKey)
    const hasOverlaySurface = overlaySurfacesByInput.has(faceSurfaceKey)
    const hasEyesSurface = eyesSurfacesByInput.has(faceSurfaceKey)
    let sourceCrop = cropByFace.get(faceKey)
    let stageStarted = now()
    const [originalFrame, splitFrame] = await Promise.all([
      sourceCrop ? Promise.resolve(null) : originalRenderer.renderToCanvas(currentAppearance, faceTransforms, effects, mode),
      existingFaceSurfaceId && hasOverlaySurface && hasEyesSurface
        ? Promise.resolve(null)
        : hairlessRenderer.renderLayersToCanvas(currentAppearance, faceTransforms, effects, mode, hideMouthForExportLoop ? { mouthLayer: 'without-mouth' } : undefined)
    ])
    reportStage('renderHairlessFaceTarget', stageStarted)
    if (!sourceCrop) {
      // Snapshots use the union of face modes, not the bounds of one frame.
      stageStarted = now()
      const crop = await measureFaceModeCrop(character.name, originalRenderer, currentAppearance, faceTransforms, effects, mode, originalFrame!, dependencies.encodeFaceCropPng)
      sourceCrop = crop ? { left: crop.left, top: crop.top, width: crop.width, height: crop.height }
        : { left: 0, top: 0, width: originalFrame!.width, height: originalFrame!.height }
      cropByFace.set(faceKey, sourceCrop)
      reportStage('measureFaceModeCrop', stageStarted)
    }
    if (splitFrame) {
      preparedGeometry ??= {
        artworkWidth: splitFrame.width, artworkHeight: splitFrame.height,
        outputWidth: splitFrame.outputWidth, outputHeight: splitFrame.outputHeight,
        shapeScaleX: splitFrame.shapeScaleX, shapeScaleY: splitFrame.shapeScaleY
      }
      baseSurfaceId ??= addSurface(`${poseKey}:base`, encodeCanvas(splitFrame.behindFace))
      if (!hasOverlaySurface) {
        const overlayDataUrl = splitFrame.inFrontOfFace ? encodeCanvas(splitFrame.inFrontOfFace) : null
        overlaySurfacesByInput.set(faceSurfaceKey, overlayDataUrl ? addSurface(`${poseKey}:${faceRenderKey}:overlay`, overlayDataUrl) : null)
      }
      if (!hasEyesSurface) {
        const eyesDataUrl = splitFrame.eyesAboveRearHair ? encodeCanvas(splitFrame.eyesAboveRearHair) : null
        eyesSurfacesByInput.set(faceSurfaceKey, eyesDataUrl ? addSurface(`${poseKey}:${faceRenderKey}:raised-eyes`, eyesDataUrl) : null)
      }
    }
    if (!baseSurfaceId || !preparedGeometry) throw Error('A camada estática do personagem não foi preparada.')
    let faceSurfaceId = existingFaceSurfaceId
    if (!faceSurfaceId) {
      if (!splitFrame) throw Error('A camada do rosto não foi preparada.')
      stageStarted = now()
      faceSurfaceId = addSurface(`${poseKey}:face:${target.assetId}`, encodeCanvas(splitFrame.face))
      faceSurfacesByInput.set(faceSurfaceKey, faceSurfaceId)
      reportStage('serializeFaceSurface', stageStarted)
    }
    const overlaySurfaceId = overlaySurfacesByInput.get(faceSurfaceKey) ?? null
    const eyesAboveRearHairSurfaceId = eyesSurfacesByInput.get(faceSurfaceKey) ?? null
    rigs.push({
      elementId: target.elementId, assetId: target.assetId, characterId: target.state.characterId!,
      poseSlot: character.customization.poseSlot ?? null,
      baseSurfaceId, faceSurfaceId, eyesAboveRearHairSurfaceId: eyesAboveRearHairSurfaceId ?? null, overlaySurfaceId: overlaySurfaceId ?? null,
      ...preparedGeometry,
      sourceCrop, sourceHead: { width: sourceHeadPart.width, height: sourceHeadPart.height },
      targetHead: { x: targetHeadPart.x, y: targetHeadPart.y, width: targetHeadPart.width, height: targetHeadPart.height, rotation: targetHeadPart.rotation },
      layers
    })
  }
  return rigs
}
