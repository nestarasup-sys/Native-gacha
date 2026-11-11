import { flushSync } from 'react-dom'
import { SceneSurface } from './SceneSurface'
import { type EditorV6WorkerBridge } from '../../../../shared/editorV6Export'
import { createEditorV6ExportWorkerHairResources } from './exportWorkerHairResources'
import { createEditorV6ExportWorkerHairRuntime } from './exportWorkerHairRuntime'
import { createEditorV6ExportFrameAssetImageLoader } from './exportFrameAssetImageLoader'
import { createEditorV6ExportFrameRenderer } from './exportFrameRenderer'
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
  const renderFrame = createEditorV6ExportFrameRenderer({
    project, width, height, layeredVideo, hairAnimation, projectAssetIndex, assetsById, hairRuntime,
    prepareAssets: prepareFrameAssets,
    commitSurface: surface => flushSync(() => root.render(<SceneSurface {...surface} />)),
    onImageLoad: onSvgImageLoad,
    waitForSvgImages: async () => {
      await Promise.all(Array.from(document.querySelectorAll<SVGImageElement>('svg image')).flatMap(image => {
        const source = image.getAttribute('href') ?? ''
        return source ? [waitForSvgImage(image, source)] : []
      }))
    },
    setPaintToken,
    // capturePage validates this exact paint with the per-frame token and retries a stale readback.
    // One refresh handoff avoids an unconditional second display interval on every exported frame.
    waitForPaintFrame: () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  })
  ;(window as unknown as { renderEditorV6ExportFrame: typeof renderFrame }).renderEditorV6ExportFrame = renderFrame
  await worker.ready()
}
void initialize().catch((error: unknown) => worker.ready(error instanceof Error ? error.message : String(error)))
