import type { CharacterRenderAssetProvider } from '../../../../../shared/characterRenderAssets'
import type { prepareSavedCharacterRenderer, GachaReusableMaterialCache } from '../../../characters/editorV6CharacterRenderer'
import type { StandardExpressionEffectsCache } from '../../../characters/standardExpressionEffects'
import type { PreparedFaceCatalogItemCache } from '../../../characters/preparedFaceCatalogItems'
import { cacheEditorV6MotionAssetProvider, type EditorV6MotionProviderReadStats } from './motionAssetProviderCache'
import type { CachedMotionBakeEndpointGeometry } from './motionBakeEndpointGeometry'

type Renderer = Awaited<ReturnType<typeof prepareSavedCharacterRenderer>>

/** Reuses immutable renderer rigs within a single hidden Electron bake lane. */
export type EditorV6BakeSession = {
  provider: CharacterRenderAssetProvider
  materials: GachaReusableMaterialCache
  expressionEffectsCache: StandardExpressionEffectsCache
  faceCatalogItemsCache: PreparedFaceCatalogItemCache
  providerReadStats: EditorV6MotionProviderReadStats
  endpointRenderers: Map<string, Renderer>
  /** Bounded endpoint crops reused only while one export bake session is alive. */
  endpointGeometryCache: Map<string, CachedMotionBakeEndpointGeometry>
  /** Bounded history distinguishes a genuinely new rig from a rig evicted earlier. */
  hasSeenPose(key: string): boolean
  rememberPose(key: string): void
  trim(): void
  dispose(): void
}

export function createEditorV6BakeSession(provider: CharacterRenderAssetProvider, options: { providerCacheEntries?: number; providerCacheRefreshOnHit?: boolean } = {}): EditorV6BakeSession {
  const endpointRenderers = new Map<string, Renderer>()
  const endpointGeometryCache = new Map<string, CachedMotionBakeEndpointGeometry>()
  const poseHistory = new Set<string>()
  const materials: GachaReusableMaterialCache = new Map()
  const faceCatalogItemsCache: PreparedFaceCatalogItemCache = new Map()
  const providerReadStats: EditorV6MotionProviderReadStats = { calls: 0, hits: 0, misses: 0, evictions: 0, milliseconds: 0 }
  const cachedProvider = cacheEditorV6MotionAssetProvider(provider, true, providerReadStats, {
    maxEntries: options.providerCacheEntries ?? 192,
    maxBytes: 48 * 1024 * 1024,
    refreshOnHit: options.providerCacheRefreshOnHit
  })
  return {
    provider: cachedProvider,
    materials,
    expressionEffectsCache: new WeakMap(),
    faceCatalogItemsCache,
    providerReadStats,
    endpointRenderers,
    endpointGeometryCache,
    hasSeenPose(key) { return poseHistory.has(key) },
    rememberPose(key) {
      if (poseHistory.has(key)) poseHistory.delete(key)
      poseHistory.add(key)
      while (poseHistory.size > 48) poseHistory.delete(poseHistory.values().next().value!)
    },
    trim() {
      // Seven Canvas RGBA surfaces per rig is a conservative worker-local estimate.
      const estimatedBytes = () => [...endpointRenderers.values()].reduce(
        (total, renderer) => total + renderer.width * renderer.height * 4 * 7, 0
      )
      while (endpointRenderers.size > 12 || (endpointRenderers.size > 1 && estimatedBytes() > 96 * 1024 * 1024)) {
        const oldest = endpointRenderers.keys().next().value!
        const renderer = endpointRenderers.get(oldest)!
        endpointRenderers.delete(oldest)
        renderer.dispose()
      }
    },
    dispose() {
      for (const renderer of endpointRenderers.values()) renderer.dispose()
      endpointRenderers.clear()
      endpointGeometryCache.clear()
      poseHistory.clear()
      materials.clear()
      faceCatalogItemsCache.clear()
    }
  }
}
