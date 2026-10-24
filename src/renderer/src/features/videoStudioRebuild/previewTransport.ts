import type { VideoSceneFrame } from '../../../../shared/videoSceneIR'
import { planSnapshotSprites } from '../../../../shared/videoStudioRebuild/previewSpritePlan'
import { VideoStudioBoundedMemo } from '../../../../shared/videoStudioNext/boundedMemo'
import { VideoStudioFrameEngine } from '../../../../shared/videoStudioRebuild/frameEngine'
import { VideoFrameScheduler } from '../../../../shared/videoStudioRebuild/frameScheduler'
import type { GachaGpuStage, GachaGpuLayer } from './gachaGpuStage'
import type { VideoStudioMediaEngine } from './mediaEngine'

export type RebuiltPreviewStatus = Readonly<{
  frame: number
  playing: boolean
  rendering: boolean
  presentedFrames: number
  skippedFrames: number
  textureBytes: number
}>

function awaitAbortable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('Quadro cancelado.', 'AbortError'))
  return new Promise<T>((resolve, reject) => {
    const abort = () => { cleanup(); reject(new DOMException('Quadro cancelado.', 'AbortError')) }
    const cleanup = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    void task.then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
  })
}

/**
 * Preview transport, fully outside React. Owns rAF, scene evaluation, GPU
 * submission and limited image decoding. UI is notified at most ~10 Hz.
 *
 * Never prepares a range of transition frames ahead of Play. Slow raster work
 * is superseded on seek; during playback, frames are sampled at the current
 * absolute clock and obsolete frames are dropped rather than blocking time.
 */
export class VideoStudioPreviewTransport {
  private readonly scheduler = new VideoFrameScheduler(2)
  private readonly images = new VideoStudioBoundedMemo<HTMLImageElement>(
    48, 64 * 1024 * 1024, image => Math.max(1, image.naturalWidth * image.naturalHeight * 4)
  )
  private readonly imageIds = new WeakMap<HTMLImageElement, number>()
  private nextImageId = 0
  private frame = 0
  private playing = false
  private disposed = false
  private requestId = 0
  private inFlight = false
  private lastRenderedFrame = -1
  private presented = 0
  private skipped = 0
  private startedAt = 0
  private startFrame = 0
  private animation = 0
  private lastNotifyAt = 0

  constructor(
    private readonly engine: VideoStudioFrameEngine,
    private readonly gpu: GachaGpuStage,
    private readonly media: VideoStudioMediaEngine,
    private readonly notify: (status: RebuiltPreviewStatus) => void,
    private readonly onError: (error: Error) => void
  ) {
    this.emit()
    this.animation = requestAnimationFrame(this.tick)
  }

  private readonly tick = (now: number) => {
    if (this.disposed) return
    if (this.playing) {
      const elapsedFrames = Math.floor(Math.max(0, now - this.startedAt) * 0.06)
      const requested = Math.min(this.engine.durationFrames - 1, this.startFrame + elapsedFrames)
      const scene = this.engine.evaluate(requested)
      const clock = this.media.currentFrame(requested, scene)
      this.frame = Math.max(0, Math.min(this.engine.durationFrames - 1, clock))
      if (this.frame === this.engine.durationFrames - 1) this.playing = false
    }
    if (!this.inFlight && this.frame !== this.lastRenderedFrame) this.request('visible')
    if (now - this.lastNotifyAt >= 100) {
      this.lastNotifyAt = now
      this.emit()
    }
    this.animation = requestAnimationFrame(this.tick)
  }

  private emit() {
    this.notify({
      frame: this.frame,
      playing: this.playing,
      rendering: this.inFlight,
      presentedFrames: this.presented,
      skippedFrames: this.skipped,
      textureBytes: this.gpu.stats().retainedEstimatedBytes
    })
  }

  private textureId(image: HTMLImageElement): string {
    let id = this.imageIds.get(image)
    if (!id) { id = ++this.nextImageId; this.imageIds.set(image, id) }
    return 'asset:' + id
  }

