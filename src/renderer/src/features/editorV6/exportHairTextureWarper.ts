import { hairMotionNeedsWarp, type HairMotionSettings, type HairMotionState } from '../../../../shared/hairMotionEngine'
import type { EditorV6FrameTimings } from '../../../../shared/editorV6Export'
import { HAIR_MOTION_MESH_HEIGHT, HAIR_MOTION_MESH_WIDTH } from '../../characters/hairMotionMeshGeometry'
import type { createExportHairMeshRenderer } from './exportHairMeshRenderer'

type MeshRenderer = Pick<ReturnType<typeof createExportHairMeshRenderer>, 'render' | 'getTimings'>
type Options = {
  hairWarpCanvases: Map<string, HTMLCanvasElement>
  staticHairWarpCanvases: Map<string, HTMLCanvasElement>
  hairMeshRenderer: MeshRenderer
}

/** Selects the original-pixel static surface or a reusable WebGL-deformed hair surface. */
export function createEditorV6ExportHairTextureWarper({ hairWarpCanvases, staticHairWarpCanvases, hairMeshRenderer }: Options) {
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
      // The padded surface is separate from animated output, so a later frame
      // cannot mutate pixels that the scene compositor is still consuming.
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
    // WebGL's viewport is anchored at the drawing buffer's bottom-left. Crop
    // it from the grow-only canvas without rescaling the per-texture output.
    context.drawImage(mesh, 0, mesh.height - outputHeight, outputWidth, outputHeight, 0, 0, outputWidth, outputHeight)
    timings.hairCanvasBlitMs = (timings.hairCanvasBlitMs ?? 0) + performance.now() - blitStarted
    return canvas
  }

  return { warpHairTexture }
}
