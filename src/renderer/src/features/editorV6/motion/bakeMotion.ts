import type { CharacterRenderAssetProvider } from '../../../../../shared/characterRenderAssets'
import type { EditorV6Element } from '../../../../../shared/editorV6'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult, EditorV6MotionFrame } from '../../../../../shared/editorV6Motion'
import { interpolateEditorV6Pose } from '../../../../../shared/editorV6MotionInterpolation'
import type { GachaReusableMaterialCache } from '../../../characters/editorV6CharacterRenderer'
import { chooseMotionAtlasLayout, MAX_MOTION_ATLAS_PIXELS } from './motionAtlasLayout'
import type { MotionPixelCrop as Crop } from './motionPixelAnalysis'
import { createMotionPoseResolver } from './motionPoseResolver'
import { resolveMotionBakeEndpointGeometry } from './motionBakeEndpointGeometry'
import type { HairBakeEndpointCrop } from './hairBakeEndpointGeometry'
import { cacheEditorV6MotionAssetProvider } from './motionAssetProviderCache'
import { createEditorV6BakeSession, type EditorV6BakeSession } from './bakeSession'
import { prepareEditorV6MotionFacePair } from './motionFacePreparation'
import { createEditorV6MotionRigPreparer } from './motionRigPreparation'
import { disposeCroppedMotionLayers, type CroppedMotionLayers } from './motionLayerCrops'
import { prepareEditorV6MotionFacePatch, type BakedFacePatch } from './motionFacePatchPreparation'
import type { EditorV6MotionLayerAtlasCapture } from './motionLayerAtlasCapture'
import { disposeEditorV6MotionLayerAtlases, type MotionLayerAtlases } from './motionLayerAtlasWriter'
import { prepareEditorV6MotionAtlasSources } from './motionAtlasSourcePreparation'
import { bakeEditorV6MotionAtlasFrames } from './motionAtlasFrameBaking'
import { finalizeEditorV6MotionBake } from './motionBakeResult'
import { createEditorV6MotionFrameRenderer } from './motionFrameRenderer'
import { bakeEditorV6StaticMouthLoop } from './motionStaticMouthBake'

export { createEditorV6BakeSession }
export type { EditorV6BakeSession }
export type { EditorV6MotionLayerAtlasCapture } from './motionLayerAtlasCapture'

