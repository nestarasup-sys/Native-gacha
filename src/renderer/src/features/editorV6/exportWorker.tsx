import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { SyntheticEvent } from 'react'
import { SceneSurface } from './SceneSurface'
import { editorV6ClipAtFrame } from '../../../../shared/editorV6TimelineCore'
import { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6TimelineScene'
import { editorV6FaceModeAtFrame } from '../../../../shared/editorV6FaceSchedule'
import { EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES, editorV6MouthLoopScaleAtFrame, editorV6LayerVisualKeys, editorV6VisualKey, type EditorV6ExportMouthLoops, type EditorV6FrameTimings, type EditorV6RenderFrameResult, type EditorV6WorkerBridge } from '../../../../shared/editorV6Export'
import { advanceHairMotionToFrame, createHairMotionState, hairMotionOffset, type HairMotionSettings, type HairMotionState } from '../../../../shared/hairMotionEngine'
import type { EditorV6HairMotionRig, EditorV6HairMotionLayer } from '../../../../shared/editorV6HairMotion'
import { faceRenderGeometry } from '../../characters/characterGeometry'
import { composeEditorV6FaceReplacements } from './sceneFaceComposition'

const worker = (window as unknown as { editorV6ExportWorker: EditorV6WorkerBridge }).editorV6ExportWorker
async function initialize() {
  const { project, width, height, layeredVideo, mouthLoops, hairAnimation } = await worker.payload()
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
  const hairSurfaces = new Map<string, HTMLImageElement>()
  const hairTextures = new Map<string, HTMLImageElement>()
  const hairRigs = new Map((hairAnimation?.rigs ?? []).map(rig => [`${rig.elementId}:${rig.assetId}`, rig]))
  const hairMotionStates = new Map<string, HairMotionState>()
  const hairWarpCanvases = new Map<string, HTMLCanvasElement>()
  const hairFrameCanvases = new Map<string, { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }>()
  const animatedElementIds = [...new Set((hairAnimation?.rigs ?? []).filter(rig => rig.layers.length > 0).map(rig => rig.elementId))]
  let headPathCapacity = 0, headPathFrame = -1
  const headPaths = new Map(animatedElementIds.map(id => [id, new Float32Array(0)]))
  const headPathLastValues = new Map(animatedElementIds.map(id => [id, 0]))
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
  const ensureHeadPaths = (targetFrame: number) => {
    if (!hairAnimation || targetFrame <= headPathFrame) return
    if (targetFrame + 1 > headPathCapacity) {
      const capacity = Math.max(1024, 2 ** Math.ceil(Math.log2(targetFrame + 1)))
      for (const [id, previous] of headPaths) {
        const next = new Float32Array(capacity)
        next.set(previous)
        headPaths.set(id, next)
      }
      headPathCapacity = capacity
    }
    for (let frame = headPathFrame + 1; frame <= targetFrame; frame += 1) {
      const resolved = resolveEditorV6SceneAtFrame(project, frame)
      const elements = new Map(resolved.elements.filter(element => element.kind === 'character').map(element => [element.id, element]))
      for (const elementId of animatedElementIds) {
        const path = headPaths.get(elementId)!
        const element = elements.get(elementId)
        const previous = headPathLastValues.get(elementId) ?? 0
        const current = element ? element.x / Math.max(1, element.width) * (element.flipX ? -1 : 1) : previous
        path[frame] = current
        headPathLastValues.set(elementId, current)
      }
    }
    headPathFrame = targetFrame
  }
  const headXAtFrame = (elementId: string, frame: number) => {
    ensureHeadPaths(frame)
    return headPaths.get(elementId)?.[frame] ?? 0
  }
  const motionSettings = (side: EditorV6HairMotionLayer['side']): HairMotionSettings => ({
    ...hairAnimation!.preset.physics,
    enabled: hairAnimation!.preset.enabled[side]
  })
  const warpHairTexture = (textureId: string, image: HTMLImageElement, state: HairMotionState, settings: HairMotionSettings, intensity: number, phase: number): HTMLCanvasElement => {
    const sourceScale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight), Math.sqrt(4_000_000 / (image.naturalWidth * image.naturalHeight)))
    const imageWidth = Math.max(1, Math.round(image.naturalWidth * sourceScale))
    const imageHeight = Math.max(1, Math.round(image.naturalHeight * sourceScale))
    let canvas = hairWarpCanvases.get(textureId)
    if (!canvas) { canvas = document.createElement('canvas'); hairWarpCanvases.set(textureId, canvas) }
    const outputWidth = Math.max(1, Math.ceil(imageWidth * 1.8)), outputHeight = Math.max(1, Math.ceil(imageHeight * 1.3))
    if (canvas.width !== outputWidth || canvas.height !== outputHeight) { canvas.width = outputWidth; canvas.height = outputHeight }
    const context = canvas.getContext('2d')
    if (!context) throw Error('Não foi possível deformar o cabelo durante a exportação.')
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    if (!settings.enabled || intensity <= 0 || state.time === 0) {
      context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, imageWidth * 0.4, imageHeight * 0.15, imageWidth, imageHeight)
      return canvas
    }
    // The preview bends a textured GPU mesh. Export uses horizontal raster
    // bands to approximate that smooth bend without reading and rewriting
    // millions of individual pixels on the CPU for every output frame.
    const stripCount = Math.min(96, imageHeight)
    const stripHeight = imageHeight / stripCount
    const destinationY = (sourceY: number) => {
      const v = Math.max(0, Math.min(1, sourceY / Math.max(1, imageHeight - 1)))
      const offset = Math.max(-0.35, Math.min(0.35, hairMotionOffset(state, v, settings.anchor) * intensity / 100))
      return sourceY + imageHeight * 0.15 - Math.min(0.06, Math.abs(offset) * 0.08) * imageHeight
    }
    for (let strip = 0; strip < stripCount; strip += 1) {
      const sourceTop = strip * stripHeight
      const sourceHeight = Math.min(imageHeight - sourceTop, stripHeight)
      const v = Math.max(0, Math.min(1, (sourceTop + sourceHeight * 0.5) / Math.max(1, imageHeight - 1)))
      const offset = Math.max(-0.35, Math.min(0.35, hairMotionOffset(state, v, settings.anchor) * intensity / 100))
      const flutter = Math.sin(v * 5 + state.time * 3 + phase) * settings.gust / 100 * 0.015 * Math.abs(offset) * 4
      const sourceTopPixels = sourceTop / sourceScale
      const sourceHeightPixels = sourceHeight / sourceScale
      const destinationTop = destinationY(sourceTop), destinationBottom = destinationY(sourceTop + sourceHeight)
      context.drawImage(image, 0, sourceTopPixels, image.naturalWidth, sourceHeightPixels,
        imageWidth * (0.4 + offset + flutter), destinationTop, imageWidth, Math.max(0.01, destinationBottom - destinationTop))
    }
    return canvas
  }
  const drawHairPiece = (context: CanvasRenderingContext2D, rig: EditorV6HairMotionRig, piece: EditorV6HairMotionLayer, element: ReturnType<typeof resolveEditorV6SceneAtFrame>['elements'][number], frame: number) => {
    const texture = hairTextures.get(piece.textureId)
    if (!texture) throw Error('A exportação perdeu uma imagem do cabelo preparado.')
    const settings = motionSettings(piece.side)
    const stateKey = `${element.id}:${piece.id}`
    let state = hairMotionStates.get(stateKey)
    if (!state) { state = createHairMotionState(); hairMotionStates.set(stateKey, state) }
    const direction = piece.flipX ? -1 : 1
    advanceHairMotionToFrame(state, settings, frame, sample => headXAtFrame(element.id, sample) * direction, piece.phase)
    const intensity = hairAnimation!.preset.intensity[piece.side]
    const warped = warpHairTexture(piece.textureId, texture, state, settings, intensity, piece.phase)
    context.save()
    context.translate(rig.outputWidth / 2, rig.outputHeight / 2)
    context.scale(rig.shapeScaleX, rig.shapeScaleY)
    context.translate(-rig.artworkWidth / 2, -rig.artworkHeight / 2)
    const headCenterX = rig.targetHead.x + rig.targetHead.width / 2
    const headCenterY = rig.targetHead.y + rig.targetHead.height / 2
    context.translate(headCenterX, headCenterY)
    context.rotate(rig.targetHead.rotation * Math.PI / 180)
    context.translate(piece.x, piece.y)
    context.rotate(piece.rotation * Math.PI / 180)
    context.scale(piece.flipX ? -1 : 1, 1)
    const drawWidth = piece.width * piece.scaleX
    const drawHeight = piece.height * piece.scaleY
    context.drawImage(warped, -drawWidth * 0.4, -drawHeight * 0.15, drawWidth * 1.8, drawHeight * 1.3)
    context.restore()
  }
  const composeHairFrame = (rig: EditorV6HairMotionRig, element: ReturnType<typeof resolveEditorV6SceneAtFrame>['elements'][number], frame: number): string => {
    const canvasKey = `${element.id}:${rig.assetId}`
    let surface = hairFrameCanvases.get(canvasKey)
    if (!surface) {
      const canvas = document.createElement('canvas')
      canvas.width = rig.outputWidth; canvas.height = rig.outputHeight
      const context = canvas.getContext('2d')
      if (!context) throw Error('Não foi possível compor o personagem animado.')
      surface = { canvas, context }
      hairFrameCanvases.set(canvasKey, surface)
    }
    const { canvas, context } = surface
    context.clearRect(0, 0, canvas.width, canvas.height)
    const drawSurface = (id: string | null) => {
      if (!id) return
      const image = hairSurfaces.get(id)
      if (!image) throw Error('A exportação perdeu uma camada do personagem preparado.')
      context.save()
      context.translate(rig.outputWidth / 2, rig.outputHeight / 2)
      context.scale(rig.shapeScaleX, rig.shapeScaleY)
      context.drawImage(image, -rig.artworkWidth / 2, -rig.artworkHeight / 2, rig.artworkWidth, rig.artworkHeight)
      context.restore()
    }
    for (const piece of rig.layers) if (piece.side === 'back') drawHairPiece(context, rig, piece, element, frame)
    drawSurface(rig.baseSurfaceId)
    drawSurface(rig.faceSurfaceId)
    for (const piece of rig.layers) if (piece.side !== 'back') drawHairPiece(context, rig, piece, element, frame)
    drawSurface(rig.overlaySurfaceId)
    const dataUrl = canvas.toDataURL('image/png')
    return dataUrl
  }
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
    const scene = applyMouthLoop(resolveEditorV6SceneAtFrame(project, frame), frame)
    const activeLayer = layeredVideo ? layer ?? 'background' : undefined
    const activeHair = Boolean(hairAnimation && activeLayer !== 'background' && scene.elements.some(element => element.kind === 'character' && !element.motionSprite && element.assetId && (hairRigs.get(`${element.id}:${element.assetId}`)?.layers.length ?? 0) > 0))
    const key = editorV6VisualKey({ ...scene, mediaVideo: undefined, ...(activeHair ? { hairAnimationFrame: frame } : {}) })
    const layerKeys = editorV6LayerVisualKeys({ ...scene, ...(activeHair ? { hairAnimationFrame: frame } : {}) })
    timings.sceneResolutionMs = performance.now() - resolutionStarted
    if (key === previous) return { reused: true, timings }
    if (activeLayer === 'background' && layerKeys.background === previousBackground) return { reused: false, layerReused: true, timings }
    if (activeLayer === 'foreground' && layerKeys.foreground === previousForeground) {
      previous = key
      return { reused: false, layerReused: true, timings }
    }
    const faceCompositionStarted = performance.now()
    const originalElements = new Map(scene.elements.map(element => [element.id, element]))
    const riggedIds = new Set(activeHair ? scene.elements.flatMap(element => element.kind === 'character' && !element.motionSprite && element.assetId && (hairRigs.get(`${element.id}:${element.assetId}`)?.layers.length ?? 0) > 0 ? [element.id] : []) : [])
    const faceCompositionInput = riggedIds.size
      ? { ...scene, mediaVideo: undefined, elements: scene.elements.map(element => riggedIds.has(element.id) ? { ...element, mouthPatch: undefined } : element) }
      : { ...scene, mediaVideo: undefined }
    const composed = activeLayer === 'background'
      ? { scene: { ...scene, mediaVideo: undefined }, assets: project.assets }
      : await composeEditorV6FaceReplacements(faceCompositionInput, project.assets)
    timings.faceCompositionMs = performance.now() - faceCompositionStarted

    const renderAssetsById = new Map(composed.assets.map(asset => [asset.id, asset]))
    for (const asset of composed.assets) assetsById.set(asset.id, asset)
    let renderScene = composed.scene
    const hairCompositionStarted = performance.now()
    if (activeHair) {
      const generatedAssets: typeof project.assets = []
      renderScene = { ...composed.scene, elements: composed.scene.elements.map(element => {
        if (!riggedIds.has(element.id)) return element
        const original = originalElements.get(element.id)
        const rig = original?.assetId ? hairRigs.get(`${element.id}:${original.assetId}`) : undefined
        if (!original || !rig || original.motionSprite) return element
        const assetId = `editor-v6-hair-motion:${element.id}`
        const asset = { id: assetId, category: 'character' as const, name: `${element.text || 'Personagem'} · cabelo animado`, mimeType: 'image/png' as const, dataUrl: composeHairFrame(rig, original, frame), timelineSnapshot: true }
        assetsById.set(assetId, asset); renderAssetsById.set(assetId, asset); generatedAssets.push(asset)
        const geometry = faceRenderGeometry(original as never, { width: rig.outputWidth, height: rig.outputHeight }, null, 1920, 1080, rig.sourceCrop)
        const patch = original.mouthPatch
        const mouthPatch = patch ? {
          ...patch,
          x: (rig.sourceCrop.left + patch.x * rig.sourceCrop.width) / rig.outputWidth,
          y: (rig.sourceCrop.top + patch.y * rig.sourceCrop.height) / rig.outputHeight,
          width: patch.width * rig.sourceCrop.width / rig.outputWidth,
          height: patch.height * rig.sourceCrop.height / rig.outputHeight
        } : undefined
        return { ...element, ...geometry, assetId, mouthPatch }
      }) }
      for (const asset of generatedAssets) images.delete(asset.id)
      timings.hairCompositionMs = performance.now() - hairCompositionStarted
    }
    const renderAssets = [...renderAssetsById.values()]
    const sceneAssetIds = renderScene.elements.flatMap(element => [element.assetId, element.mouthPatch?.assetId])
    const ids = new Set(activeLayer === 'background' ? [renderScene.background.backgroundAssetId] : activeLayer === 'foreground' ? sceneAssetIds : [renderScene.background.backgroundAssetId, ...sceneAssetIds])
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
    flushSync(() => root.render(<SceneSurface scene={renderScene} assets={renderAssets} outputWidth={width} outputHeight={height} renderLayer={activeLayer ?? 'all'} onImageLoad={onSvgImageLoad} />))
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
