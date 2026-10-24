import { VideoStudioBoundedMemo } from '../../../shared/videoStudioNext/boundedMemo'
import type { VideoStudioBudgetLease, VideoStudioResourceBudget } from '../../../shared/videoStudioNext/resourceBudget'

type ExportImageMemos = Readonly<{
  originals: VideoStudioBoundedMemo<HTMLImageElement>
  skin: VideoStudioBoundedMemo<HTMLImageElement>
  hair: VideoStudioBoundedMemo<HTMLImageElement>
}>

/** Export opt-in only; ordinary Gacha UI retains its existing cache behavior. */
export let exportImageMemos: ExportImageMemos | null = null
const wardrobeImageCache = new Map<string, Promise<HTMLImageElement>>()
const workerImageCache = new Map<string, { promise: Promise<HTMLImageElement>; bytes: number; lease?: VideoStudioBudgetLease }>()
let workerImageCacheBytes = 0
let workerImageBudget: VideoStudioResourceBudget | null = null
let workerImageCacheHits = 0
let workerImageCacheMisses = 0
let workerImageCacheFailures = 0
let workerImageCacheInvalidations = 0
const MAX_WORKER_IMAGE_CACHE_BYTES = 96 * 1024 * 1024
const MAX_WORKER_IMAGE_CACHE_ENTRIES = 256

function estimateDecodedRgba(image: HTMLImageElement): number {
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const bytes = width * height * 4
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : Number.MAX_SAFE_INTEGER
}

export function configureVideoExportCharacterImageCaches(budget: VideoStudioResourceBudget): void {
  clearVideoExportCharacterImageCaches()
  workerImageBudget = budget
  exportImageMemos = {
    originals: new VideoStudioBoundedMemo(64, 24 * 1024 * 1024, estimateDecodedRgba, budget, 'texture'),
    skin: new VideoStudioBoundedMemo(32, 16 * 1024 * 1024, estimateDecodedRgba, budget, 'texture'),
    hair: new VideoStudioBoundedMemo(32, 16 * 1024 * 1024, estimateDecodedRgba, budget, 'texture'),
  }
}

export function clearVideoExportCharacterImageCaches(): void {
  exportImageMemos?.originals.clear()
  exportImageMemos?.skin.clear()
  exportImageMemos?.hair.clear()
  if (workerImageCache.size) workerImageCacheInvalidations += 1
  for (const entry of workerImageCache.values()) {
    entry.lease?.release()
    void entry.promise.then(image => {
      if (image instanceof ImageBitmap) image.close()
    }).catch(() => {})
  }
  workerImageCache.clear()
  workerImageCacheBytes = 0
}

export function disposeVideoExportCharacterImageCaches(): void {
  clearVideoExportCharacterImageCaches()
  exportImageMemos = null
  workerImageBudget = null
}

export function workerCharacterImageCacheStats(): Readonly<{
  entries: number; bytes: number; maxBytes: number; maxEntries: number
  hits: number; misses: number; failures: number; invalidations: number
}> {
  return {
    entries: workerImageCache.size,
    bytes: workerImageCacheBytes,
    maxBytes: MAX_WORKER_IMAGE_CACHE_BYTES,
    maxEntries: MAX_WORKER_IMAGE_CACHE_ENTRIES,
    hits: workerImageCacheHits,
    misses: workerImageCacheMisses,
    failures: workerImageCacheFailures,
    invalidations: workerImageCacheInvalidations,
  }
}

/** Original image-loader semantics remain unchanged when export mode is off. */
export function loadCachedImage(source: string | CanvasImageSource): Promise<HTMLImageElement> {
  if (typeof source !== 'string') return Promise.resolve(source as HTMLImageElement)
  if (typeof Image === 'undefined') {
    const cached = workerImageCache.get(source)
    if (cached) {
      workerImageCacheHits += 1
      workerImageCache.delete(source)
      workerImageCache.set(source, cached)
      return cached.promise
    }
    workerImageCacheMisses += 1
    const entry: { bytes: number; promise: Promise<HTMLImageElement>; lease?: VideoStudioBudgetLease } = {
      bytes: 0, promise: Promise.resolve(null as unknown as HTMLImageElement),
    }
    entry.promise = fetch(source).then(response => {
      if (!response.ok) throw new Error(`Não foi possível carregar a imagem do personagem (${response.status}).`)
      return response.blob()
    }).then(blob => createImageBitmap(blob)).then(bitmap => {
      if (workerImageCache.get(source) !== entry) {
        bitmap.close()
        throw new Error('Imagem removida do cache Offscreen durante a leitura.')
      }
      entry.bytes = bitmap.width * bitmap.height * 4
      if (entry.bytes > MAX_WORKER_IMAGE_CACHE_BYTES) {
        bitmap.close()
        throw new Error('Imagem excede o orçamento do cache Offscreen de personagens.')
      }
      while ((workerImageCache.size >= MAX_WORKER_IMAGE_CACHE_ENTRIES
        || workerImageCacheBytes + entry.bytes > MAX_WORKER_IMAGE_CACHE_BYTES
        || (workerImageBudget && workerImageBudget.snapshot().availableBytes < entry.bytes))
        && workerImageCache.size) {
        const oldest = workerImageCache.keys().next().value
        if (oldest === undefined) break
        const removed = workerImageCache.get(oldest)
        workerImageCache.delete(oldest)
        if (removed) {
          workerImageCacheBytes -= removed.bytes
          removed.lease?.release()
          void removed.promise.then(image => {
            if (image instanceof ImageBitmap) image.close()
          }).catch(() => {})
        }
      }
      const lease = workerImageBudget?.tryReserve('texture', entry.bytes)
      if (workerImageBudget && !lease) {
        bitmap.close()
        throw new Error('Limite de memória do Worker Gacha atingido ao carregar uma imagem.')
      }
      entry.lease = lease ?? undefined
      workerImageCacheBytes += entry.bytes
      return bitmap as unknown as HTMLImageElement
    }).catch(error => {
      workerImageCacheFailures += 1
      if (workerImageCache.get(source) === entry) workerImageCache.delete(source)
      throw error
    })
    workerImageCache.set(source, entry)
    return entry.promise
  }
  const create = () => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível carregar a imagem da roupa.'))
    image.src = source
  })
  if (exportImageMemos) return exportImageMemos.originals.getOrCreate(source, create)
  const cached = wardrobeImageCache.get(source)
  if (cached) return cached
  const promise = create()
  wardrobeImageCache.set(source, promise)
  void promise.catch(() => wardrobeImageCache.delete(source))
  return promise
}
