import type { VideoExportCharacterSnapshot } from '../../../../shared/videoExportCharacters'
import type { VideoCharacterRenderAssetSnapshot } from '../../../../shared/videoCharacterRenderAssets'
import type { VideoSceneFrame } from '../../../../shared/videoSceneIR'
import type { VideoGachaCanvasState } from './videoGachaCanvasFrame'

export type VideoCharacterWorkerTimings = Readonly<{
  workerRenderMs: number
  workerBitmapMs: number
  workerTotalMs: number
  transferBytes: number
  transferCount: number
  frameCache: Readonly<{
    frameCache: Readonly<{ entries: number; retainedBytes: number; maxEntries: number; maxBytes: number }>
    preparedCanvases: Readonly<{ entries: number; retainedBytes: number; maxEntries: number; maxBytes: number; hits: number; misses: number }>
    frameCacheHits: number
    frameCacheMisses: number
    cacheInvalidations: number
  }>
  imageCache: Readonly<{
    entries: number; bytes: number; maxBytes: number; maxEntries: number
    hits: number; misses: number; failures: number; invalidations: number
  }>
  budget: Readonly<{ limitBytes: number; usedBytes: number; availableBytes: number; activeLeases: number }>
}>
export type VideoCharacterWorkerFrame = Readonly<{
  states: ReadonlyMap<string, VideoGachaCanvasState>
  timings: VideoCharacterWorkerTimings
  roundTripMs: number
  postMessageMs: number
}>

type Pending = {
  frame: number
  resolve: (value: VideoCharacterWorkerFrame) => void
  reject: (reason: Error) => void
  signal?: AbortSignal
  abort: () => void
  cleanup: () => void
  startedAt: number
  postMessageMs: number
  cancelled: boolean
}

type WorkerResponse = Readonly<{
  type: 'ready' | 'frame' | 'error'
  id?: number
  frame?: number
  error?: string
  cancelled?: boolean
  initMs?: number
  budgetBytes?: number
  states?: ReadonlyArray<{ elementId: string; state: VideoGachaCanvasState }>
  timings?: VideoCharacterWorkerTimings
}>

function asError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason))
}

function compactFrame(frame: VideoSceneFrame): VideoSceneFrame {
  const characters = frame.characters.map((character) => {
    const emptyState = character.authoredState
      ? { ...character.authoredState, imageDataUrl: '' }
      : undefined
    const transition = character.transition ? {
      ...character.transition,
      from: { ...character.transition.from, imageDataUrl: '' },
      to: { ...character.transition.to, imageDataUrl: '' },
    } : undefined
    return {
      ...character,
      ...(emptyState ? { authoredState: emptyState } : {}),
      ...(transition ? { transition } : {}),
    }
  })
  // The character renderer only reads frame, variant and characters. Avoid
  // cloning layer descriptions/media URLs already owned by the surface.
  return { frame: frame.frame, variant: frame.variant, characters } as unknown as VideoSceneFrame
}

/** Single-flight OffscreenCanvas character renderer. No save/project APIs are exposed in the Worker. */
export class VideoCharacterFrameRenderWorkerClient {
  private readonly worker: Worker
  private readonly pending = new Map<number, Pending>()
  private readonly ready: Promise<{ initMs: number; budgetBytes: number }>
  private readonly initStartedAt = performance.now()
  private nextId = 0
  private readyResolve!: (value: { initMs: number; budgetBytes: number }) => void
  private readyReject!: (reason: Error) => void
  private disposed = false
  private workerInitMs = 0
  private budgetBytes = 0
  private staticWorkerCount = 0

