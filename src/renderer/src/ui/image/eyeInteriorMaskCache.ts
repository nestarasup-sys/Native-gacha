import { createBoundedImageCache } from './boundedImageCache.ts'

export const EYE_INTERIOR_MASK_CACHE_MAX_ENTRIES = 48
export const EYE_INTERIOR_MASK_CACHE_MAX_BYTES = 64 * 1024 * 1024

export function createEyeInteriorMaskCache(load: (source: string) => Promise<HTMLCanvasElement | null>) {
  return createBoundedImageCache<HTMLCanvasElement | null>({
    load,
    estimateValueBytes: (canvas) => canvas
      ? Math.max(1, canvas.width) * Math.max(1, canvas.height) * 4
      : 0,
    maxEntries: EYE_INTERIOR_MASK_CACHE_MAX_ENTRIES,
    maxBytes: EYE_INTERIOR_MASK_CACHE_MAX_BYTES
  })
}
