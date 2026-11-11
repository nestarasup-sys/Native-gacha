import type { EditorV6FrameMetrics, EditorV6FrameTimings } from '../../../../shared/editorV6Export'
import type { EditorV6HairMotionLayer, EditorV6HairMotionRig, EditorV6HairMotionTransition } from '../../../../shared/editorV6HairMotion'
import type { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6TimelineScene'

type SceneElement = ReturnType<typeof resolveEditorV6SceneAtFrame>['elements'][number]
type CanvasSurface = { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }
type HairTransitionPlan = { atlas: EditorV6HairMotionTransition }

type Options = {
  hairSurfaces: Map<string, HTMLImageElement>
  hairFrameCanvases: Map<string, CanvasSurface>
  motionHairFrameSurfaces: Map<string, CanvasSurface>
  drawHairPiece: (context: CanvasRenderingContext2D, rig: EditorV6HairMotionRig, piece: EditorV6HairMotionLayer, element: SceneElement, frame: number, timings: EditorV6FrameTimings) => void
}

/** Composes prepared hair layers into reusable canvases without retaining rendered frame data. */
export function createEditorV6ExportHairFrameComposer({ hairSurfaces, hairFrameCanvases, motionHairFrameSurfaces, drawHairPiece }: Options) {
  const composeHairFrame = (rig: EditorV6HairMotionRig, element: SceneElement, frame: number, timings: EditorV6FrameTimings, metrics: EditorV6FrameMetrics): HTMLCanvasElement => {
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
    element: SceneElement,
    frame: number,
    transition: HairTransitionPlan,
    sample: EditorV6HairMotionTransition['frames'][number],
    timings: EditorV6FrameTimings,
    metrics: EditorV6FrameMetrics
  ): HTMLCanvasElement => {
    let surface = motionHairFrameSurfaces.get(elementId)
    if (!surface) {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) throw Error('Não foi possível compor o cabelo durante a troca de pose.')
      surface = { canvas, context }
      motionHairFrameSurfaces.set(elementId, surface)
    }
    const { canvas, context } = surface
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
    drawAtlasSurface(transition.atlas.behindFaceSurfaceId)
    drawAtlasSurface(transition.atlas.faceSurfaceId)
    for (const piece of rig.layers) if (piece.id.startsWith('rearHair:')) drawHairPiece(context, rig, piece, element, frame, timings)
    drawAtlasSurface(transition.atlas.eyesAboveRearHairSurfaceId ?? null)
    for (const piece of rig.layers) if (piece.side !== 'back' && !piece.id.startsWith('rearHair:')) drawHairPiece(context, rig, piece, element, frame, timings)
    drawAtlasSurface(transition.atlas.overlaySurfaceId)
    metrics.hairRasterFrames = (metrics.hairRasterFrames ?? 0) + 1
    metrics.hairRasterPixels = (metrics.hairRasterPixels ?? 0) + canvas.width * canvas.height
    return canvas
  }

  return { composeHairFrame, composeMotionHairFrame }
}
