import type { EditorV6ExportPart, EditorV6FrameMetrics } from '../../../src/shared/editorV6Export'
import type { EditorV6FrameWorker } from './exportWorkers'
import {
  addEditorV6FrameMetrics,
  recordEditorV6Timing,
  recordEditorV6Timings,
  type EditorV6TimingAccumulators
} from './exportMetrics'

type FrameCounters = {
  rendered: number
  reused: number
  frames: number
  frameSequenceDiagnostics?: EditorV6FrameSequenceDiagnostics
}

export type EditorV6FrameSequenceDiagnostics = {
  frameCount: number
  rawBytesWritten: number
  runLengths: number[]
  runCount: number
  repeatedRunCount: number
  repeatedFrames: number
  averageRunLength: number
  medianRunLength: number
  maximumRunLength: number
  avoidableBytesIfOneFramePerRun: number
  backgroundConstantForegroundChangedFrames: number
}

export type EditorV6FrameWriteTimelineSample = {
  frame: number
  startOffsetMs: number
  endOffsetMs: number
  writeWaitMs: number
  backpressureMs: number
  backpressureStartOffsetMs?: number
  backpressureEndOffsetMs?: number
  bytes: number
  identicalToPrevious: boolean
}

type Dependencies = {
  worker: Pick<EditorV6FrameWorker, 'frame'>
  part: Pick<EditorV6ExportPart, 'startFrame' | 'endFrame'>
  signal: AbortSignal
  counters: FrameCounters
  timingAccumulators?: EditorV6TimingAccumulators
  frameMetrics?: EditorV6FrameMetrics
  collectDiagnostics?: boolean
  writeFrame: (
    bitmap: Buffer,
    frame: number
  ) => Promise<void | { bytesWritten?: number; backpressureMs?: number; backpressureStartAt?: number; backpressureEndAt?: number }>
  onFrameWritten: () => void
  /** Overlap exactly one independent frame render with the preceding encoder write. */
  overlapEncoding?: boolean
  diagnosticLayerBytes?: number
  diagnosticExportStartedAt?: number
  onDiagnosticWrite?: (sample: EditorV6FrameWriteTimelineSample) => void
  now?: () => number
}

