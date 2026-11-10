import { editorV6ClipAtFrame } from '../../../../shared/editorV6TimelineCore'
import { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6TimelineScene'
import { editorV6FaceModeAtFrame } from '../../../../shared/editorV6FaceSchedule'
import { EDITOR_V6_MOUTH_LOOP_SAMPLE_SCALES, editorV6MouthLoopScaleAtFrame, editorV6LayerVisualKeys, editorV6VisualKey, type EditorV6ExportMouthLoops, type EditorV6FrameMetrics, type EditorV6FrameTimings, type EditorV6RenderFrameResult, type EditorV6WorkerBridge } from '../../../../shared/editorV6Export'
import { advanceHairMotionToFrame, applyHairMotionLoopHeadImpulse, buildHairMotionLoop, createHairMotionState, hairMotionLatestPoseEnd, hairMotionNeedsWarp, hairMotionLoopOffsets, hairMotionPoseReactionEndFrames, hairMotionPoseReactionIsActive, prewarmHairMotionState, sampleHairMotionPoseReaction, type HairMotionLoop, type HairMotionSettings, type HairMotionState } from '../../../../shared/hairMotionEngine'
import { editorV6HairMotionHeadPathDelta, editorV6HairMotionHeadPathPoint, editorV6HairMotionInstancePhase, editorV6HairMotionLayerHeadPosition, interpolateEditorV6HairMotionHeadPathPoint, interpolateEditorV6HairMotionRig, type EditorV6HairMotionHeadPathPoint, type EditorV6HairMotionRig, type EditorV6HairMotionLayer, type EditorV6HairMotionTransition } from '../../../../shared/editorV6HairMotion'
import { editorV6MotionChangesHairGeometry, editorV6MotionHasCompleteFaceAtlas } from '../../../../shared/editorV6Motion'
import { motionEase } from '../../../../shared/editorV6MotionInterpolation'
import { expandEditorV6HairCrop } from './editorV6HairMotionGeometry'
import { HAIR_MOTION_MESH_HEIGHT, HAIR_MOTION_MESH_WIDTH } from '../../characters/hairMotionMeshGeometry'
import { composeEditorV6FaceReplacements } from './sceneFaceComposition'
import { createExportHairMeshRenderer } from './exportHairMeshRenderer'
import { createExportHairTransitionFrameIndex } from './exportHairTransitionIndex'
import { createEditorV6FrameAssetRegistry, selectEditorV6RenderableAssets } from './exportFrameAssets'
import { compileEditorV6ScenePlan } from '../../../../shared/editorV6ScenePlan'
import { createReactSvgFrameSurface } from './adapters/reactSvgFrameSurface'

const worker = (window as unknown as { editorV6ExportWorker: EditorV6WorkerBridge }).editorV6ExportWorker
async function initialize() {
  const { project, width, height, layeredVideo, mouthLoops, hairAnimation } = await worker.payload()
  const renderPlan = compileEditorV6ScenePlan(project, { width, height })
  const rootElement = document.getElementById('root')!
  const frameSurface = new URLSearchParams(window.location.search).get('sceneSurface') === 'canvas2d'
    ? (await import('./adapters/canvas2dWithSvgFallbackFrameSurface')).createCanvas2dWithSvgFallbackFrameSurface(rootElement, width, height)
    : createReactSvgFrameSurface(rootElement, width, height)
  const images = new Map<string, Promise<void>>()
  // The document catalog is immutable during this worker's lifetime. Keep its
  // composition index separate from the small durable atlas cache.
  const projectAssetIndex = new Map(renderPlan.assetIds.flatMap(id => {
    const asset = renderPlan.resolveAsset(id)
    return asset ? [[id, asset] as const] : []
  }))
  const assetsById = new Map(projectAssetIndex)
  const hairSurfaces = new Map<string, HTMLImageElement>()
  const hairSurfaceDataById = new Map((hairAnimation?.surfaces ?? []).map(surface => [surface.id, surface.dataUrl]))
  const hairTextures = new Map<string, HTMLImageElement>()
  const hairRigs = new Map((hairAnimation?.rigs ?? []).map(rig => [`${rig.elementId}:${rig.assetId}`, rig]))
  const hairPoseRigs = new Map<string, EditorV6HairMotionRig>()
  for (const rig of hairAnimation?.rigs ?? []) {
    const key = `${rig.elementId}:${rig.poseSlot ?? 'base'}`
    if (!hairPoseRigs.has(key)) hairPoseRigs.set(key, rig)
  }
  const hairRigForElement = (element: { id: string; assetId?: string; poseSlot?: number | null }) => {
    const direct = element.assetId ? hairRigs.get(`${element.id}:${element.assetId}`) : undefined
    const poseSlot = element.poseSlot ?? direct?.poseSlot
    return hairPoseRigs.get(`${element.id}:${poseSlot ?? 'base'}`) ?? direct
  }
  const motionBlocks = new Map(project.timeline.tracks.flatMap(track => track.blocks.map(block => [block.id, block] as const)))
  const motionPlans = [...renderPlan.motionPlans]
  const hairMotionTransitions: Array<{ elementId: string; key: string; startFrame: number; endFrame: number; samples: Array<{ offset: number; progress: number }>; from?: EditorV6HairMotionRig; to?: EditorV6HairMotionRig; physicsFrom?: EditorV6HairMotionRig; physicsTo?: EditorV6HairMotionRig; fromElement: typeof project.elements[number]; toElement: typeof project.elements[number]; atlas?: EditorV6HairMotionTransition }> = []
  const preparedTransitions = new Map((hairAnimation?.motionTransitions ?? []).map(transition => [`${transition.elementId}:${transition.key}`, transition]))
  const expressionOnlyPlansByElement = new Map<string, typeof motionPlans>()
  for (const plan of motionPlans) {
    // One-shot pose reaction keeps the canonical full-character motion atlas.
    // It needs only the end-of-pose events, not interpolated hairless layers.
    if (hairAnimation?.poseReactionOnly || motionBlocks.get(plan.blockId)?.incomingMotion?.key !== plan.key) continue
    // Face-only plans still animate through their normal motionSprite and face
    // atlas. Do not let that facial atlas replace an in-flight hair pose atlas.
    if (!editorV6MotionChangesHairGeometry(plan)) {
      if (editorV6MotionHasCompleteFaceAtlas(plan, motionBlocks.get(plan.blockId)?.incomingMotion)) {
        const entries = expressionOnlyPlansByElement.get(plan.elementId) ?? []
        entries.push(plan)
        expressionOnlyPlansByElement.set(plan.elementId, entries)
      }
      continue
    }
    const from = plan.from.assetId ? hairRigs.get(`${plan.elementId}:${plan.from.assetId}`) : undefined
    const to = plan.to.assetId ? hairRigs.get(`${plan.elementId}:${plan.to.assetId}`) : undefined
    hairMotionTransitions.push({ elementId: plan.elementId, key: plan.key, startFrame: plan.startFrame, endFrame: plan.endFrame, samples: plan.samples.map(sample => ({ offset: sample.offset, progress: sample.progress })), from, to, physicsFrom: hairRigForElement(plan.from), physicsTo: hairRigForElement(plan.to), fromElement: plan.from, toElement: plan.to, atlas: preparedTransitions.get(`${plan.elementId}:${plan.key}`) })
  }
  // The worker owns one immutable export document. Pre-index only prepared interior
  // frames, keeping the first eligible transition when authored ranges overlap.
  const hairTransitionIndex = createExportHairTransitionFrameIndex(hairMotionTransitions)
  // Pose events must not depend on an incomingMotion atlas being prepared
  // before the UI sent the export. The main MP4 runner prepares any missing
  // canonical atlases later; these timeline plans are the source of truth.
  const hairPoseReactionEnds = hairAnimation?.poseReactionOnly
    ? hairMotionPoseReactionEndFrames(motionPlans.map(plan => ({ elementId: plan.elementId, endFrame: plan.endFrame, fromElement: plan.from, toElement: plan.to })))
    : new Map<string, number[]>()
  const transitionForFrame = (elementId: string, frame: number) => hairTransitionIndex.get(elementId, frame)?.transition
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
  const hairFrameCanvases = new Map<string, { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }>()
  // One live surface per transitioning actor lets the SVG embed the canvas
  // directly. These surfaces are reused across frames instead of PNG round trips.
  const motionHairFrameSurfaces = new Map<string, { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }>()
  const animatedElementIds = [...new Set((hairAnimation?.rigs ?? []).filter(rig => rig.layers.length > 0).map(rig => rig.elementId))]
  let headPathCapacity = 0, headPathFrame = -1
  const headPaths = new Map(animatedElementIds.map(id => [id, new Float32Array(0)]))
  const headPathPrevious = new Map<string, EditorV6HairMotionHeadPathPoint>()
  const headLayerFlipChanges = new Map<string, Array<{ frame: number; flipX: boolean }>>()
  type ResolvedHairRig = { rig: EditorV6HairMotionRig; crop?: EditorV6HairMotionRig['sourceCrop']; element: ReturnType<typeof resolveEditorV6SceneAtFrame>['elements'][number] }
  const hairRigAtFrame = (element: ReturnType<typeof resolveEditorV6SceneAtFrame>['elements'][number], frame: number): ResolvedHairRig | undefined => {
    const elementId = element.id
    if (element.motionSprite) {
      const indexed = hairTransitionIndex.get(elementId, frame)
      const transition = indexed?.transition
      if (transition?.from && transition.to) {
        const sample = indexed?.poseSample
        const hairlessFrame = indexed?.atlasFrame
        if (sample && hairlessFrame) {
          return {
            rig: interpolateEditorV6HairMotionRig(transition.from, transition.to, motionEase(sample.progress)),
            crop: hairlessFrame.crop,
            element: { ...element, x: hairlessFrame.x, y: hairlessFrame.y, width: hairlessFrame.width, height: hairlessFrame.height, rotation: hairlessFrame.rotation, flipX: hairlessFrame.flipX }
          }
        }
      }
      const expressionPlan = expressionOnlyPlansByElement.get(elementId)?.find(plan => frame > plan.startFrame && frame < plan.endFrame)
      if (expressionPlan) {
        const rig = (expressionPlan.from.assetId ? hairRigs.get(`${elementId}:${expressionPlan.from.assetId}`) : undefined)
          ?? hairPoseRigs.get(`${elementId}:${expressionPlan.from.poseSlot ?? 'base'}`)
        if (rig) return { rig, element: expressionPlan.from }
      }
    }
    const rig = element.assetId ? hairRigs.get(`${element.id}:${element.assetId}`) : undefined
    return rig ? { rig, element } : undefined
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
      // Reuse the raw scene already resolved for this exported frame; mouth
      // overlays must not change the physical rig used by head-path inertia.
      const resolved = frame === resolvedFrame && resolvedRawScene
        ? resolvedRawScene : resolveEditorV6SceneAtFrame(project, frame)
      const elements = new Map(resolved.elements.filter(element => element.kind === 'character').map(element => [element.id, element]))
      for (const elementId of animatedElementIds) {
        const path = headPaths.get(elementId)!
        const element = elements.get(elementId)
        if (!element) {
          path[frame] = frame > 0 ? path[frame - 1] : 0
          continue
        }
        const previous = headPathPrevious.get(elementId)
        const indexed = hairTransitionIndex.get(elementId, frame)
        const transition = indexed?.transition
        const transitionSample = indexed?.poseSample
        const resolvedRig = hairRigAtFrame(element, frame)
        const pathPoint = transition && transitionSample && transition.physicsFrom && transition.physicsTo
          ? interpolateEditorV6HairMotionHeadPathPoint(transition.fromElement, transition.toElement, transition.physicsFrom, transition.physicsTo, motionEase(transitionSample.progress))
          : (() => {
              return resolvedRig
                ? editorV6HairMotionHeadPathPoint(resolvedRig.element, resolvedRig.rig)
                : { centerX: (50 + element.x) / 100, centerY: (50 + element.y) / 100, localX: 0, rotation: element.rotation, flipX: Boolean(element.flipX) }
            })()
        if (!previous || frame === 0) {
          path[frame] = 0
        } else {
          // Physics follows authored actor transforms and pose head geometry.
          // Transition atlas crops remain visual-only and cannot inject false
          // head velocity when a face expression changes its raster bounds.
          path[frame] = path[frame - 1] + editorV6HairMotionHeadPathDelta(previous, pathPoint)
        }
        headPathPrevious.set(elementId, pathPoint)
        for (const layer of resolvedRig?.rig.layers ?? []) {
          const key = `${elementId}:${layer.id}`
          const changes = headLayerFlipChanges.get(key) ?? []
          if (changes.length === 0 || changes[changes.length - 1].flipX !== layer.flipX) changes.push({ frame, flipX: layer.flipX })
          if (changes.length) headLayerFlipChanges.set(key, changes)
        }
      }
    }
    headPathFrame = targetFrame
  }
  const headXAtFrame = (elementId: string, frame: number) => {
    ensureHeadPaths(frame)
    return headPaths.get(elementId)?.[frame] ?? 0
  }
  const pieceFlipXAtFrame = (elementId: string, pieceId: string, frame: number, fallback: boolean) => {
    const changes = headLayerFlipChanges.get(`${elementId}:${pieceId}`)
    if (!changes?.length) return fallback
    if (frame < changes[0].frame) return fallback
    let low = 0, high = changes.length - 1
    while (low < high) {
      const middle = Math.ceil((low + high) / 2)
      if (changes[middle].frame <= frame) low = middle
      else high = middle - 1
    }
    return changes[low].flipX
  }
  const motionSettings = (side: EditorV6HairMotionLayer['side']): HairMotionSettings => ({
    ...hairAnimation!.preset.physics,
    enabled: hairAnimation!.preset.enabled[side]
  })
  const warpHairTexture = (textureId: string, image: HTMLImageElement, state: HairMotionState, settings: HairMotionSettings, intensity: number, phase: number, timings: EditorV6FrameTimings): HTMLCanvasElement => {
    const clearCanvas = (context: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
      const started = performance.now()
      context.clearRect(0, 0, canvas.width, canvas.height)
      timings.hairCanvasClearMs = (timings.hairCanvasClearMs ?? 0) + performance.now() - started
    }
    const imageWidth = image.naturalWidth
    const imageHeight = image.naturalHeight
    const outputWidth = Math.max(1, Math.ceil(imageWidth * HAIR_MOTION_MESH_WIDTH)), outputHeight = Math.max(1, Math.ceil(imageHeight * HAIR_MOTION_MESH_HEIGHT))
    if (!hairMotionNeedsWarp(state, settings, intensity)) {
      const ready = staticHairWarpCanvases.get(textureId)
      if (ready) return ready
      // Exactly the same Canvas2D draw as the historical static branch.
      // Static and dynamic surfaces are separate, so drawing another frame
      // never mutates the pixels already handed to the scene compositor.
      const canvas = document.createElement('canvas')
      canvas.width = outputWidth; canvas.height = outputHeight
      const context = canvas.getContext('2d')
      if (!context) throw Error('Não foi possível preparar o cabelo estático para a exportação.')
      clearCanvas(context, canvas)
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, imageWidth, imageHeight, imageWidth * .4, imageHeight * .15, imageWidth, imageHeight)
      staticHairWarpCanvases.set(textureId, canvas)
      return canvas
    }
    let canvas = hairWarpCanvases.get(textureId)
    if (!canvas) { canvas = document.createElement('canvas'); hairWarpCanvases.set(textureId, canvas) }
    if (canvas.width !== outputWidth || canvas.height !== outputHeight) { canvas.width = outputWidth; canvas.height = outputHeight }
    const context = canvas.getContext('2d')
    if (!context) throw Error('Não foi possível deformar o cabelo durante a exportação.')
    clearCanvas(context, canvas)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    const previousMeshTimings = hairMeshRenderer.getTimings()
    const mesh = hairMeshRenderer.render(image, state, settings, intensity, phase)
    const nextMeshTimings = hairMeshRenderer.getTimings()
    timings.hairMeshPositionMs = (timings.hairMeshPositionMs ?? 0) + nextMeshTimings.positionMs - previousMeshTimings.positionMs
    timings.hairMeshUploadMs = (timings.hairMeshUploadMs ?? 0) + nextMeshTimings.uploadMs - previousMeshTimings.uploadMs
    timings.hairMeshTextureUploadMs = (timings.hairMeshTextureUploadMs ?? 0) + nextMeshTimings.textureUploadMs - previousMeshTimings.textureUploadMs
    timings.hairMeshDrawMs = (timings.hairMeshDrawMs ?? 0) + nextMeshTimings.drawMs - previousMeshTimings.drawMs
    timings.hairMeshContextCheckMs = (timings.hairMeshContextCheckMs ?? 0) + nextMeshTimings.contextCheckMs - previousMeshTimings.contextCheckMs
    timings.hairMeshStateSetupMs = (timings.hairMeshStateSetupMs ?? 0) + nextMeshTimings.stateSetupMs - previousMeshTimings.stateSetupMs
    const blitStarted = performance.now()
    // WebGL's viewport is anchored at the drawing buffer's bottom-left.
    // Crop that viewport from a grow-only canvas to keep the previous exact
    // per-texture raster dimensions and avoid rescaling the mesh.
    context.drawImage(mesh, 0, mesh.height - outputHeight, outputWidth, outputHeight, 0, 0, outputWidth, outputHeight)
    timings.hairCanvasBlitMs = (timings.hairCanvasBlitMs ?? 0) + performance.now() - blitStarted
    return canvas
  }
  const drawHairPiece = (context: CanvasRenderingContext2D, rig: EditorV6HairMotionRig, piece: EditorV6HairMotionLayer, element: ReturnType<typeof resolveEditorV6SceneAtFrame>['elements'][number], frame: number, timings: EditorV6FrameTimings) => {
    const motionStateStarted = performance.now()
    const texture = hairTextures.get(piece.textureId)
    if (!texture) throw Error('A exportação perdeu uma imagem do cabelo preparado.')
    const settings = motionSettings(piece.side)
    if (hairAnimation?.posteriorOnly && !piece.id.startsWith('rearHair:')) settings.enabled = false
    const stateKey = `${element.id}:${piece.id}`
    let state = hairMotionStates.get(stateKey)
    if (!state) { state = createHairMotionState(); hairMotionStates.set(stateKey, state) }
    const phase = (hairMotionInstancePhases.get(element.id) ?? editorV6HairMotionInstancePhase(element.id)) + piece.phase
    const headAtFrame = (sample: number) => editorV6HairMotionLayerHeadPosition(headXAtFrame(element.id, sample), pieceFlipXAtFrame(element.id, piece.id, sample, piece.flipX))
    if (hairAnimation?.poseReactionOnly) {
      // Explicit part ID, not a side alias: rearHair is POSTERIOR; backHair is TRASEIRO.
      const transitionEnd = hairMotionLatestPoseEnd(hairPoseReactionEnds.get(element.id) ?? [], frame)
      const moving = piece.id.startsWith('rearHair:')
        ? sampleHairMotionPoseReaction(state.offsets, settings, frame, transitionEnd, phase)
        : (state.offsets.fill(0), false)
      state.time = moving ? 1 : 0 // Exact original pixels when the piece is at rest.
      state.frame = frame
    } else if (hairAnimation?.loopFrames) {
      let loop = hairMotionLoops.get(stateKey)
      if (!loop) {
        const prewarmStarted = performance.now()
        loop = buildHairMotionLoop(settings, phase, hairAnimation.loopFrames)
        hairMotionLoops.set(stateKey, loop)
        timings.hairMotionPrewarmMs = (timings.hairMotionPrewarmMs ?? 0) + performance.now() - prewarmStarted
      }
      state.offsets.set(hairMotionLoopOffsets(loop, frame))
      // Authored head motion stays independent of the periodic breeze.
      const headDelta = frame > 0 ? headAtFrame(frame) - headAtFrame(frame - 1) : 0
      applyHairMotionLoopHeadImpulse(state.offsets, headDelta, settings)
      state.time = 1 // Keep mesh warping active; offsets are sampled by absolute frame.
      state.frame = frame
    } else {
      if (state.frame < 0 || frame < state.frame) {
        const prewarmStarted = performance.now()
        prewarmHairMotionState(state, settings, headAtFrame(0), phase)
        timings.hairMotionPrewarmMs = (timings.hairMotionPrewarmMs ?? 0) + performance.now() - prewarmStarted
      }
      advanceHairMotionToFrame(state, settings, frame, headAtFrame, phase)
    }
    timings.hairMotionStateMs = (timings.hairMotionStateMs ?? 0) + performance.now() - motionStateStarted
    const intensity = hairAnimation!.preset.intensity[piece.side]
    const warped = warpHairTexture(piece.textureId, texture, state, settings, intensity, phase, timings)
    const layerDrawStarted = performance.now()
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
    timings.hairLayerDrawMs = (timings.hairLayerDrawMs ?? 0) + performance.now() - layerDrawStarted
  }
  const composeHairFrame = (rig: EditorV6HairMotionRig, element: ReturnType<typeof resolveEditorV6SceneAtFrame>['elements'][number], frame: number, timings: EditorV6FrameTimings, metrics: EditorV6FrameMetrics): HTMLCanvasElement => {
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
    const clearStarted = performance.now()
    context.clearRect(0, 0, canvas.width, canvas.height)
    timings.hairCanvasClearMs = (timings.hairCanvasClearMs ?? 0) + performance.now() - clearStarted
    const drawSurface = (id: string | null) => {
      if (!id) return
      const image = hairSurfaces.get(id)
      if (!image) throw Error('A exportação perdeu uma camada do personagem preparado.')
      const surfaceStarted = performance.now()
      context.save()
      context.translate(rig.outputWidth / 2, rig.outputHeight / 2)
      context.scale(rig.shapeScaleX, rig.shapeScaleY)
      context.drawImage(image, -rig.artworkWidth / 2, -rig.artworkHeight / 2, rig.artworkWidth, rig.artworkHeight)
      context.restore()
      timings.hairSurfaceComposeMs = (timings.hairSurfaceComposeMs ?? 0) + performance.now() - surfaceStarted
    }
    for (const piece of rig.layers) if (piece.side === 'back') drawHairPiece(context, rig, piece, element, frame, timings)
    drawSurface(rig.baseSurfaceId)
    drawSurface(rig.faceSurfaceId)
    for (const piece of rig.layers) if (piece.id.startsWith('rearHair:')) drawHairPiece(context, rig, piece, element, frame, timings)
    drawSurface(rig.eyesAboveRearHairSurfaceId ?? null)
    for (const piece of rig.layers) if (piece.side !== 'back' && !piece.id.startsWith('rearHair:')) drawHairPiece(context, rig, piece, element, frame, timings)
    drawSurface(rig.overlaySurfaceId)
    metrics.hairRasterFrames = (metrics.hairRasterFrames ?? 0) + 1
    metrics.hairRasterPixels = (metrics.hairRasterPixels ?? 0) + canvas.width * canvas.height
    return canvas
  }
  const composeMotionHairFrame = (
    elementId: string,
    rig: EditorV6HairMotionRig,
    element: ReturnType<typeof resolveEditorV6SceneAtFrame>['elements'][number],
    frame: number,
    transition: NonNullable<ReturnType<typeof transitionForFrame>>,
    sample: EditorV6HairMotionTransition['frames'][number],
    timings: EditorV6FrameTimings,
    metrics: EditorV6FrameMetrics
  ): HTMLCanvasElement => {
    let motionHairFrameSurface = motionHairFrameSurfaces.get(elementId)
    if (!motionHairFrameSurface) {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) throw Error('Não foi possível compor o cabelo durante a troca de pose.')
      motionHairFrameSurface = { canvas, context }
      motionHairFrameSurfaces.set(elementId, motionHairFrameSurface)
    }
    const { canvas, context } = motionHairFrameSurface
    if (canvas.width !== rig.outputWidth || canvas.height !== rig.outputHeight) {
      canvas.width = rig.outputWidth; canvas.height = rig.outputHeight
    }
    const clearStarted = performance.now()
    context.clearRect(0, 0, canvas.width, canvas.height)
    timings.hairCanvasClearMs = (timings.hairCanvasClearMs ?? 0) + performance.now() - clearStarted
    const drawAtlasSurface = (surfaceId: string | null) => {
      if (!surfaceId) return
      const image = hairSurfaces.get(surfaceId)
      if (!image) throw Error('A exportação perdeu uma camada sem cabelo da troca de pose.')
      context.drawImage(image, sample.sprite.x, sample.sprite.y, sample.sprite.width, sample.sprite.height, sample.crop.left, sample.crop.top, sample.crop.width, sample.crop.height)
    }
    for (const piece of rig.layers) if (piece.side === 'back') drawHairPiece(context, rig, piece, element, frame, timings)
    drawAtlasSurface(transition.atlas!.behindFaceSurfaceId)
    drawAtlasSurface(transition.atlas!.faceSurfaceId)
    for (const piece of rig.layers) if (piece.id.startsWith('rearHair:')) drawHairPiece(context, rig, piece, element, frame, timings)
    drawAtlasSurface(transition.atlas!.eyesAboveRearHairSurfaceId ?? null)
    for (const piece of rig.layers) if (piece.side !== 'back' && !piece.id.startsWith('rearHair:')) drawHairPiece(context, rig, piece, element, frame, timings)
    drawAtlasSurface(transition.atlas!.overlaySurfaceId)
    metrics.hairRasterFrames = (metrics.hairRasterFrames ?? 0) + 1
    metrics.hairRasterPixels = (metrics.hairRasterPixels ?? 0) + canvas.width * canvas.height
    return canvas
  }
  const mouthLoopByBlock = new Map<string, EditorV6ExportMouthLoops['states'][number]>()
  const mouthlessSourceAssetById = new Map<string, string>()
  for (const state of mouthLoops?.states ?? []) {
    for (const blockId of state.blockIds) mouthLoopByBlock.set(`${state.elementId}:${blockId}`, state)
    if (state.sourceAssetId) for (const baseAssetId of Object.values(state.baseAssetIds ?? {})) mouthlessSourceAssetById.set(baseAssetId, state.sourceAssetId)
  }
  const hairSourceAssetId = (element: { assetId?: string }) => element.assetId ? mouthlessSourceAssetById.get(element.assetId) ?? element.assetId : undefined
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
      const mouthlessAssetId = state.baseAssetIds?.[faceMode]
      return { ...element, ...(mouthlessAssetId ? { assetId: mouthlessAssetId } : {}), mouthPatch: { assetId: state.assetId, ...motion.facePatch } }
    }) }
  }
  ;(window as unknown as { renderEditorV6ExportFrame: (frame: number, layer: 'background' | 'foreground' | undefined, paintToken: number) => Promise<EditorV6RenderFrameResult> }).renderEditorV6ExportFrame = async (frame, layer, paintToken) => {
    const timings: EditorV6FrameTimings = {}
    const metrics: EditorV6FrameMetrics = {}
    const resolutionStarted = performance.now()
    // Two layered captures of the same frame share one immutable raw timeline
    // resolution. Head-path preparation consumes this same scene where possible.
    if (resolvedFrame !== frame || !resolvedRawScene) {
      resolvedRawScene = renderPlan.evaluateFrame(frame)
      resolvedFrame = frame
    }
    const scene = applyMouthLoop(resolvedRawScene, frame)
    const activeLayer = layeredVideo ? layer ?? 'background' : undefined
    const hasAnimatedHair = (element: ReturnType<typeof resolveEditorV6SceneAtFrame>['elements'][number]) => element.kind === 'character' && Boolean(
      element.motionSprite
        ? !hairAnimation?.poseReactionOnly && Boolean(hairRigAtFrame(element, frame)?.rig.layers.length)
        : hairSourceAssetId(element) && (hairRigs.get(`${element.id}:${hairSourceAssetId(element)}`)?.layers.length ?? 0) > 0
    )
    const activeHair = Boolean(hairAnimation && activeLayer !== 'background' && scene.elements.some(hasAnimatedHair))
    // Keep the exact existing hair composition on the first rest frame.
    // Subsequent identical frames need no new raster or capture. Never swap
    // to the saved static snapshot: its pixels can differ from composed hair.
    const reacting = Boolean(hairAnimation?.poseReactionOnly && activeHair && scene.elements.some(element =>
      hasAnimatedHair(element) && hairMotionPoseReactionIsActive(hairPoseReactionEnds.get(element.id) ?? [], frame)
    ))
    const hairNeedsFrame = activeHair && (!hairAnimation?.poseReactionOnly || reacting)
    const baseKey = editorV6VisualKey({ ...scene, mediaVideo: undefined, ...(hairNeedsFrame ? { hairAnimationFrame: frame } : {}) })
    const baseLayerKeys = editorV6LayerVisualKeys({ ...scene, ...(hairNeedsFrame ? { hairAnimationFrame: frame } : {}) })
    // Original visual keys omit some expression and effect properties.
    // Require the whole resolved scene element identity to match at rest.
    const signature = hairAnimation?.poseReactionOnly ? JSON.stringify(scene.elements) : null
    const key = signature === null ? baseKey : JSON.stringify([baseKey, signature])
    const layerKeys = signature === null ? baseLayerKeys : {
      ...baseLayerKeys, foreground: JSON.stringify([baseLayerKeys.foreground, signature])
    }
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
      ? { scene: { ...scene, mediaVideo: undefined }, assets: [] }
      : await composeEditorV6FaceReplacements(faceCompositionInput, project.assets, { assetIndex: projectAssetIndex, additionsOnly: true })
    timings.faceCompositionMs = performance.now() - faceCompositionStarted

    // Face composites are temporary and often change at every speaking frame.
    // Keep them in this frame's registry only: the shared cache in
    // sceneFaceComposition already has an explicit memory budget.
    // Inserting them into assetsById would retain every evicted PNG for the
    // entire export, causing renderer memory to grow with video duration.
    const { current: renderAssetsById, resolve: resolveFrameAsset } = createEditorV6FrameAssetRegistry(assetsById, composed.assets)
    let renderScene = composed.scene
    const hairCompositionStarted = performance.now()
    const hairDetailKeys = ['hairMotionStateMs', 'hairLayerDrawMs', 'hairSurfaceComposeMs', 'hairCanvasClearMs', 'hairRigInterpolationMs', 'hairMeshContextCheckMs', 'hairMeshStateSetupMs', 'hairMeshPositionMs', 'hairMeshUploadMs', 'hairMeshTextureUploadMs', 'hairMeshDrawMs', 'hairCanvasBlitMs'] as const
    const hairDetailBefore = Object.fromEntries(hairDetailKeys.map(key => [key, timings[key] ?? 0])) as Record<typeof hairDetailKeys[number], number>
    const rasterCanvases = new Map<string, HTMLCanvasElement>()
    if (activeHair) {
      const animatedElements: typeof composed.scene.elements = []
      for (const element of composed.scene.elements) {
        if (!riggedIds.has(element.id)) { animatedElements.push(element); continue }
        const original = originalElements.get(element.id)
        if (!original) { animatedElements.push(element); continue }
        if (original.motionSprite) {
          const indexed = hairTransitionIndex.get(original.id, frame)
          const transition = indexed?.transition
          const transitionFrame = indexed?.atlasFrame
          const poseSample = indexed?.poseSample
          if (!transition?.from || !transition.to || !transitionFrame || !poseSample || !transition.atlas) {
            const expressionPlan = expressionOnlyPlansByElement.get(original.id)?.find(plan => frame > plan.startFrame && frame < plan.endFrame)
            const resolvedHairRig = expressionPlan ? hairRigAtFrame(original, frame) : undefined
            const rig = resolvedHairRig?.rig
            if (!rig) { animatedElements.push(element); continue }
            rasterCanvases.set(element.id, composeHairFrame(rig, resolvedHairRig.element, frame, timings, metrics))
            const geometry = expandEditorV6HairCrop(original, { width: rig.outputWidth, height: rig.outputHeight }, rig.sourceCrop)
            const patch = original.mouthPatch
            const mouthPatch = patch ? {
              ...patch,
              x: (rig.sourceCrop.left + patch.x * rig.sourceCrop.width) / rig.outputWidth,
              y: (rig.sourceCrop.top + patch.y * rig.sourceCrop.height) / rig.outputHeight,
              width: patch.width * rig.sourceCrop.width / rig.outputWidth,
              height: patch.height * rig.sourceCrop.height / rig.outputHeight
            } : undefined
            animatedElements.push({ ...element, assetId: undefined, motionSprite: undefined, ...geometry, mouthPatch })
            continue
          }
          const rigInterpolationStarted = performance.now()
          const rig = interpolateEditorV6HairMotionRig(transition.from, transition.to, motionEase(poseSample.progress))
          timings.hairRigInterpolationMs = (timings.hairRigInterpolationMs ?? 0) + performance.now() - rigInterpolationStarted
          rasterCanvases.set(element.id, composeMotionHairFrame(element.id, rig, original, frame, transition, transitionFrame, timings, metrics))
          let mouthPatch: typeof element.mouthPatch = undefined
          if (transitionFrame.facePatch && transition.atlas.faceAtlasSurfaceId) {
            const faceSurfaceId = transition.atlas.faceAtlasSurfaceId
            let faceAsset = assetsById.get(faceSurfaceId)
            if (!faceAsset) {
              const dataUrl = hairSurfaceDataById.get(faceSurfaceId)
              if (!dataUrl) throw Error('A exportação perdeu as expressões faciais da troca de pose.')
              faceAsset = { id: faceSurfaceId, category: 'character', name: `${element.text || 'Personagem'} · rosto da transição`, mimeType: 'image/png', dataUrl, timelineSnapshot: true }
              assetsById.set(faceSurfaceId, faceAsset)
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
          const geometryStarted = performance.now()
          const geometry = expandEditorV6HairCrop({ ...element, ...transitionFrame }, { width: rig.outputWidth, height: rig.outputHeight }, crop)
          if (mouthPatch) mouthPatch = { ...mouthPatch, x: (crop.left + mouthPatch.x * crop.width) / rig.outputWidth, y: (crop.top + mouthPatch.y * crop.height) / rig.outputHeight, width: mouthPatch.width * crop.width / rig.outputWidth, height: mouthPatch.height * crop.height / rig.outputHeight }
          timings.hairRigInterpolationMs = (timings.hairRigInterpolationMs ?? 0) + performance.now() - geometryStarted
          animatedElements.push({ ...element, assetId: undefined, motionSprite: undefined, ...geometry, rotation: transitionFrame.rotation, flipX: transitionFrame.flipX, mouthPatch })
          continue
        }
        const sourceAssetId = hairSourceAssetId(original)
        const rig = sourceAssetId ? hairRigs.get(`${element.id}:${sourceAssetId}`) : undefined
        if (!rig) { animatedElements.push(element); continue }
        rasterCanvases.set(element.id, composeHairFrame(rig, original, frame, timings, metrics))
        const geometry = expandEditorV6HairCrop(original, { width: rig.outputWidth, height: rig.outputHeight }, rig.sourceCrop)
        const patch = original.mouthPatch
        const mouthPatch = patch ? {
          ...patch,
          x: (rig.sourceCrop.left + patch.x * rig.sourceCrop.width) / rig.outputWidth,
          y: (rig.sourceCrop.top + patch.y * rig.sourceCrop.height) / rig.outputHeight,
          width: patch.width * rig.sourceCrop.width / rig.outputWidth,
          height: patch.height * rig.sourceCrop.height / rig.outputHeight
        } : undefined
        animatedElements.push({ ...element, ...geometry, assetId: undefined, mouthPatch })
      }
      renderScene = { ...composed.scene, elements: animatedElements }
      timings.hairCompositionMs = performance.now() - hairCompositionStarted
      const instrumented = hairDetailKeys.reduce((total, key) => total + (timings[key] ?? 0) - hairDetailBefore[key], 0)
      timings.hairCompositionOtherMs = Math.max(0, timings.hairCompositionMs - instrumented)
    }
    // SceneSurface and the image preloader only need the assets actually
    // referenced by this layer/frame. Previously the whole project catalog was
    // rebuilt and passed to React on every animated-hair frame.
    const renderAssets = selectEditorV6RenderableAssets(renderScene, activeLayer ?? 'all', resolveFrameAsset)
    const assetPreparationStarted = performance.now()
    for (const asset of renderAssets) {
      let prepared = images.get(asset.id)
      if (!prepared) {
        prepared = new Promise<void>((resolve, reject) => {
          const image = new Image()
          image.onerror = () => reject(Error(`Não foi possível preparar ${asset.name}.`))
          image.onload = () => {
            void image.decode().then(() => {
              resolve()
            }, () => reject(Error(`Não foi possível decodificar ${asset.name}.`)))
          }
          image.src = asset.dataUrl
        })
        if (images.size >= 32) images.delete(images.keys().next().value!)
        images.set(asset.id, prepared)
      }
      await prepared
    }
    timings.assetPreparationMs = performance.now() - assetPreparationStarted
    const surfaceTimings = await frameSurface.present({ scene: renderScene, assets: renderAssets, width, height, renderLayer: activeLayer ?? 'all', rasterCanvases, paintToken })
    timings.surfaceRenderMs = surfaceTimings.renderMs
    timings.assetPreparationMs = (timings.assetPreparationMs ?? 0) + surfaceTimings.imageWaitMs
    timings.rafWaitMs = surfaceTimings.presentationWaitMs
    if (surfaceTimings.surfaceMode === 'canvas2d') metrics.canvas2dPresentations = (metrics.canvas2dPresentations ?? 0) + 1
    else if (surfaceTimings.surfaceMode === 'svg-fallback') metrics.svgFallbackPresentations = (metrics.svgFallbackPresentations ?? 0) + 1
    if (activeLayer === 'background') previousBackground = layerKeys.background
    else if (activeLayer === 'foreground') { previousForeground = layerKeys.foreground; previous = key }
    else { previousBackground = layerKeys.background; previousForeground = layerKeys.foreground; previous = key }
    return { reused: false, timings, ...(Object.keys(metrics).length ? { metrics } : {}) }
  }
  window.addEventListener('pagehide', () => {
    frameSurface.dispose()
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
