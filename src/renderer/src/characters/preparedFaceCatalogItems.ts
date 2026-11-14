import type { FaceCatalogItem } from '../../../shared/fabricator'
import type { CharacterRenderAssetProvider } from '../../../shared/characterRenderAssets'

export type PreparedFaceCatalogItemCache = Map<string, Promise<FaceCatalogItem | null>>

/** Reuse catalog reads across paired prepared renderers in one export pose. */
export function createPreparedFaceCatalogItemLoader(
  modelSlot: number,
  provider: Pick<CharacterRenderAssetProvider, 'loadFaceCatalogItem'>,
  sharedCache?: PreparedFaceCatalogItemCache
) {
  const localCache: PreparedFaceCatalogItemCache = new Map()

  return (id: string): Promise<FaceCatalogItem | null> => {
    const key = JSON.stringify([modelSlot, id])
    let pending = localCache.get(key)
    if (pending) return pending

    pending = sharedCache?.get(key)
    if (!pending) {
      pending = provider.loadFaceCatalogItem(modelSlot, id)
      sharedCache?.set(key, pending)
    }
    localCache.set(key, pending)
    void pending.catch(() => {
      if (localCache.get(key) === pending) localCache.delete(key)
      if (sharedCache?.get(key) === pending) sharedCache.delete(key)
    })
    return pending
  }
}