/** Streams rendered frames to FFmpeg; per-frame diagnostics are opt-in. */
export async function renderAndWriteEditorV6Frames(dependencies: Dependencies): Promise<void> {
  const { worker, part, signal, counters, timingAccumulators, frameMetrics, writeFrame, onFrameWritten } = dependencies
  const collectDiagnostics = dependencies.collectDiagnostics === true
  const now = collectDiagnostics ? dependencies.now ?? (() => performance.now()) : () => 0
  let previousBitmap: Buffer | undefined
  let currentRunLength = 0
  const runLengths = collectDiagnostics ? [] as number[] : undefined
  let repeatedFrames = 0
  let backgroundConstantForegroundChangedFrames = 0
  let identicalToPrevious = false

  // Ordinary offscreen captures own independent BGRA buffers. The encoder can
  // consume one while the Chromium worker renders the next. Layered capture
  // reuses an assembly buffer, so the caller must keep this path disabled.
  const renderFrame = async (frame: number) => {
    const started = collectDiagnostics ? now() : 0
    const value = await worker.frame(frame)
    return { value, elapsedMs: collectDiagnostics ? now() - started : 0 }
  }
  type RenderedFrame = Awaited<ReturnType<typeof renderFrame>>
  type Lookahead = { ok: true; value: RenderedFrame } | { ok: false; error: unknown }
  let nextFrame: Promise<Lookahead> | undefined

  for (let frame = part.startFrame; frame < part.endFrame; frame++) {
    signal.throwIfAborted()
    let rendered: RenderedFrame
    if (nextFrame) {
      const outcome = await nextFrame
      if (!outcome.ok) throw outcome.error
      rendered = outcome.value
    } else {
      rendered = await renderFrame(frame)
    }
    nextFrame = undefined

    // Count diagnostics only when consuming a frame, not for speculative
    // lookahead that may have completed just as FFmpeg fails its prior write.
    if (collectDiagnostics && timingAccumulators) {
      recordEditorV6Timing(timingAccumulators, 'frameRoundTripMs', rendered.elapsedMs)
      recordEditorV6Timings(timingAccumulators, rendered.value.timings)
    }
    if (collectDiagnostics && frameMetrics) addEditorV6FrameMetrics(frameMetrics, rendered.value.metrics)
    const precedingBitmap = previousBitmap
    const wasReused = rendered.value.reused && Boolean(precedingBitmap)
    if (wasReused) counters.reused++
    else {
      if (!rendered.value.bitmap) throw Error('O renderizador não entregou o bitmap.')
      previousBitmap = rendered.value.bitmap
      counters.rendered++
    }

    if (collectDiagnostics && dependencies.onDiagnosticWrite && previousBitmap) {
      const sameAsPrevious =
        frame > part.startFrame &&
        (wasReused ||
          Boolean(precedingBitmap && rendered.value.bitmap && precedingBitmap.equals(rendered.value.bitmap)))
      identicalToPrevious = sameAsPrevious
      if (sameAsPrevious) {
        currentRunLength++
        repeatedFrames++
      } else {
        if (currentRunLength > 0) runLengths?.push(currentRunLength)
        currentRunLength = 1
      }
      const layerBytes = dependencies.diagnosticLayerBytes
      if (layerBytes && frame > part.startFrame && !wasReused && precedingBitmap && rendered.value.bitmap) {
        const sameBackground = precedingBitmap
          .subarray(0, layerBytes)
          .equals(rendered.value.bitmap.subarray(0, layerBytes))
        const sameForeground = precedingBitmap
          .subarray(layerBytes, layerBytes * 2)
          .equals(rendered.value.bitmap.subarray(layerBytes, layerBytes * 2))
        if (sameBackground && !sameForeground) backgroundConstantForegroundChangedFrames++
      }
    }

    const bitmapToWrite = previousBitmap
    if (!bitmapToWrite) throw Error('O pipeline não tem um quadro anterior para enviar.')
    const writeStarted = collectDiagnostics ? now() : 0
    const writing = writeFrame(bitmapToWrite, frame)
    let nextRenderFinishedAt: number | undefined
    if (dependencies.overlapEncoding && frame + 1 < part.endFrame && !signal.aborted) {
      // A fast failed render must not cause an unhandled rejection while the
      // preceding FFmpeg write is still waiting for backpressure.
      nextFrame = renderFrame(frame + 1).then(
        (value): Lookahead => {
          if (collectDiagnostics) nextRenderFinishedAt = now()
          return { ok: true, value }
        },
        (error): Lookahead => ({ ok: false, error })
      )
    }
    // Never queue a second stream write before the first callback finishes.
    // The old BGRA view remains alive and frame ordering is preserved.
    const writeResult = await writing
    const writeFinishedAt = collectDiagnostics ? now() : 0
    if (collectDiagnostics && timingAccumulators) {
      recordEditorV6Timing(timingAccumulators, 'ffmpegWriteMs', writeFinishedAt - writeStarted)
      const uncoveredFrom = nextFrame ? (nextRenderFinishedAt ?? writeFinishedAt) : writeStarted
      recordEditorV6Timing(timingAccumulators, 'ffmpegWriteUncoveredMs', writeFinishedAt - uncoveredFrom)
    }
    if (collectDiagnostics && dependencies.onDiagnosticWrite)
      dependencies.onDiagnosticWrite({
        frame,
        startOffsetMs: writeStarted - (dependencies.diagnosticExportStartedAt ?? 0),
        endOffsetMs: writeFinishedAt - (dependencies.diagnosticExportStartedAt ?? 0),
        writeWaitMs: writeFinishedAt - writeStarted,
        backpressureMs: writeResult?.backpressureMs ?? 0,
        ...(writeResult && typeof writeResult === 'object' && writeResult.backpressureStartAt !== undefined
          ? {
              backpressureStartOffsetMs: writeResult.backpressureStartAt - (dependencies.diagnosticExportStartedAt ?? 0)
            }
          : {}),
        ...(writeResult && typeof writeResult === 'object' && writeResult.backpressureEndAt !== undefined
          ? { backpressureEndOffsetMs: writeResult.backpressureEndAt - (dependencies.diagnosticExportStartedAt ?? 0) }
          : {}),
        bytes: writeResult?.bytesWritten ?? bitmapToWrite.length,
        identicalToPrevious
      })
    counters.frames++
    onFrameWritten()
  }

  if (collectDiagnostics && dependencies.onDiagnosticWrite && currentRunLength > 0) runLengths?.push(currentRunLength)
  if (collectDiagnostics && dependencies.onDiagnosticWrite && runLengths) {
    const sorted = [...runLengths].sort((left, right) => left - right)
    const middle = Math.floor(sorted.length / 2)
    const medianRunLength = sorted.length % 2 ? sorted[middle] : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    const repeatedRunCount = runLengths.filter((length) => length > 1).length
    const bytesPerFrame = previousBitmap?.length ?? 0
    const frameCount = runLengths.reduce((total, length) => total + length, 0)
    const rawBytesWritten = frameCount * bytesPerFrame
    const diagnostics: EditorV6FrameSequenceDiagnostics = {
      frameCount,
      rawBytesWritten,
      runLengths,
      runCount: runLengths.length,
      repeatedRunCount,
      repeatedFrames,
      averageRunLength: runLengths.length ? Number((frameCount / runLengths.length).toFixed(3)) : 0,
      medianRunLength,
      maximumRunLength: Math.max(0, ...runLengths),
      avoidableBytesIfOneFramePerRun: repeatedFrames * bytesPerFrame,
      backgroundConstantForegroundChangedFrames
    }
    dependencies.counters.frameSequenceDiagnostics = diagnostics
  }
}
