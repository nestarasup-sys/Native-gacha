/**
 * Local admission ledger for the rebuilt Video Studio.
 * Not a process-tree RAM/VRAM limiter: later EngineSupervisor work must include
 * per-PID measurements, decoders, native buffers, GPU and in-flight resources.
 */
export type VideoStudioResourceCategory =
  | 'artwork' | 'texture' | 'video-decoder' | 'audio' | 'preview' | 'export' | 'ipc' | 'render-work' | 'other'

export type VideoStudioBudgetLease = Readonly<{
  id: number
  category: VideoStudioResourceCategory
  bytes: number
  release: () => void
}>

export type VideoStudioBudgetSnapshot = Readonly<{
  limitBytes: number
  softLimitBytes: number
  usedBytes: number
  availableBytes: number
  pressure: boolean
  activeLeases: number
  byCategory: Readonly<Record<string, number>>
}>

export class VideoStudioResourceBudget {
  private readonly leases = new Map<number, { category: VideoStudioResourceCategory; bytes: number }>()
  private nextId = 1
  private usedBytes = 0
  private disposed = false

  constructor(
    readonly limitBytes: number,
    readonly softLimitBytes: number = Math.max(1, Math.floor(limitBytes * 0.85))
  ) {
    if (!Number.isSafeInteger(limitBytes) || limitBytes < 1
      || !Number.isSafeInteger(softLimitBytes) || softLimitBytes < 1 || softLimitBytes > limitBytes) {
      throw new RangeError('Invalid video resource budget in bytes.')
    }
  }

  tryReserve(category: VideoStudioResourceCategory, bytes: number): VideoStudioBudgetLease | null {
    if (this.disposed) return null
    if (!Number.isSafeInteger(bytes) || bytes < 1) throw new RangeError('Invalid reservation size.')
    if (bytes > this.limitBytes - this.usedBytes) return null
    const id = this.nextId++
    this.leases.set(id, { category, bytes })
    this.usedBytes += bytes
    return Object.freeze({ id, category, bytes, release: () => this.release(id) })
  }

  private release(id: number): void {
    const entry = this.leases.get(id)
    if (!entry) return
    this.leases.delete(id)
    this.usedBytes -= entry.bytes
  }

  snapshot(): VideoStudioBudgetSnapshot {
    const byCategory: Record<string, number> = Object.create(null) as Record<string, number>
    for (const { category, bytes } of this.leases.values()) {
      byCategory[category] = (byCategory[category] ?? 0) + bytes
    }
    return {
      limitBytes: this.limitBytes,
      softLimitBytes: this.softLimitBytes,
      usedBytes: this.usedBytes,
      availableBytes: this.limitBytes - this.usedBytes,
      pressure: this.usedBytes >= this.softLimitBytes,
      activeLeases: this.leases.size,
      byCategory,
    }
  }

  dispose(): void {
    this.disposed = true
    this.leases.clear()
    this.usedBytes = 0
  }
}
