import { createIpcPerformanceSnapshot, type IpcPerformanceMetric } from '../ipcPerformanceSnapshot'
import type { IpcPerformanceDiagnosticsSnapshot } from '../../src/shared/dataManagement'

export const MAX_IPC_PERFORMANCE_COLLECTION_MS = 5 * 60 * 1000
const SAFE_IPC_CHANNEL = /^[a-z][a-z0-9:_-]{1,127}$/

export function createIpcPerformanceCollector(options: {
  initiallyEnabled?: boolean
  now?: () => number
  nowIso?: () => string
  maxDurationMs?: number
} = {}) {
  const now = options.now ?? (() => performance.now())
  const nowIso = options.nowIso ?? (() => new Date().toISOString())
  const maxDurationMs = options.maxDurationMs ?? MAX_IPC_PERFORMANCE_COLLECTION_MS
  const metrics = new Map<string, IpcPerformanceMetric>()
  let enabled = false
  let startedAt: string | null = null
  let startedAtMs: number | null = null
  let stoppedAtMs: number | null = null

  function stopIfExpired(currentTime?: number): void {
    if (!enabled || startedAtMs === null) return
    const measuredAt = currentTime ?? now()
    if (measuredAt - startedAtMs >= maxDurationMs) {
      enabled = false
      stoppedAtMs = startedAtMs + maxDurationMs
    }
  }

  function snapshot(): IpcPerformanceDiagnosticsSnapshot {
    const currentTime = now()
    stopIfExpired(currentTime)
    const durationMs = startedAtMs === null ? 0
      : Math.min(maxDurationMs, Math.max(0, (enabled ? currentTime : stoppedAtMs ?? currentTime) - startedAtMs))
    return {
      enabled,
      startedAt,
      durationMs: Math.round(durationMs),
      maxDurationMs,
      rows: createIpcPerformanceSnapshot(metrics)
        .sort((left, right) => right.worstMs - left.worstMs || right.calls - left.calls || left.channel.localeCompare(right.channel))
    }
  }

  function isEnabled(): boolean {
    stopIfExpired()
    return enabled
  }

  function setEnabled(nextEnabled: boolean): IpcPerformanceDiagnosticsSnapshot {
    stopIfExpired()
    if (nextEnabled === enabled) return snapshot()
    if (nextEnabled) {
      metrics.clear()
      startedAt = nowIso()
      startedAtMs = now()
      stoppedAtMs = null
      enabled = true
    } else {
      enabled = false
      stoppedAtMs = now()
    }
    return snapshot()
  }

  async function measure<T>(channel: string, action: () => Promise<T> | T): Promise<T> {
    stopIfExpired()
    if (!enabled) return action()
    const began = now()
    let failed = false
    try { return await action() }
    catch (reason) { failed = true; throw reason }
    finally {
      const ended = now()
      stopIfExpired(ended)
      const withinCollectionWindow = startedAtMs !== null
        && began >= startedAtMs
        && ended <= startedAtMs + maxDurationMs
        && (stoppedAtMs === null || ended <= stoppedAtMs)
      if (withinCollectionWindow && SAFE_IPC_CHANNEL.test(channel)) {
        let metric = metrics.get(channel)
        if (!metric) { metric = { calls: 0, failures: 0, totalMs: 0, worstMs: 0 }; metrics.set(channel, metric) }
        const elapsed = Math.max(0, ended - began)
        metric.calls += 1
        if (failed) metric.failures += 1
        metric.totalMs += elapsed
        metric.worstMs = Math.max(metric.worstMs, elapsed)
      }
    }
  }

  if (options.initiallyEnabled) setEnabled(true)
  return { measure, snapshot, setEnabled, isEnabled }
}
