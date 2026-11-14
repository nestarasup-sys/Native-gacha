import type { EditorV6HairMotionBundle } from '../../../../shared/editorV6HairMotion'
import type { HairMotionLoop, HairMotionState } from '../../../../shared/hairMotionEngine'
import { editorV6HairMotionInstancePhase } from '../../../../shared/editorV6HairMotion'
import { createExportHairMeshRenderer } from './exportHairMeshRenderer'
import { createEditorV6ExportHairTextureWarper } from './exportHairTextureWarper'

type ImageLoader = (dataUrl: string) => Promise<ImageBitmap>
type HairMeshRenderer = ReturnType<typeof createExportHairMeshRenderer>

async function loadHairImage(dataUrl: string): Promise<ImageBitmap> {
  try {
    // Data URLs have opaque origins in Chromium. Although they can be drawn to
    // 2D canvases, uploading an HTMLImageElement sourced from one to WebGL can
    // trigger a cross-origin SecurityError. Set the CORS mode before loading
    // media URLs and upload only the resulting origin-clean ImageBitmap.
    if (dataUrl.startsWith('gacha-editor-media://')) {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.src = dataUrl
      try {
        await image.decode()
        return await createImageBitmap(image)
      } finally { image.src = '' }
    }
    const prefix = 'data:image/png;base64,'
    if (!dataUrl.startsWith(prefix)) throw Error(`A camada de cabelo tem origem ou formato não aceito (${dataUrl.slice(0, 32)}).`)
    if (dataUrl.length > 48_000_000) throw Error(`A camada de cabelo excede o limite de 48 MB (${dataUrl.length} caracteres).`)
    let binary = atob(dataUrl.slice(prefix.length))
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    binary = ''
    return await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
  } catch (error) {
    throw Error('Não foi possível decodificar uma camada da animação de cabelo.', { cause: error })
  }
}

/** Owns all per-worker hair images, canvases and WebGL resources for one export. */
export async function createEditorV6ExportWorkerHairResources(
  animation: EditorV6HairMotionBundle | null | undefined,
  dependencies: { loadImage?: ImageLoader; createMeshRenderer?: () => HairMeshRenderer } = {}
) {
  const hairSurfaces = new Map<string, ImageBitmap>()
  const hairSurfaceDataById = new Map((animation?.surfaces ?? []).map(surface => [surface.id, surface.dataUrl]))
  const hairTextures = new Map<string, ImageBitmap>()
  const hairMotionStates = new Map<string, HairMotionState>()
  const hairMotionLoops = new Map<string, HairMotionLoop>()
  const hairMotionInstancePhases = new Map([...new Set((animation?.rigs ?? []).map(rig => rig.elementId))].map(elementId => [elementId, editorV6HairMotionInstancePhase(elementId)]))
  const hairWarpCanvases = new Map<string, HTMLCanvasElement>()
  // Immutable padded pixels for stationary strands; never shared across exports.
  const staticHairWarpCanvases = new Map<string, HTMLCanvasElement>()
  const hairFrameCanvases = new Map<string, { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }>()
  // Live surfaces let the SVG embed transition canvases without PNG round trips.
  const motionHairFrameSurfaces = new Map<string, { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }>()
  const ownedImages = new Set<ImageBitmap>()
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
    for (const image of ownedImages) image.close()
    ownedImages.clear()
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
      const loadInto = async (id: string, dataUrl: string, target: Map<string, ImageBitmap>) => {
        const image = await loadImage(dataUrl)
        if (disposed) { image.close(); throw Error('A preparação das imagens de cabelo foi cancelada.') }
        ownedImages.add(image)
        target.set(id, image)
      }
      await Promise.all([
        ...animation.surfaces.map(surface => loadInto(surface.id, surface.dataUrl, hairSurfaces)),
        ...animation.textures.map(texture => loadInto(texture.id, texture.dataUrl, hairTextures))
      ])
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
