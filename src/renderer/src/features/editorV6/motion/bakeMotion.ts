import type { CharacterRenderAssetProvider } from '../../../../../shared/characterRenderAssets'
import type { EditorV6Element, EditorV6FaceRenderMode } from '../../../../../shared/editorV6'
import type { EditorV6MotionBakeRequest, EditorV6MotionBakeResult, EditorV6MotionFrame } from '../../../../../shared/editorV6Motion'
import { editorV6FaceModeDuringMotion } from '../../../../../shared/editorV6FaceSchedule'
import { interpolateEditorV6Face, interpolateEditorV6Pose } from '../../../../../shared/editorV6MotionInterpolation'
import type { prepareSavedCharacterRenderer, GachaReusableMaterialCache, PreparedGachaLayerFrame } from '../../../characters/editorV6CharacterRenderer'
import { chooseMotionAtlasLayout, MAX_MOTION_ATLAS_PIXELS } from './motionAtlasLayout'
import {
  unionMotionCrops as unionCrop,
  type MotionPixelCrop as Crop
} from './motionPixelAnalysis'
import { createMotionPoseResolver } from './motionPoseResolver'
import { resolveMotionBakeEndpointGeometry } from './motionBakeEndpointGeometry'
import type { HairBakeEndpointCrop } from './hairBakeEndpointGeometry'
import { cacheEditorV6MotionAssetProvider } from './motionAssetProviderCache'
import { createEditorV6BakeSession, type EditorV6BakeSession } from './bakeSession'
import { prepareEditorV6MotionFacePair, scaleEditorV6MotionMouth } from './motionFacePreparation'
import { createEditorV6MotionRigPreparer } from './motionRigPreparation'
import { disposeCroppedMotionLayers, type CroppedMotionLayers } from './motionLayerCrops'
import { createTransparentMotionPatch, readMotionCanvasCrop } from './motionCanvasRegions'
import { prepareEditorV6MotionFacePatch, type BakedFacePatch } from './motionFacePatchPreparation'
import { prepareEditorV6MouthlessBaseAssets } from './motionMouthlessBaseAssets'
import { buildEditorV6IsolatedMouthAtlas } from './motionIsolatedMouthAtlas'
import { buildEditorV6LegacyMouthAtlas } from './motionLegacyMouthAtlas'
import { detectEditorV6LegacyMouthBounds } from './motionLegacyMouthBounds'
import type { EditorV6MotionLayerAtlasCapture } from './motionLayerAtlasCapture'
import { disposeEditorV6MotionLayerAtlases, type MotionLayerAtlases } from './motionLayerAtlasWriter'
import { prepareEditorV6MotionAtlasSources } from './motionAtlasSourcePreparation'
import { bakeEditorV6MotionAtlasFrames } from './motionAtlasFrameBaking'
import { finalizeEditorV6MotionBake } from './motionBakeResult'

export { createEditorV6BakeSession }
export type { EditorV6BakeSession }
export type { EditorV6MotionLayerAtlasCapture } from './motionLayerAtlasCapture'

