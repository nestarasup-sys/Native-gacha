/** Cache ownership only: eviction never changes images held by active renderers. */
export function createCharacterImagePromiseCacheBudget(maxBytes: number) {
  type RetainedEntry = { bytes: number; evict: () => void }
  const entries = new Map<object, RetainedEntry>()
  let retainedBytes = 0

  const remove = (token: object) => {
    const entry = entries.get(token)
    if (!entry) return
    entries.delete(token)
    retainedBytes -= entry.bytes
  }
  const trim = () => {
    while (retainedBytes > maxBytes) {
      const oldest = entries.entries().next().value
      if (!oldest) break
      oldest[1].evict()
    }
  }

  return {
    add(token: object, bytes: number, evict: () => void) {
      remove(token)
      entries.set(token, { bytes, evict })
      retainedBytes += bytes
      trim()
    },
    update(token: object, bytes: number) {
      const entry = entries.get(token)
      if (!entry) return
      retainedBytes += bytes - entry.bytes
      entry.bytes = bytes
      trim()
    },
    touch(token: object) {
      const entry = entries.get(token)
      if (!entry) return
      entries.delete(token)
      entries.set(token, entry)
    },
    remove
  }
}

type CharacterImagePromiseCacheBudget = ReturnType<typeof createCharacterImagePromiseCacheBudget>

export function createCharacterImagePromiseCache(options: { maxEntries: number; maxBytes: number; budget?: CharacterImagePromiseCacheBudget }) {
  type Entry = { promise: Promise<HTMLImageElement>; bytes: number }
  const entries = new Map<string, Entry>()
  let retainedBytes = 0
  const remove = (key: string, entry: Entry) => {
    if (entries.get(key) !== entry) return
    entries.delete(key)
    retainedBytes -= entry.bytes
    options.budget?.remove(entry)
  }
  const trim = () => {
    while (entries.size > options.maxEntries || retainedBytes > options.maxBytes) {
      const oldest = entries.entries().next().value
      if (!oldest) break
      remove(...oldest)
    }
  }
  return {
    get(key: string) {
      const entry = entries.get(key)
      if (entry) {
        entries.delete(key)
        entries.set(key, entry)
        options.budget?.touch(entry)
      }
      return entry?.promise
    },
    set(key: string, promise: Promise<HTMLImageElement>) {
      const previous = entries.get(key)
      if (previous) remove(key, previous)
      const entry: Entry = { promise, bytes: key.length * 2 }
      entries.set(key, entry)
      retainedBytes += entry.bytes
      trim()
      if (entries.get(key) === entry) options.budget?.add(entry, entry.bytes, () => remove(key, entry))
      void promise.then(image => {
        if (entries.get(key) !== entry) return
        // OffscreenCanvas is returned by worker recoloring under the same contract.
        const width = image.naturalWidth || image.width || 0
        const height = image.naturalHeight || image.height || 0
        const outputSourceBytes = image.src && image.src !== key ? image.src.length * 2 : 0
        const bytes = key.length * 2 + outputSourceBytes + width * height * 4
        retainedBytes += bytes - entry.bytes
        entry.bytes = bytes
        trim()
        if (entries.get(key) === entry) options.budget?.update(entry, bytes)
      }, () => remove(key, entry))
    }
  }
}
