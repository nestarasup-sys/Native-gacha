'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { analyze, format, partMetric, median } = require('../../scripts/editor-v6/analyze-hair-benchmark.cjs')
const FRAMES = 2394
const PROJECT_TITLE = 'Teste de Importação — Personagens do Pacote'
const PROJECT_ID = '408a77d1-d964-4c04-a66b-f4e9fcfeee46'

function sampleRun(run, cold = false) {
  const hairPreparationWallMs = cold ? 6000 : 2000
  const mainExportWallMs = cold ? 30000 : 13000
  return {
    run, cacheState: cold ? 'cold-motion-cache' : 'warm-motion-cache',
    totalFrames: FRAMES, width: 1920, height: 1080, fps: '30/1', hairPresetSlot: 2,
    selectedEncoder: 'libopenh264', requestedEncoder: 'cpu', workers: 4,
    mouthLoopDisabled: false, hairPoseReactionOnly: true, hairPosteriorOnly: true,
    hairPresetFingerprint: 'only-compared-not-printed', hairPreparationWallMs, mainExportWallMs,
    clickToValidatedWallMs: hairPreparationWallMs + mainExportWallMs, audioClips: 2, audioOutput: true,
    processSampleCount: 5,
    phaseMilliseconds: { temporarySetup: 50, characterLoading: 500, motionPreparation: cold ? 3000 : 500, encoderProbe: 100, rendering: cold ? 23000 : 11000, finalization: 700, publication: 100 },
    partTiming: [
      { frameRoundTripMs: { totalMs: 12500, samples: 150 }, ffmpegWriteMs: { totalMs: 800, samples: 150 }, ipcDrawMs: { totalMs: 9500 }, hairCompositionMs: { totalMs: 4000 }, captureMs: { totalMs: 2200 } },
      { frameRoundTripMs: { totalMs: 11500, samples: 150 }, ffmpegWriteMs: { totalMs: 600, samples: 150 }, ipcDrawMs: { totalMs: 8800 }, hairCompositionMs: { totalMs: 3500 }, captureMs: { totalMs: 2300 } }
    ]
  }
}
function sampleSummary() {
  return { passed: true, benchmarkKind: 'real-project-hair-export', projectId: PROJECT_ID, projectTitle: PROJECT_TITLE, nativeRenderer: false, captureMode: 'capturePage', requestedEncoder: 'cpu', includeSpeechMouth: true, mouthLoopCycleFrames: 30, hairPoseReactionOnly: true, hairPosteriorOnly: true, startFrame: 0, endFrame: FRAMES, timelineDurationFrames: FRAMES, durationFrames: FRAMES, fps: '30/1', width: 1920, height: 1080, hairPresetSlot: 2, runs: [sampleRun(1, true), sampleRun(2), sampleRun(3)] }
}
test('tempo de parede separa preparo, export e comparação cache frio/quente', () => {
  const report = analyze(sampleSummary())
  assert.equal(report.ok, true)
  assert.equal(report.benchmark.medianAllMs, 15000)
  assert.equal(report.benchmark.medianWarmMs, 15000)
  assert.equal(report.benchmark.targetMetAll, false)
  assert.equal(report.benchmark.targetMetWarm, true)
  assert.equal(report.benchmark.rankedByMedian[0].key, 'rendering')
  assert.equal(report.runs[1].fpsEffective, FRAMES * 1000 / 15000)
  assert.equal(report.runs[1].unattributedWallMs, 0)
})
test('trabalho paralelo mostra máximo da parte e soma agregada separadamente', () => {
  const report = analyze(sampleSummary())
  const roundTrip = report.runs[0].frameTopLevel.find(value => value.key === 'frameRoundTripMs')
  assert.deepEqual({ max: roundTrip.maxPartMs, sum: roundTrip.sumWorkerMs, parts: roundTrip.parts }, { max: 12500, sum: 24000, parts: 2 })
  assert.equal(partMetric(sampleRun(1), 'missing'), null)
  assert.equal(median([3000, 1000, 2000]), 2000)
  assert.equal(median([10, 30]), 20)
})
test('resumo não inclui fingerprint nem IDs de projeto na saída', () => {
  const result = analyze(sampleSummary())
  const output = format(result)
  assert.match(output, /2394 quadros/)
  assert.match(output, /ponta a ponta do recorte ≤30 s/)
  assert.match(output, /Não some esses totais/)
  assert.doesNotMatch(output, /only-compared-not-printed/)
})
test('rejeita benchmark incompleto, áudio inconsistente e preset alterado', () => {
  const summary = sampleSummary()
  summary.runs[0].audioOutput = false
  summary.runs[1].hairPresetFingerprint = 'diferente'
  summary.runs[2].totalFrames = 299
  const result = analyze(summary)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some(error => error.includes('áudio')))
  assert.ok(result.errors.some(error => error.includes('Preset diferente')))
  assert.ok(result.errors.some(error => error.includes('quadros')))
})

