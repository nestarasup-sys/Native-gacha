import type { CustomizerFaceAppearance } from '../../../shared/customizer'
import type { FaceExpressionEffects } from '../../../shared/fabricator'
import type { StudioFaceMode, StudioFaceTransforms } from '../../../shared/studio'
import type { GachaStaticLayers } from './gachaStaticLayers'

/** Independent render passes around a single immutable prepared pose. */
export type GachaFacePass = 'effects' | 'catalog' | 'details' | 'extras'
  | 'brow-left' | 'brow-right' | 'eye-left' | 'eye-right'
  | 'pupil-left' | 'pupil-right'
export const GPU_FACE_PASSES: readonly GachaFacePass[] = [
  'effects','catalog','brow-left','brow-right','eye-left','eye-right',
  'pupil-left','pupil-right','details','extras'
] as const

export type FacePassDrawer = (
  context: CanvasRenderingContext2D,
  appearance: CustomizerFaceAppearance | undefined,
  transforms?: StudioFaceTransforms,
  effects?: FaceExpressionEffects,
  mode?: StudioFaceMode,
  pass?: GachaFacePass
) => Promise<void>

/** Reuses the exact source painter, never encodes a flattened face as PNG.
 * The base/wardrobe and foreground hair textures are held by the rig. */
export function createPreparedGachaGpuLayers(args: Readonly<{
  rigLayers: GachaStaticLayers
  shapeScale: {x:number;y:number}
  outputWidth:number;outputHeight:number
  artworkWidth:number;artworkHeight:number;modelSlot:number
  appearance?:CustomizerFaceAppearance
  legacyFaceImage:HTMLImageElement|null
  drawFace:FacePassDrawer
}>) {
  const scaled = (sourceCanvas: HTMLCanvasElement): HTMLCanvasElement => {
    if (args.shapeScale.x === 1 && args.shapeScale.y === 1) return sourceCanvas
    const result = document.createElement('canvas')
    result.width = args.outputWidth
    result.height = args.outputHeight
    const out = result.getContext('2d')
    if (!out) throw new Error('Canvas de camada proporcional indisponível.')
    out.translate(args.outputWidth / 2, args.outputHeight / 2)
    out.scale(args.shapeScale.x, args.shapeScale.y)
    out.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2)
    return result
  }
  const rigBack = scaled(args.rigLayers.behindFace)
  const rigFront = args.rigLayers.inFrontOfFace ? scaled(args.rigLayers.inFrontOfFace) : null
  const renderGpuFacePass = async (
    pass: GachaFacePass,
    appearance: CustomizerFaceAppearance | undefined = args.appearance,
    transforms?: StudioFaceTransforms,
    effects?: FaceExpressionEffects,
    mode?: StudioFaceMode
  ): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement('canvas')
    canvas.width = args.artworkWidth
    canvas.height = args.artworkHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Camada facial Gacha indisponível.')
    await args.drawFace(context, appearance, transforms, effects, mode, pass)
    return scaled(canvas)
  }
  const renderGpuLayers = async (
    appearance: CustomizerFaceAppearance | undefined = args.appearance,
    transforms?: StudioFaceTransforms,
    effects?: FaceExpressionEffects,
    mode?: StudioFaceMode
  ): Promise<ReadonlyArray<{ id: string; source: HTMLCanvasElement }>> => {
    const layers: Array<{id:string;source:HTMLCanvasElement}> = [{id:'rig-behind-face',source:rigBack}]
    if (appearance?.modelSlot === args.modelSlot) {
      for (const pass of GPU_FACE_PASSES) layers.push({
        id:'face:'+pass,source:await renderGpuFacePass(pass,appearance,transforms,effects,mode)
      })
    } else if (args.legacyFaceImage) {
      const legacy=document.createElement('canvas')
      legacy.width=args.artworkWidth;legacy.height=args.artworkHeight
      const ctx=legacy.getContext('2d')
      if(ctx) {
        ctx.drawImage(args.legacyFaceImage,0,0,legacy.width,legacy.height)
        layers.push({id:'face:legacy',source:scaled(legacy)})
      }
    }
    if (rigFront) layers.push({id:'rig-front',source:rigFront})
    return layers
  }
  return {
    gpuStaticLayers:{behindFace:rigBack,inFrontOfFace:rigFront},
    renderGpuFacePass,renderGpuLayers
  }
}
