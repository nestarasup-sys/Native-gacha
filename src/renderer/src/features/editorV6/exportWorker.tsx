import { flushSync } from 'react-dom'
import { SceneSurface } from './SceneSurface'
import { type EditorV6FrameMetrics, type EditorV6FrameTimings, type EditorV6RenderFrameResult, type EditorV6WorkerBridge } from '../../../../shared/editorV6Export'
import { composeEditorV6FaceReplacements } from './sceneFaceComposition'
import { createEditorV6ExportWorkerHairResources } from './exportWorkerHairResources'
import { createEditorV6ExportWorkerHairRuntime } from './exportWorkerHairRuntime'
import { createEditorV6ExportFrameAssetImageLoader } from './exportFrameAssetImageLoader'
import { createEditorV6ExportFrameReuseState } from './exportFrameReuse'
import { resolveEditorV6ExportFramePlan } from './exportFramePlan'
import { createEditorV6FrameAssetRegistry, selectEditorV6RenderableAssets } from './exportFrameAssets'
import { createEditorV6ExportWorkerSurface, createEditorV6SvgImageReadiness } from './exportWorkerSurface'

const worker = (window as unknown as { editorV6ExportWorker: EditorV6WorkerBridge }).editorV6ExportWorker
async function initialize() {
  const { project, width, height, layeredVideo, mouthLoops, hairAnimation } = await worker.payload()
  const surface = createEditorV6ExportWorkerSurface(width, height)
  const { root, setPaintToken } = surface
  const images = new Map<string, Promise<void>>()
  const { prepare: prepareFrameAssets } = createEditorV6ExportFrameAssetImageLoader(images)
  const { onLoad: onSvgImageLoad, waitForImage: waitForSvgImage } = createEditorV6SvgImageReadiness()
  // The document catalog is immutable during this worker's lifetime. Keep its
  // composition index separate from the small durable atlas cache.
  const projectAssetIndex = new Map(project.assets.map(asset => [asset.id, asset]))
  const assetsById = new Map(projectAssetIndex)
  const hairResources = await createEditorV6ExportWorkerHairResources(hairAnimation)
  window.addEventListener('pagehide', hairResources.dispose, { once: true })
  const hairRuntime = createEditorV6ExportWorkerHairRuntime(project, hairAnimation, hairResources, mouthLoops)
  const { hairPoseReactionEnds, resolveRawSceneAtFrame, applyMouthLoop, hasAnimatedHair, composeHairScene, hairSurfaceDataById } = hairRuntime
  const frameReuse = createEditorV6ExportFrameReuseState()
  ;(window as unknown as { renderEditorV6ExportFrame: (frame: number, layer: 'background' | 'foreground' | undefined, paintToken: number) => Promise<EditorV6RenderFrameResult> }).renderEditorV6ExportFrame = async (frame, layer, paintToken) => {
    const timings: EditorV6FrameTimings = {}
    const metrics: EditorV6FrameMetrics = {}
    const resolutionStarted = performance.now()
    // Two layered captures of the same frame share one immutable raw timeline
    // resolution. Head-path preparation consumes this same scene where possible.
    const rawScene = resolveRawSceneAtFrame(frame)
    const scene = applyMouthLoop(rawScene, frame)
    const framePlan = resolveEditorV6ExportFramePlan({
      scene, frame, requestedLayer: layer, layeredVideo, hairAnimation, hairPoseReactionEnds,
      hasAnimatedHair: element => hasAnimatedHair(element, frame)
    })
    const { activeLayer, activeHair, key, layerKeys } = framePlan
    timings.sceneResolutionMs = performance.now() - resolutionStarted
    const reuseDecision = frameReuse.decide(key, activeLayer, layerKeys)
    if (reuseDecision === 'frame') return { reused: true, timings }
    if (reuseDecision === 'background' || reuseDecision === 'foreground') return { reused: false, layerReused: true, timings }
    const faceCompositionStarted = performance.now()
    const originalElements = new Map(scene.elements.map(element => [element.id, element]))
    const riggedIds = new Set(activeHair ? scene.elements.flatMap(element => hasAnimatedHair(element, frame) ? [element.id] : []) : [])
    const faceCompositionInput = riggedIds.size
      ? { ...scene, mediaVideo: undefined, elements: scene.elements.map(element => riggedIds.has(element.id) ? { ...element, mouthPatch: undefined } : element) }
      : { ...scene, mediaVideo: undefined }
    const composed = activeLayer === 'background'
      ? { scene: { ...scene, mediaVideo: undefined }, assets: [] }
      : await composeEditorV6FaceReplacements(faceCompositionInput, project.assets, { assetIndex: projectAssetIndex, additionsOnly: true })
    timings.faceCompositionMs = performance.now() - faceCompositionStarted

    // Face composites are temporary and often change at every speaking frame.
    // Keep them in this frame's registry only: the shared cache in
    // sceneFaceComposition already has an explicit memory budget.
    // Inserting them into assetsById would retain every evicted PNG for the
    // entire export, causing renderer memory to grow with video duration.
    const { current: renderAssetsById, resolve: resolveFrameAsset } = createEditorV6FrameAssetRegistry(assetsById, composed.assets)
    const { renderScene, rasterCanvases } = composeHairScene({
      composedScene: composed.scene, originalElements, frame, activeHair, riggedElementIds: riggedIds, assetsById, renderAssetsById,
      hairSurfaceDataById, timings, metrics
    })
    // SceneSurface and the image preloader only need the assets actually
    // referenced by this layer/frame. Previously the whole project catalog was
    // rebuilt and passed to React on every animated-hair frame.
    const renderAssets = selectEditorV6RenderableAssets(renderScene, activeLayer ?? 'all', resolveFrameAsset)
    const assetPreparationStarted = performance.now()
    await prepareFrameAssets(renderAssets)
    timings.assetPreparationMs = performance.now() - assetPreparationStarted
    const reactCommitStarted = performance.now()
    flushSync(() => root.render(<SceneSurface scene={renderScene} assets={renderAssets} outputWidth={width} outputHeight={height} renderLayer={activeLayer ?? 'all'} onImageLoad={onSvgImageLoad} rasterCanvases={rasterCanvases} />))
    timings.reactCommitMs = performance.now() - reactCommitStarted
    const svgImageDecodeStarted = performance.now()
    await Promise.all(Array.from(document.querySelectorAll<SVGImageElement>('svg image')).flatMap((image) => {
      const source = image.getAttribute('href') ?? ''
      return source ? [waitForSvgImage(image, source)] : []
    }))
    timings.assetPreparationMs = (timings.assetPreparationMs ?? 0) + performance.now() - svgImageDecodeStarted
    setPaintToken(paintToken)
    const rafStarted = performance.now()
    // capturePage validates this exact paint with the per-frame token and retries a stale readback.
    // One refresh handoff avoids an unconditional second display interval on every exported frame.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    timings.rafWaitMs = performance.now() - rafStarted
    frameReuse.recordRendered(key, layerKeys, activeLayer)
    return { reused: false, timings, ...(Object.keys(metrics).length ? { metrics } : {}) }
  }
  await worker.ready()
}
void initialize().catch((error: unknown) => worker.ready(error instanceof Error ? error.message : String(error)))
