import type { EditorV6ExportPart, EditorV6FrameMetrics } from '../../../src/shared/editorV6Export'
import type { EditorV6FrameWorker } from './exportWorkers'
import { addEditorV6FrameMetrics, recordEditorV6Timing, recordEditorV6Timings, type EditorV6TimingAccumulators } from './exportMetrics'

type FrameCounters = { rendered: number; reused: number; frames: number }

type Dependencies = {
  worker: Pick<EditorV6FrameWorker, 'frame'>
  part: Pick<EditorV6ExportPart, 'startFrame' | 'endFrame'>
  signal: AbortSignal
  counters: FrameCounters
  timingAccumulators: EditorV6TimingAccumulators
  frameMetrics: EditorV6FrameMetrics
  writeFrame: (bitmap: Buffer) => Promise<void>
  onFrameWritten: () => void
  /** Overlap exactly one independent frame render with the preceding encoder write. */
  overlapEncoding?: boolean
  now?: () => number
}

/** Streams rendered frames to FFmpeg and records reuse, timing, and frame metrics for one part. */
export async function renderAndWriteEditorV6Frames(dependencies: Dependencies): Promise<void> {
  const { worker, part, signal, counters, timingAccumulators, frameMetrics, writeFrame, onFrameWritten } = dependencies
  const now = dependencies.now ?? (() => performance.now())
  let previousBitmap: Buffer | undefined

  // Ordinary offscreen captures own independent BGRA buffers. The encoder can
  // consume one while the Chromium worker renders the next. Layered capture
  // reuses an assembly buffer, so the caller must keep this path disabled.
  const renderFrame = async (frame: number) => {
    const started = now()
    const result = await worker.frame(frame)
    recordEditorV6Timing(timingAccumulators, 'frameRoundTripMs', now() - started)
    recordEditorV6Timings(timingAccumulators, result.timings)
    addEditorV6FrameMetrics(frameMetrics, result.metrics)
    return result
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

    if (rendered.reused && previousBitmap) counters.reused++
    else {
      if (!rendered.bitmap) throw Error('O renderizador não entregou o bitmap.')
      previousBitmap = rendered.bitmap
      counters.rendered++
    }

    const writeStarted = now()
    const writing = writeFrame(previousBitmap)
    if (dependencies.overlapEncoding && frame + 1 < part.endFrame && !signal.aborted) {
      // A fast failed render must not cause an unhandled rejection while the
      // preceding FFmpeg write is still waiting for backpressure.
      nextFrame = renderFrame(frame + 1).then(
        (value): Lookahead => ({ ok: true, value }),
        (error): Lookahead => ({ ok: false, error })
      )
    }
    // Never queue a second stream write before the first callback finishes.
    // The old BGRA view remains alive and frame ordering is preserved.
    await writing
    recordEditorV6Timing(timingAccumulators, 'ffmpegWriteMs', now() - writeStarted)
    counters.frames++
    onFrameWritten()
  }
}
