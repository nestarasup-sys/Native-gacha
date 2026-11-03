import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { SyntheticEvent } from 'react'
import { SceneSurface } from './SceneSurface'
import { editorV6ClipAtFrame } from '../../../../shared/editorV6TimelineCore'
import { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6TimelineScene'
import { editorV6FaceModeAtFrame } from '../../../../shared/editorV6FaceSchedule'
import { EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES, editorV6MouthLoopScaleAtFrame, editorV6LayerVisualKeys, editorV6VisualKey, type EditorV6ExportMouthLoops, type EditorV6FrameTimings, type EditorV6RenderFrameResult, type EditorV6WorkerBridge } from '../../../../shared/editorV6Export'
import { advanceHairMotionToFrame, createHairMotionState, type HairMotionSettings, type HairMotionState } from '../../../../shared/hairMotionEngine'
import { editorV6HairMotionHeadAnchorX, interpolateEditorV6HairMotionRig, type EditorV6HairMotionRig, type EditorV6HairMotionLayer, type EditorV6HairMotionTransition } from '../../../../shared/editorV6HairMotion'
import { editorV6MotionPlans } from '../../../../shared/editorV6Motion'
import { motionEase } from '../../../../shared/editorV6MotionInterpolation'
import { expandEditorV6HairCrop } from './editorV6HairMotionGeometry'
import { HAIR_MOTION_MESH_HEIGHT, HAIR_MOTION_MESH_WIDTH } from '../../characters/hairMotionMeshGeometry'
import { composeEditorV6FaceReplacements } from './sceneFaceComposition'
import { createExportHairMeshRenderer } from './exportHairMeshRenderer'
import { createEditorV6FrameAssetRegistry } from './exportFrameAssets'

const worker = (window as unknown as { editorV6ExportWorker: EditorV6WorkerBridge }).editorV6ExportWorker
async function initialize() {
  const { project, width, height, layeredVideo, mouthLoops, hairAnimation } = await worker.payload()
  const rootElement = document.getElementById('root')!
  // Keep the render surface at the requested export dimensions. A small strip
  // beside it carries a per-frame compositor token and is cropped before the
  // bitmap reaches FFmpeg.
  rootElement.style.width = `${width}px`
  rootElement.style.height = `${height}px`
  rootElement.style.overflow = 'hidden'
  const paintTokenElement = document.createElement('div')
  paintTokenElement.setAttribute('aria-hidden', 'true')
  Object.assign(paintTokenElement.style, {
    position: 'fixed', left: `${width}px`, top: '0', width: '24px', height: '16px',
    pointerEvents: 'none', zIndex: '2147483647', opacity: '1', contain: 'strict'
  })
  const paintTokenCells = Array.from({ length: 24 }, (_, bit) => {
    const cell = document.createElement('div')
    Object.assign(cell.style, {
      position: 'absolute', left: `${(bit % 6) * 4}px`, top: `${Math.floor(bit / 6) * 4}px`,
      width: '4px', height: '4px', backgroundColor: '#000'
    })
    paintTokenElement.append(cell)
    return cell
  })
  document.body.append(paintTokenElement)
  const setPaintToken = (token: number) => {
    if (!Number.isInteger(token) || token < 1 || token > 0xffffff) throw Error('Identificador de quadro inválido na exportação.')
    for (let bit = 0; bit < paintTokenCells.length; bit++) paintTokenCells[bit].style.backgroundColor = ((token >>> bit) & 1) === 1 ? '#fff' : '#000'
  }
  const root = createRoot(rootElement)
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
  const hairSurfaceDataById = new Map((hairAnimation?.surfaces ?? []).map(surface => [surface.id, surface.dataUrl]))
  const hairTextures = new Map<string, HTMLImageElement>()
  const hairRigs = new Map((hairAnimation?.rigs ?? []).map(rig => [`${rig.elementId}:${rig.assetId}`, rig]))
  const motionBlocks = new Map(project.timeline.tracks.flatMap(track => track.blocks.map(block => [block.id, block] as const)))
  const hairMotionTransitions: Array<{ elementId: string; key: string; startFrame: number; endFrame: number; samples: Array<{ offset: number; progress: number }>; from?: EditorV6HairMotionRig; to?: EditorV6HairMotionRig; atlas?: EditorV6HairMotionTransition }> = []
  const preparedTransitions = new Map((hairAnimation?.motionTransitions ?? []).map(transition => [`${transition.elementId}:${transition.key}`, transition]))
  for (const plan of editorV6MotionPlans(project)) {
    if (motionBlocks.get(plan.blockId)?.incomingMotion?.key !== plan.key) continue
    const from = plan.from.assetId ? hairRigs.get(`${plan.elementId}:${plan.from.assetId}`) : undefined
    const to = plan.to.assetId ? hairRigs.get(`${plan.elementId}:${plan.to.assetId}`) : undefined
    hairMotionTransitions.push({ elementId: plan.elementId, key: plan.key, startFrame: plan.startFrame, endFrame: plan.endFrame, samples: plan.samples, from, to, atlas: preparedTransitions.get(`${plan.elementId}:${plan.key}`) })
  }
  const transitionForFrame = (elementId: string, frame: number) => hairMotionTransitions.find(transition => transition.elementId === elementId
    && transition.atlas && transition.from && transition.to && frame > transition.startFrame && frame < transition.endFrame
    && transition.atlas.frames.some(sample => transition.endFrame + sample.offset === frame))
  const transitionSampleForFrame = (transition: NonNullable<ReturnType<typeof transitionForFrame>>, frame: number) => transition.atlas!.frames.find(sample => transition.endFrame + sample.offset === frame)
  const hairMotionStates = new Map<string, HairMotionState>()
  const hairWarpCanvases = new Map<string, HTMLCanvasElement>()
  const hairMeshRenderer = createExportHairMeshRenderer()
  const hairFrameCanvases = new Map<string, { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }>()
  // A single reusable scratch canvas is enough for every rasterized transition
  // sample. Allocating a native-resolution canvas per frame pressures Chromium's
  // backing-store allocator even when the old canvas is resized to 1×1.
  let motionHairFrameSurface: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null = null
  const animatedElementIds = [...new Set((hairAnimation?.rigs ?? []).filter(rig => rig.layers.length > 0).map(rig => rig.elementId))]
  let headPathCapacity = 0, headPathFrame = -1
  const headPaths = new Map(animatedElementIds.map(id => [id, new Float32Array(0)]))
  const headPathLastValues = new Map(animatedElementIds.map(id => [id, 0]))
  const headAnchorAtFrame = (element: ReturnType<typeof resolveEditorV6SceneAtFrame>['elements'][number], frame: number): number => {
    const elementId = element.id
    if (element.motionSprite) {
      const transition = transitionForFrame(elementId, frame)
      if (transition?.from && transition.to) {
        const sample = transition.samples.find(candidate => transition.endFrame + candidate.offset === frame)
        const hairlessFrame = transitionSampleForFrame(transition, frame)
        if (sample && hairlessFrame) {
          const hairlessElement = { ...element, x: hairlessFrame.x, y: hairlessFrame.y, width: hairlessFrame.width, height: hairlessFrame.height, rotation: hairlessFrame.rotation, flipX: hairlessFrame.flipX }
          const rig = interpolateEditorV6HairMotionRig(transition.from, transition.to, motionEase(sample.progress))
          return editorV6HairMotionHeadAnchorX(hairlessElement, { ...rig, sourceCrop: hairlessFrame.crop })
        }
      }
    }
    const rig = element.assetId ? hairRigs.get(`${element.id}:${element.assetId}`) : undefined
    if (rig) return editorV6HairMotionHeadAnchorX(element, rig)
    return (50 + element.x) / 100
  }
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
        const current = element ? headAnchorAtFrame(element, frame) : previous
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
    const imageWidth = image.naturalWidth
    const imageHeight = image.naturalHeight
    let canvas = hairWarpCanvases.get(textureId)
    if (!canvas) { canvas = document.createElement('canvas'); hairWarpCanvases.set(textureId, canvas) }
    const outputWidth = Math.max(1, Math.ceil(imageWidth * HAIR_MOTION_MESH_WIDTH)), outputHeight = Math.max(1, Math.ceil(imageHeight * HAIR_MOTION_MESH_HEIGHT))
    if (canvas.width !== outputWidth || canvas.height !== outputHeight) { canvas.width = outputWidth; canvas.height = outputHeight }
    const context = canvas.getContext('2d')
    if (!context) throw Error('Não foi possível deformar o cabelo durante a exportação.')
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    if (!settings.enabled || intensity <= 0 || state.time === 0) {
      context.drawImage(image, 0, 0, imageWidth, imageHeight, imageWidth * .4, imageHeight * .15, imageWidth, imageHeight)
      return canvas
    }
    const mesh = hairMeshRenderer.render(image, state, settings, intensity, phase)
    context.drawImage(mesh, 0, 0, outputWidth, outputHeight)
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
    // The padded warp canvas holds the original image at (0.4w, 0.15h).
    // Center that original image on the same anchor used by the character renderer.
    context.drawImage(warped, -drawWidth * 0.9, -drawHeight * 0.65, drawWidth * 1.8, drawHeight * 1.3)
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
  const composeMotionHairFrame = (
    rig: EditorV6HairMotionRig,
    element: ReturnType<typeof resolveEditorV6SceneAtFrame>['elements'][number],
    frame: number,
    transition: NonNullable<ReturnType<typeof transitionForFrame>>,
    sample: NonNullable<ReturnType<typeof transitionSampleForFrame>>
  ): string => {
    if (!motionHairFrameSurface) {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) throw Error('Não foi possível compor o cabelo durante a troca de pose.')
      motionHairFrameSurface = { canvas, context }
    }
    const { canvas, context } = motionHairFrameSurface
    if (canvas.width !== rig.outputWidth || canvas.height !== rig.outputHeight) {
      canvas.width = rig.outputWidth; canvas.height = rig.outputHeight
    }
    context.clearRect(0, 0, canvas.width, canvas.height)
    const drawAtlasSurface = (surfaceId: string | null) => {
      if (!surfaceId) return
      const image = hairSurfaces.get(surfaceId)
      if (!image) throw Error('A exportação perdeu uma camada sem cabelo da troca de pose.')
      context.drawImage(image, sample.sprite.x, sample.sprite.y, sample.sprite.width, sample.sprite.height, sample.crop.left, sample.crop.top, sample.crop.width, sample.crop.height)
    }
    for (const piece of rig.layers) if (piece.side === 'back') drawHairPiece(context, rig, piece, element, frame)
    drawAtlasSurface(transition.atlas!.behindFaceSurfaceId)
    drawAtlasSurface(transition.atlas!.faceSurfaceId)
    for (const piece of rig.layers) if (piece.side !== 'back') drawHairPiece(context, rig, piece, element, frame)
    drawAtlasSurface(transition.atlas!.overlaySurfaceId)
    return canvas.toDataURL('image/png')
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
  ;(window as unknown as { renderEditorV6ExportFrame: (frame: number, layer: 'background' | 'foreground' | undefined, paintToken: number) => Promise<EditorV6RenderFrameResult> }).renderEditorV6ExportFrame = async (frame, layer, paintToken) => {
    const timings: EditorV6FrameTimings = {}
    const resolutionStarted = performance.now()
    const scene = applyMouthLoop(resolveEditorV6SceneAtFrame(project, frame), frame)
    const activeLayer = layeredVideo ? layer ?? 'background' : undefined
    const hasAnimatedHair = (element: ReturnType<typeof resolveEditorV6SceneAtFrame>['elements'][number]) => element.kind === 'character' && Boolean(
      element.motionSprite
        ? transitionForFrame(element.id, frame)?.from?.layers.length
        : element.assetId && (hairRigs.get(`${element.id}:${element.assetId}`)?.layers.length ?? 0) > 0
    )
    const activeHair = Boolean(hairAnimation && activeLayer !== 'background' && scene.elements.some(hasAnimatedHair))
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
    const riggedIds = new Set(activeHair ? scene.elements.flatMap(element => hasAnimatedHair(element) ? [element.id] : []) : [])
    const faceCompositionInput = riggedIds.size
      ? { ...scene, mediaVideo: undefined, elements: scene.elements.map(element => riggedIds.has(element.id) ? { ...element, mouthPatch: undefined } : element) }
      : { ...scene, mediaVideo: undefined }
    const composed = activeLayer === 'background'
      ? { scene: { ...scene, mediaVideo: undefined }, assets: project.assets }
      : await composeEditorV6FaceReplacements(faceCompositionInput, project.assets)
    timings.faceCompositionMs = performance.now() - faceCompositionStarted

    // Face composites are temporary and often change at every speaking frame.
    // Keep them in this frame's registry only: the shared cache in
    // sceneFaceComposition already has an explicit memory budget.
    // Inserting them into assetsById would retain every evicted PNG for the
    // entire export, causing renderer memory to grow with video duration.
    const { current: renderAssetsById, resolve: resolveFrameAsset } = createEditorV6FrameAssetRegistry(assetsById, composed.assets)
    let renderScene = composed.scene
    const hairCompositionStarted = performance.now()
    if (activeHair) {
      const generatedAssets: typeof project.assets = []
      renderScene = { ...composed.scene, elements: composed.scene.elements.map(element => {
        if (!riggedIds.has(element.id)) return element
        const original = originalElements.get(element.id)
        if (!original) return element
        if (original.motionSprite) {
          const transition = transitionForFrame(original.id, frame)
          const transitionFrame = transition ? transitionSampleForFrame(transition, frame) : undefined
          const poseSample = transition?.samples.find(sample => transition.endFrame + sample.offset === frame)
          if (!transition?.from || !transition.to || !transitionFrame || !poseSample || !transition.atlas) return element
          const rig = interpolateEditorV6HairMotionRig(transition.from, transition.to, motionEase(poseSample.progress))
          const assetId = `editor-v6-hair-motion:${element.id}`
          const asset = { id: assetId, category: 'character' as const, name: `${element.text || 'Personagem'} · cabelo animado`, mimeType: 'image/png' as const, dataUrl: composeMotionHairFrame(rig, original, frame, transition, transitionFrame), timelineSnapshot: true }
          renderAssetsById.set(assetId, asset); generatedAssets.push(asset)
          let mouthPatch: typeof element.mouthPatch = undefined
          if (transitionFrame.facePatch && transition.atlas.faceAtlasSurfaceId) {
            const faceSurfaceId = transition.atlas.faceAtlasSurfaceId
            let faceAsset = assetsById.get(faceSurfaceId)
            if (!faceAsset) {
              const dataUrl = hairSurfaceDataById.get(faceSurfaceId)
              if (!dataUrl) throw Error('A exportação perdeu as expressões faciais da troca de pose.')
              faceAsset = { id: faceSurfaceId, category: 'character', name: `${element.text || 'Personagem'} · rosto da transição`, mimeType: 'image/png', dataUrl, timelineSnapshot: true }
              assetsById.set(faceSurfaceId, faceAsset); generatedAssets.push(faceAsset)
            }
            // assetsById is a cross-frame cache, but renderAssetsById is rebuilt
            // for every frame from the base composition. Re-register the cached
            // face atlas so the patch remains available after the first sample.
            renderAssetsById.set(faceSurfaceId, faceAsset)
            mouthPatch = { assetId: faceSurfaceId, ...transitionFrame.facePatch }
          }
          // Transition geometry describes the cropped body atlas. Expand it to
          // the complete artwork so hair outside that crop is not clipped.
          const crop = transitionFrame.crop
          const geometry = expandEditorV6HairCrop({ ...element, ...transitionFrame }, { width: rig.outputWidth, height: rig.outputHeight }, crop)
          if (mouthPatch) mouthPatch = { ...mouthPatch, x: (crop.left + mouthPatch.x * crop.width) / rig.outputWidth, y: (crop.top + mouthPatch.y * crop.height) / rig.outputHeight, width: mouthPatch.width * crop.width / rig.outputWidth, height: mouthPatch.height * crop.height / rig.outputHeight }
          return { ...element, assetId, motionSprite: undefined, ...geometry, rotation: transitionFrame.rotation, flipX: transitionFrame.flipX, mouthPatch }
        }
        const rig = original.assetId ? hairRigs.get(`${element.id}:${original.assetId}`) : undefined
        if (!rig) return element
        const assetId = `editor-v6-hair-motion:${element.id}`
        const asset = { id: assetId, category: 'character' as const, name: `${element.text || 'Personagem'} · cabelo animado`, mimeType: 'image/png' as const, dataUrl: composeHairFrame(rig, original, frame), timelineSnapshot: true }
        renderAssetsById.set(assetId, asset); generatedAssets.push(asset)
        const geometry = expandEditorV6HairCrop(original, { width: rig.outputWidth, height: rig.outputHeight }, rig.sourceCrop)
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
      const asset = id ? resolveFrameAsset(id) : undefined
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
    setPaintToken(paintToken)
    const rafStarted = performance.now()
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    timings.rafWaitMs = performance.now() - rafStarted
    if (activeLayer === 'background') previousBackground = layerKeys.background
    else if (activeLayer === 'foreground') { previousForeground = layerKeys.foreground; previous = key }
    else { previousBackground = layerKeys.background; previousForeground = layerKeys.foreground; previous = key }
    return { reused: false, timings }
  }
  window.addEventListener('pagehide', () => {
    hairMeshRenderer.dispose()
    for (const canvas of hairWarpCanvases.values()) canvas.width = canvas.height = 1
    for (const { canvas } of hairFrameCanvases.values()) canvas.width = canvas.height = 1
    if (motionHairFrameSurface) motionHairFrameSurface.canvas.width = motionHairFrameSurface.canvas.height = 1
    hairWarpCanvases.clear()
    hairFrameCanvases.clear()
    motionHairFrameSurface = null
  }, { once: true })
  await worker.ready()
}
void initialize().catch((error: unknown) => worker.ready(error instanceof Error ? error.message : String(error)))
