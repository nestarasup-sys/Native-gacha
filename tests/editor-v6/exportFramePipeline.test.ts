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
