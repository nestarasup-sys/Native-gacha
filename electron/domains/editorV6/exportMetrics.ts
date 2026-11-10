import type { EditorV6FrameMetrics, EditorV6FrameTimings } from '../../../src/shared/editorV6Export'

export type EditorV6ExportPhase = 'temporarySetup' | 'characterLoading' | 'motionPreparation' | 'encoderProbe' | 'rendering' | 'finalization' | 'publication'
export type EditorV6ExportPhaseTimings = Record<EditorV6ExportPhase, number>
export type EditorV6TimingPhase = keyof EditorV6FrameTimings | 'workerStartupMs' | 'ffmpegFinalizeMs' | 'hairPngEncodeMs' | 'hairPngDecodeMs'
export type EditorV6TimingAccumulator = { count: number; totalMs: number; maxMs: number; histogram: number[] }
export type EditorV6TimingAccumulators = Record<EditorV6TimingPhase, EditorV6TimingAccumulator>
export type EditorV6FrameTimingReport = Partial<Record<EditorV6TimingPhase, { samples: number; totalMs: number; p50Ms: number; p95Ms: number; maxMs: number }>>

const TIMING_BUCKET_MS = .1
const TIMING_BUCKETS = 2001
const TIMING_PHASES = ['workerStartupMs', 'sceneResolutionMs', 'faceCompositionMs', 'hairCompositionMs', 'hairCompositionOtherMs', 'hairMotionStateMs', 'hairLayerDrawMs', 'hairSurfaceComposeMs', 'hairCanvasClearMs', 'hairRigInterpolationMs', 'hairMeshContextCheckMs', 'hairMeshStateSetupMs', 'hairMeshPositionMs', 'hairMeshUploadMs', 'hairMeshTextureUploadMs', 'hairMeshDrawMs', 'hairCanvasBlitMs', 'hairMotionPrewarmMs', 'hairPngEncodeMs', 'hairPngDecodeMs', 'assetPreparationMs', 'reactCommitMs', 'rafWaitMs', 'ipcDrawMs', 'captureMs', 'paintWaitMs', 'capturePageMs', 'captureBitmapMs', 'backgroundCaptureMs', 'foregroundCaptureMs', 'frameRoundTripMs', 'ffmpegWriteMs', 'ffmpegFinalizeMs'] as const satisfies readonly EditorV6TimingPhase[]

export function createEditorV6TimingAccumulators(): EditorV6TimingAccumulators {
  return Object.fromEntries(TIMING_PHASES.map((phase) => [phase, { count: 0, totalMs: 0, maxMs: 0, histogram: Array<number>(TIMING_BUCKETS).fill(0) }])) as EditorV6TimingAccumulators
}

export function recordEditorV6Timing(accumulators: EditorV6TimingAccumulators, phase: EditorV6TimingPhase, milliseconds: number): void {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return
  const stats = accumulators[phase], bucket = Math.min(TIMING_BUCKETS - 1, Math.floor(milliseconds / TIMING_BUCKET_MS))
  stats.count++
  stats.totalMs += milliseconds
  stats.maxMs = Math.max(stats.maxMs, milliseconds)
  stats.histogram[bucket]++
}

export function summarizeEditorV6Timings(accumulators: EditorV6TimingAccumulators): EditorV6FrameTimingReport {
  const report: EditorV6FrameTimingReport = {}
  for (const [phase, stats] of Object.entries(accumulators) as Array<[EditorV6TimingPhase, EditorV6TimingAccumulator]>) {
    if (!stats.count) continue
    const percentile = (fraction: number) => {
      const target = Math.ceil(stats.count * fraction)
      let accumulated = 0
      for (let bucket = 0; bucket < stats.histogram.length; bucket++) {
        accumulated += stats.histogram[bucket]
        if (accumulated >= target) return Number((bucket * TIMING_BUCKET_MS).toFixed(1))
      }
      return 0
    }
    report[phase] = { samples: stats.count, totalMs: Math.round(stats.totalMs * 100) / 100, p50Ms: percentile(.5), p95Ms: percentile(.95), maxMs: Math.round(stats.maxMs * 100) / 100 }
  }
  return report
}

export function addEditorV6FrameMetrics(target: EditorV6FrameMetrics, values: EditorV6FrameMetrics | undefined): void {
  if (!values) return
  for (const [metric, value] of Object.entries(values) as Array<[keyof EditorV6FrameMetrics, number]>) {
    if (!Number.isSafeInteger(value) || value < 0) continue
    target[metric] = (target[metric] ?? 0) + value
  }
}

export function addEditorV6PhaseTime(
  report: { phaseMilliseconds: EditorV6ExportPhaseTimings },
  phase: EditorV6ExportPhase,
  startedAt: number,
  now: () => number = () => performance.now()
): void {
  report.phaseMilliseconds[phase] = Math.round((report.phaseMilliseconds[phase] + now() - startedAt) * 100) / 100
}
