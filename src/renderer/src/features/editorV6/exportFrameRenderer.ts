import type { SyntheticEvent } from 'react'
import type { EditorV6Asset, EditorV6Document } from '../../../../shared/editorV6'
import { createEditorV6ExportFrameVisualKeyCache, type EditorV6FrameMetrics, type EditorV6FrameTimings, type EditorV6RenderFrameResult, type EditorV6WorkerPayload } from '../../../../shared/editorV6Export'
import { composeEditorV6FaceReplacements } from './sceneFaceComposition'
import { createEditorV6ExportWorkerHairRuntime } from './exportWorkerHairRuntime'
import { createEditorV6ExportFrameReuseState } from './exportFrameReuse'
import { resolveEditorV6ExportFramePlan } from './exportFramePlan'
import { createEditorV6FrameAssetRegistry, selectEditorV6RenderableAssets } from './exportFrameAssets'
import { createEditorV6NativeFramePlan } from './editorV6NativeFramePlan'

type HairRuntime = ReturnType<typeof createEditorV6ExportWorkerHairRuntime>
type ExportScene = ReturnType<HairRuntime['resolveRawSceneAtFrame']>
type ExportSceneElement = ExportScene['elements'][number]
type RenderLayer = 'all' | 'background' | 'foreground' | 'stacked'

const EMPTY_ORIGINAL_ELEMENTS: ReadonlyMap<string, ExportSceneElement> = new Map()

type SurfaceInput = {
  scene: Awaited<ReturnType<HairRuntime['resolveRawSceneAtFrame']>>
  assets: readonly EditorV6Asset[]
  resolveAssetById: (id: string) => EditorV6Asset | undefined
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
  nativeRenderer?: boolean
  hairAnimation: EditorV6WorkerPayload['hairAnimation']
  projectAssetIndex: ReadonlyMap<string, EditorV6Asset>
  assetsById: Map<string, EditorV6Asset>
  hairRuntime: HairRuntime
  prepareAssets: (assets: readonly EditorV6Asset[]) => Promise<void>
  commitSurface: (surface: SurfaceInput) => void
  onImageLoad: (event: SyntheticEvent<SVGImageElement>) => void
  waitForSvgImages: () => Promise<void> | undefined
  setPaintToken: (token: number) => void
  waitForPaintFrame: () => Promise<void>
  setDiagnosticStage?: (stage: string) => void
  now?: () => number
}

