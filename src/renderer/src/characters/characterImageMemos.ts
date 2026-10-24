import { VideoStudioBoundedMemo } from '../../../shared/videoStudioNext/boundedMemo'
import type { VideoStudioResourceBudget } from '../../../shared/videoStudioNext/resourceBudget'

type ExportImageMemos = Readonly<{
  originals: VideoStudioBoundedMemo<HTMLImageElement>
  skin: VideoStudioBoundedMemo<HTMLImageElement>
  hair: VideoStudioBoundedMemo<HTMLImageElement>
}>

/** Export opt-in only; ordinary Gacha UI retains its existing cache behavior. */
export let exportImageMemos: ExportImageMemos | null = null
const wardrobeImageCache = new Map<string, Promise<HTMLImageElement>>()

function estimateDecodedRgba(image: HTMLImageElement): number {
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  const bytes = width * height * 4
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : Number.MAX_SAFE_INTEGER
}

export function configureVideoExportCharacterImageCaches(budget: VideoStudioResourceBudget): void {
  clearVideoExportCharacterImageCaches()
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
}

export function disposeVideoExportCharacterImageCaches(): void {
  clearVideoExportCharacterImageCaches()
  exportImageMemos = null
}

/** Original image-loader semantics remain unchanged when export mode is off. */
export function loadCachedImage(source: string): Promise<HTMLImageElement> {
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
