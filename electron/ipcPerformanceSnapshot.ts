export type IpcPerformanceMetric = {
  calls: number
  failures: number
  totalMs: number
  worstMs: number
}

export type IpcPerformanceSnapshotRow = {
  channel: string
  calls: number
  failures: number
  averageMs: number
  worstMs: number
}

export function createIpcPerformanceSnapshot(
  metrics: ReadonlyMap<string, IpcPerformanceMetric>,
): IpcPerformanceSnapshotRow[] {
  return [...metrics].map(([channel, metric]) => ({
    channel,
    calls: metric.calls,
    failures: metric.failures,
    averageMs: metric.calls > 0 ? +((metric.totalMs / metric.calls).toFixed(2)) : 0,
    worstMs: +metric.worstMs.toFixed(2),
  }))
}
