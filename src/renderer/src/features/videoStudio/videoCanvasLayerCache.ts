import type { VideoStudioBudgetLease, VideoStudioResourceBudget } from '../../../../shared/videoStudioNext/resourceBudget'

export type VideoCanvasLayerCacheStats = Readonly<{
  hits: number
  misses: number
  evictions: number
  entries: number
  bytes: number
  maxBytes: number
}>

type Entry = { canvas: HTMLCanvasElement; bytes: number; lease?: VideoStudioBudgetLease }

/**
 * Surface-local LRU of visual layers. A shared ledger controls the *cached*
 * decoded RGBA estimate; temporary render canvases/Chromium GPU allocations
 * are not covered and must be measured separately.
 */
export class VideoCanvasLayerCache {
  private readonly entries = new Map<string, Entry>()
  private bytes = 0
  private hits = 0
  private misses = 0
  private evictions = 0
  private generation = 0

  constructor(readonly maxBytes = 96 * 1024 * 1024, private readonly budget?: VideoStudioResourceBudget) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 16 * 1024 * 1024) {
      throw new Error('Orçamento do cache de layers inválido.')
    }
  }

  get(key: string): HTMLCanvasElement | undefined {
    const entry = this.entries.get(key)
    if (!entry) { this.misses++; return undefined }
    this.entries.delete(key)
    this.entries.set(key, entry)
    this.hits++
    return entry.canvas
  }

  private evictOldest(): boolean {
    const oldestKey = this.entries.keys().next().value
    if (oldestKey === undefined) return false
    const entry = this.entries.get(oldestKey)
    this.entries.delete(oldestKey)
    if (entry) {
      this.bytes -= entry.bytes
      entry.lease?.release()
    }
    this.evictions++
    return true
  }

  create(
    key: string,
    width: number,
    height: number,
    draw: (context: CanvasRenderingContext2D) => void | Promise<void>
  ): Promise<HTMLCanvasElement> {
    const bytes = width * height * 4
    if (!key || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1 || !Number.isSafeInteger(bytes)) {
      throw new Error('Layer cache inválido.')
    }
    const existing = this.get(key)
    if (existing) return Promise.resolve(existing)
    const generation = this.generation
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { alpha: true })
    if (!context) throw new Error('Canvas de layer indisponível.')

    return Promise.resolve().then(() => draw(context)).then(() => {
      // A clear/unmount while an async image was loading must not revive cache.
      if (generation !== this.generation || bytes > this.maxBytes) return canvas
      const replaced = this.entries.get(key)
      if (replaced) {
        this.entries.delete(key)
        this.bytes -= replaced.bytes
        replaced.lease?.release()
      }
      // Evict before admission, including when another consumer is using
      // the same ledger. A failed reservation still returns a valid transient
      // canvas to preserve frame correctness rather than failing export.
      while ((this.bytes + bytes > this.maxBytes
        || (this.budget && this.budget.snapshot().availableBytes < bytes))
        && this.entries.size > 0) this.evictOldest()

      const lease = this.budget?.tryReserve('preview', bytes)
      if (this.budget && !lease) return canvas
      this.entries.set(key, { canvas, bytes, ...(lease ? { lease } : {}) })
      this.bytes += bytes
      return canvas
    })
  }

  clear(): void {
    this.generation++
    for (const entry of this.entries.values()) entry.lease?.release()
    this.entries.clear()
    this.bytes = 0
  }

  stats(): VideoCanvasLayerCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      entries: this.entries.size,
      bytes: this.bytes,
      maxBytes: this.maxBytes,
    }
  }
}
