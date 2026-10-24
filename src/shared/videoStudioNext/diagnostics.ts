/**
 * On-demand, privacy-minimal Electron process metrics for Video Studio on Windows.
 * Electron memory fields are KiB (NOT bytes), while os/process counters use bytes.
 * GPU/FFmpeg/native child allocations require the Windows ETW/CIM probe.
 */
export type VideoStudioElectronMetric = Readonly<{
  pid: number
  type: string
  workingSetKiB: number
  peakWorkingSetKiB: number
  privateBytesKiB: number
}>

export type VideoStudioProcessFailure = Readonly<{
  occurredAt: string
  kind: 'renderer' | 'child'
  reason: string
  exitCode: number
}>

export type VideoStudioMemoryReport = Readonly<{
  sampledAt: string
  platform: string
  mainPid: number
  totalRamBytes: number
  freeRamBytes: number
  mainRssBytes: number
  electronProcesses: ReadonlyArray<VideoStudioElectronMetric>
  recentProcessFailures: ReadonlyArray<VideoStudioProcessFailure>
  reportedWorkingSetKiB: number
  reportedPrivateBytesKiB: number
  /** Not inferred: this API has no trustworthy process-tree FFmpeg or VRAM totals. */
  ffmpegAndOtherChildrenIncluded: false
  gpuDedicatedBytes: null
}>

type RawMetric = Readonly<{
  pid: number
  type: string
  memory?: {
    workingSetSize?: number
    peakWorkingSetSize?: number
    privateBytes?: number
  }
}>

/** No paths, project names, document contents or command lines are recorded. */
export function videoStudioMemoryReport(
  metrics: ReadonlyArray<RawMetric>,
  host: Readonly<{
    sampledAt: string; platform: string; mainPid: number
    totalRamBytes: number; freeRamBytes: number; mainRssBytes: number
    recentProcessFailures?: ReadonlyArray<VideoStudioProcessFailure>
  }>
): VideoStudioMemoryReport {
  const safeKiB = (input: unknown) =>
    typeof input === 'number' && Number.isFinite(input) && input >= 0 ? Math.round(input) : 0
  const processes = metrics.filter(({ pid }) => Number.isSafeInteger(pid) && pid > 0)
    .map((process) => ({
      pid: process.pid,
      type: process.type,
      workingSetKiB: safeKiB(process.memory?.workingSetSize),
      peakWorkingSetKiB: safeKiB(process.memory?.peakWorkingSetSize),
      privateBytesKiB: safeKiB(process.memory?.privateBytes),
    }))
  return {
    ...host,
    electronProcesses: processes,
    recentProcessFailures: [...(host.recentProcessFailures ?? [])],
    reportedWorkingSetKiB: processes.reduce((sum, p) => sum + p.workingSetKiB, 0),
    reportedPrivateBytesKiB: processes.reduce((sum, p) => sum + p.privateBytesKiB, 0),
    ffmpegAndOtherChildrenIncluded: false,
    gpuDedicatedBytes: null,
  }
}
