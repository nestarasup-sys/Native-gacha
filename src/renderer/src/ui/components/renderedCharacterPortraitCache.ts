import { createBoundedImageCache } from '../image/boundedImageCache.ts'

export const RENDERED_CHARACTER_PORTRAIT_CACHE_MAX_ENTRIES = 32
export const RENDERED_CHARACTER_PORTRAIT_CACHE_MAX_BYTES = 32 * 1024 * 1024

export function createRenderedCharacterPortraitCache() {
  return createBoundedImageCache<string | null>({
    estimateValueBytes: (dataUrl) => dataUrl ? dataUrl.length * 2 : 0,
    maxEntries: RENDERED_CHARACTER_PORTRAIT_CACHE_MAX_ENTRIES,
    maxBytes: RENDERED_CHARACTER_PORTRAIT_CACHE_MAX_BYTES
  })
}
