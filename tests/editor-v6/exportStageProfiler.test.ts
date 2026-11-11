import { describe, expect, it, vi } from 'vitest'
import { createEditorV6ExportStageProfiler } from '../../src/renderer/src/features/editorV6/editorV6ExportStageProfiler'

describe('createEditorV6ExportStageProfiler', () => {
  it('aggregates valid timings in first-seen stage order and emits each sample', () => {
    const onStage = vi.fn()
    const profiler = createEditorV6ExportStageProfiler(onStage, () => 45)

    profiler.record('render', 12)
    profiler.report('encode', 25)
    profiler.record('render', 7)
    profiler.record('ignored', Number.NaN)
    profiler.record('ignored', -1)

    expect(profiler.snapshot()).toEqual([
      { name: 'render', samples: 2, totalMilliseconds: 19, maxMilliseconds: 12 },
      { name: 'encode', samples: 1, totalMilliseconds: 20, maxMilliseconds: 20 }
    ])
    expect(onStage.mock.calls).toEqual([
      ['render', 12],
      ['encode', 20],
      ['render', 7]
    ])
  })

  it('creates an independent snapshot for each export preparation', () => {
    const first = createEditorV6ExportStageProfiler()
    const second = createEditorV6ExportStageProfiler()
    first.record('render', 5)

    expect(second.snapshot()).toEqual([])
    expect(first.snapshot()).toEqual([{ name: 'render', samples: 1, totalMilliseconds: 5, maxMilliseconds: 5 }])
  })
})