  private async decode(dataUrl: string, signal: AbortSignal): Promise<HTMLImageElement> {
    const load = this.images.getOrCreate(dataUrl, () => new Promise((resolve, reject) => {
      const image = new Image()
      image.decoding = 'async'
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Asset Gacha indisponível no preview reconstruído.'))
      image.src = dataUrl
    }))
    return awaitAbortable(load, signal)
  }

  private async layers(scene: VideoSceneFrame, signal: AbortSignal): Promise<GachaGpuLayer[]> {
    const output: GachaGpuLayer[] = []
    if (scene.background.assetDataUrl) {
      const image = await this.decode(scene.background.assetDataUrl, signal)
      output.push({
        textureId: this.textureId(image), source: image,
        element: { x: scene.background.x, y: scene.background.y, width: scene.background.width,
          height: scene.background.height, rotation: scene.background.rotation }
      })
    }
    for (const layer of scene.layers) {
      if (signal.aborted) throw new DOMException('Quadro cancelado.', 'AbortError')
      if (layer.type === 'video') {
        const element = this.media.activeFrameSources(scene).get(layer.clipId)
        if (element) output.push({
          textureId: 'video:' + layer.clipId,
          source: element, dynamic: true,
          element: { x: layer.transform?.x ?? 0, y: layer.transform?.y ?? 0,
            width: layer.transform?.width ?? 100, height: layer.transform?.height ?? 100,
            rotation: layer.transform?.rotation ?? 0 }
        })
        continue
      }
      // Decode only current absolute-frame transition sprites, retaining them
      // as independent GPU textures in the same document z-order.
      const planned = planSnapshotSprites(layer, scene.characters ?? [])
      const sprites = await Promise.all(planned.map(async item => {
        const image = await this.decode(item.imageDataUrl, signal)
        return { textureId: this.textureId(image), source: image,
          element: item.element, opacity: item.opacity }
      }))
      output.push(...sprites)
    }
    return output
  }

  private request(priority: 'visible'|'seek') {
    if (this.disposed) return
    const requestId = ++this.requestId
    const scene = this.engine.evaluate(this.frame)
    this.media.sync(scene, this.playing)
    this.inFlight = true
    const work = this.scheduler.request('frame:' + scene.frame, priority, signal => this.layers(scene, signal))
    void work.then(layers => {
      if (this.disposed || requestId !== this.requestId) return
      this.gpu.draw(layers, scene.background.color)
      this.presented++
      if (this.lastRenderedFrame >= 0 && scene.frame > this.lastRenderedFrame + 1) {
        this.skipped += scene.frame - this.lastRenderedFrame - 1
      }
      this.lastRenderedFrame = scene.frame
    }).catch(error => {
      if (this.disposed || requestId !== this.requestId || (error as Error)?.name === 'AbortError') return
      this.onError(error instanceof Error ? error : new Error(String(error)))
    }).finally(() => {
      if (this.disposed || requestId !== this.requestId) return
      this.inFlight = false
      this.emit()
    })
  }

  seek(frame: number) {
    if (this.disposed || !Number.isSafeInteger(frame)) return
    this.playing = false
    this.frame = Math.max(0, Math.min(this.engine.durationFrames - 1, frame))
    ++this.requestId
    this.scheduler.cancel()
    this.inFlight = false
    this.lastRenderedFrame = -1
    this.request('seek')
    this.emit()
  }

  setPlaying(value: boolean) {
    if (this.disposed || this.playing === value) return
    this.playing = value
    if (value) {
      this.startFrame = this.frame
      this.startedAt = performance.now()
    } else {
      this.media.sync(this.engine.evaluate(this.frame), false)
    }
    this.emit()
  }

  snapshot(): RebuiltPreviewStatus {
    return { frame: this.frame, playing: this.playing, rendering: this.inFlight,
      presentedFrames: this.presented, skippedFrames: this.skipped,
      textureBytes: this.gpu.stats().retainedEstimatedBytes }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    cancelAnimationFrame(this.animation)
    ++this.requestId
    this.scheduler.dispose()
    this.images.clear()
    this.media.dispose()
    this.gpu.dispose()
  }
}
