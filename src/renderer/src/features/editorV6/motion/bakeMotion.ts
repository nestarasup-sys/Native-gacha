import type { CharacterRenderAssetProvider } from '../../../../../shared/characterRenderAssets'
import type { EditorV6Element } from '../../../../../shared/editorV6'
import type { EditorV6MotionBakeProfile, EditorV6MotionBakeRequest, EditorV6MotionBakeResult, EditorV6MotionFrame } from '../../../../../shared/editorV6Motion'
import { interpolateEditorV6Pose } from '../../../../../shared/editorV6MotionInterpolation'
import type { GachaReusableMaterialCache } from '../../../characters/editorV6CharacterRenderer'
import { chooseMotionAtlasLayout, MAX_MOTION_ATLAS_PIXELS } from './motionAtlasLayout'
import type { MotionPixelCrop as Crop } from './motionPixelAnalysis'
import { createMotionPoseResolver } from './motionPoseResolver'
import { editorV6MotionEndpointGeometryCacheKey, measureEditorV6MotionSnapshot, resolveMotionBakeEndpointGeometry } from './motionBakeEndpointGeometry'
import type { HairBakeEndpointCrop } from './hairBakeEndpointGeometry'
import { cacheEditorV6MotionAssetProvider } from './motionAssetProviderCache'
import type { EditorV6MotionProviderReadStats } from './motionAssetProviderCache'
import { createEditorV6BakeSession, type EditorV6BakeSession } from './bakeSession'
import { prepareEditorV6MotionFacePair } from './motionFacePreparation'
import { createEditorV6MotionRigPreparer } from './motionRigPreparation'
import { disposeCroppedMotionLayers, type CroppedMotionLayers } from './motionLayerCrops'
import { prepareEditorV6MotionFacePatch, type BakedFacePatch } from './motionFacePatchPreparation'
import type { prepareSavedCharacterRenderer } from '../../../characters/editorV6CharacterRenderer'
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
  const began = performance.now(), profile: EditorV6MotionBakeProfile = {
    assetLoadingMs: 0, poseResolutionMs: 0, facePreparationMs: 0, endpointGeometryMs: 0,
    rigBuildMs: 0, sampleRenderingMs: 0, cropDetectionMs: 0, facePatchPreparationMs: 0,
    atlasAssemblyMs: 0, faceAtlasMs: 0, atlasEncodingMs: 0, sampleRenderCalls: 0
  }
  const localProviderReadStats: EditorV6MotionProviderReadStats = { calls: 0, hits: 0, misses: 0, evictions: 0, milliseconds: 0 }
  const providerReadStats = session?.providerReadStats ?? localProviderReadStats
  const providerReadsBefore = { ...providerReadStats }
  const provider = session?.provider ?? cacheEditorV6MotionAssetProvider(rawProvider, false, providerReadStats)
  const slot = request.character.customization.modelSlot ?? 1
  const assetLoadStarted = performance.now()
  const source = await provider.loadFabricatorSlot(slot)
  profile.assetLoadingMs += performance.now() - assetLoadStarted
  if (!source) throw Error('O modelo do personagem não está disponível para animar.')
  const resolvePose = createMotionPoseResolver(source, provider)
  const pose = (state: EditorV6Element) => {
    const slotId = state.poseSlot === undefined ? request.character.customization.poseSlot : state.poseSlot
    return resolvePose(slotId)
  }
  const poseStarted = performance.now(), faceStarted = performance.now()
  const posePair = Promise.all([pose(request.plan.from), pose(request.plan.to)]).then(value => {
    profile.poseResolutionMs += performance.now() - poseStarted
    return value
  })
  const facePair = prepareEditorV6MotionFacePair(request.plan.from, request.plan.to, request.character.customization, provider).then(value => {
    profile.facePreparationMs += performance.now() - faceStarted
    return value
  })
  const [[fromPose, toPose], [from, to]] = await Promise.all([posePair, facePair])
  const materials: GachaReusableMaterialCache = session?.materials ?? new Map()
  const rigPreparer = createEditorV6MotionRigPreparer({
    character: request.character,
    source,
    provider,
    materials,
    session,
    disableScopedPreparationReuse: request.diagnosticDisableScopedPreparationReuse,
    fromPose,
    toPose,
    interpolateArtwork: progress => interpolateEditorV6Pose(fromPose, toPose, progress)
  })
  const { samePose, prepare } = rigPreparer
  let preparedAtlasFrames: BakedBodySample[] | undefined, pendingFacePatches: BakedFacePatch[] | undefined
  let bodyAtlas: HTMLCanvasElement | undefined
  let layerAtlases: MotionLayerAtlases | undefined
  const layerFrames: EditorV6MotionLayerAtlasCapture['frames'] = []
  const render = createEditorV6MotionFrameRenderer({ request, from, to, prepare, samePose, session, profile })
  type MotionRenderer = Awaited<ReturnType<typeof prepareSavedCharacterRenderer>>
  const prepareFacePatch = async (options: Parameters<typeof prepareEditorV6MotionFacePatch<MotionRenderer>>[0]) => {
    const started = performance.now()
    try { return await prepareEditorV6MotionFacePatch(options) }
    finally { profile.facePatchPreparationMs += performance.now() - started }
  }
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
    if (staticMouthBake) {
      profile.providerReadCalls = providerReadStats.calls - providerReadsBefore.calls
      profile.providerCacheHits = providerReadStats.hits - providerReadsBefore.hits
      profile.providerCacheMisses = providerReadStats.misses - providerReadsBefore.misses
      profile.providerCacheEvictions = providerReadStats.evictions - providerReadsBefore.evictions
      profile.providerReadMs = providerReadStats.milliseconds - providerReadsBefore.milliseconds
      Object.assign(profile, {
        rigBuildMs: rigPreparer.metrics().rigBuildMilliseconds,
        sampleRenderCalls: profile.sampleRenderCalls
      })
      staticMouthBake.metrics.rigKeyLookups = rigPreparer.metrics().rigKeyLookups
      staticMouthBake.metrics.rigRebuilds = rigPreparer.metrics().rigRebuilds
      staticMouthBake.metrics.rigBuildMilliseconds = rigPreparer.metrics().rigBuildMilliseconds
      staticMouthBake.metrics.profile = profile
      return staticMouthBake
    }
    const endpointStarted = performance.now()
    // Endpoint crops are exact properties of the character snapshot and visual
    // state. Keep this small cache within the export-scoped bake session; never
    // read or write the persistent project motion cache for these measurements.
    const endpointGeometryCache = request.cacheScope ? session?.endpointGeometryCache : undefined
    const endpointGeometry = await resolveMotionBakeEndpointGeometry({
      captureLayerAtlases: Boolean(captureLayerAtlases),
      endpointCrops,
      endpointGeometryCache,
      endpointCacheKeys: endpointGeometryCache ? {
        from: editorV6MotionEndpointGeometryCacheKey(request.character, request.plan.from),
        to: editorV6MotionEndpointGeometryCacheKey(request.character, request.plan.to)
      } : undefined,
      measure: async (endpoint, crop) => {
        const renderer = await prepare(endpoint === 'from' ? 0 : 1)
        try {
          if (crop) return { crop, width: renderer.width, height: renderer.height }
          return await measureEditorV6MotionSnapshot(renderer, request.plan[endpoint], request.character)
        } finally { rigPreparer.disposeTransientRenderer(renderer) }
      }
    })
    const { fromCrop, toCrop, maximumCanvasWidth, maximumCanvasHeight } = endpointGeometry
    profile.endpointGeometryCacheHits = endpointGeometry.endpointGeometryCacheHits
    profile.endpointGeometryCacheMisses = endpointGeometry.endpointGeometryCacheMisses
    profile.endpointGeometryMs += performance.now() - endpointStarted
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
        profile,
        mouthScaleSamples: request.mouthScaleSamples,
        captureLayers: Boolean(captureLayerAtlases),
        render: (progress, faceMode, mouthScale, captureLayers) => render(progress, faceMode, mouthScale, false, undefined, false, captureLayers),
        prepareFacePatch: ({ index, faceMode, progress, mouthScale, frame }) => prepareFacePatch({ index, faceMode, progress, mouthScale, mouthScaleSamples: request.mouthScaleSamples, frame, render })
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
      prepareFacePatch: ({ index, faceMode, progress, mouthScale, frame }) => prepareFacePatch({ index, faceMode, progress, mouthScale, mouthScaleSamples: request.mouthScaleSamples, frame, render }),
      profile
    })
    const rigMetrics = rigPreparer.metrics()
    profile.rigBuildMs = rigMetrics.rigBuildMilliseconds
    profile.providerReadCalls = providerReadStats.calls - providerReadsBefore.calls
    profile.providerCacheHits = providerReadStats.hits - providerReadsBefore.hits
    profile.providerCacheMisses = providerReadStats.misses - providerReadsBefore.misses
    profile.providerCacheEvictions = providerReadStats.evictions - providerReadsBefore.evictions
    profile.providerReadMs = providerReadStats.milliseconds - providerReadsBefore.milliseconds
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
      metrics: { milliseconds: performance.now() - began, preparedRigs: rigMetrics.preparedRigs, reusedRigs: rigMetrics.reusedRigs, rigKeyLookups: rigMetrics.rigKeyLookups, rigRebuilds: rigMetrics.rigRebuilds, rigBuildMilliseconds: rigMetrics.rigBuildMilliseconds },
      profile,
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
