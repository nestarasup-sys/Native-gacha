import { describe, expect, it, vi } from 'vitest'
import type { EditorV6FrameWorker } from '../../electron/domains/editorV6/exportWorkers'
import { createEditorV6TimingAccumulators, summarizeEditorV6Timings } from '../../electron/domains/editorV6/exportMetrics'
import { renderAndWriteEditorV6Frames } from '../../electron/domains/editorV6/exportFramePipeline'
import type { EditorV6FrameMetrics, EditorV6FrameTimings } from '../../src/shared/editorV6Export'

function worker(frames: Array<Awaited<ReturnType<EditorV6FrameWorker['frame']>>>) {
  return { frame: vi.fn(async (index: number) => frames[index]!) }
}

function accounting() {
  return {
    counters: { rendered: 0, reused: 0, frames: 0 },
    timingAccumulators: createEditorV6TimingAccumulators(),
    frameMetrics: {} as Record<string, number>
  }
}

describe('pipeline de quadros renderizados do Editor V6', () => {
  it('reutiliza o último bitmap, escreve todos os quadros e agrega métricas', async () => {
    const first = Buffer.from([1, 2, 3])
    const last = Buffer.from([4, 5, 6])
    const renderer = worker([
      { reused: false, bitmap: first, timings: { sceneResolutionMs: 1 }, metrics: { hairRasterFrames: 1 } },
      { reused: true, timings: { sceneResolutionMs: 2 }, metrics: { hairRasterFrames: 1 } },
      { reused: false, bitmap: last, timings: { hairCompositionMs: 3 }, metrics: { hairRasterFrames: 2 } }
    ])
    const state = accounting()
    const writes: Buffer[] = []
    let completedFrames = 0

    await renderAndWriteEditorV6Frames({
      worker: renderer,
      part: { startFrame: 0, endFrame: 3 },
      signal: new AbortController().signal,
      ...state,
      writeFrame: async (bitmap) => { writes.push(bitmap) },
      onFrameWritten: () => { completedFrames++ },
      now: () => 10
    })

    expect(renderer.frame.mock.calls.map(([frame]) => frame)).toEqual([0, 1, 2])
    expect(writes).toEqual([first, first, last])
    expect(state.counters).toEqual({ rendered: 2, reused: 1, frames: 3 })
    expect(completedFrames).toBe(3)
    expect(state.frameMetrics).toEqual({ hairRasterFrames: 4 })
    expect(summarizeEditorV6Timings(state.timingAccumulators).sceneResolutionMs).toMatchObject({ samples: 2, totalMs: 3 })
  })

  it('overlaps one render with the preceding FFmpeg write while bounding the queue', async () => {
    let releaseFirstWrite!: () => void
    const firstWrite = new Promise<void>(resolve => { releaseFirstWrite = resolve })
    let secondFrameStarted!: () => void
    const secondStarted = new Promise<void>(resolve => { secondFrameStarted = resolve })
    let thirdFrameStarted!: () => void
    const thirdStarted = new Promise<void>(resolve => { thirdFrameStarted = resolve })
    const pictures = [Buffer.from([10]), Buffer.from([20]), Buffer.from([30])]
    const renderer = { frame: vi.fn(async (frame: number) => {
      if (frame === 1) secondFrameStarted()
      if (frame === 2) thirdFrameStarted()
      return { reused: false, bitmap: pictures[frame] }
    }) }
    const writeFrame = vi.fn((bitmap: Buffer) => bitmap === pictures[0] ? firstWrite : Promise.resolve())
    const onFrameWritten = vi.fn()
    const state = accounting()
    const exporting = renderAndWriteEditorV6Frames({
      worker: renderer, part: { startFrame: 0, endFrame: 3 },
      signal: new AbortController().signal, ...state,
      writeFrame, onFrameWritten, overlapEncoding: true
    })

    await secondStarted
    expect(renderer.frame.mock.calls.map(([frame]) => frame)).toEqual([0, 1])
    expect(writeFrame).toHaveBeenCalledTimes(1)
    expect(onFrameWritten).not.toHaveBeenCalled()

    releaseFirstWrite()
    await thirdStarted
    await exporting
    expect(renderer.frame.mock.calls.map(([frame]) => frame)).toEqual([0, 1, 2])
    expect(writeFrame.mock.calls.map(([bitmap]) => bitmap)).toEqual(pictures)
    expect(state.counters).toEqual({ rendered: 3, reused: 0, frames: 3 })
    expect(onFrameWritten).toHaveBeenCalledTimes(3)
  })

  it('retains acknowledged frames and observes an early lookahead failure without unhandled rejection', async () => {
    const failure = Error('falha no próximo quadro')
    let releaseWrite!: () => void
    const writing = new Promise<void>(resolve => { releaseWrite = resolve })
    let notifySecond!: () => void
    const secondStarted = new Promise<void>(resolve => { notifySecond = resolve })
    const renderer = { frame: vi.fn(async (frame: number) => {
      if (frame === 1) { notifySecond(); throw failure }
      return { reused: false, bitmap: Buffer.from([42]) }
    }) }
    const writeFrame = vi.fn(() => writing)
    const onFrameWritten = vi.fn()
    const state = accounting()
    const exporting = renderAndWriteEditorV6Frames({
      worker: renderer, part: { startFrame: 0, endFrame: 3 },
      signal: new AbortController().signal, ...state,
      writeFrame, onFrameWritten, overlapEncoding: true
    })

    await secondStarted
    releaseWrite()
    await expect(exporting).rejects.toBe(failure)
    expect(renderer.frame.mock.calls.map(([frame]) => frame)).toEqual([0, 1])
    expect(writeFrame).toHaveBeenCalledTimes(1)
    expect(state.counters).toEqual({ rendered: 1, reused: 0, frames: 1 })
    expect(onFrameWritten).toHaveBeenCalledOnce()
  })

  it('does not prefetch after FFmpeg writing triggers cancellation', async () => {
    const cancellation = Error('cancelado durante a escrita')
    const controller = new AbortController()
    const renderer = worker([
      { reused: false, bitmap: Buffer.from([7]) },
      { reused: false, bitmap: Buffer.from([8]) }
    ])
    const state = accounting()
    await expect(renderAndWriteEditorV6Frames({
      worker: renderer, part: { startFrame: 0, endFrame: 2 },
      signal: controller.signal, ...state, overlapEncoding: true,
      writeFrame: async () => { controller.abort(cancellation) },
      onFrameWritten: vi.fn()
    })).rejects.toBe(cancellation)
    expect(renderer.frame).toHaveBeenCalledTimes(1)
    expect(state.counters.frames).toBe(1)
  })

  it('preserves reuse and all timing metrics with encoding overlap enabled', async () => {
    const first = Buffer.from([1, 3, 5])
    const second = Buffer.from([2, 4, 6])
    const renderer = worker([
      { reused: false, bitmap: first, timings: { captureMs: 2 } },
      { reused: true, timings: { sceneResolutionMs: 1 } },
      { reused: false, bitmap: second, metrics: { captureReadbacks: 1 } }
    ])
    const writes: Buffer[] = []
    const state = accounting()
    await renderAndWriteEditorV6Frames({
      worker: renderer, part: { startFrame: 0, endFrame: 3 },
      signal: new AbortController().signal, ...state, overlapEncoding: true,
      writeFrame: async bitmap => { writes.push(bitmap) }, onFrameWritten: vi.fn()
    })
    expect(writes).toEqual([first, first, second])
    expect(state.counters).toEqual({ rendered: 2, reused: 1, frames: 3 })
    expect(state.frameMetrics).toEqual({ captureReadbacks: 1 })
    const summary = summarizeEditorV6Timings(state.timingAccumulators)
    expect(summary.captureMs?.totalMs).toBe(2)
    expect(summary.sceneResolutionMs?.totalMs).toBe(1)
    expect(summary.ffmpegWriteMs?.samples).toBe(3)
  })

  it('agrega somente campos próprios das métricas por quadro', async () => {
    const timings = Object.assign(Object.create({ sceneResolutionMs: 99 }), { assetPreparationMs: 0.35 }) as EditorV6FrameTimings
    const metrics = Object.assign(Object.create({ hairRasterFrames: 99 }), { captureReadbacks: 1 }) as EditorV6FrameMetrics
    const renderer = worker([{ reused: false, bitmap: Buffer.from([1]), timings, metrics }])
    const state = accounting()

    await renderAndWriteEditorV6Frames({
      worker: renderer,
      part: { startFrame: 0, endFrame: 1 },
      signal: new AbortController().signal,
      ...state,
      writeFrame: vi.fn(async () => undefined),
      onFrameWritten: vi.fn(),
      now: () => 10
    })

    expect(state.frameMetrics).toEqual({ captureReadbacks: 1 })
    const summary = summarizeEditorV6Timings(state.timingAccumulators)
    expect(summary.assetPreparationMs).toMatchObject({ samples: 1, totalMs: 0.35, p50Ms: 0.3 })
    expect(summary.sceneResolutionMs).toBeUndefined()
  })

  it('rejeita bitmap ausente e mantém contadores anteriores se o write falha', async () => {
    const emptyRenderer = worker([{ reused: true }])
    const emptyState = accounting()
    await expect(renderAndWriteEditorV6Frames({
      worker: emptyRenderer,
      part: { startFrame: 0, endFrame: 1 },
      signal: new AbortController().signal,
      ...emptyState,
      writeFrame: vi.fn(async () => undefined),
      onFrameWritten: vi.fn(),
      now: () => 10
    })).rejects.toThrow('O renderizador não entregou o bitmap.')

    const renderer = worker([{ reused: false, bitmap: Buffer.from([9]) }])
    const state = accounting()
    await expect(renderAndWriteEditorV6Frames({
      worker: renderer,
      part: { startFrame: 0, endFrame: 1 },
      signal: new AbortController().signal,
      ...state,
      writeFrame: vi.fn(async () => { throw Error('falha de escrita sintética') }),
      onFrameWritten: vi.fn(),
      now: () => 10
    })).rejects.toThrow('falha de escrita sintética')
    expect(state.counters).toEqual({ rendered: 1, reused: 0, frames: 0 })
  })

  it('interrompe antes de solicitar um quadro após o sinal de cancelamento', async () => {
    const controller = new AbortController()
    const renderer = worker([
      { reused: false, bitmap: Buffer.from([1]) },
      { reused: false, bitmap: Buffer.from([2]) }
    ])
    const state = accounting()
    const writeFrame = vi.fn(async () => { controller.abort(Error('cancelado sinteticamente')) })

    await expect(renderAndWriteEditorV6Frames({
      worker: renderer,
      part: { startFrame: 0, endFrame: 2 },
      signal: controller.signal,
      ...state,
      writeFrame,
      onFrameWritten: vi.fn(),
      now: () => 10
    })).rejects.toThrow('cancelado sinteticamente')
    expect(renderer.frame).toHaveBeenCalledTimes(1)
    expect(state.counters.frames).toBe(1)
  })
})
