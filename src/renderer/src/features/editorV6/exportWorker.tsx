import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { SceneSurface } from './SceneSurface'
import { editorV6ClipAtFrame, resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6Timeline'
import { editorV6FaceModeAtFrame } from '../../../../shared/editorV6FaceSchedule'
import { EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES, editorV6LayerVisualKeys, editorV6VisualKey, type EditorV6ExportMouthLoops, type EditorV6FrameTimings, type EditorV6RenderFrameResult, type EditorV6WorkerBridge } from '../../../../shared/editorV6Export'

const worker = (window as unknown as { editorV6ExportWorker: EditorV6WorkerBridge }).editorV6ExportWorker
async function initialize() {
  const { project, width, height, layeredVideo, mouthLoops } = await worker.payload()
  const root = createRoot(document.getElementById('root')!)
  const images = new Map<string, Promise<void>>()
  const mouthLoopByBlock = new Map<string, EditorV6ExportMouthLoops['states'][number]>()
  for (const state of mouthLoops?.states ?? []) for (const blockId of state.blockIds) mouthLoopByBlock.set(`${state.elementId}:${blockId}`, state)
  let previous = '', previousBackground = '', previousForeground = ''
  const applyMouthLoop = (scene: ReturnType<typeof resolveEditorV6SceneAtFrame>, frame: number) => {
    if (!mouthLoops) return scene
    const phase = ((frame - mouthLoops.startFrame) % mouthLoops.cycleFrames + mouthLoops.cycleFrames) % mouthLoops.cycleFrames / mouthLoops.cycleFrames
    const travel = phase <= .5 ? phase * 2 : (1 - phase) * 2
    const sampleIndex = Math.round(travel * (EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES.length - 1))
    return { ...scene, elements: scene.elements.map((element) => {
      if (element.kind !== 'character' || !element.characterId || element.motionSprite) return element
      const faceMode = editorV6FaceModeAtFrame(project.id, project.timeline, element.characterId, frame)
      if (faceMode !== 'talk' || element.activeFaceMode === 'blink') return element
      const block = editorV6ClipAtFrame(project.timeline, element.id, frame)?.block
      const state = mouthLoopByBlock.get(`${element.id}:${block?.id ?? element.id}`)
      if (!state || state.characterId !== element.characterId) return element
      const motion = state.frames[sampleIndex] ?? state.frames[0]
      if (!motion) return element
      return { ...element, assetId: state.assetId, motionSprite: motion.sprite, x: motion.x, y: motion.y, width: motion.width, height: motion.height, rotation: motion.rotation, flipX: motion.flipX, characterScale: 100, characterWidthScale: 100, characterHeightScale: 100 }
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