test('exige o projeto autorizado e valida a janela coberta em todos os takes', () => {
  const wrongProject = sampleSummary()
  wrongProject.projectId = '00000000-0000-0000-0000-000000000000'
  assert.ok(analyze(wrongProject).errors.some(error => error.includes('projeto autorizado')))
  const partial = sampleSummary()
  partial.startFrame = 450
  partial.endFrame = 1050
  partial.durationFrames = 600
  partial.targetSeconds = 10
  partial.runs = [sampleRun(1)]
  partial.runs[0].totalFrames = 600
  partial.runs[0].mainExportWallMs = 9000
  partial.runs[0].clickToValidatedWallMs = 11000
  const partialReport = analyze(partial)
  assert.equal(partialReport.ok, true)
  assert.equal(partialReport.benchmark.segmentTargetMetAll, true)
  assert.match(format(partialReport), /Meta local de exportação ≤10 s: atingida/)
  partial.endFrame += 1
  assert.ok(analyze(partial).errors.some(error => error.includes('janela')))
})
test('exige export padrão com todas as animações e não aceita renderizador nativo', () => {
  const simplified = sampleSummary()
  simplified.includeSpeechMouth = false
  assert.ok(analyze(simplified).errors.some(error => error.includes('perfil padrão')))
  const native = sampleSummary()
  native.nativeRenderer = true
  native.captureMode = 'native-cpp'
  assert.ok(analyze(native).errors.some(error => error.includes('captura padrão')))
  const mouthOff = sampleSummary()
  mouthOff.runs[0].mouthLoopDisabled = true
  assert.ok(analyze(mouthOff).errors.some(error => error.includes('boca')))
})
test('expõe a parte do tempo ponta a ponta sem fase atribuída', () => {
  const summary = sampleSummary()
  summary.runs[0].clickToValidatedWallMs += 1200
  const result = analyze(summary)
  assert.equal(result.runs[0].unattributedWallMs, 1200)
  assert.ok(result.warnings.some(error => error.includes('1.20 s do tempo ponta a ponta não está atribuído')))
  assert.match(format(result), /fora das fases 1\.20 s/)
})
test('avisa sobre encoder variável e ausência de amostragem sem inventar medições', () => {
  const summary = sampleSummary()
  summary.runs[2].selectedEncoder = 'h264_amf'
  summary.runs[2].processSampleCount = 0
  summary.runs[2].partTiming = []
  const result = analyze(summary)
  assert.equal(result.ok, true)
  assert.ok(result.warnings.some(w => w.includes('encoder')))
  assert.ok(result.warnings.some(w => w.includes('processos')))
  assert.ok(result.warnings.some(w => w.includes('métricas por parte')))
})

test('rejeita duração zero e fingerprint ausente para não gerar FPS infinito', () => {
  const summary = sampleSummary()
  summary.runs[0].clickToValidatedWallMs = 0
  summary.runs[1].hairPresetFingerprint = ''
  const result = analyze(summary)
  assert.equal(result.ok, false)
  assert.ok(result.errors.some(value => value.includes('tempos ponta a ponta')))
  assert.ok(result.errors.some(value => value.includes('fingerprint do preset')))
})
