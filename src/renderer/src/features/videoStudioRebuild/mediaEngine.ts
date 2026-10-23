import type { VideoStudioAsset } from '../../../../shared/studio'
import type { VideoSceneFrame } from '../../../../shared/videoSceneIR'

type MediaEntry = { element: HTMLVideoElement; source: string; ready: boolean }

/**
 * Separate AV owner (no React and no timeline mutations). Chromium's video
 * element supplies decoded frames and the native audio clock. The clock is
 * taken from the active audible video where possible; otherwise a monotonic
 * stage clock is used. No synthetic claim of decoded 60 fps.
 *
 * Process isolation via Electron utilityProcess and a worker hard-kill
 * supervisor is the next media-engine gate; this is a browser media service.
 */
export class VideoStudioMediaEngine {
  private readonly videos = new Map<string, MediaEntry>()
  private readonly pending = new Map<string, Promise<MediaEntry>>()
  private generation = 0
  private closed = false
  private anchor: { frame: number; at: number } | null = null
  private playing = false
  private audioMasterId: string | null = null
  private readonly sessionId = crypto.randomUUID()
  private workerFrame: { frame: number; at: number } | null = null
  private lastWorkerSync = 0
  private workerSyncPending = false
  private workerOnline = true

  constructor(
    private readonly studioId: string,
    private readonly assets: readonly VideoStudioAsset[],
    private readonly maxDecoders = 2
  ) {
    if (!Number.isSafeInteger(maxDecoders) || maxDecoders < 1) throw new RangeError('Limite de decodificadores inválido.')
  }

  async acquire(assetId: string, signal?: AbortSignal): Promise<HTMLVideoElement | null> {
    if (this.closed || signal?.aborted) return null
    const existing = this.videos.get(assetId)
    if (existing) return existing.ready ? existing.element : null
    if (this.videos.size + this.pending.size >= this.maxDecoders) return null
    const asset = this.assets.find((item) => item.id === assetId)
    if (!asset) return null
    let pending = this.pending.get(assetId)
    if (!pending) {
      const generation = this.generation
      pending = window.desktop.prepareVideoPreviewMedia(this.studioId, asset).then(async (proxy) => {
        if (generation !== this.generation || this.closed) throw new Error('Mídia obsoleta.')
        const element = document.createElement('video')
        element.preload = 'auto'
        element.playsInline = true
        element.src = proxy.proxyUrl
        element.load()
        const entry = { element, source: proxy.proxyUrl, ready: false }
        await new Promise<void>((resolve, reject) => {
          const done = () => { element.removeEventListener('loadedmetadata',ok);element.removeEventListener('error',fail) }
          const ok = () => { done(); resolve() }
          const fail = () => { done(); reject(new Error('Não foi possível decodificar o vídeo no motor novo.')) }
          element.addEventListener('loadedmetadata',ok,{once:true})
          element.addEventListener('error',fail,{once:true})
          if (element.readyState >= 1) ok()
        })
        if (this.closed || generation !== this.generation) {
          element.pause();element.removeAttribute('src');element.load()
          throw new Error('Mídia obsoleta.')
        }
        entry.ready=true;this.videos.set(assetId,entry)
        return entry
      }).finally(() => { this.pending.delete(assetId) })
      this.pending.set(assetId,pending)
    }
    try {
      const entry=await pending
      return this.closed || signal?.aborted ? null : entry.element
    } catch {
      return null
    }
  }

  /** Audio first: if a clip is currently playing, its native currentTime
   * anchors the requested frame. Without audio, use performance.now().
   */
  currentFrame(fallbackFrame: number, scene?: VideoSceneFrame): number {
    if (!this.playing) return fallbackFrame
    if (scene && this.audioMasterId) {
      const active=scene.videos.find(v=>v.assetId===this.audioMasterId)
      const media=this.videos.get(this.audioMasterId)?.element
      if (active && media && !media.paused && media.readyState>=2) {
        return Math.max(0,Math.round((media.currentTime*60)-active.sourceTick+scene.frame))
      }
    }
    if(this.workerFrame && performance.now()-this.workerFrame.at < 1000) {
      return Math.max(0,this.workerFrame.frame+Math.round((performance.now()-this.workerFrame.at)*.06))
    }
    return this.anchor
      ? Math.max(0,this.anchor.frame+Math.round((performance.now()-this.anchor.at)*.06))
      : fallbackFrame
  }

