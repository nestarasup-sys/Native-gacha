import type { VideoStudioResourceBudget, VideoStudioBudgetLease } from './resourceBudget'

type Job<T> = Readonly<{
  run: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}>

/**
 * One large Gacha raster recipe at a time, with a finite waiting queue.
 * Reserves a conservative workspace estimate BEFORE calling Chromium Canvas
 * renderers. The reservation is a pressure/admission guard, NOT a claim to
 * bound native/decoded PNG/VRAM usage exactly.
 */
export class VideoStudioRasterAdmission {
  private readonly waiting: Array<Job<unknown>> = []
  private active = false
  private disposed = false

  constructor(
    private readonly budget?: VideoStudioResourceBudget,
    readonly estimatedWorkBytes = 16 * 1024 * 1024,
    readonly maxWaiting = 8,
    private readonly evictDerivedCache?: () => void
  ) {
    if (!Number.isSafeInteger(estimatedWorkBytes) || estimatedWorkBytes < 1
      || !Number.isSafeInteger(maxWaiting) || maxWaiting < 0) {
      throw new RangeError('Invalid Gacha raster admission limits')
    }
  }

  private startNext(): void {
    if (this.active || this.disposed) return
    const job = this.waiting.shift()
    if (!job) return

    let lease: VideoStudioBudgetLease | null | undefined
    try {
      lease = this.budget?.tryReserve('render-work', this.estimatedWorkBytes)
      if (this.budget && !lease) {
        // Cached derived artwork is disposable; source models and snapshots
        // are never removed by this pressure handler.
        this.evictDerivedCache?.()
        lease = this.budget.tryReserve('render-work', this.estimatedWorkBytes)
      }
    } catch (reason) {
      job.reject(reason)
      this.startNext()
      return
    }
    if (this.budget && !lease) {
      const snapshot = this.budget.snapshot()
      job.reject(new Error(
        `Orçamento de memória insuficiente antes de renderizar o personagem Gacha `
        + `(usado=${snapshot.usedBytes}, limite=${snapshot.limitBytes}, necessário=${this.estimatedWorkBytes} bytes).`
      ))
      this.startNext()
      return
    }

    this.active = true
    const complete = () => {
      lease?.release()
      this.active = false
      this.startNext()
    }
    // Release the reservation BEFORE notifying the caller that the work has
    // settled. Promise.finally() after resolve/reject would expose stale
    // usedBytes to downstream jobs and could trigger spurious budget denials.
    void Promise.resolve().then(job.run).then(
      (value) => { complete(); job.resolve(value) },
      (reason) => { complete(); job.reject(reason) }
    )
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    if (this.disposed) return Promise.reject(new Error('Renderizador Gacha descartado.'))
    if (this.active && this.waiting.length >= this.maxWaiting) {
      return Promise.reject(new Error('Fila de renderização Gacha saturada.'))
    }
    return new Promise<T>((resolve, reject) => {
      this.waiting.push({ run: task, resolve, reject } as Job<unknown>)
      this.startNext()
    })
  }

  status(): Readonly<{ active: boolean; waiting: number; disposed: boolean }> {
    return { active: this.active, waiting: this.waiting.length, disposed: this.disposed }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const item of this.waiting.splice(0)) {
      item.reject(new Error('Renderizador Gacha descartado.'))
    }
    // The active raster cannot be force-cancelled by TS alone; its lease will
    // be released by its own finally when the renderer settles.
  }
}
