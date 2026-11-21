import { flushSync } from 'react-dom'
import { SceneSurface } from './SceneSurface'
import { EditorV6StackedExportSurface } from './exportStackedSceneSurface'
import { type EditorV6WorkerBridge } from '../../../../shared/editorV6Export'
import { formatEditorV6Error } from '../../../../shared/editorV6Error'
import { createEditorV6ExportWorkerHairResources } from './exportWorkerHairResources'
import { createEditorV6ExportWorkerHairRuntime } from './exportWorkerHairRuntime'
import { createEditorV6ExportFrameAssetImageLoader } from './exportFrameAssetImageLoader'
import { createEditorV6ExportFrameRenderer } from './exportFrameRenderer'
import { createEditorV6ExportPaintHandoff } from './exportPaintHandoff'
import { createEditorV6ExportWorkerSurface, createEditorV6SvgImageReadiness } from './exportWorkerSurface'

const worker = (window as unknown as { editorV6ExportWorker: EditorV6WorkerBridge }).editorV6ExportWorker
async function initialize() {
  const exportDiagnosticWindow = window as unknown as {
    __editorV6ExportDiagnosticStage?: string
    __editorV6ExportDiagnosticAssets?: Array<{ index: number; state: string; mime: string; bytes: number }>
  }
  exportDiagnosticWindow.__editorV6ExportDiagnosticStage = 'worker-initialize'
  const { project, width, height, layeredVideo, singlePassLayers = false, nativeRenderer = false, includeSpeechMouth = true, mouthLoops, hairAnimation, waitForRaf = false, reuseRestHair = true } = await worker.payload()
  const surface = createEditorV6ExportWorkerSurface(width, height, layeredVideo && singlePassLayers)
  const { root, setPaintToken } = surface
  const images = new Map<string, Promise<void>>()
  const assetDecodeDiagnostics = new Map<number, { index: number; state: string; mime: string; bytes: number }>()
  const { prepare: prepareFrameAssets } = createEditorV6ExportFrameAssetImageLoader(images, status => {
    if (status.state === 'ready') assetDecodeDiagnostics.delete(status.index)
    else assetDecodeDiagnostics.set(status.index, status)
    exportDiagnosticWindow.__editorV6ExportDiagnosticAssets = [...assetDecodeDiagnostics.values()]
  })
  const { onLoad: onSvgImageLoad, waitForImage: waitForSvgImage } = createEditorV6SvgImageReadiness()
  // The document catalog is immutable during this worker's lifetime. Keep its
  // composition index separate from the small durable atlas cache.
  const projectAssetIndex = new Map(project.assets.map(asset => [asset.id, asset]))
  const assetsById = new Map(projectAssetIndex)
  const hairResources = await createEditorV6ExportWorkerHairResources(hairAnimation)
  window.addEventListener('pagehide', hairResources.dispose, { once: true })
  const hairRuntime = createEditorV6ExportWorkerHairRuntime(project, hairAnimation, hairResources, mouthLoops, includeSpeechMouth, reuseRestHair)
  const renderFrame = createEditorV6ExportFrameRenderer({
    project, width, height, layeredVideo, nativeRenderer, hairAnimation, projectAssetIndex, assetsById, hairRuntime,
    prepareAssets: prepareFrameAssets,
    commitSurface: surface => flushSync(() => {
      const { renderLayer, ...sceneProps } = surface
      root.render(renderLayer === 'stacked'
        ? <EditorV6StackedExportSurface {...sceneProps} />
        : <SceneSurface {...sceneProps} renderLayer={renderLayer} />)
    }),
    onImageLoad: onSvgImageLoad,
    waitForSvgImages: () => {
      let pending: Promise<void>[] | undefined
      for (const image of document.querySelectorAll<SVGImageElement>('svg image')) {
        const source = image.getAttribute('href') ?? ''
        if (!source) continue
        const readiness = waitForSvgImage(image, source)
        if (readiness) (pending ??= []).push(readiness)
      }
      return pending ? Promise.all(pending).then(() => undefined) : undefined
    },
    setPaintToken,
    setDiagnosticStage: stage => { exportDiagnosticWindow.__editorV6ExportDiagnosticStage = stage },
    // The main process checks paint-token pixels and retries stale readbacks.
    // Do not force a 60Hz display tick here unless explicitly benchmarking the
    // legacy path; otherwise the UI can be ready before the next vsync.
    waitForPaintFrame: createEditorV6ExportPaintHandoff(waitForRaf)
  })
  ;(window as unknown as { renderEditorV6ExportFrame: typeof renderFrame }).renderEditorV6ExportFrame = renderFrame
  await worker.ready()
}
void initialize().catch((error: unknown) => worker.ready(formatEditorV6Error(error)))