  /** Non-blocking sync: media elements and audio run independently of React.
   * At most two decoders, and seeks are coalesced by the caller's frame plan.
   */
  sync(scene: VideoSceneFrame, playing: boolean): void {
    if (this.closed) return
    if (playing !== this.playing) {
      this.playing=playing
      if (playing) this.anchor={frame:scene.frame,at:performance.now()}
      else this.anchor=null
    }
    // The independent utility process owns the rational 60 fps timeline clock.
    // Feed it the native media clock when an audible source is ready; never
    // await IPC in requestAnimationFrame or make Play wait for an asset render.
    const now=performance.now()
    if(this.workerOnline && !this.workerSyncPending && now-this.lastWorkerSync>=200) {
      this.lastWorkerSync=now;this.workerSyncPending=true
      const masterVideo=scene.videos[0]
      const element=masterVideo&&this.videos.get(masterVideo.assetId)?.element
      const audioFrame=element && !element.paused && element.readyState>=2
        ? Math.max(0,Math.round(element.currentTime*60-masterVideo.sourceTick+scene.frame))
        : undefined
      void window.desktop.controlVideoMediaEngine({
        op:'sync',sessionId:this.sessionId,frame:scene.frame,playing,
        ...(audioFrame===undefined?{}:{audioFrame})
      }).then(result=>{if(!this.closed)this.workerFrame={frame:result.frame,at:performance.now()}})
        .catch(()=>{this.workerOnline=false;this.workerFrame=null})
        .finally(()=>{this.workerSyncPending=false})
    }
    const activeIds=new Set(scene.videos.map(v=>v.assetId))
    this.audioMasterId=scene.videos[0]?.assetId ?? null
    for(const [id, entry] of this.videos) if(!activeIds.has(id)) entry.element.pause()
    for(const video of scene.videos) {
      const entry=this.videos.get(video.assetId)
      if (!entry?.ready) { void this.acquire(video.assetId); continue }
      const element=entry.element
      const target=video.sourceTimeNumerator/video.sourceTimeDenominator
      if (Number.isFinite(element.duration) && Math.abs(element.currentTime-target)>(playing ? .2 : 1/60)) {
        try {element.currentTime=Math.max(0,Math.min(target,element.duration-.001))} catch { /* wait for decoder */ }
      }
      element.muted=video.assetId!==this.audioMasterId
      if(playing && element.paused) void element.play().catch(()=>undefined)
      if(!playing && !element.paused) element.pause()
    }
  }

  activeFrameSources(scene: VideoSceneFrame): ReadonlyMap<string, HTMLVideoElement> {
    return new Map(scene.videos.flatMap(v=>{
      const media=this.videos.get(v.assetId)?.element
      return media && media.readyState>=2 ? [[v.clipId,media] as const] : []
    }))
  }

  /** Cancels pending publications and *really stops* native decoders. */
  stop(): void {
    this.generation++
    this.playing=false;this.anchor=null;this.audioMasterId=null
    for(const entry of this.videos.values()) {
      entry.element.pause()
      entry.element.removeAttribute('src')
      entry.element.load()
    }
    this.videos.clear()
    this.workerFrame=null
    if(this.workerOnline) void window.desktop.controlVideoMediaEngine({op:'cancel',sessionId:this.sessionId}).catch(()=>undefined)
  }

  dispose(): void {
    if(this.closed)return
    this.closed=true;this.stop()
    if(this.workerOnline) void window.desktop.controlVideoMediaEngine({op:'close',sessionId:this.sessionId}).catch(()=>undefined)
  }
}
