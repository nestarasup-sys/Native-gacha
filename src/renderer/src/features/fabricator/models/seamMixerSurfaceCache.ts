export type SeamMixerSurface = { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }

export const SEAM_MIXER_SURFACE_CACHE_MAX_ENTRIES = 24
export const SEAM_MIXER_SURFACE_CACHE_MAX_BYTES = 48 * 1024 * 1024

/** LRU cache for decoded mixer canvases, bounded by both entries and RGBA surface size. */
export class BoundedSeamMixerSurfaceCache extends Map<string, SeamMixerSurface> {
  private readonly surfaceBytes = new Map<string, number>()
  private retainedByteLength = 0
  private readonly maxEntries: number
  private readonly maxBytes: number

  constructor(
    maxEntries = SEAM_MIXER_SURFACE_CACHE_MAX_ENTRIES,
    maxBytes = SEAM_MIXER_SURFACE_CACHE_MAX_BYTES
  ) {
    super()
    this.maxEntries = Number.isFinite(maxEntries) ? Math.max(0, Math.floor(maxEntries)) : SEAM_MIXER_SURFACE_CACHE_MAX_ENTRIES
    this.maxBytes = Number.isFinite(maxBytes) ? Math.max(0, Math.floor(maxBytes)) : SEAM_MIXER_SURFACE_CACHE_MAX_BYTES
  }

  get estimatedRetainedBytes(): number {
    return this.retainedByteLength
  }

  override get(key: string): SeamMixerSurface | undefined {
    const surface = super.get(key)
    if (!surface) return undefined
    super.delete(key)
    super.set(key, surface)
    return surface
  }

  override set(key: string, surface: SeamMixerSurface): this {
    this.delete(key)
    const bytes = surface.canvas.width * surface.canvas.height * 4
    if (!Number.isFinite(bytes) || bytes <= 0 || this.maxEntries <= 0 || bytes > this.maxBytes) return this

    while (this.size >= this.maxEntries || this.retainedByteLength + bytes > this.maxBytes) {
      const oldest = this.keys().next()
      if (oldest.done) break
      this.delete(oldest.value)
    }

    super.set(key, surface)
    this.surfaceBytes.set(key, bytes)
    this.retainedByteLength += bytes
    return this
  }

  override delete(key: string): boolean {
    const bytes = this.surfaceBytes.get(key)
    if (bytes !== undefined) {
      this.surfaceBytes.delete(key)
      this.retainedByteLength -= bytes
    }
    return super.delete(key)
  }

  override clear(): void {
    this.surfaceBytes.clear()
    this.retainedByteLength = 0
    super.clear()
  }
}
