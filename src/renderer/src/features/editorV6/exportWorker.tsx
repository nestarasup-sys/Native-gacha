import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { SceneSurface } from './SceneSurface'
import { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6Timeline'
import { editorV6VisualKey, type EditorV6WorkerBridge } from '../../../../shared/editorV6Export'

const worker = (window as unknown as { editorV6ExportWorker: EditorV6WorkerBridge }).editorV6ExportWorker
async function initialize() {
  const { project, width, height } = await worker.payload()
  const root = createRoot(document.getElementById('root')!)
  const images = new Map<string, Promise<void>>()
  const layeredVideo = project.timeline.tracks.some((track) => track.kind === 'video' && track.blocks.some((block) => block.mediaId && project.media?.some((media) => media.id === block.mediaId && media.kind === 'video')))
  let previous = ''
  ;(window as unknown as { renderEditorV6ExportFrame: (frame: number, layer?: 'background' | 'foreground') => Promise<{ reused: boolean }> }).renderEditorV6ExportFrame = async (frame, layer) => {
    const scene = resolveEditorV6SceneAtFrame(project, frame), key = editorV6VisualKey({ ...scene, mediaVideo: undefined })
    if (key === previous) return { reused: true }
    const ids = new Set([scene.background.backgroundAssetId, ...scene.elements.map((element) => element.assetId)])
    for (const asset of project.assets) {
      if (!ids.has(asset.id)) continue
      let prepared = images.get(asset.id)
      if (!prepared) {
        prepared = new Promise<void>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(Error(`Não foi possível preparar ${asset.name}.`)); image.src = asset.dataUrl })
        if (images.size >= 32) images.delete(images.keys().next().value!)
        images.set(asset.id, prepared)
      }
      await prepared
    }
    flushSync(() => root.render(<SceneSurface scene={{ ...scene, mediaVideo: undefined }} assets={project.assets} outputWidth={width} outputHeight={height} renderLayer={layeredVideo ? layer ?? 'background' : 'all'} />))
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    if (!layeredVideo || layer === 'foreground') previous = key
    return { reused: false }
  }
  await worker.ready()
}
void initialize().catch((error: unknown) => worker.ready(error instanceof Error ? error.message : String(error)))
