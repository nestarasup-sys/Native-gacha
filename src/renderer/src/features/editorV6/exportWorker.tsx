import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { SyntheticEvent } from 'react'
import { SceneSurface } from './SceneSurface'
import { editorV6ClipAtFrame } from '../../../../shared/editorV6TimelineCore'
import { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6TimelineScene'
import { editorV6FaceModeAtFrame } from '../../../../shared/editorV6FaceSchedule'
import { EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES, editorV6MouthLoopScaleAtFrame, editorV6LayerVisualKeys, editorV6VisualKey, type EditorV6ExportMouthLoops, type EditorV6FrameTimings, type EditorV6RenderFrameResult, type EditorV6WorkerBridge } from '../../../../shared/editorV6Export'

const worker = (window as unknown as { editorV6ExportWorker: EditorV6WorkerBridge }).editorV6ExportWorker
async function initialize() {
  const { project, width, height, layeredVideo, mouthLoops } = await worker.payload()
  const root = createRoot(document.getElementById('root')!)
  const images = new Map<string, Promise<void>>()
  const loadedSvgImages = new WeakMap<SVGImageElement, string>()
  const onSvgImageLoad = (event: SyntheticEvent<SVGImageElement>) => {
    const image = event.currentTarget
    loadedSvgImages.set(image, image.getAttribute('href') ?? '')
  }
  const waitForSvgImage = (image: SVGImageElement, expectedSource: string) => {
    if (loadedSvgImages.get(image) === expectedSource) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout>
      const finish = (error?: Error) => {
        clearTimeout(timeout)
        image.removeEventListener('load', onLoad)
        image.removeEventListener('error', onError)
        if (error) reject(error)
        else resolve()
      }
      const onLoad = () => {
        const source = image.getAttribute('href') ?? ''
        loadedSvgImages.set(image, source)
        if (source === expectedSource) finish()
      }
      const onError = () => finish(Error('Uma imagem da cena falhou ao carregar no renderizador de exportação.'))
      image.addEventListener('load', onLoad)
      image.addEventListener('error', onError)
      timeout = setTimeout(() => finish(Error('Tempo limite ao carregar uma imagem da cena para exportação.')), 60000)
      if (loadedSvgImages.get(image) === expectedSource) finish()
    })
  }
  const assetsById = new Map(project.assets.map(asset => [asset.id, asset]))
  const mouthLoopByBlock = new Map<string, EditorV6ExportMouthLoops['states'][number]>()
  for (const state of mouthLoops?.states ?? []) for (const blockId of state.blockIds) mouthLoopByBlock.set(`${state.elementId}:${blockId}`, state)
  let previous = '', previousBackground = '', previousForeground = ''
  const applyMouthLoop = (scene: ReturnType<typeof resolveEditorV6SceneAtFrame>, frame: number) => {
    if (!mouthLoops) return scene
    const scale = editorV6MouthLoopScaleAtFrame(frame, mouthLoops.startFrame, mouthLoops.cycleFrames)
    const sampleIndex = Math.round((scale - 1) / (EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES[2] - 1) * 2)
    return { ...scene, elements: scene.elements.map((element) => {
      if (element.kind !== 'character' || !element.characterId) return element
      const faceMode = editorV6FaceModeAtFrame(project.id, project.timeline, element.characterId, frame)
      if (faceMode !== 'talk' && faceMode !== 'talk-blink') return element
      const block = editorV6ClipAtFrame(project.timeline, element.id, frame)?.block
      const state = mouthLoopByBlock.get(`${element.id}:${block?.id ?? element.id}`)
      if (!state || state.characterId !== element.characterId) return element
      if (element.motionSprite) {
        if (!element.mouthPatch && scale > 1.000001) throw Error(`A transição de ${element.text || element.characterId} não tem uma camada facial preparada durante a fala; a exportação foi interrompida para preservar a qualidade.`)
        return element
      }
      const motion = state.frames[sampleIndex] ?? state.frames[0]
      if (!motion?.facePatch) throw Error(`A camada facial de ${element.text || element.characterId} está incompleta; a exportação foi interrompida para evitar um vídeo sem animação de boca.`)
      return { ...element, mouthPatch: { assetId: state.assetId, ...motion.facePatch } }
    }) }
  }
  ;(window as unknown as { renderEditorV6ExportFrame: (frame: number, layer?: 'background' | 'foreground') => Promise<EditorV6RenderFrameResult> }).renderEditorV6ExportFrame = async (frame, layer) => {
    const timings: EditorV6FrameTimings = {}
    const resolutionStarted = performance.now()
    const scene = applyMouthLoop(resolveEditorV6SceneAtFrame(project, frame), frame), key = editorV6VisualKey({ ...scene, mediaVideo: undefined })
    const layerKeys = editorV6LayerVisualKeys(scene), activeLayer = layeredVideo ? layer ?? 'background' : undefined
    timings.sceneResolutionMs = performance.now() - resolutionStarted
    if (key === previous) return { reused: true, timings }
    if (activeLayer === 'background' && layerKeys.background === previousBackground) return { reused: false, layerReused: true, timings }
    if (activeLayer === 'foreground' && layerKeys.foreground === previousForeground) {
      previous = key
      return { reused: false, layerReused: true, timings }
    }
    const sceneAssetIds = scene.elements.flatMap((element) => [element.assetId, element.mouthPatch?.assetId])
    const ids = new Set(activeLayer === 'background' ? [scene.background.backgroundAssetId] : activeLayer === 'foreground' ? sceneAssetIds : [scene.background.backgroundAssetId, ...sceneAssetIds])
    const assetPreparationStarted = performance.now()
    for (const id of ids) {
      const asset = id ? assetsById.get(id) : undefined
      if (!asset) continue
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
    flushSync(() => root.render(<SceneSurface scene={{ ...scene, mediaVideo: undefined }} assets={project.assets} outputWidth={width} outputHeight={height} renderLayer={activeLayer ?? 'all'} onImageLoad={onSvgImageLoad} />))
    timings.reactCommitMs = performance.now() - reactCommitStarted
    const svgImageDecodeStarted = performance.now()
    await Promise.all(Array.from(document.querySelectorAll<SVGImageElement>('svg image')).flatMap((image) => {
      const source = image.getAttribute('href') ?? ''
      return source ? [waitForSvgImage(image, source)] : []
    }))
    timings.assetPreparationMs = (timings.assetPreparationMs ?? 0) + performance.now() - svgImageDecodeStarted
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
