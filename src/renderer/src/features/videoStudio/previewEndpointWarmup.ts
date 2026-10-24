import type { CharacterTransition } from './characterTransitions'

/**
 * Warm only nearby authored endpoint PNGs, never the expensive Gacha
 * intermediate rasters. Decoding runs asynchronously in Chromium and does
 * not gate Play. Bounded retained Image references reduce cold decode flashes
 * when a 250 ms transition begins.
 */
export class PreviewEndpointWarmup {
  private readonly decoded = new Map<string, HTMLImageElement>()
  constructor(private readonly maxImages = 8) {}

  prepare(spans: readonly CharacterTransition[], currentFrame: number, horizonFrames = 240): void {
    if (typeof Image === 'undefined') return
    const upcoming = spans.filter(span =>
      span.boundaryFrame > currentFrame && span.startFrame <= currentFrame + horizonFrames
    ).slice(0, 3)
    for (const span of upcoming) {
      for (const src of [span.from.imageDataUrl, span.to.imageDataUrl]) {
        if (!src) continue
        const already = this.decoded.get(src)
        if (already) {
          this.decoded.delete(src)
          this.decoded.set(src, already)
          continue
        }
        const image = new Image()
        image.src = src
        this.decoded.set(src, image)
        // Browser decoder primes raster memory. The DOM still owns any error
        // fallback; no request waits for this promise.
        if (typeof image.decode === 'function') void image.decode().catch(() => {})
        while (this.decoded.size > this.maxImages) this.decoded.delete(this.decoded.keys().next().value!)
      }
    }
  }

  cachedImages(): number { return this.decoded.size }
  clear(): void { this.decoded.clear() }
}
