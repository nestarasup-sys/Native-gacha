type BoundedImageCacheOptions<T> = {
  load?: (source: string) => Promise<T>
  estimateValueBytes: (value: T, source: string) => number
  maxEntries: number
  maxBytes: number
}

export type BoundedImageCacheStats = {
  entries: number
  inFlight: number
  retainedBytes: number
  maxEntries: number
  maxBytes: number
}

/** Shares concurrent image loads and keeps completed results within an LRU byte budget. */
export function createBoundedImageCache<T>(options: BoundedImageCacheOptions<T>) {
  const maxEntries = Math.max(0, Math.floor(options.maxEntries))
  const maxBytes = Math.max(0, Math.floor(options.maxBytes))
  const completed = new Map<string, { value: T; retainedBytes: number }>()
  const inFlight = new Map<string, Promise<T>>()
  let retainedBytes = 0
  let generation = 0

  const trim = () => {
    while (completed.size > maxEntries || retainedBytes > maxBytes) {
      const oldest = completed.entries().next().value as [string, { value: T; retainedBytes: number }] | undefined
      if (!oldest) break
      completed.delete(oldest[0])
      retainedBytes -= oldest[1].retainedBytes
    }
  }

  return {
    load(source: string, loader = options.load): Promise<T> {
      const cached = completed.get(source)
      if (cached) {
        completed.delete(source)
        completed.set(source, cached)
        return Promise.resolve(cached.value)
      }
      const pending = inFlight.get(source)
      if (pending) return pending
      if (!loader) return Promise.reject(new Error('O cache precisa de uma função para carregar o valor.'))

      const requestGeneration = generation
      let request: Promise<T>
      request = Promise.resolve()
        .then(() => loader(source))
        .then((value) => {
          if (generation === requestGeneration && inFlight.get(source) === request) {
            inFlight.delete(source)
            const valueBytes = Math.max(0, Math.floor(options.estimateValueBytes(value, source) || 0))
            const entryBytes = source.length * 2 + valueBytes
            if (maxEntries > 0 && entryBytes <= maxBytes) {
              completed.set(source, { value, retainedBytes: entryBytes })
              retainedBytes += entryBytes
              trim()
            }
          }
          return value
        }, (error: unknown) => {
          if (inFlight.get(source) === request) inFlight.delete(source)
          throw error
        })
      inFlight.set(source, request)
      return request
    },

    clear(): void {
      generation += 1
      completed.clear()
      inFlight.clear()
      retainedBytes = 0
    },

    getStats(): BoundedImageCacheStats {
      return { entries: completed.size, inFlight: inFlight.size, retainedBytes, maxEntries, maxBytes }
    }
  }
}