type BakedBodySample = { canvas: HTMLCanvasElement; crop: Crop; layers?: CroppedMotionLayers }
/** Bake canonical rig samples into one bounded PNG atlas, off the UI thread. */
export async function bakeEditorV6Motion(request: EditorV6MotionBakeRequest, rawProvider: CharacterRenderAssetProvider, session?: EditorV6BakeSession, captureLayerAtlases?: (capture: EditorV6MotionLayerAtlasCapture) => void, endpointCrops?: { from: HairBakeEndpointCrop; to: HairBakeEndpointCrop }): Promise<EditorV6MotionBakeResult> {
  const began = performance.now(), provider = cacheEditorV6MotionAssetProvider(session?.provider ?? rawProvider), slot = request.character.customization.modelSlot ?? 1
  const source = await provider.loadFabricatorSlot(slot)
  if (!source) throw Error('O modelo do personagem não está disponível para animar.')
  const resolvePose = createMotionPoseResolver(source, provider)
  const pose = (state: EditorV6Element) => {
    const slotId = state.poseSlot === undefined ? request.character.customization.poseSlot : state.poseSlot
    return resolvePose(slotId)
  }
  const [[fromPose, toPose], [from, to]] = await Promise.all([
    Promise.all([pose(request.plan.from), pose(request.plan.to)]),
    prepareEditorV6MotionFacePair(request.plan.from, request.plan.to, request.character.customization, provider)
  ])
  const materials: GachaReusableMaterialCache = session?.materials ?? new Map()
  const rigPreparer = createEditorV6MotionRigPreparer({
    character: request.character,
    source,
    provider,
    materials,
    session,
    fromPose,
    toPose,
    interpolateArtwork: progress => interpolateEditorV6Pose(fromPose, toPose, progress)
  })
  const { samePose, prepare } = rigPreparer
  let preparedAtlasFrames: BakedBodySample[] | undefined, pendingFacePatches: BakedFacePatch[] | undefined
  let bodyAtlas: HTMLCanvasElement | undefined
  let layerAtlases: MotionLayerAtlases | undefined
  const layerFrames: EditorV6MotionLayerAtlasCapture['frames'] = []
  const render = createEditorV6MotionFrameRenderer({ request, from, to, prepare, samePose, session })
  try {
    const staticMouthBake = await bakeEditorV6StaticMouthLoop({
      request,
      from,
      to,
      samePose,
      captureLayerAtlases: Boolean(captureLayerAtlases),
      render,
      elapsedMilliseconds: () => performance.now() - began,
      rigMetrics: rigPreparer.metrics
    })
    if (staticMouthBake) return staticMouthBake
    const { fromCrop, toCrop, maximumCanvasWidth, maximumCanvasHeight } = await resolveMotionBakeEndpointGeometry({
      captureLayerAtlases: Boolean(captureLayerAtlases),
      endpointCrops,
      staticMouthLoop: false,
      hasMouthScaleSamples: Boolean(request.mouthScaleSamples),
      firstFaceMode: from.activeFaceMode,
      render
    })
    const count = request.plan.samples.length
    const maxAtlasPixels = Math.min(MAX_MOTION_ATLAS_PIXELS, request.maxAtlasPixels ?? MAX_MOTION_ATLAS_PIXELS)
    let maximumWidth = maximumCanvasWidth, maximumHeight = maximumCanvasHeight
    let layout = chooseMotionAtlasLayout(count, maximumWidth, maximumHeight, 4096, maxAtlasPixels)
    let ratio = layout.ratio
    const frames: EditorV6MotionFrame[] = []
    const facePatches: BakedFacePatch[] = pendingFacePatches = []
    if (ratio < 1) {
      // The canvas can contain large transparent margins. Keep native cropped samples so
      // the atlas uses visible bounds without rendering the same transition twice.
      const prepared = await prepareEditorV6MotionAtlasSources({
        samples: request.plan.samples,
        fromCrop,
        toCrop,
        mouthScaleSamples: request.mouthScaleSamples,
        captureLayers: Boolean(captureLayerAtlases),
        render: (progress, faceMode, mouthScale, captureLayers) => render(progress, faceMode, mouthScale, false, undefined, false, captureLayers),
        prepareFacePatch: ({ index, faceMode, progress, mouthScale, frame }) => prepareEditorV6MotionFacePatch({ index, faceMode, progress, mouthScale, mouthScaleSamples: request.mouthScaleSamples, frame, render })
      })
      preparedAtlasFrames = prepared.frames
      facePatches.push(...prepared.facePatches)
      maximumWidth = prepared.maximumWidth
      maximumHeight = prepared.maximumHeight
      layout = chooseMotionAtlasLayout(count, maximumWidth, maximumHeight, 4096, maxAtlasPixels)
      ratio = layout.ratio
    }
    if (ratio < 1) throw Error(`A transição deste personagem precisa de ${layout.width}×${layout.height} pixels em resolução nativa e excede o limite seguro. A exportação foi interrompida para não reduzir a nitidez do personagem.`)
    const bakedAtlas = await bakeEditorV6MotionAtlasFrames({
      samples: request.plan.samples,
      from,
      to,
      fromCrop,
      toCrop,
      maximumWidth,
      maximumHeight,
      columns: layout.columns,
      rows: layout.rows,
      ratio,
      preparedFrames: preparedAtlasFrames,
      mouthScaleSamples: request.mouthScaleSamples,
      captureLayers: Boolean(captureLayerAtlases),
      render: (progress, faceMode, mouthScale, captureLayers) => render(progress, faceMode, mouthScale, false, undefined, false, captureLayers),
      prepareFacePatch: ({ index, faceMode, progress, mouthScale, frame }) => prepareEditorV6MotionFacePatch({ index, faceMode, progress, mouthScale, mouthScaleSamples: request.mouthScaleSamples, frame, render })
    })
    const atlas = bodyAtlas = bakedAtlas.atlas
    frames.push(...bakedAtlas.frames)
    facePatches.push(...bakedAtlas.facePatches)
    layerFrames.push(...bakedAtlas.layerFrames)
    layerAtlases = bakedAtlas.layerAtlases
    return finalizeEditorV6MotionBake({
      atlas,
      frames,
      facePatches,
      key: request.plan.key,
      samples: count,
      maxAtlasPixels,
      metrics: { milliseconds: performance.now() - began, preparedRigs: rigPreparer.metrics().preparedRigs, reusedRigs: rigPreparer.metrics().reusedRigs },
      layerAtlases,
      layerFrames,
      captureLayerAtlases
    })
  } finally {
    preparedAtlasFrames?.forEach(({ canvas, layers }) => { canvas.width = canvas.height = 1; disposeCroppedMotionLayers(layers) })
    pendingFacePatches?.forEach(({ canvas }) => { canvas.width = canvas.height = 1 })
    disposeEditorV6MotionLayerAtlases(layerAtlases)
    if (bodyAtlas) bodyAtlas.width = bodyAtlas.height = 1
    rigPreparer.disposeTransientReusable()
    session?.trim()
    if (!session || materials.size > 4) materials.clear()
  }
}
