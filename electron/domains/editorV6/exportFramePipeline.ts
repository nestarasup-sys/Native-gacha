import type { EditorV6ExportPart, EditorV6FrameMetrics } from '../../../src/shared/editorV6Export'
import type { EditorV6FrameWorker } from './exportWorkers'
import { addEditorV6FrameMetrics, recordEditorV6Timing, type EditorV6TimingAccumulators, type EditorV6TimingPhase } from './exportMetrics'

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
  now?: () => number
}

/** Streams rendered frames to FFmpeg and records reuse, timing, and frame metrics for one part. */
export async function renderAndWriteEditorV6Frames(dependencies: Dependencies): Promise<void> {
  const { worker, part, signal, counters, timingAccumulators, frameMetrics, writeFrame, onFrameWritten } = dependencies
  const now = dependencies.now ?? (() => performance.now())
  let previousBitmap: Buffer | undefined

  for (let frame = part.startFrame; frame < part.endFrame; frame++) {
    signal.throwIfAborted()
    const frameStarted = now()
    const rendered = await worker.frame(frame)
    recordEditorV6Timing(timingAccumulators, 'frameRoundTripMs', now() - frameStarted)
    for (const [phase, milliseconds] of Object.entries(rendered.timings ?? {}) as Array<[EditorV6TimingPhase, number]>) {
      recordEditorV6Timing(timingAccumulators, phase, milliseconds)
    }
    addEditorV6FrameMetrics(frameMetrics, rendered.metrics)

    if (rendered.reused && previousBitmap) counters.reused++
    else {
      if (!rendered.bitmap) throw Error('O renderizador não entregou o bitmap.')
      previousBitmap = rendered.bitmap
      counters.rendered++
    }

    const writeStarted = now()
    await writeFrame(previousBitmap)
    recordEditorV6Timing(timingAccumulators, 'ffmpegWriteMs', now() - writeStarted)
    counters.frames++
    onFrameWritten()
  }
}
