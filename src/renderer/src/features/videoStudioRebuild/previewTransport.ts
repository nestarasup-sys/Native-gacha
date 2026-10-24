import type { VideoSceneFrame } from '../../../../shared/videoSceneIR'
import { planSnapshotSprites } from '../../../../shared/videoStudioRebuild/previewSpritePlan'
import type { CatalogGpuCompiler } from './catalogGpuCompiler'
import { createPreviewBalloonCanvas, previewBalloonKey } from './balloonCanvas'
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
  private readonly balloons = new VideoStudioBoundedMemo<HTMLCanvasElement>(
    24, 24 * 1024 * 1024, canvas => canvas.width * canvas.height * 4
  )
  private readonly imageIds = new WeakMap<object, number>()
  private nextImageId = 0
  private frame = 0
  private playing = false
  private disposed = false
  private requestId = 0
  private inFlight = false
  private lastRenderedFrame = -1
  private dirtySprites = false
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
    private readonly onError: (error: Error) => void,
    private readonly catalog?: CatalogGpuCompiler
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
    if (!this.inFlight && (this.dirtySprites || this.frame !== this.lastRenderedFrame)) this.request('visible')
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

  private textureId(image: TexImageSource): string {
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
      if ((layer.kind === 'speech' || layer.kind === 'thought') && !layer.assetDataUrl) {
        const key=previewBalloonKey(layer.element)
        const canvas=await awaitAbortable(this.balloons.getOrCreate(key,
          () => Promise.resolve(createPreviewBalloonCanvas(layer.element))),signal)
        output.push({textureId:this.textureId(canvas),source:canvas,
          element:{x:layer.element.x,y:layer.element.y,width:layer.element.width,
            height:layer.element.height,rotation:layer.element.rotation,
            flipX:layer.element.flipX}})
        continue
      }
      // An experimental real-catalog rig is used only if ALL current parts
      // are ready. Missing models, old projects and transitions display the
      // exact saved PNG immediately instead of waiting for catalog raster.
      if (layer.kind === 'character' && this.catalog) {
        const actor = scene.characters?.find(item => item.elementId === layer.element.id)
        const sprites = this.catalog.sprites(layer, actor)
        const budget = this.gpu.stats().capBytes ?? Number.POSITIVE_INFINITY
        const inUse = output.reduce((bytes,item) => {
          const size=item.source as {naturalWidth?:number;naturalHeight?:number;width?:number;height?:number;videoWidth?:number;videoHeight?:number}
          return bytes + Number(size.naturalWidth??size.videoWidth??size.width??0)
            *Number(size.naturalHeight??size.videoHeight??size.height??0)*4
        },0)
        const needed = sprites?.reduce((bytes,item) => bytes+item.source.width*item.source.height*4,0) ?? 0
        if(sprites?.length && inUse+needed<=budget){output.push(...sprites);continue}
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
    this.dirtySprites=false
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

  /** Catalog pass compilation finished: refresh the current absolute frame
   * without restarting Play or preparing future transition samples. */
  refreshGpuSources():void {
    if(this.disposed)return
    this.dirtySprites=true
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
    this.balloons.clear()
    this.catalog?.dispose()
    this.media.dispose()
    this.gpu.dispose()
  }
}
