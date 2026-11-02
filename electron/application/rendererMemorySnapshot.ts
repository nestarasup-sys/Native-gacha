import type { ProcessMetric, WebContents } from 'electron'
import type { RuntimeDiagnosticsSnapshot } from '../../src/shared/dataManagement'

type RendererMemorySnapshot = Pick<RuntimeDiagnosticsSnapshot['memory'],
  'rendererWorkingSetBytes' | 'rendererPeakWorkingSetBytes' | 'rendererPrivateBytes' | 'rendererSharedBytes'>

const unavailableRendererMemory = (): RendererMemorySnapshot => ({
  rendererWorkingSetBytes: null,
  rendererPeakWorkingSetBytes: null,
  rendererPrivateBytes: null,
  rendererSharedBytes: null
})

function bytesFromKilobytes(value: number | undefined): number | null {
  return Number.isFinite(value) ? Math.round((value ?? 0) * 1024) : null
}

/** Selects this window's OS process and maps Electron's optional memory sample to the diagnostics contract. */
export function selectRendererMemorySnapshot(
  metrics: readonly Pick<ProcessMetric, 'pid' | 'memory'>[],
  renderer: Pick<WebContents, 'getOSProcessId'>
): RendererMemorySnapshot {
  const processMetric = metrics.find((metric) => metric.pid === renderer.getOSProcessId())
  if (!processMetric?.memory) return unavailableRendererMemory()

  return {
    rendererWorkingSetBytes: bytesFromKilobytes(processMetric.memory.workingSetSize),
    rendererPeakWorkingSetBytes: bytesFromKilobytes(processMetric.memory.peakWorkingSetSize),
    rendererPrivateBytes: bytesFromKilobytes(processMetric.memory.privateBytes),
    rendererSharedBytes: null
  }
}
