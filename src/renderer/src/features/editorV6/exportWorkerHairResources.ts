import type { EditorV6HairMotionBundle } from '../../../../shared/editorV6HairMotion'
import type { HairMotionLoop, HairMotionState } from '../../../../shared/hairMotionEngine'
import { editorV6HairMotionInstancePhase } from '../../../../shared/editorV6HairMotion'
import { createExportHairMeshRenderer } from './exportHairMeshRenderer'
import { createEditorV6ExportHairTextureWarper } from './exportHairTextureWarper'

type ImageLoader = (dataUrl: string) => Promise<HTMLImageElement>
type HairMeshRenderer = ReturnType<typeof createExportHairMeshRenderer>

function loadHairImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => { void image.decode().then(() => resolve(image), () => reject(Error('Não foi possível decodificar uma camada da animação de cabelo.'))) }
    image.onerror = () => reject(Error('Não foi possível carregar uma camada da animação de cabelo.'))
    image.src = dataUrl
  })
}

/** Owns all per-worker hair images, canvases and WebGL resources for one export. */
export async function createEditorV6ExportWorkerHairResources(
  animation: EditorV6HairMotionBundle | null | undefined,
  dependencies: { loadImage?: ImageLoader; createMeshRenderer?: () => HairMeshRenderer } = {}
) {
  const hairSurfaces = new Map<string, HTMLImageElement>()
  const hairSurfaceDataById = new Map((animation?.surfaces ?? []).map(surface => [surface.id, surface.dataUrl]))
  const hairTextures = new Map<string, HTMLImageElement>()
  const hairMotionStates = new Map<string, HairMotionState>()
  const hairMotionLoops = new Map<string, HairMotionLoop>()
  const hairMotionInstancePhases = new Map([...new Set((animation?.rigs ?? []).map(rig => rig.elementId))].map(elementId => [elementId, editorV6HairMotionInstancePhase(elementId)]))
  const hairWarpCanvases = new Map<string, HTMLCanvasElement>()
  // Immutable padded pixels for stationary strands; never shared across exports.
  const staticHairWarpCanvases = new Map<string, HTMLCanvasElement>()
  const hairFrameCanvases = new Map<string, { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }>()
  // Live surfaces let the SVG embed transition canvases without PNG round trips.
  const motionHairFrameSurfaces = new Map<string, { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }>()
  const animatedElementIds = [...new Set((animation?.rigs ?? []).filter(rig => rig.layers.length > 0).map(rig => rig.elementId))]
  const hairMeshRenderer = (dependencies.createMeshRenderer ?? createExportHairMeshRenderer)()
  const { warpHairTexture } = createEditorV6ExportHairTextureWarper({ hairWarpCanvases, staticHairWarpCanvases, hairMeshRenderer })
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    hairMeshRenderer.dispose()
    for (const canvas of hairWarpCanvases.values()) canvas.width = canvas.height = 1
    for (const canvas of staticHairWarpCanvases.values()) canvas.width = canvas.height = 1
    for (const { canvas } of hairFrameCanvases.values()) canvas.width = canvas.height = 1
    for (const { canvas } of motionHairFrameSurfaces.values()) canvas.width = canvas.height = 1
    hairSurfaces.clear()
    hairSurfaceDataById.clear()
    hairTextures.clear()
    hairMotionStates.clear()
    hairMotionLoops.clear()
    hairMotionInstancePhases.clear()
    hairWarpCanvases.clear()
    staticHairWarpCanvases.clear()
    hairFrameCanvases.clear()
    motionHairFrameSurfaces.clear()
  }

  try {
    if (animation) {
      const loadImage = dependencies.loadImage ?? loadHairImage
      const [surfaceImages, textureImages] = await Promise.all([
        Promise.all(animation.surfaces.map(async surface => [surface.id, await loadImage(surface.dataUrl)] as const)),
        Promise.all(animation.textures.map(async texture => [texture.id, await loadImage(texture.dataUrl)] as const))
      ])
      for (const [id, image] of surfaceImages) hairSurfaces.set(id, image)
      for (const [id, image] of textureImages) hairTextures.set(id, image)
    }
  } catch (error) {
    dispose()
    throw error
  }

  return {
    hairSurfaces, hairSurfaceDataById, hairTextures, hairMotionStates, hairMotionLoops, hairMotionInstancePhases,
    hairWarpCanvases, staticHairWarpCanvases, hairFrameCanvases, motionHairFrameSurfaces,
    animatedElementIds, hairMeshRenderer, warpHairTexture, dispose
  }
}
