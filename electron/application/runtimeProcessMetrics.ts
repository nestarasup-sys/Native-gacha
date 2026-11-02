import type { ProcessMetric } from 'electron'
import type { RuntimeProcessMetric } from '../../src/shared/dataManagement'

type RuntimeProcessMetricInput = Pick<ProcessMetric,
  'pid' | 'type' | 'name' | 'serviceName' | 'cpu' | 'memory'>

function bytesFromKilobytes(value: number | undefined): number | null {
  return Number.isFinite(value) && (value ?? -1) >= 0 ? Math.round((value ?? 0) * 1024) : null
}

function safeProcessLabel(value: string | undefined, fallback: string): string {
  const label = value?.trim()
  if (!label || label.length > 64 || /[\\/:@]/.test(label) || /\.\./.test(label) || /https?/i.test(label)) return fallback
  const normalized = label.replace(/[^\p{L}\p{N} _().-]/gu, '').trim()
  return normalized || fallback
}

function kindForProcess(metric: RuntimeProcessMetricInput, mainPid: number, rendererPid: number): RuntimeProcessMetric['kind'] {
  if (metric.pid === mainPid) return 'main'
  if (metric.pid === rendererPid) return 'renderer'
  return metric.type === 'Utility' || metric.type === 'GPU' || metric.type === 'Zygote' || metric.type === 'Sandbox helper'
    ? 'auxiliary'
    : 'other'
}

function labelForProcess(metric: RuntimeProcessMetricInput, kind: RuntimeProcessMetric['kind']): string {
  if (kind === 'main') return 'Electron Main'
  if (kind === 'renderer') return 'Janela do Native-gacha'
  const fallback = metric.type === 'Utility' ? 'Processo auxiliar' : metric.type
  return safeProcessLabel(metric.serviceName, safeProcessLabel(metric.name, fallback))
}

/** Maps Electron metrics into a local-safe shape, converting memory KB to bytes exactly once. */
export function mapRuntimeProcessMetrics(
  metrics: readonly RuntimeProcessMetricInput[],
  options: { mainPid: number; rendererPid: number; sampleIntervalMs: number | null }
): RuntimeProcessMetric[] {
  return metrics.map((metric) => {
    const kind = kindForProcess(metric, options.mainPid, options.rendererPid)
    const percentCPUUsage = metric.cpu.percentCPUUsage
    return {
      pid: metric.pid,
      kind,
      type: metric.type,
      label: labelForProcess(metric, kind),
      cpuPercent: options.sampleIntervalMs !== null && options.sampleIntervalMs > 0 && Number.isFinite(percentCPUUsage) && percentCPUUsage >= 0
        ? percentCPUUsage
        : null,
      workingSetBytes: bytesFromKilobytes(metric.memory?.workingSetSize),
      peakWorkingSetBytes: bytesFromKilobytes(metric.memory?.peakWorkingSetSize),
      privateBytes: bytesFromKilobytes(metric.memory?.privateBytes)
    }
  })
}
