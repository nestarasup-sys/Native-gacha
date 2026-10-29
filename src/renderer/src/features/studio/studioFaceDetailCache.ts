import type { FaceCatalogItem } from '../../../../shared/fabricator'

export const STUDIO_FACE_DETAIL_CACHE_CAPACITY = 12

/** Keeps selected sheets available while bounding image-bearing details held by the Studio. */
export function mergeStudioFaceDetails(
  current: Record<string, FaceCatalogItem>,
  incoming: Record<string, FaceCatalogItem>,
  pinnedKeys: readonly string[] = []
): Record<string, FaceCatalogItem> {
  const cache = new Map(Object.entries(current))
  for (const [key, item] of Object.entries(incoming)) {
    cache.delete(key)
    cache.set(key, item)
  }

  const pinned = new Set(pinnedKeys)
  while (cache.size > STUDIO_FACE_DETAIL_CACHE_CAPACITY) {
    const oldestUnpinnedKey = Array.from(cache.keys()).find((key) => !pinned.has(key))
    if (oldestUnpinnedKey === undefined) break
    cache.delete(oldestUnpinnedKey)
  }

  return Object.fromEntries(cache)
}
