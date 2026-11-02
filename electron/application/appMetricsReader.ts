import type { ProcessMetric } from 'electron'

export type TimedAppMetrics = {
  metrics: ProcessMetric[]
  sampleIntervalMs: number | null
}

/** Tracks the interval Electron uses to calculate percentCPUUsage. */
export function createAppMetricsReader(
  getMetrics: () => ProcessMetric[],
  now: () => number = () => performance.now()
): () => TimedAppMetrics {
  let previousReadAt: number | null = null

  return () => {
    const metrics = getMetrics()
    const readAt = now()
    const sampleIntervalMs = previousReadAt === null ? null : Math.max(0, readAt - previousReadAt)
    previousReadAt = readAt
    return { metrics, sampleIntervalMs }
  }
}
