import type { SyntheticEvent } from 'react'
import type { EditorV6Asset, EditorV6Document } from '../../../../shared/editorV6'
import type { EditorV6FrameMetrics, EditorV6FrameTimings, EditorV6RenderFrameResult, EditorV6WorkerPayload } from '../../../../shared/editorV6Export'
import { composeEditorV6FaceReplacements } from './sceneFaceComposition'
import { createEditorV6ExportWorkerHairRuntime } from './exportWorkerHairRuntime'
import { createEditorV6ExportFrameReuseState } from './exportFrameReuse'
import { resolveEditorV6ExportFramePlan } from './exportFramePlan'
import { createEditorV6FrameAssetRegistry, selectEditorV6RenderableAssets } from './exportFrameAssets'

type HairRuntime = ReturnType<typeof createEditorV6ExportWorkerHairRuntime>
type RenderLayer = 'all' | 'background' | 'foreground'

type SurfaceInput = {
  scene: Awaited<ReturnType<HairRuntime['resolveRawSceneAtFrame']>>
  assets: readonly EditorV6Asset[]
  outputWidth: number
  outputHeight: number
  renderLayer: RenderLayer
  onImageLoad: (event: SyntheticEvent<SVGImageElement>) => void
  rasterCanvases: ReadonlyMap<string, HTMLCanvasElement>
}

type Options = {
  project: EditorV6Document
  width: number
  height: number
  layeredVideo: boolean
  hairAnimation: EditorV6WorkerPayload['hairAnimation']
  projectAssetIndex: ReadonlyMap<string, EditorV6Asset>
  assetsById: Map<string, EditorV6Asset>
  hairRuntime: HairRuntime
  prepareAssets: (assets: readonly EditorV6Asset[]) => Promise<void>
  commitSurface: (surface: SurfaceInput) => void
  onImageLoad: (event: SyntheticEvent<SVGImageElement>) => void
  waitForSvgImages: () => Promise<void>
  setPaintToken: (token: number) => void
  waitForPaintFrame: () => Promise<void>
  now?: () => number
}

/** Coordinates one export-frame resolution, composition, commit and paint handoff. */
export function createEditorV6ExportFrameRenderer(options: Options) {
  const {
    project, width, height, layeredVideo, hairAnimation, projectAssetIndex, assetsById,
    hairRuntime, prepareAssets, commitSurface, onImageLoad, waitForSvgImages, setPaintToken, waitForPaintFrame
  } = options
  const now = options.now ?? (() => performance.now())
  const frameReuse = createEditorV6ExportFrameReuseState()

  return async (
    frame: number,
    layer: 'background' | 'foreground' | undefined,
    paintToken: number
  ): Promise<EditorV6RenderFrameResult> => {
    const timings: EditorV6FrameTimings = {}
    const metrics: EditorV6FrameMetrics = {}
    const resolutionStarted = now()
    // Layered captures of one frame share the cached, unmodified timeline scene.
    const rawScene = hairRuntime.resolveRawSceneAtFrame(frame)
    const scene = hairRuntime.applyMouthLoop(rawScene, frame)
    const framePlan = resolveEditorV6ExportFramePlan({
      scene, frame, requestedLayer: layer, layeredVideo, hairAnimation, hairPoseReactionEnds: hairRuntime.hairPoseReactionEnds,
      hasAnimatedHair: element => hairRuntime.hasAnimatedHair(element, frame)
    })
    const { activeLayer, activeHair, key, layerKeys } = framePlan
    timings.sceneResolutionMs = now() - resolutionStarted
    const reuseDecision = frameReuse.decide(key, activeLayer, layerKeys)
    if (reuseDecision === 'frame') return { reused: true, timings }
    if (reuseDecision === 'background' || reuseDecision === 'foreground') return { reused: false, layerReused: true, timings }

    const faceCompositionStarted = now()
    const originalElements = new Map(scene.elements.map(element => [element.id, element]))
    const riggedIds = new Set(activeHair ? scene.elements.flatMap(element => hairRuntime.hasAnimatedHair(element, frame) ? [element.id] : []) : [])
    const faceCompositionInput = riggedIds.size
      ? { ...scene, mediaVideo: undefined, elements: scene.elements.map(element => riggedIds.has(element.id) ? { ...element, mouthPatch: undefined } : element) }
      : { ...scene, mediaVideo: undefined }
    const composed = activeLayer === 'background'
      ? { scene: { ...scene, mediaVideo: undefined }, assets: [] }
      : await composeEditorV6FaceReplacements(faceCompositionInput, project.assets, { assetIndex: projectAssetIndex, additionsOnly: true })
    timings.faceCompositionMs = now() - faceCompositionStarted

    // Face composites are temporary and often change at every speaking frame.
    // Keep them in this frame's registry only: sceneFaceComposition has its own
    // bounded cache, and promoting evicted PNGs would retain them for the export.
    const { current: renderAssetsById, resolve: resolveFrameAsset } = createEditorV6FrameAssetRegistry(assetsById, composed.assets)
    const { renderScene, rasterCanvases } = hairRuntime.composeHairScene({
      composedScene: composed.scene, originalElements, frame, activeHair, riggedElementIds: riggedIds, assetsById, renderAssetsById,
      hairSurfaceDataById: hairRuntime.hairSurfaceDataById, timings, metrics
    })
    // Pass only assets referenced by this layer/frame instead of rebuilding the whole catalog.
    const renderAssets = selectEditorV6RenderableAssets(renderScene, activeLayer ?? 'all', resolveFrameAsset)
    const assetPreparationStarted = now()
    await prepareAssets(renderAssets)
    timings.assetPreparationMs = now() - assetPreparationStarted

    const reactCommitStarted = now()
    commitSurface({
      scene: renderScene, assets: renderAssets, outputWidth: width, outputHeight: height,
      renderLayer: activeLayer ?? 'all', onImageLoad, rasterCanvases
    })
    timings.reactCommitMs = now() - reactCommitStarted

    const svgImageDecodeStarted = now()
    await waitForSvgImages()
    timings.assetPreparationMs = (timings.assetPreparationMs ?? 0) + now() - svgImageDecodeStarted
    setPaintToken(paintToken)
    const rafStarted = now()
    await waitForPaintFrame()
    timings.rafWaitMs = now() - rafStarted
    frameReuse.recordRendered(key, layerKeys, activeLayer)
    return { reused: false, timings, ...(Object.keys(metrics).length ? { metrics } : {}) }
  }
}
