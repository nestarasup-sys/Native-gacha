import { createCharacterImagePromiseCache } from './characterImagePromiseCache'

/** Create a bounded LRU cache while keeping eviction isolated per consumer. */
export function createCharacterImageCache(options: { maxEntries?: number; maxBytes?: number } = {}) {
  const imageCache = createCharacterImagePromiseCache({ maxEntries: options.maxEntries ?? 512, maxBytes: options.maxBytes ?? 128 * 1024 * 1024 })

  return function loadCachedImage(source: string | CanvasImageSource): Promise<HTMLImageElement> {
    if (typeof source !== 'string') return Promise.resolve(source as HTMLImageElement)
    if (typeof Image === 'undefined') return Promise.reject(new Error('O carregamento de imagens exige a interface do navegador.'))
    const cached = imageCache.get(source)
    if (cached) return cached
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Não foi possível carregar a imagem do personagem.'))
      image.src = source
    })
    imageCache.set(source, promise)
    return promise
  }
}
