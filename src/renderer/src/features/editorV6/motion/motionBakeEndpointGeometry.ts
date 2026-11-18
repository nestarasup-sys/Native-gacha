import type { EditorV6FaceRenderMode } from '../../../../../shared/editorV6'
import type { CustomizerCharacter } from '../../../../../shared/customizer'
import type { EditorV6Element } from '../../../../../shared/editorV6'
import type { MotionPixelCrop } from './motionPixelAnalysis'
import { resolvedHairBakeEndpointDimensions, type HairBakeEndpointCrop } from './hairBakeEndpointGeometry'

export type CachedMotionBakeEndpointGeometry = { crop: MotionPixelCrop; width: number; height: number }

/** Exact visual inputs only; callers scope this key to the current export session. */
export function editorV6MotionEndpointGeometryCacheKey(character: CustomizerCharacter, state: EditorV6Element): string {
  // The element ID identifies a timeline instance, not the rendered character
  // geometry. Identical visual snapshots on separate clips can share one crop.
  const { id, ...visualState } = state
  void id
  return JSON.stringify([character.id, character.updatedAt, character.customization, visualState])
}

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
  endpointGeometryCacheHits: number
  endpointGeometryCacheMisses: number
}

type ResolveMotionBakeEndpointGeometryOptions<Renderer> = {
  captureLayerAtlases: boolean
  endpointCrops?: { from: HairBakeEndpointCrop; to: HairBakeEndpointCrop }
  endpointGeometryCache?: Map<string, CachedMotionBakeEndpointGeometry>
  endpointCacheKeys?: { from: string; to: string }
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
  endpointGeometryCache,
  endpointCacheKeys,
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
      maximumCanvasHeight: Math.max(endpointDimensions.firstHeight, endpointDimensions.lastHeight),
      endpointGeometryCacheHits: 0,
      endpointGeometryCacheMisses: 0
    }
  }

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

  const cachedEndpoint = (key: string | undefined): CachedMotionBakeEndpointGeometry | undefined => {
    if (!key || !endpointGeometryCache) return undefined
    const cached = endpointGeometryCache.get(key)
    if (!cached) return undefined
    endpointGeometryCache.delete(key)
    endpointGeometryCache.set(key, cached)
    return cached
  }
  let endpointGeometryCacheHits = 0, endpointGeometryCacheMisses = 0
  const rememberEndpoint = (key: string | undefined, value: CachedMotionBakeEndpointGeometry) => {
    if (!key || !endpointGeometryCache) return
    endpointGeometryCache.delete(key)
    endpointGeometryCache.set(key, value)
    while (endpointGeometryCache.size > 128) endpointGeometryCache.delete(endpointGeometryCache.keys().next().value!)
  }
  const resolveEndpoint = async (progress: number, key: string | undefined, measuredCrop?: MotionPixelCrop): Promise<CachedMotionBakeEndpointGeometry> => {
    const cached = cachedEndpoint(key)
    if (cached) { endpointGeometryCacheHits++; return cached }
    if (key && endpointGeometryCache) endpointGeometryCacheMisses++
    const initial = await render(progress, staticMouthLoop && progress === 0 ? firstFaceMode : undefined, 1, hasMouthScaleSamples)
    try {
      const crop = measuredCrop ?? await endpointCrop(progress, initial.crop, initial.renderer)
      const resolved = { crop, width: initial.width, height: initial.height }
      rememberEndpoint(key, resolved)
      return resolved
    } finally { initial.dispose() }
  }

  const from = await resolveEndpoint(0, endpointCacheKeys?.from, endpointCrops?.from)
  const to = staticMouthLoop
    ? from
    : await resolveEndpoint(1, endpointCacheKeys?.to, endpointCrops?.to)

  return {
    fromCrop: from.crop,
    toCrop: to.crop,
    maximumCanvasWidth: Math.max(from.width, to.width),
    maximumCanvasHeight: Math.max(from.height, to.height),
    endpointGeometryCacheHits,
    endpointGeometryCacheMisses
  }
}