/** Coordinates one export-frame resolution, composition, commit and paint handoff. */
export function createEditorV6ExportFrameRenderer(options: Options) {
  const {
    project, width, height, layeredVideo, nativeRenderer = false, hairAnimation, projectAssetIndex, assetsById,
    hairRuntime, prepareAssets, commitSurface, onImageLoad, waitForSvgImages, setPaintToken, waitForPaintFrame,
    setDiagnosticStage = () => undefined
  } = options
  const now = options.now ?? (() => performance.now())
  const frameReuse = createEditorV6ExportFrameReuseState()
  const visualKeyCache = createEditorV6ExportFrameVisualKeyCache()

  return async (
    frame: number,
    layer: 'background' | 'foreground' | 'stacked' | undefined,
    paintToken: number
  ): Promise<EditorV6RenderFrameResult> => {
    const frameStarted = now()
    const timings: EditorV6FrameTimings = {}
    const metrics: EditorV6FrameMetrics = {}
    const completeFrame = (result: Omit<EditorV6RenderFrameResult, 'timings'>): EditorV6RenderFrameResult => {
      timings.rendererFrameWorkMs = now() - frameStarted
      return { ...result, timings }
    }
    const resolutionStarted = now()
    setDiagnosticStage(`scene-resolution:${frame}`)
    // Layered captures of one frame share the cached, unmodified timeline scene.
    const rawScene = hairRuntime.resolveRawSceneAtFrame(frame)
    const scene = hairRuntime.applyMouthLoop(rawScene, frame)
    const framePlan = resolveEditorV6ExportFramePlan({
      scene, frame, requestedLayer: layer === 'stacked' ? undefined : layer, layeredVideo: layeredVideo && layer !== 'stacked', hairAnimation, hairPoseReactionEnds: hairRuntime.hairPoseReactionEnds,
      visualKeyCache,
      hasAnimatedHair: element => hairRuntime.hasAnimatedHair(element, frame)
    })
    const { activeLayer, activeHair, riggedElementIds, key, layerKeys } = framePlan
    // A stacked frame contains the full background and foreground in one
    // DOM paint. Frame reuse is evaluated for both layers together.
    timings.sceneResolutionMs = now() - resolutionStarted
    const reuseDecision = frameReuse.decide(key, activeLayer, layerKeys)
    if (reuseDecision === 'frame') return completeFrame({ reused: true })
    if (reuseDecision === 'background' || reuseDecision === 'foreground') return completeFrame({ reused: false, layerReused: true })

    const faceCompositionStarted = now()
    setDiagnosticStage(`face-composition:${frame}`)
    let originalElements = EMPTY_ORIGINAL_ELEMENTS
    let hasRiggedMouthPatch = false
    if (activeHair) {
      const indexedElements = new Map<string, ExportSceneElement>()
      for (const element of scene.elements) {
        if (!riggedElementIds.has(element.id)) continue
        indexedElements.set(element.id, element)
        if (element.mouthPatch) hasRiggedMouthPatch = true
      }
      originalElements = indexedElements
    }
    const riggedIds = riggedElementIds
    const faceCompositionInput = riggedIds.size
      ? { ...scene, mediaVideo: undefined, elements: hasRiggedMouthPatch ? scene.elements.map(element => riggedIds.has(element.id) ? { ...element, mouthPatch: undefined } : element) : scene.elements }
      : { ...scene, mediaVideo: undefined }
    const composed = activeLayer === 'background'
      ? { scene: { ...scene, mediaVideo: undefined }, assets: [] }
      : await composeEditorV6FaceReplacements(faceCompositionInput, project.assets, { assetIndex: projectAssetIndex, additionsOnly: true })
    timings.faceCompositionMs = now() - faceCompositionStarted

    // Face composites are temporary and often change at every speaking frame.
    // Keep them in this frame's registry only: sceneFaceComposition has its own
    // bounded cache, and promoting evicted PNGs would retain them for the export.
    const { current: renderAssetsById, resolve: resolveFrameAsset } = createEditorV6FrameAssetRegistry(assetsById, composed.assets)
    setDiagnosticStage(`hair-composition:${frame}`)
    const { renderScene, rasterCanvases } = hairRuntime.composeHairScene({
      composedScene: composed.scene, originalElements, frame, activeHair, riggedElementIds: riggedIds, assetsById, renderAssetsById,
      hairSurfaceDataById: hairRuntime.hairSurfaceDataById, timings, metrics
    })
    // Pass only assets referenced by this layer/frame instead of rebuilding the whole catalog.
    const renderAssets = selectEditorV6RenderableAssets(renderScene, activeLayer ?? 'all', resolveFrameAsset)
    setDiagnosticStage(`asset-selection:${frame}`)
    if (nativeRenderer) {
      const nativePlanStarted = now()
      const nativeFrame = await createEditorV6NativeFramePlan({
        scene: renderScene,
        assets: renderAssets,
        resolveAssetById: resolveFrameAsset,
        rasterCanvases,
        frame,
        width,
        height,
        layer: layer ?? 'all'
      })
      timings.nativePlanMs = now() - nativePlanStarted
      frameReuse.recordRendered(key, layerKeys, activeLayer)
      return completeFrame({ reused: false, nativeFrame, ...(Object.keys(metrics).length ? { metrics } : {}) })
    }
    const assetPreparationStarted = now()
    setDiagnosticStage(`asset-decode:${frame}`)
    await prepareAssets(renderAssets)
    timings.assetPreparationMs = now() - assetPreparationStarted

    const reactCommitStarted = now()
    setDiagnosticStage(`react-commit:${frame}`)
    commitSurface({
      scene: renderScene, assets: renderAssets, resolveAssetById: resolveFrameAsset, outputWidth: width, outputHeight: height,
      renderLayer: layer === 'stacked' ? 'stacked' : activeLayer ?? 'all', onImageLoad, rasterCanvases
    })
    timings.reactCommitMs = now() - reactCommitStarted

    const svgImageDecodeStarted = now()
    setDiagnosticStage(`svg-image-decode:${frame}`)
    const pendingSvgImages = waitForSvgImages()
    if (pendingSvgImages) await pendingSvgImages
    timings.assetPreparationMs = (timings.assetPreparationMs ?? 0) + now() - svgImageDecodeStarted
    setPaintToken(paintToken)
    const rafStarted = now()
    setDiagnosticStage(`paint-handoff:${frame}`)
    await waitForPaintFrame()
    timings.rafWaitMs = now() - rafStarted
    frameReuse.recordRendered(key, layerKeys, activeLayer)
    setDiagnosticStage(`frame-ready:${frame}`)
    return completeFrame({ reused: false, ...(Object.keys(metrics).length ? { metrics } : {}) })
  }
}
