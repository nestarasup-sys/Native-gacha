export type FramePriority = 'visible' | 'seek' | 'prefetch'
type Job<T> = {
  key: string
  priority: number
  generation: number
  work: (signal: AbortSignal) => Promise<T>
  resolve: (result: T) => void
  reject: (error: Error) => void
}
const priorityScore: Record<FramePriority, number> = { visible: 3, seek: 2, prefetch: 1 }

export function frameCancelled(): Error {
  return Object.assign(new Error('Frame obsoleto ou cancelado.'), { name: 'AbortError' })
}

/**
 * Rebuilt preview scheduler. Does not enumerate or pre-render transition
 * samples. Only the exact requested frame may execute, with bounded optional
 * prefetch, request generations and cooperative cancellation.
 *
 * IMPORTANT: AbortSignal only cancels work that cooperates. A process
 * supervisor is responsible for hard-killing unresponsive decoders.
 */
export class VideoFrameScheduler {
  private queue: Job<unknown>[] = []
  private active: { controller: AbortController; job: Job<unknown> } | null = null
  private generation = 0
  private closed = false

  constructor(readonly maxQueued = 3) {
    if (!Number.isSafeInteger(maxQueued) || maxQueued < 0) throw new RangeError('Fila de frames inválida.')
  }

  request<T>(key: string, priority: FramePriority, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(frameCancelled())
    if (!key || !(priority in priorityScore)) return Promise.reject(new Error('Solicitação de frame inválida.'))
    if (priority !== 'prefetch') this.cancel()
    const generation = this.generation
    if (priority === 'prefetch' && this.queue.length >= this.maxQueued) {
      return Promise.reject(frameCancelled())
    }
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ key, priority: priorityScore[priority], generation, work, resolve, reject } as Job<unknown>)
      this.queue.sort((a, b) => b.priority - a.priority)
      this.pump()
    })
  }

  private pump(): void {
    if (this.closed || this.active) return
    const job = this.queue.shift()
    if (!job) return
    if (job.generation !== this.generation) { job.reject(frameCancelled()); this.pump(); return }
    const controller = new AbortController()
    this.active = { controller, job }
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) throw frameCancelled()
      return job.work(controller.signal)
    }).then(
      (result) => {
        if (controller.signal.aborted || job.generation !== this.generation || this.closed) job.reject(frameCancelled())
        else job.resolve(result)
      },
      (error: unknown) => job.reject(controller.signal.aborted ? frameCancelled() :
        error instanceof Error ? error : new Error(String(error)))
    ).finally(() => {
      if (this.active?.job === job) this.active = null
      this.pump()
    })
  }

  /** A seek supersedes all queued jobs and aborts the in-flight renderer. */
  cancel(): void {
    this.generation++
    this.active?.controller.abort()
    for (const job of this.queue.splice(0)) job.reject(frameCancelled())
  }

  status() {
    return { active: Boolean(this.active), waiting: this.queue.length, generation: this.generation, closed: this.closed }
  }

  dispose(): void {
    if (this.closed) return
    this.closed = true
    this.cancel()
  }
}