type Renderer = Awaited<ReturnType<typeof prepareSavedCharacterRenderer>>
type MotionFrameRender = { canvas: HTMLCanvasElement; width: number; height: number; crop: Crop; renderer: Renderer; layers?: PreparedGachaLayerFrame; mouthCanvas?: HTMLCanvasElement; mouthCrop?: Crop; dispose: () => void }
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
  const render = async (progress: number, faceMode?: EditorV6FaceRenderMode, mouthScale = 1, fingerprint = false, preparedRenderer?: Renderer, referenceMode = false, captureLayers = false): Promise<MotionFrameRender> => {
    const renderer = preparedRenderer ?? await prepare(progress), face = scaleEditorV6MotionMouth(interpolateEditorV6Face(from, to, progress), mouthScale)
    try {
      const mode = faceMode ?? face.mode
      const renderMode = referenceMode ? mode : editorV6FaceModeDuringMotion(mode)
      const isolateMouth = Boolean(request.mouthScaleSamples && (mode === 'talk' || mode === 'talk-blink') && renderer.canIsolateMouth(face.appearance))
      // A hair-layer bake needs both the full body and split layers. Render
      // expensive face assets once, not twice for every intermediate sample.
      const mouthOptions = isolateMouth ? { mouthLayer: 'without-mouth' as const } : undefined
      const layered = captureLayers
        ? await renderer.renderToCanvasWithLayers(face.appearance, face.transforms, face.effects, renderMode, mouthOptions)
        : undefined
      const result = layered ?? await renderer.renderToCanvas(face.appearance, face.transforms, face.effects, renderMode, mouthOptions)
      const layers = layered?.layers
      const mouth = isolateMouth ? await renderer.renderMouthToCanvas(face.appearance, face.transforms, face.effects, renderMode) : undefined
      return { ...result, crop: readMotionCanvasCrop(result.canvas, fingerprint), renderer, ...(layers ? { layers } : {}), ...(mouth ? { mouthCanvas: mouth.canvas, mouthCrop: readMotionCanvasCrop(mouth.canvas, fingerprint, 0) } : {}), dispose: () => {
        if (!samePose && !preparedRenderer && !(session && [...session.endpointRenderers.values()].includes(renderer))) renderer.dispose()
      } }
    } catch (error) {
      if (!samePose && !preparedRenderer && !(session && [...session.endpointRenderers.values()].includes(renderer))) renderer.dispose()
      throw error
    }
  }
  try {
    const staticMouthLoop = Boolean(!captureLayerAtlases && request.mouthScaleSamples && samePose
      && JSON.stringify(from) === JSON.stringify(to)
      && request.plan.samples.every((sample) => sample.faceMode === from.activeFaceMode))
    if (staticMouthLoop) {
      const scales = request.mouthScaleSamples!
      const baseline = await render(0, from.activeFaceMode, 1, true)
      if (baseline.mouthCanvas && baseline.mouthCrop) {
        const { sourceCrop, isolatedBaseline, assets: mouthlessBaseAssets } = await prepareEditorV6MouthlessBaseAssets({ from, baseline, render })

        const isolatedPatches: Array<{ canvas: HTMLCanvasElement; crop: Crop }> = []
        let mouthAtlas: HTMLCanvasElement | undefined
        try {
          const baselineMouthCrop = isolatedBaseline.mouthCrop!
          isolatedPatches.push({ canvas: createTransparentMotionPatch(isolatedBaseline.mouthCanvas!, baselineMouthCrop), crop: baselineMouthCrop })
          for (let index = 1; index < scales.length; index++) {
            const comparison = await render(0, from.activeFaceMode, scales[index], index === scales.length - 1, baseline.renderer)
            try {
              if (!comparison.mouthCanvas || !comparison.mouthCrop) throw Error('Não foi possível isolar a peça da boca para o ciclo de fala.')
              if (index === scales.length - 1 && comparison.mouthCrop.fingerprint === baselineMouthCrop.fingerprint) throw Error('A boca aberta não respondeu à ampliação; confira se o personagem tem uma variante de boca aberta editável no catálogo facial.')
              isolatedPatches.push({ canvas: createTransparentMotionPatch(comparison.mouthCanvas, comparison.mouthCrop), crop: comparison.mouthCrop })
            } finally { comparison.dispose() }
          }
          const mouthUnion = isolatedPatches.reduce((bounds, patch) => unionCrop(bounds, patch.crop), isolatedPatches[0].crop)
          for (const patch of isolatedPatches) {
            const normalized = document.createElement('canvas')
            normalized.width = mouthUnion.width + 4; normalized.height = mouthUnion.height + 4
            const normalizedContext = normalized.getContext('2d')!
            normalizedContext.drawImage(patch.canvas, 2, 2, patch.crop.width, patch.crop.height,
              2 + patch.crop.left - mouthUnion.left, 2 + patch.crop.top - mouthUnion.top, patch.crop.width, patch.crop.height)
            patch.canvas.width = patch.canvas.height = 1
            patch.canvas = normalized
            patch.crop = mouthUnion
          }
          const packed = buildEditorV6IsolatedMouthAtlas({
            patches: isolatedPatches,
            sampleOffsets: request.plan.samples.map(sample => sample.offset),
            sourceCrop,
            key: request.plan.key,
            rotation: from.rotation,
            flipX: Boolean(from.flipX),
            maxAtlasPixels: request.maxAtlasPixels
          })
          mouthAtlas = packed.atlas
          const count = request.plan.samples.length
          return {
            asset: packed.asset,
            assetRole: 'face-atlas', mouthIsolationMode: 'isolated-piece', mouthlessBaseAssets,
            motion: packed.motion,
            metrics: { milliseconds: performance.now() - began, ...rigPreparer.metrics(), samples: count, atlasPixels: packed.atlasPixels }
          }
        } finally {
          isolatedPatches.forEach(({ canvas }) => { canvas.width = canvas.height = 1 })
          if (mouthAtlas) mouthAtlas.width = mouthAtlas.height = 1
          baseline.dispose(); isolatedBaseline.dispose()
        }
      }
      const { sourceCrop, changedBounds } = await detectEditorV6LegacyMouthBounds({ baseline, scales, faceMode: from.activeFaceMode, render })
      const packed = await buildEditorV6LegacyMouthAtlas({
        sourceCrop,
        changedBounds,
        samples: request.plan.samples,
        scales,
        from,
        key: request.plan.key,
        maxAtlasPixels: request.maxAtlasPixels,
        render: (faceMode, mouthScale) => render(0, faceMode, mouthScale)
      })
      return { asset: packed.asset, assetRole: 'face-atlas', mouthIsolationMode: 'legacy-patch', motion: packed.motion, metrics: { milliseconds: performance.now() - began, preparedRigs: rigPreparer.metrics().preparedRigs, reusedRigs: rigPreparer.metrics().reusedRigs, samples: request.plan.samples.length, atlasPixels: packed.atlasPixels } }
    }
    const { fromCrop, toCrop, maximumCanvasWidth, maximumCanvasHeight } = await resolveMotionBakeEndpointGeometry({
      captureLayerAtlases: Boolean(captureLayerAtlases),
      endpointCrops,
      staticMouthLoop,
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
