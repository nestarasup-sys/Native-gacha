import { flushSync } from 'react-dom'
import { SceneSurface } from './SceneSurface'
import { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6TimelineScene'
import { type EditorV6FrameMetrics, type EditorV6FrameTimings, type EditorV6RenderFrameResult, type EditorV6WorkerBridge } from '../../../../shared/editorV6Export'
import { type HairMotionLoop, type HairMotionState } from '../../../../shared/hairMotionEngine'
import { editorV6HairMotionInstancePhase } from '../../../../shared/editorV6HairMotion'
import { composeEditorV6FaceReplacements } from './sceneFaceComposition'
import { createExportHairMeshRenderer } from './exportHairMeshRenderer'
import { createEditorV6ExportHairMotionPlanIndex } from './exportHairMotionPlanIndex'
import { createEditorV6ExportHairRigAtFrame } from './exportHairRigAtFrame'
import { createEditorV6HairHeadPathTimeline } from './exportHairHeadPathTimeline'
import { createEditorV6ExportHairFrameComposer } from './exportHairFrameComposer'
import { createEditorV6ExportHairPieceDrawer } from './exportHairPieceDrawing'
import { createEditorV6ExportHairSceneComposer } from './exportHairSceneComposition'
import { createEditorV6ExportHairTextureWarper } from './exportHairTextureWarper'
import { createEditorV6ExportFrameAssetImageLoader } from './exportFrameAssetImageLoader'
import { createEditorV6ExportFrameReuseState } from './exportFrameReuse'
import { resolveEditorV6ExportFramePlan } from './exportFramePlan'
import { createEditorV6ExportMouthLoopResolver } from './exportMouthLoop'
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
  const hairSurfaces = new Map<string, HTMLImageElement>()
  const hairSurfaceDataById = new Map((hairAnimation?.surfaces ?? []).map(surface => [surface.id, surface.dataUrl]))
  const hairTextures = new Map<string, HTMLImageElement>()
  const hairMotionPlanIndex = createEditorV6ExportHairMotionPlanIndex(project, hairAnimation)
  const { hairTransitionIndex, hairPoseReactionEnds } = hairMotionPlanIndex
  const { hairRigAtFrame } = createEditorV6ExportHairRigAtFrame(hairMotionPlanIndex)
  let resolvedFrame = -1
  let resolvedRawScene: ReturnType<typeof resolveEditorV6SceneAtFrame> | undefined
  const hairMotionStates = new Map<string, HairMotionState>()
  const hairMotionLoops = new Map<string, HairMotionLoop>()
  const hairMotionInstancePhases = new Map([...new Set((hairAnimation?.rigs ?? []).map(rig => rig.elementId))].map(elementId => [elementId, editorV6HairMotionInstancePhase(elementId)]))
  const hairWarpCanvases = new Map<string, HTMLCanvasElement>()
  // Immutable, correctly padded source pixels for a stationary strand.
  // Kept only for this worker, never across MP4 exports or character edits.
  const staticHairWarpCanvases = new Map<string, HTMLCanvasElement>()
  const hairMeshRenderer = createExportHairMeshRenderer()
  const { warpHairTexture } = createEditorV6ExportHairTextureWarper({ hairWarpCanvases, staticHairWarpCanvases, hairMeshRenderer })
  const hairFrameCanvases = new Map<string, { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }>()
  // One live surface per transitioning actor lets the SVG embed the canvas
  // directly. These surfaces are reused across frames instead of PNG round trips.
  const motionHairFrameSurfaces = new Map<string, { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }>()
  const animatedElementIds = [...new Set((hairAnimation?.rigs ?? []).filter(rig => rig.layers.length > 0).map(rig => rig.elementId))]
  const loadHairImage = (dataUrl: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => { void image.decode().then(() => resolve(image), () => reject(Error('Não foi possível decodificar uma camada da animação de cabelo.'))) }
    image.onerror = () => reject(Error('Não foi possível carregar uma camada da animação de cabelo.'))
    image.src = dataUrl
  })
  if (hairAnimation) {
    const [surfaceImages, textureImages] = await Promise.all([
      Promise.all(hairAnimation.surfaces.map(async surface => [surface.id, await loadHairImage(surface.dataUrl)] as const)),
      Promise.all(hairAnimation.textures.map(async texture => [texture.id, await loadHairImage(texture.dataUrl)] as const))
    ])
    for (const [id, image] of surfaceImages) hairSurfaces.set(id, image)
    for (const [id, image] of textureImages) hairTextures.set(id, image)
  }
  const { headXAtFrame, pieceFlipXAtFrame } = createEditorV6HairHeadPathTimeline({
    animatedElementIds,
    hasHairAnimation: Boolean(hairAnimation),
    resolveScene: frame => frame === resolvedFrame && resolvedRawScene
      // Reuse the raw scene already resolved for this exported frame; mouth
      // overlays must not change the physical rig used by head-path inertia.
      ? resolvedRawScene
      : resolveEditorV6SceneAtFrame(project, frame),
    getTransitionSample: (elementId, frame) => {
      const indexed = hairTransitionIndex.get(elementId, frame)
      return indexed ? { transition: indexed.transition, poseSample: indexed.poseSample } : undefined
    },
    hairRigAtFrame
  })
  const drawHairPiece = createEditorV6ExportHairPieceDrawer({
    animation: hairAnimation!, textures: hairTextures, states: hairMotionStates, loops: hairMotionLoops,
    instancePhases: hairMotionInstancePhases, poseReactionEnds: hairPoseReactionEnds,
    headXAtFrame, pieceFlipXAtFrame, warpHairTexture
  })
  const { composeHairFrame, composeMotionHairFrame } = createEditorV6ExportHairFrameComposer({
    hairSurfaces,
    hairFrameCanvases,
    motionHairFrameSurfaces,
    drawHairPiece
  })
  const { applyMouthLoop, hairSourceAssetId } = createEditorV6ExportMouthLoopResolver(project, mouthLoops)
  const { hasAnimatedHair, compose: composeHairScene } = createEditorV6ExportHairSceneComposer({
    animation: hairAnimation, planIndex: hairMotionPlanIndex, hairRigAtFrame, hairSourceAssetId, composeHairFrame, composeMotionHairFrame
  })
  const frameReuse = createEditorV6ExportFrameReuseState()
  ;(window as unknown as { renderEditorV6ExportFrame: (frame: number, layer: 'background' | 'foreground' | undefined, paintToken: number) => Promise<EditorV6RenderFrameResult> }).renderEditorV6ExportFrame = async (frame, layer, paintToken) => {
    const timings: EditorV6FrameTimings = {}
    const metrics: EditorV6FrameMetrics = {}
    const resolutionStarted = performance.now()
    // Two layered captures of the same frame share one immutable raw timeline
    // resolution. Head-path preparation consumes this same scene where possible.
    if (resolvedFrame !== frame || !resolvedRawScene) {
      resolvedRawScene = resolveEditorV6SceneAtFrame(project, frame)
      resolvedFrame = frame
    }
    const scene = applyMouthLoop(resolvedRawScene, frame)
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
  window.addEventListener('pagehide', () => {
    hairMeshRenderer.dispose()
    for (const canvas of hairWarpCanvases.values()) canvas.width = canvas.height = 1
    for (const canvas of staticHairWarpCanvases.values()) canvas.width = canvas.height = 1
    for (const { canvas } of hairFrameCanvases.values()) canvas.width = canvas.height = 1
    for (const { canvas } of motionHairFrameSurfaces.values()) canvas.width = canvas.height = 1
    hairWarpCanvases.clear()
    hairFrameCanvases.clear()
    motionHairFrameSurfaces.clear()
  }, { once: true })
  await worker.ready()
}
void initialize().catch((error: unknown) => worker.ready(error instanceof Error ? error.message : String(error)))
