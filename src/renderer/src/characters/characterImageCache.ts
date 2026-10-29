/** Create a bounded LRU cache while keeping eviction isolated per consumer. */
export function createCharacterImageCache(options: { maxEntries?: number; maxBytes?: number } = {}) {
  type Entry = { promise: Promise<HTMLImageElement>; bytes: number }
  const imageCache = new Map<string, Entry>()
  const maxEntries = options.maxEntries ?? 512
  const maxBytes = options.maxBytes ?? 128 * 1024 * 1024
  let retainedBytes = 0
  const remove = (key: string, entry: Entry) => {
    if (imageCache.get(key) !== entry) return
    imageCache.delete(key)
    retainedBytes -= entry.bytes
  }
  const trim = () => {
    while (imageCache.size > maxEntries || retainedBytes > maxBytes) {
      const oldest = imageCache.entries().next().value
      if (!oldest) break
      remove(...oldest)
    }
  }

  return function loadCachedImage(source: string | CanvasImageSource): Promise<HTMLImageElement> {
    if (typeof source !== 'string') return Promise.resolve(source as HTMLImageElement)
    if (typeof Image === 'undefined') return Promise.reject(new Error('O carregamento de imagens exige a interface do navegador.'))
    const cached = imageCache.get(source)
    if (cached) {
      imageCache.delete(source)
      imageCache.set(source, cached)
      return cached.promise
    }
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Não foi possível carregar a imagem do personagem.'))
      image.src = source
    })
    const entry: Entry = { promise, bytes: source.length * 2 }
    imageCache.set(source, entry)
    retainedBytes += entry.bytes
    trim()
    void promise.then(image => {
      if (imageCache.get(source) !== entry) return
      // Estimate RGBA pixels plus the source string. Eviction only drops our
      // reference; callers may safely finish drawing the same image.
      const bytes = source.length * 2 + image.naturalWidth * image.naturalHeight * 4
      retainedBytes += bytes - entry.bytes
      entry.bytes = bytes
      trim()
    }, () => remove(source, entry))
    return promise
  }
}
