import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addEditorV6FrameMetrics,
  addEditorV6PhaseTime,
  createEditorV6TimingAccumulators,
  recordEditorV6Timing,
  summarizeEditorV6Timings
} from '../electron/domains/editorV6/exportMetrics.ts'

test('acumula histogramas, arredonda percentis e limita buckets acima de 200 ms', () => {
  const accumulators = createEditorV6TimingAccumulators()
  for (const value of [0.11, 1.01, 1.19, 10.6, 220.4]) recordEditorV6Timing(accumulators, 'captureMs', value)
  recordEditorV6Timing(accumulators, 'hairPngEncodeMs', 3.4)
  recordEditorV6Timing(accumulators, 'captureMs', Number.NaN)
  recordEditorV6Timing(accumulators, 'captureMs', Number.POSITIVE_INFINITY)
  recordEditorV6Timing(accumulators, 'captureMs', 0)
  recordEditorV6Timing(accumulators, 'captureMs', -1)

  const summary = summarizeEditorV6Timings(accumulators).captureMs

  assert.deepEqual(summary, { samples: 5, totalMs: 233.31, p50Ms: 1.1, p95Ms: 200, maxMs: 220.4 })
  assert.equal(accumulators.captureMs.histogram.length, 2001)
  assert.equal(accumulators.captureMs.histogram[2000], 1)
  assert.equal(summarizeEditorV6Timings(accumulators).hairPngEncodeMs.samples, 1)
  assert.equal(summarizeEditorV6Timings(createEditorV6TimingAccumulators()).captureMs, undefined)
})

test('soma apenas métricas inteiras seguras e não negativas', () => {
  const target = { hairRasterPixels: 3, captureReadbacks: 1 }

  addEditorV6FrameMetrics(target, {
    hairRasterPixels: 5,
    hairRasterFrames: 2,
    captureReadbacks: -1,
    captureStaleReadbacks: Number.MAX_SAFE_INTEGER + 1
  })
  addEditorV6FrameMetrics(target, undefined)

  assert.deepEqual(target, { hairRasterPixels: 8, hairRasterFrames: 2, captureReadbacks: 1 })
})

test('acumula duração arredondada da fase usando relógio monotônico injetável', () => {
  const report = { phaseMilliseconds: { temporarySetup: 0, characterLoading: 0, motionPreparation: 0, encoderProbe: 0, rendering: 4, finalization: 0, publication: 0 } }

  addEditorV6PhaseTime(report, 'rendering', 100, () => 108.789)

  assert.equal(report.phaseMilliseconds.rendering, 12.79)
})
