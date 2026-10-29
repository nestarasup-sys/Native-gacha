import test from 'node:test'
import assert from 'node:assert/strict'

test('diagnóstico de playback limita amostras e conserva totais da sessão', async () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const previousSessionStorage = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { __editorV6TraceCapture: false }
  })
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: { getItem: (key) => key === 'gv5:perf' ? '1' : null }
  })

  try {
    const diagnostics = await import('../src/renderer/src/ui/performanceDiagnostics.ts?bounded-playback-test')
    diagnostics.resetUiPerformance()
    for (let index = 0; index < 10_005; index += 1) {
      const frame = index < 3 ? index : index + 2
      diagnostics.recordEditorV6PlaybackFrame(frame, index * 33.33, 0.125)
    }
    diagnostics.recordEditorV6PlaybackFrame(Number.NaN, 0, 0)
    diagnostics.recordUiCommit('/editor-v6', 'update', 0, 0, 0, 0)

    const playback = diagnostics.snapshotUiPerformance().find((route) => route.route === '/editor-v6').playback
    assert.equal(playback.logicalFrameUpdates, 10_005)
    assert.equal(playback.firstLogicalFrame, 0)
    assert.equal(playback.lastLogicalFrame, 10_006)
    assert.equal(playback.samplesRetained, 5_000)
    assert.equal(playback.samplesDropped, 5_005)
    assert.equal(playback.samples[0].frame, 5_007)
    assert.equal(playback.samples.at(-1).frame, 10_006)
    assert.equal(playback.logicalFrameGapCount, 1)
    assert.deepEqual(playback.logicalFrameGaps, [{ from: 2, to: 5, skipped: 2 }])
    assert.equal(playback.publishTotalMs, 1_250.63)

    diagnostics.resetUiPerformance()
    diagnostics.recordUiCommit('/editor-v6', 'update', 0, 0, 0, 0)
    const resetPlayback = diagnostics.snapshotUiPerformance()[0].playback
    assert.equal(resetPlayback.logicalFrameUpdates, 0)
    assert.equal(resetPlayback.samplesRetained, 0)
    assert.equal(resetPlayback.samplesDropped, 0)
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else Reflect.deleteProperty(globalThis, 'window')
    if (previousSessionStorage) Object.defineProperty(globalThis, 'sessionStorage', previousSessionStorage)
    else Reflect.deleteProperty(globalThis, 'sessionStorage')
  }
})
