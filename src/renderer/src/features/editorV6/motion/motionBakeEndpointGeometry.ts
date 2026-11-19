import type { CustomizerCharacter } from '../../../../../shared/customizer'
import type { EditorV6Element } from '../../../../../shared/editorV6'
import { editorV6FaceModeForElement, measureFaceModeCrop, type PreparedEditorV6FaceRenderer } from '../faceModeAssets'
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

/** The displayed rectangle belongs to the authored snapshot's composite crop. */
export async function measureEditorV6MotionSnapshot(
  renderer: PreparedEditorV6FaceRenderer,
  state: EditorV6Element,
  character: CustomizerCharacter
): Promise<CachedMotionBakeEndpointGeometry> {
  const appearance = state.faceAppearance ?? character.customization.faceAppearance
  const mode = editorV6FaceModeForElement(state, appearance)
  const { width, height } = renderer
  const crop = await measureFaceModeCrop(state.text, renderer, appearance, state.faceTransforms, state.activeExpressionEffects, mode)
  return { width, height, crop: crop ?? { left: 0, top: 0, width, height } }
}

export type MotionBakeEndpointGeometry = {
  fromCrop: MotionPixelCrop
  toCrop: MotionPixelCrop
  maximumCanvasWidth: number
  maximumCanvasHeight: number
  endpointGeometryCacheHits: number
  endpointGeometryCacheMisses: number
}

type ResolveMotionBakeEndpointGeometryOptions = {
  captureLayerAtlases: boolean
  endpointCrops?: { from: HairBakeEndpointCrop; to: HairBakeEndpointCrop }
  endpointGeometryCache?: Map<string, CachedMotionBakeEndpointGeometry>
  endpointCacheKeys?: { from: string; to: string }
  measure: (endpoint: 'from' | 'to', crop?: MotionPixelCrop) => Promise<CachedMotionBakeEndpointGeometry>
}

/** Resolves native endpoint sizes and union face crops, reusing premeasured hair endpoints when valid. */
export async function resolveMotionBakeEndpointGeometry({
  captureLayerAtlases,
  endpointCrops,
  endpointGeometryCache,
  endpointCacheKeys,
  measure
}: ResolveMotionBakeEndpointGeometryOptions): Promise<MotionBakeEndpointGeometry> {
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
  const resolveEndpoint = async (endpoint: 'from' | 'to'): Promise<CachedMotionBakeEndpointGeometry> => {
    const knownCrop = endpointCrops?.[endpoint]
    const key = knownCrop ? undefined : endpointCacheKeys?.[endpoint]
    const cached = cachedEndpoint(key)
    if (cached) { endpointGeometryCacheHits++; return cached }
    if (key && endpointGeometryCache) endpointGeometryCacheMisses++
    const resolved = await measure(endpoint, knownCrop)
    rememberEndpoint(key, resolved)
    return resolved
  }

  const from = await resolveEndpoint('from')
  const to = await resolveEndpoint('to')

  return {
    fromCrop: from.crop,
    toCrop: to.crop,
    maximumCanvasWidth: Math.max(from.width, to.width),
    maximumCanvasHeight: Math.max(from.height, to.height),
    endpointGeometryCacheHits,
    endpointGeometryCacheMisses
  }
}
