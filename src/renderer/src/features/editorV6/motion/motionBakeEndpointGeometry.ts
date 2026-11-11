import type { EditorV6FaceRenderMode } from '../../../../../shared/editorV6'
import type { MotionPixelCrop } from './motionPixelAnalysis'
import { resolvedHairBakeEndpointDimensions, type HairBakeEndpointCrop } from './hairBakeEndpointGeometry'

export type MotionBakeEndpointFrame<Renderer> = {
  width: number
  height: number
  crop: MotionPixelCrop
  renderer: Renderer
  dispose: () => void
}

type MotionEndpointRender<Renderer> = (
  progress: number,
  faceMode?: EditorV6FaceRenderMode,
  mouthScale?: number,
  fingerprint?: boolean,
  preparedRenderer?: Renderer,
  referenceMode?: boolean
) => Promise<MotionBakeEndpointFrame<Renderer>>

export type MotionBakeEndpointGeometry = {
  fromCrop: MotionPixelCrop
  toCrop: MotionPixelCrop
  maximumCanvasWidth: number
  maximumCanvasHeight: number
}

type ResolveMotionBakeEndpointGeometryOptions<Renderer> = {
  captureLayerAtlases: boolean
  endpointCrops?: { from: HairBakeEndpointCrop; to: HairBakeEndpointCrop }
  staticMouthLoop: boolean
  hasMouthScaleSamples: boolean
  firstFaceMode?: EditorV6FaceRenderMode
  render: MotionEndpointRender<Renderer>
}

function isMissingBlinkAsset(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Selecione olhos do catálogo ou assets de Olhos Dev')
}

/** Resolves native endpoint sizes and union face crops, reusing premeasured hair endpoints when valid. */
export async function resolveMotionBakeEndpointGeometry<Renderer>({
  captureLayerAtlases,
  endpointCrops,
  staticMouthLoop,
  hasMouthScaleSamples,
  firstFaceMode,
  render
}: ResolveMotionBakeEndpointGeometryOptions<Renderer>): Promise<MotionBakeEndpointGeometry> {
  // Hair preparation already measured both untrimmed endpoint sizes and all face-mode crops.
  const endpointDimensions = captureLayerAtlases ? resolvedHairBakeEndpointDimensions(endpointCrops) : null
  if (endpointDimensions && endpointCrops) {
    return {
      fromCrop: endpointCrops.from,
      toCrop: endpointCrops.to,
      maximumCanvasWidth: Math.max(endpointDimensions.firstWidth, endpointDimensions.lastWidth),
      maximumCanvasHeight: Math.max(endpointDimensions.firstHeight, endpointDimensions.lastHeight)
    }
  }

  const first = await render(0, staticMouthLoop ? firstFaceMode : undefined, 1, hasMouthScaleSamples)
  const fullWidth = first.width, fullHeight = first.height
  const endpointCrop = async (progress: number, initial: MotionPixelCrop, renderer: Renderer): Promise<MotionPixelCrop> => {
    let left = initial.left, top = initial.top, right = left + initial.width, bottom = top + initial.height
    for (const mode of ['idle', 'blink', 'talk', 'talk-blink'] as const) {
      try {
        const frame = await render(progress, mode, 1, false, renderer, true)
        try {
          left = Math.min(left, frame.crop.left)
          top = Math.min(top, frame.crop.top)
          right = Math.max(right, frame.crop.left + frame.crop.width)
          bottom = Math.max(bottom, frame.crop.top + frame.crop.height)
        } finally { frame.dispose() }
      } catch (error) {
        const missingBlink = isMissingBlinkAsset(error)
        if (!missingBlink || (mode !== 'blink' && mode !== 'talk-blink')) throw error
      }
    }
    return { left, top, width: right - left, height: bottom - top }
  }

  let fromCrop: MotionPixelCrop, toCrop: MotionPixelCrop
  try { fromCrop = endpointCrops?.from ?? await endpointCrop(0, first.crop, first.renderer) }
  finally { first.dispose() }
  const last = staticMouthLoop ? null : await render(1)
  try { toCrop = endpointCrops?.to ?? (last ? await endpointCrop(1, last.crop, last.renderer) : fromCrop) }
  finally { last?.dispose() }

  return {
    fromCrop,
    toCrop,
    maximumCanvasWidth: Math.max(fullWidth, last?.width ?? fullWidth),
    maximumCanvasHeight: Math.max(fullHeight, last?.height ?? fullHeight)
  }
}
