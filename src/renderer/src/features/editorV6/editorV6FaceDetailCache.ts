import type { FaceCatalogItem } from '../../../../shared/fabricator'

export const EDITOR_V6_FACE_DETAIL_CACHE_LIMIT = 16

/** Keeps frequently used PNG sheets available without retaining an entire face catalog in renderer memory. */
export function rememberEditorV6FaceCatalogItem(
  cache: Readonly<Record<string, FaceCatalogItem>>,
  key: string,
  item: FaceCatalogItem
): Record<string, FaceCatalogItem> {
  const next = { ...cache }
  delete next[key]
  next[key] = item
  const keys = Object.keys(next)
  const expired = keys.slice(0, Math.max(0, keys.length - EDITOR_V6_FACE_DETAIL_CACHE_LIMIT))
  for (const expiredKey of expired) delete next[expiredKey]
  return next
}
