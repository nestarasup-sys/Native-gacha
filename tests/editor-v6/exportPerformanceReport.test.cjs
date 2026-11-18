'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { analyzeEditorV6ExportReport, compareEditorV6Exports, formatAnalysis } =
  require('../../scripts/editor-v6/analyze-export-performance.cjs')

const report = (renderingMs = 360000, wallMs = 370000) => ({
  state: 'completed', totalFrames: 10800, fps: 30, milliseconds: wallMs,
  options: { encoder: 'cpu' },
  hairPreparation: { totalMilliseconds: 2000 },
  motionPreparation: { milliseconds: 5000 },
  phaseMilliseconds: { rendering: renderingMs, motionPreparation: 5000 },
  attempts: [{
    encoder: 'cpu', parts: [
      { index: 0, frames: 5400, milliseconds: 180000, frameRafGate: false, frameRestHairReuse: true, frameLayerCapture: 'stacked',
        frameMetrics: { hairRasterFrames: 30, hairCompositeReuseFrames: 300, captureReadbacks: 4300, captureStaleReadbacks: 2 },
        frameTiming: { frameRoundTripMs: { p50Ms: 16, p95Ms: 35 } } },
      { index: 1, frames: 5400, milliseconds: 180000, frameRafGate: false, frameRestHairReuse: true,
        frameMetrics: { hairRasterFrames: 40, hairCompositeReuseFrames: 400, captureStaleReadbacks: 3 } }
    ]
  }]
})

test('resumes relative speed, hair metrics and per-part timing without summing parallel wall times', () => {
  const summary = analyzeEditorV6ExportReport(report())
  assert.equal(summary.durationMilliseconds, 360000)
  assert.equal(summary.wallMilliseconds, 370000)
  assert.equal(summary.totalWithHairMilliseconds, 372000)
  assert.equal(summary.capturedFrames, 10800)
  assert.equal(summary.metrics.hairRasterFrames, 70)
  assert.equal(summary.metrics.hairCompositeReuseFrames, 700)
  assert.equal(summary.metrics.captureStaleReadbacks, 5)
  assert.equal(summary.effectiveRenderFps, 30)
  assert.ok(formatAnalysis(summary).includes('frameRoundTripMs: p50 16ms'))
  assert.ok(formatAnalysis(summary).includes('captura=stacked; leituras=4300'))
})

test('compares the same encoder/frame range and rejects misleading comparisons', () => {
  const before = analyzeEditorV6ExportReport(report())
  const after = analyzeEditorV6ExportReport(report(300000, 310000))
  const comparison = compareEditorV6Exports(before, after)
  assert.ok(comparison.totalWithHairPct < 0)
  assert.equal(Math.round(comparison.renderingPct), -17)
  assert.throws(() => compareEditorV6Exports(before, { ...after, encoder: 'amf' }), /mesmo intervalo e encoder/)
  assert.throws(() => compareEditorV6Exports(before, { ...after, totalFrames: 60 }), /mesmo intervalo e encoder/)
})

test('rejects malformed reports and keeps absent timings explicitly unmeasured', () => {
  assert.throws(() => analyzeEditorV6ExportReport({ totalFrames: 0 }), /contagem válida/)
  const summary = analyzeEditorV6ExportReport({ totalFrames: 1, state: 'failed', attempts: [], phaseMilliseconds: {} })
  assert.equal(summary.effectiveRenderFps, null)
  assert.equal(summary.wallMilliseconds, null)
  assert.equal(summary.realTimeFactor, null)
})

test('separa execução dentro do renderer, subfases medidas e espera restante do executeJavaScript', () => {
  const summary = analyzeEditorV6ExportReport({
    totalFrames: 30, fps: 30, state: 'completed',
    attempts: [{ parts: [{ frameTiming: {
      rendererFrameWorkMs: { totalMs: 1000, samples: 10 },
      ipcDrawMs: { totalMs: 1500, samples: 10 },
      sceneResolutionMs: { totalMs: 100, samples: 10 },
      faceCompositionMs: { totalMs: 50, samples: 2 }
    } }] }]
  })

  assert.deepEqual(summary.rendererFrameWork, {
    rendererFrameWorkMs: 1000,
    ipcDrawMs: 1500,
    instrumentedFrameWorkMs: 150,
    unclassifiedRendererFrameWorkMs: 850,
    executeJavaScriptRemainderMs: 500,
    rendererFrameSamples: 10,
    ipcDrawSamples: 10
  })
  assert.match(formatAnalysis(summary), /trabalho interno ainda sem subfase 0\.85 s/)
  assert.match(formatAnalysis(summary), /resíduo de ida\/volta executeJavaScript ≈0\.50 s/)
})

test('preserva o transporte de quadro informado pelo benchmark', () => {
  const summary = analyzeEditorV6ExportReport({
    totalFrames: 1, fps: 30, state: 'completed', frameTransport: 'worker-ipc', attempts: []
  })
  assert.equal(summary.frameTransport, 'worker-ipc')
  assert.match(formatAnalysis(summary), /Transporte de quadro: worker-ipc/)
})
