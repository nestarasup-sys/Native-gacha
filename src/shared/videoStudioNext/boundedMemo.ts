import type { VideoStudioBudgetLease, VideoStudioResourceBudget, VideoStudioResourceCategory } from './resourceBudget'

type Entry<T> = { promise: Promise<T>; lease?: VideoStudioBudgetLease; bytes: number }

/**
 * Bounded async memo for derived Gacha artwork recipes.
 * Limits RETAINED result strings by byte estimate and entry count. It does
 * not limit in-flight raster allocations or decoded Chromium/GPU texture RAM.
 */
export class VideoStudioBoundedMemo<T> {
  private readonly entries = new Map<string, Entry<T>>()
  private retainedBytes = 0
  private generation = 0

  constructor(
    private readonly maxEntries: number,
    private readonly maxBytes: number,
    private readonly estimateBytes: (result: T) => number,
    private readonly budget?: VideoStudioResourceBudget,
    private readonly category: VideoStudioResourceCategory = 'artwork'
  ) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1
      || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      throw new RangeError('Invalid memo limits')
    }
  }

  private evictOldest(): boolean {
    const key = this.entries.keys().next().value
    if (key === undefined) return false
    const entry = this.entries.get(key)
    this.entries.delete(key)
    if (entry) {
      this.retainedBytes -= entry.bytes
      entry.lease?.release()
    }
    return true
  }

  getOrCreate(key: string, create: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key)
    if (hit) {
      this.entries.delete(key)
      this.entries.set(key, hit)
      return hit.promise
    }
    const generation = this.generation
    const entry: Entry<T> = { bytes: 0, promise: Promise.resolve().then(create) }
    this.entries.set(key, entry)
    while (this.entries.size > this.maxEntries) this.evictOldest()
    const pending = entry.promise.then((result) => {
      if (generation !== this.generation || this.entries.get(key) !== entry) return result
      const bytes = this.estimateBytes(result)
      if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > this.maxBytes) {
        this.entries.delete(key)
        return result
      }
      while ((this.retainedBytes + bytes > this.maxBytes
        || (this.budget && this.budget.snapshot().availableBytes < bytes))
        && this.entries.size > 1) {
        const oldest = this.entries.keys().next().value
        if (oldest === key) break
        this.evictOldest()
      }
      const lease = this.budget?.tryReserve(this.category, bytes)
      if (this.budget && !lease) {
        this.entries.delete(key)
        return result
      }
      entry.bytes = bytes
      entry.lease = lease ?? undefined
      this.retainedBytes += bytes
      return result
    }, (reason: unknown) => {
      if (this.entries.get(key) === entry) this.entries.delete(key)
      throw reason
    })
    // Keep a stable Promise for multiple simultaneous requesters.
    entry.promise = pending
    return pending
  }

  stats(): Readonly<{ entries: number; retainedBytes: number; maxEntries: number; maxBytes: number }> {
    return { entries: this.entries.size, retainedBytes: this.retainedBytes, maxEntries: this.maxEntries, maxBytes: this.maxBytes }
  }

  clear(): void {
    this.generation++
    for (const entry of this.entries.values()) entry.lease?.release()
    this.entries.clear()
    this.retainedBytes = 0
  }
}
