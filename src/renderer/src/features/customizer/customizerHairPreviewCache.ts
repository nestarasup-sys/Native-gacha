import { createBoundedImageCache } from '../../ui/image/boundedImageCache.ts'

export const CUSTOMIZER_HAIR_PREVIEW_CACHE_MAX_ENTRIES = 40
export const CUSTOMIZER_HAIR_PREVIEW_CACHE_MAX_BYTES = 24 * 1024 * 1024

/** Bounds trimmed preview strings by estimated retained source and result size. */
export function createCustomizerHairPreviewCache(load: (source: string) => Promise<string>) {
  return createBoundedImageCache<string>({
    load,
    estimateValueBytes: (preview) => preview.length * 2,
    maxEntries: CUSTOMIZER_HAIR_PREVIEW_CACHE_MAX_ENTRIES,
    maxBytes: CUSTOMIZER_HAIR_PREVIEW_CACHE_MAX_BYTES
  })
}
