import type { ProcessMetric } from 'electron'

type ProcessMemoryMetric = Pick<ProcessMetric, 'type' | 'memory'>
type ProcessMemoryPeak = { processCount: number; workingSetBytes: number; privateBytes: number }

export type EditorV6ExportProcessMemoryReport = {
  sampleIntervalMs: number
  sampleCount: number
  failedSamples: number
  workingSetCompleteSamples: number
  privateBytesCompleteSamples: number
  peakTotalWorkingSetBytes: number
  peakTotalPrivateBytes: number
  peakByType: Partial<Record<ProcessMetric['type'], ProcessMemoryPeak>>
}

type ProcessMemorySums = {
  processCount: number
  workingSetBytes: number
  privateBytes: number
  workingSetComplete: boolean
  privateBytesComplete: boolean
}

const kilobytesToBytes = (value: number | undefined): number | undefined =>
  Number.isFinite(value) && (value ?? -1) >= 0 ? Math.round((value ?? 0) * 1024) : undefined

export function createEditorV6ExportProcessMemoryReport(sampleIntervalMs = 1000): EditorV6ExportProcessMemoryReport {
  return {
    sampleIntervalMs,
    sampleCount: 0,
    failedSamples: 0,
    workingSetCompleteSamples: 0,
    privateBytesCompleteSamples: 0,
    peakTotalWorkingSetBytes: 0,
    peakTotalPrivateBytes: 0,
    peakByType: {}
  }
}

/** Accumulates Electron process-memory peaks without retaining PIDs or process names. */
export function recordEditorV6ExportProcessMemorySample(
  report: EditorV6ExportProcessMemoryReport,
  metrics: readonly ProcessMemoryMetric[]
): void {
  report.sampleCount += 1
  const byType = new Map<ProcessMetric['type'], ProcessMemorySums>()

  for (const metric of metrics) {
    const current = byType.get(metric.type) ?? {
      processCount: 0,
      workingSetBytes: 0,
      privateBytes: 0,
      workingSetComplete: true,
      privateBytesComplete: true
    }
    const workingSetBytes = kilobytesToBytes(metric.memory?.workingSetSize)
    const privateBytes = kilobytesToBytes(metric.memory?.privateBytes)
    current.processCount += 1
    if (workingSetBytes === undefined) current.workingSetComplete = false
    else current.workingSetBytes += workingSetBytes
    if (privateBytes === undefined) current.privateBytesComplete = false
    else current.privateBytes += privateBytes
    byType.set(metric.type, current)
  }

  const hasProcesses = metrics.length > 0
  const totalWorkingSetComplete = hasProcesses && [...byType.values()].every(value => value.workingSetComplete)
  const totalPrivateBytesComplete = hasProcesses && [...byType.values()].every(value => value.privateBytesComplete)
  if (totalWorkingSetComplete) {
    report.workingSetCompleteSamples += 1
    report.peakTotalWorkingSetBytes = Math.max(report.peakTotalWorkingSetBytes, [...byType.values()].reduce((sum, value) => sum + value.workingSetBytes, 0))
  }
  if (totalPrivateBytesComplete) {
    report.privateBytesCompleteSamples += 1
    report.peakTotalPrivateBytes = Math.max(report.peakTotalPrivateBytes, [...byType.values()].reduce((sum, value) => sum + value.privateBytes, 0))
  }

  for (const [type, current] of byType) {
    const previous = report.peakByType[type] ?? { processCount: 0, workingSetBytes: 0, privateBytes: 0 }
    report.peakByType[type] = {
      processCount: Math.max(previous.processCount, current.processCount),
      workingSetBytes: current.workingSetComplete
        ? Math.max(previous.workingSetBytes, current.workingSetBytes)
        : previous.workingSetBytes,
      privateBytes: current.privateBytesComplete
        ? Math.max(previous.privateBytes, current.privateBytes)
        : previous.privateBytes
    }
  }
}

export function recordEditorV6ExportProcessMemorySampleFailure(report: EditorV6ExportProcessMemoryReport): void {
  report.failedSamples += 1
}
