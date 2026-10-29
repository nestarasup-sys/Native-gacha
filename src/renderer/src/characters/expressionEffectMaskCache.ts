import { createBoundedImageCache } from '../ui/image/boundedImageCache.ts'

export const EXPRESSION_EFFECT_MASK_CACHE_MAX_ENTRIES = 8
export const EXPRESSION_EFFECT_MASK_CACHE_MAX_BYTES = 32 * 1024 * 1024

export function createExpressionEffectMaskCache(load: (source: string) => Promise<HTMLImageElement>) {
  return createBoundedImageCache<HTMLImageElement>({
    load,
    estimateValueBytes: (image) => Math.max(1, image.naturalWidth || image.width) * Math.max(1, image.naturalHeight || image.height) * 4,
    maxEntries: EXPRESSION_EFFECT_MASK_CACHE_MAX_ENTRIES,
    maxBytes: EXPRESSION_EFFECT_MASK_CACHE_MAX_BYTES
  })
}
