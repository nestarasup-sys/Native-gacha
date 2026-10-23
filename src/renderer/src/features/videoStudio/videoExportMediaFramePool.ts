import type { VideoSceneFrame } from '../../../../shared/videoSceneIR'
import type { VideoStudioBudgetLease, VideoStudioResourceBudget } from '../../../../shared/videoStudioNext/resourceBudget'

type CachedBitmap = { bitmap: ImageBitmap; bytes: number; pins: number; lease?: VideoStudioBudgetLease }
type BorrowedBitmap = Readonly<{ bitmap: ImageBitmap; release: () => void }>

/** Keep frames alive for the entire scene render. Caller MUST release in finally. */
export type VideoExportMediaFrameLease = Readonly<{
  frames: ReadonlyMap<string, CanvasImageSource>
  release: () => void
}>

function abortError(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error ? signal.reason : new DOMException('Operação cancelada.', 'AbortError')
}

export class VideoExportMediaFramePool {
  private readonly videos = new Map<string, HTMLVideoElement>()
  private readonly ready = new Map<string, Promise<HTMLVideoElement>>()
  private readonly bitmaps = new Map<string, CachedBitmap>()
  private readonly transients = new Set<CachedBitmap>()
  private bitmapBytes = 0
  private activeScene = false
  private disposed = false

  constructor(
    private readonly jobId: string,
    private readonly maxBitmapBytes = 96 * 1024 * 1024,
    private readonly budget?: VideoStudioResourceBudget,
    private readonly releaseExternalCache?: () => void
  ) {
    if (!Number.isSafeInteger(maxBitmapBytes) || maxBitmapBytes < 1) {
      throw new RangeError('Orçamento de bitmaps de mídia inválido.')
    }
  }