  constructor(characters: VideoExportCharacterSnapshot, characterAssets: VideoCharacterRenderAssetSnapshot) {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
      throw new Error('Worker/OffscreenCanvas/createImageBitmap indisponível neste Electron.')
    }
    this.ready = new Promise((resolve, reject) => { this.readyResolve = resolve; this.readyReject = reject })
    this.worker = new Worker(new URL('./videoCharacterFrameRender.worker.ts', import.meta.url), { type: 'module' })
    this.worker.addEventListener('message', event => this.onMessage(event.data as WorkerResponse))
    this.worker.addEventListener('error', event => this.failAll(new Error(event.message || 'Worker Gacha encerrou com erro.')))
    this.worker.addEventListener('messageerror', () => this.failAll(new Error('Resposta inválida do Worker Gacha.')))
    this.staticWorkerCount = 1
    try {
      this.worker.postMessage({ type: 'init', characters, characterAssets })
    } catch (error) {
      this.failAll(asError(error))
    }
  }

  private onMessage(response: WorkerResponse): void {
    if (!response || typeof response !== 'object') return
    if (response.type === 'ready') {
      this.workerInitMs = Number(response.initMs) || 0
      this.budgetBytes = Number(response.budgetBytes) || 0
      this.readyResolve({ initMs: this.workerInitMs, budgetBytes: this.budgetBytes })
      return
    }
    if (response.type === 'error' && (!Number.isSafeInteger(response.id) || response.id === 0)) {
      this.failAll(new Error(response.error ?? 'Worker Gacha não inicializou.'))
      return
    }
    const id = Number(response.id)
    const pending = this.pending.get(id)
    if (!pending) {
      for (const entry of response.states ?? []) {
        const image = entry.state.canvasImage
        if (image instanceof ImageBitmap) image.close()
      }
      return
    }
    this.pending.delete(id)
    pending.cleanup()
    const error = response.type === 'error' ? new Error(response.error ?? 'Worker Gacha falhou.') : null
    if (error || pending.cancelled) {
      for (const entry of response.states ?? []) {
        const image = entry.state.canvasImage
        if (image instanceof ImageBitmap) image.close()
      }
      pending.reject(error ?? new DOMException('Renderização Gacha cancelada.', 'AbortError'))
      return
    }
    if (response.type !== 'frame' || response.frame !== pending.frame || !response.timings || !Array.isArray(response.states)) {
      for (const entry of response.states ?? []) {
        if (entry.state.canvasImage instanceof ImageBitmap) entry.state.canvasImage.close()
      }
      pending.reject(new Error('Resposta do Worker Gacha não corresponde ao frame solicitado.'))
      return
    }
    pending.resolve({
      states: new Map(response.states.map(({ elementId, state }) => [elementId, state])),
      timings: response.timings,
      roundTripMs: Math.max(0, performance.now() - pending.startedAt),
      postMessageMs: pending.postMessageMs,
    })
  }

  private failAll(reason: Error): void {
    if (!this.disposed) {
      this.disposed = true
      this.worker.terminate()
    }
    this.readyReject(reason)
    for (const [id, pending] of this.pending) {
      this.pending.delete(id)
      pending.cleanup()
      pending.reject(reason)
    }
  }

  async waitUntilReady(): Promise<{ initMs: number; startupRoundTripMs: number; budgetBytes: number; workers: number }> {
    const ready = await this.ready
    return {
      ...ready,
      startupRoundTripMs: Math.max(0, performance.now() - this.initStartedAt),
      workers: this.staticWorkerCount,
    }
  }

  async renderFrame(frame: VideoSceneFrame, signal?: AbortSignal): Promise<VideoCharacterWorkerFrame> {
    signal?.throwIfAborted()
    await this.ready
    if (this.disposed) throw new Error('Worker Gacha já foi encerrado.')
    if (this.pending.size) throw new Error('Backpressure: há um frame Gacha em voo.')
    const compact = compactFrame(frame)
    const id = ++this.nextId
    const startedAt = performance.now()
    return await new Promise<VideoCharacterWorkerFrame>((resolve, reject) => {
      const abort = () => {
        const pending = this.pending.get(id)
        if (!pending || pending.cancelled) return
        pending.cancelled = true
        try { this.worker.postMessage({ type: 'cancel', id }) } catch {}
      }
      const timeout = setTimeout(() => this.failAll(new Error('Worker Gacha excedeu 60 segundos no render de frame.')), 60_000)
      const cleanup = () => {
        clearTimeout(timeout)
        signal?.removeEventListener('abort', abort)
      }
      const pending: Pending = {
        frame: frame.frame, resolve, reject, signal, abort, cleanup,
        startedAt, postMessageMs: 0, cancelled: false,
      }
      this.pending.set(id, pending)
      signal?.addEventListener('abort', abort, { once: true })
      const postedAt = performance.now()
      try {
        this.worker.postMessage({ type: 'frame', id, frame: compact })
        pending.postMessageMs = performance.now() - postedAt
      } catch (error) {
        this.pending.delete(id)
        cleanup()
        reject(asError(error))
      }
      if (signal?.aborted) abort()
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.worker.terminate()
    const error = new DOMException('Worker Gacha encerrado.', 'AbortError')
    this.readyReject(error)
    for (const [id, pending] of this.pending) {
      this.pending.delete(id)
      pending.cleanup()
      pending.reject(error)
    }
  }
}
