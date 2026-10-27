import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { SceneSurface } from './SceneSurface'
import { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6Timeline'
import { editorV6LayerVisualKeys, editorV6VisualKey, type EditorV6FrameTimings, type EditorV6RenderFrameResult, type EditorV6WorkerBridge } from '../../../../shared/editorV6Export'

const worker = (window as unknown as { editorV6ExportWorker: EditorV6WorkerBridge }).editorV6ExportWorker
async function initialize() {
  const { project, width, height, layeredVideo } = await worker.payload()
  const root = createRoot(document.getElementById('root')!)
  const images = new Map<string, Promise<void>>()
  let previous = '', previousBackground = '', previousForeground = ''
  ;(window as unknown as { renderEditorV6ExportFrame: (frame: number, layer?: 'background' | 'foreground') => Promise<EditorV6RenderFrameResult> }).renderEditorV6ExportFrame = async (frame, layer) => {
    const timings: EditorV6FrameTimings = {}
    const resolutionStarted = performance.now()
    const scene = resolveEditorV6SceneAtFrame(project, frame), key = editorV6VisualKey({ ...scene, mediaVideo: undefined })
    const layerKeys = editorV6LayerVisualKeys(scene), activeLayer = layeredVideo ? layer ?? 'background' : undefined
    timings.sceneResolutionMs = performance.now() - resolutionStarted
    if (key === previous) return { reused: true, timings }
    if (activeLayer === 'background' && layerKeys.background === previousBackground) return { reused: false, layerReused: true, timings }
    if (activeLayer === 'foreground' && layerKeys.foreground === previousForeground) {
      previous = key
      return { reused: false, layerReused: true, timings }
    }
    const ids = new Set(activeLayer === 'background' ? [scene.background.backgroundAssetId] : activeLayer === 'foreground' ? scene.elements.map((element) => element.assetId) : [scene.background.backgroundAssetId, ...scene.elements.map((element) => element.assetId)])
    const assetPreparationStarted = performance.now()
    for (const asset of project.assets) {
      if (!ids.has(asset.id)) continue
      let prepared = images.get(asset.id)
      if (!prepared) {
        prepared = new Promise<void>((resolve, reject) => {
          const image = new Image()
          image.onerror = () => reject(Error(`Não foi possível preparar ${asset.name}.`))
          image.onload = () => { void image.decode().then(resolve, () => reject(Error(`Não foi possível decodificar ${asset.name}.`))) }
          image.src = asset.dataUrl
        })
        if (images.size >= 32) images.delete(images.keys().next().value!)
        images.set(asset.id, prepared)
      }
      await prepared
    }
    timings.assetPreparationMs = performance.now() - assetPreparationStarted
    const reactCommitStarted = performance.now()
    flushSync(() => root.render(<SceneSurface scene={{ ...scene, mediaVideo: undefined }} assets={project.assets} outputWidth={width} outputHeight={height} renderLayer={activeLayer ?? 'all'} />))
    timings.reactCommitMs = performance.now() - reactCommitStarted
    const rafStarted = performance.now()
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    timings.rafWaitMs = performance.now() - rafStarted
    if (activeLayer === 'background') previousBackground = layerKeys.background
    else if (activeLayer === 'foreground') { previousForeground = layerKeys.foreground; previous = key }
    else { previousBackground = layerKeys.background; previousForeground = layerKeys.foreground; previous = key }
    return { reused: false, timings }
  }
  await worker.ready()
}
void initialize().catch((error: unknown) => worker.ready(error instanceof Error ? error.message : String(error)))