  private video(assetId: string): Promise<HTMLVideoElement> {
    if (this.disposed) return Promise.reject(new Error('Decoder de mídia já foi descartado.'))
    let pending = this.ready.get(assetId)
    if (pending) return pending
    const video = document.createElement('video')
    video.muted = true
    video.preload = 'auto'
    video.playsInline = true
    video.crossOrigin = 'anonymous'
    video.src = `gacha-video://export-job/${this.jobId}/${assetId}`
    this.videos.set(assetId, video)
    pending = new Promise<HTMLVideoElement>((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', loaded)
        video.removeEventListener('error', failed)
      }
      const loaded = () => { cleanup(); resolve(video) }
      const failed = () => { cleanup(); reject(new Error(`Não foi possível decodificar a mídia pinada ${assetId}.`)) }
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA && Number.isFinite(video.duration)) resolve(video)
      else {
        video.addEventListener('loadedmetadata', loaded, { once: true })
        video.addEventListener('error', failed, { once: true })
        video.load()
      }
    })
    this.ready.set(assetId, pending)
    void pending.catch(() => { this.ready.delete(assetId); this.videos.delete(assetId) })
    return pending
  }

  private async seek(video: HTMLVideoElement, target: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw abortError(signal)
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('Mídia sem duração decodificável.')
    const clamped = Math.max(0, Math.min(target, Math.max(0, video.duration - 0.000001)))
    const needsSeek = Math.abs(video.currentTime - clamped) > 0.000001 || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    if (!needsSeek) return

    await new Promise<void>((resolve, reject) => {
      let done = false
      const timeout = window.setTimeout(() => finish(new Error('Seek de mídia excedeu 8 segundos.')), 8000)
      const finish = (error?: Error) => {
        if (done) return
        done = true
        window.clearTimeout(timeout)
        video.removeEventListener('seeked', onSeeked)
        video.removeEventListener('error', onError)
        signal?.removeEventListener('abort', onAbort)
        error ? reject(error) : resolve()
      }
      const onSeeked = () => {
        // seeked means the paused media element completed its seek. Waiting for
        // a future requestVideoFrameCallback can deadlock because no future
        // playback presentation is required while paused.
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) finish()
        else {
          const check = () => {
            if (done) return
            if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) finish()
            else window.setTimeout(check, 4)
          }
          check()
        }
      }
      const onError = () => finish(new Error('Decoder falhou durante seek de mídia.'))
      const onAbort = () => finish(abortError(signal))
      video.addEventListener('seeked', onSeeked, { once: true })
      video.addEventListener('error', onError, { once: true })
      signal?.addEventListener('abort', onAbort, { once: true })
      try { video.currentTime = clamped }
      catch (reason) { finish(reason instanceof Error ? reason : new Error(String(reason))) }
    })
    if (signal?.aborted) throw abortError(signal)
  }

  private closeEntry(entry: CachedBitmap): void {
    entry.bitmap.close()
    entry.lease?.release()
  }

  /** Cached frames borrowed by a composition must never be evicted. */
  private evictUnpinned(): boolean {
    for (const [key, entry] of this.bitmaps) {
      if (entry.pins > 0) continue
      this.bitmaps.delete(key)
      this.bitmapBytes -= entry.bytes
      this.closeEntry(entry)
      return true
    }
    return false
  }

  private async borrowFrame(
    assetId: string,
    sourceNumerator: number,
    sourceDenominator: number,
    signal?: AbortSignal
  ): Promise<BorrowedBitmap> {
    if (this.disposed) throw new Error('Decoder de mídia já foi descartado.')
    if (!Number.isSafeInteger(sourceNumerator) || !Number.isSafeInteger(sourceDenominator)
      || sourceNumerator < 0 || sourceDenominator <= 0) {
      throw new Error('Timestamp de mídia inválido.')
    }

    const key = assetId + ':' + sourceNumerator + '/' + sourceDenominator
    const cached = this.bitmaps.get(key)
    if (cached) {
      this.bitmaps.delete(key)
      this.bitmaps.set(key, cached)
      cached.pins++
      let released = false
      return { bitmap: cached.bitmap, release: () => {
        if (released) return
        released = true
        if (cached.pins > 0) cached.pins--
      } }
    }

    const video = await this.video(assetId)
    if (this.disposed) throw new Error('Decoder de mídia já foi descartado.')
    await this.seek(video, sourceNumerator / sourceDenominator, signal)
    if (this.disposed) throw new Error('Decoder de mídia já foi descartado.')
    if (signal?.aborted) throw abortError(signal)
    const bitmap = await createImageBitmap(video)
    if (this.disposed || signal?.aborted) {
      bitmap.close()
      throw this.disposed ? new Error('Decoder de mídia já foi descartado.') : abortError(signal)
    }
    const bytes = bitmap.width * bitmap.height * 4
    if (!bitmap.width || !bitmap.height || !Number.isSafeInteger(bytes)) {
      bitmap.close()
      throw new Error('Decoder retornou um frame de vídeo inválido.')
    }

    // Both cached and in-flight frames reserve bytes in the surface budget.
    // Evict only non-borrowed frames; preserve frames from earlier clips in
    // the same composite, even when the 96 MiB cache is full.
    while ((this.bitmapBytes + bytes > this.maxBitmapBytes
      || (this.budget && this.budget.snapshot().availableBytes < bytes))
      && this.evictUnpinned()) { /* finite LRU */ }

    let lease = this.budget?.tryReserve('video-decoder', bytes)
    if (this.budget && !lease) {
      // Layer cache is derived and can be regenerated. Flush it before
      // dropping a final-quality video frame.
      this.releaseExternalCache?.()
      lease = this.budget.tryReserve('video-decoder', bytes)
    }
    if (this.budget && !lease) {
      bitmap.close()
      throw new Error('Orçamento de frames decodificados esgotado para esta surface.')
    }

    const entry: CachedBitmap = { bitmap, bytes, pins: 1, ...(lease ? { lease } : {}) }
    if (bytes <= this.maxBitmapBytes && this.bitmapBytes + bytes <= this.maxBitmapBytes) {
      this.bitmaps.set(key, entry)
      this.bitmapBytes += bytes
      let released = false
      return { bitmap, release: () => {
        if (released) return
        released = true
        if (entry.pins > 0) entry.pins--
      } }
    }

    // Cache exceeded by simultaneously visible clips: transient frame is
    // pinned and counted until composition releases it, then closed.
    this.transients.add(entry)
    let released = false
    return { bitmap, release: () => {
      if (released) return
      released = true
      if (this.transients.delete(entry)) this.closeEntry(entry)
    } }
  }

  async acquireFramesForScene(scene: VideoSceneFrame, signal?: AbortSignal): Promise<VideoExportMediaFrameLease> {
    if (this.disposed) throw new Error('Decoder de mídia já foi descartado.')
    if (this.activeScene) throw new Error('Composições de vídeo simultâneas na mesma surface.')
    this.activeScene = true
    const frames = new Map<string, CanvasImageSource>()
    const releases: Array<() => void> = []
    let released = false
    const release = () => {
      if (released) return
      released = true
      for (const done of releases.reverse()) done()
      this.activeScene = false
    }
    try {
      for (const video of scene.videos) {
        if (signal?.aborted) throw abortError(signal)
        const pinned = await this.borrowFrame(
          video.assetId, video.sourceTimeNumerator, video.sourceTimeDenominator, signal
        )
        releases.push(pinned.release)
        frames.set(video.clipId, pinned.bitmap)
      }
      return { frames, release }
    } catch (reason) {
      release()
      throw reason
    }
  }

  dispose(): void {
    this.disposed = true
    for (const cached of this.bitmaps.values()) this.closeEntry(cached)
    this.bitmaps.clear()
    this.bitmapBytes = 0
    for (const transient of this.transients) this.closeEntry(transient)
    this.transients.clear()
    for (const video of this.videos.values()) {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    this.videos.clear()
    this.ready.clear()
  }
}
