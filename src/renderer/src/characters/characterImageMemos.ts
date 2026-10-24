const imageCache = new Map<string, Promise<HTMLImageElement>>()
const maxEntries = 512

/** Shared image decoding cache for character editors. */
export function loadCachedImage(source: string | CanvasImageSource): Promise<HTMLImageElement> {
  if (typeof source !== 'string') return Promise.resolve(source as HTMLImageElement)
  if (typeof Image === 'undefined') return Promise.reject(new Error('O carregamento de imagens exige a interface do navegador.'))
  const cached = imageCache.get(source)
  if (cached) {
    imageCache.delete(source)
    imageCache.set(source, cached)
    return cached
  }
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível carregar a imagem do personagem.'))
    image.src = source
  })
  imageCache.set(source, promise)
  while (imageCache.size > maxEntries) imageCache.delete(imageCache.keys().next().value!)
  void promise.catch(() => imageCache.delete(source))
  return promise
}
