import type { FaceCatalogItem } from '../../../shared/fabricator'
import type { CharacterRenderAssetProvider } from '../../../shared/characterRenderAssets'

export type PreparedFaceCatalogItemCache = Map<string, Promise<FaceCatalogItem | null>>
const MAX_SHARED_FACE_CATALOG_ITEMS = 64
const MAX_SHARED_FACE_CATALOG_BYTES = 24 * 1024 * 1024
type PreparedFaceCacheState = { sizes: Map<string, number>; totalBytes: number }
const sharedCacheStates = new WeakMap<PreparedFaceCatalogItemCache, PreparedFaceCacheState>()

function preparedFaceItemBytes(item: FaceCatalogItem | null): number {
  if (!item) return 16
  return (item.sheet.dataUrl.length + item.pieces.reduce((total, piece) => total + piece.dataUrl.length, 0)) * 2
    + JSON.stringify([item.transforms, item.name]).length * 2
}

/** Reuse catalog reads across paired prepared renderers in one export pose. */
export function createPreparedFaceCatalogItemLoader(
  modelSlot: number,
  provider: Pick<CharacterRenderAssetProvider, 'loadFaceCatalogItem'>,
  sharedCache?: PreparedFaceCatalogItemCache
) {
  const localCache: PreparedFaceCatalogItemCache = new Map()
  const sharedState = sharedCache ? sharedCacheStates.get(sharedCache) ?? { sizes: new Map<string, number>(), totalBytes: 0 } : undefined
  if (sharedCache && sharedState && !sharedCacheStates.has(sharedCache)) sharedCacheStates.set(sharedCache, sharedState)
  const trimSharedCache = () => {
    while (sharedCache && sharedState && (sharedCache.size > MAX_SHARED_FACE_CATALOG_ITEMS || sharedState.totalBytes > MAX_SHARED_FACE_CATALOG_BYTES)) {
      const oldest = sharedCache.keys().next().value as string | undefined
      if (!oldest) break
      sharedCache.delete(oldest)
      sharedState.totalBytes -= sharedState.sizes.get(oldest) ?? 0
      sharedState.sizes.delete(oldest)
    }
  }

  return (id: string): Promise<FaceCatalogItem | null> => {
    const key = JSON.stringify([modelSlot, id])
    let pending = localCache.get(key)
    if (pending) return pending

    pending = sharedCache?.get(key)
    if (pending && sharedCache) {
      sharedCache.delete(key)
      sharedCache.set(key, pending)
    }
    if (!pending) {
      pending = provider.loadFaceCatalogItem(modelSlot, id)
      if (sharedCache) {
        sharedCache.set(key, pending)
        trimSharedCache()
        void pending.then(item => {
          if (sharedCache.get(key) !== pending || !sharedState) return
          sharedState.sizes.set(key, preparedFaceItemBytes(item))
          sharedState.totalBytes += sharedState.sizes.get(key)!
          trimSharedCache()
        }, () => {
          if (sharedCache.get(key) === pending) sharedCache.delete(key)
        })
      }
    }
    localCache.set(key, pending)
    void pending.catch(() => {
      if (localCache.get(key) === pending) localCache.delete(key)
      if (sharedCache?.get(key) === pending) {
        sharedCache.delete(key)
        if (sharedState) {
          sharedState.totalBytes -= sharedState.sizes.get(key) ?? 0
          sharedState.sizes.delete(key)
        }
      }
    })
    return pending
  }
}
