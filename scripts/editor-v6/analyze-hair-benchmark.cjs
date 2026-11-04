'use strict'

/**
 * Diagnóstico numérico e sanitizado do benchmark isolado do Editor V6.
 * Uso: node scripts/editor-v6/analyze-hair-benchmark.cjs <stress-export-validation.json>
 * Não abre MP4, assets, presets, pastas do projeto nem imprime IDs/caminhos.
 */
const fs = require('node:fs')

const PHASES = [
  ['hairPreparationWallMs', 'Preparação do cabelo (antes do job)'],
  ['temporarySetup', 'Preparação temporária'],
  ['characterLoading', 'Carregamento de personagens'],
  ['motionPreparation', 'Preparação de movimentos'],
  ['encoderProbe', 'Teste de encoders'],
  ['rendering', 'Renderização + codificação'],
  ['finalization', 'Finalização + validação'],
  ['publication', 'Publicação do MP4']
]
const FRAME_TOP_LEVEL = [
  ['frameRoundTripMs', 'Worker: render + captura + IPC'],
  ['ffmpegWriteMs', 'Escrita no FFmpeg / backpressure']
]
const FRAME_WITHIN_WORKER = [
  ['ipcDrawMs', 'IPC / espera do desenho'],
  ['captureMs', 'Captura Chromium + bitmap'],
  ['sceneResolutionMs', 'Resolução da cena'],
  ['faceCompositionMs', 'Composição da face'],
  ['hairCompositionMs', 'Composição do cabelo'],
  ['assetPreparationMs', 'Preparação dos assets'],
  ['reactCommitMs', 'Commit React'],
  ['rafWaitMs', 'Espera de frame RAF']
]
const finiteNonnegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0
const finitePositive = value => typeof value === 'number' && Number.isFinite(value) && value > 0
const seconds = ms => `${(ms / 1000).toFixed(2)} s`
const median = numbers => {
  const sorted = [...numbers].sort((a, b) => a - b)
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
}
function getPhaseMs(run, key) {
  const value = key === 'hairPreparationWallMs' ? run.hairPreparationWallMs : run.phaseMilliseconds?.[key]
  return finiteNonnegative(value) ? value : null
}
function partMetric(run, key) {
  const values = (run.partTiming ?? []).map(part => part?.[key]?.totalMs).filter(finiteNonnegative)
  if (!values.length) return null
  return { maxPartMs: Math.max(...values), sumWorkerMs: values.reduce((a, b) => a + b, 0), parts: values.length }
}
function validate(summary) {
  const errors = []
  const warnings = []
  if (summary?.passed !== true || summary?.benchmarkKind !== 'real-project-hair-export') errors.push('Resumo não é um benchmark real de cabelo concluído.')
  if (!Array.isArray(summary?.runs) || summary.runs.length !== 3) errors.push('São necessárias três execuções completas.')
  if (summary?.durationFrames !== 300 || summary?.fps !== '30/1') errors.push('O benchmark precisa conter 300 quadros a 30 FPS.')
  if (!Number.isSafeInteger(summary?.width) || summary.width < 1 || !Number.isSafeInteger(summary?.height) || summary.height < 1) errors.push('Dimensões inválidas.')
  if (!Number.isInteger(summary?.hairPresetSlot) || summary.hairPresetSlot < 1 || summary.hairPresetSlot > 5) errors.push('Slot de preset inválido.')
  if (Array.isArray(summary?.runs)) {
    const encoders = new Set()
    const fingerprints = new Set()
    const options = new Set()
    summary.runs.forEach((run, index) => {
      const prefix = `Execução ${index + 1}`
      if (run.totalFrames !== 300 || run.fps !== '30/1' || run.width !== summary.width || run.height !== summary.height || run.hairPresetSlot !== summary.hairPresetSlot) errors.push(`${prefix}: quadros, FPS, dimensões ou preset inconsistentes.`)
      if (!finiteNonnegative(run.hairPreparationWallMs) || !finitePositive(run.mainExportWallMs) || !finitePositive(run.clickToValidatedWallMs)) errors.push(`${prefix}: tempos ponta a ponta ausentes ou inválidos.`)
      else if (Math.abs(run.clickToValidatedWallMs - run.hairPreparationWallMs - run.mainExportWallMs) > 10) warnings.push(`${prefix}: soma dos relógios de preparação e export difere do total.`)
      if (run.audioOutput !== (run.audioClips > 0) || !Number.isSafeInteger(run.audioClips) || run.audioClips < 0) errors.push(`${prefix}: áudio não confere com a saída.`)
      if (!Array.isArray(run.partTiming) || !run.partTiming.length) warnings.push(`${prefix}: não há métricas por parte para aprofundar o diagnóstico.`)
      if (!run.processSampleCount) warnings.push(`${prefix}: medição externa de processos ausente.`)
      encoders.add(run.selectedEncoder)
      if (typeof run.hairPresetFingerprint !== 'string' || !run.hairPresetFingerprint.trim()) errors.push(`${prefix}: fingerprint do preset ausente.`)
      fingerprints.add(run.hairPresetFingerprint)
      options.add(`${run.workers}:${run.width}x${run.height}:${run.requestedEncoder}`)
    })
    if (encoders.size > 1) warnings.push('O encoder selecionado mudou entre execuções; não atribua diferenças de tempo ao cache.')
    if (fingerprints.size > 1) errors.push('Preset diferente entre execuções; comparabilidade inválida.')
    if (options.size > 1) warnings.push('Configuração de workers, resolução ou encoder solicitado mudou entre execuções.')
  }
  return { errors, warnings }
}
function analyze(summary) {
  const { errors, warnings } = validate(summary)
  if (errors.length) return { ok: false, errors, warnings }
  const runs = summary.runs.map((run, index) => ({
    run: index + 1,
    cacheState: String(run.cacheState || 'não informado'),
    totalMs: run.clickToValidatedWallMs,
    fpsEffective: 300000 / run.clickToValidatedWallMs,
    preparationMs: run.hairPreparationWallMs,
    exportMs: run.mainExportWallMs,
    phases: PHASES.map(([key, label]) => ({ key, label, milliseconds: getPhaseMs(run, key) })).filter(p => p.milliseconds !== null),
    frameTopLevel: FRAME_TOP_LEVEL.map(([key, label]) => ({ key, label, ...partMetric(run, key) })).filter(p => p.parts),
    frameWithinWorker: FRAME_WITHIN_WORKER.map(([key, label]) => ({ key, label, ...partMetric(run, key) })).filter(p => p.parts)
  }))
  const warm = runs.filter(run => /warm/i.test(run.cacheState))
  const comparable = warm.length >= 2 ? warm : runs
  const ranked = PHASES.map(([key, label]) => ({
    key, label, medianMs: median(comparable.map(run => run.phases.find(p => p.key === key)?.milliseconds ?? 0))
  })).sort((a, b) => b.medianMs - a.medianMs)
  return {
    ok: true, warnings, runs, benchmark: {
      resolution: `${summary.width}x${summary.height}`, frames: 300, preset: summary.hairPresetSlot,
      medianAllMs: median(runs.map(run => run.totalMs)),
      medianWarmMs: warm.length >= 2 ? median(warm.map(run => run.totalMs)) : null,
      medianEffectiveFps: median(runs.map(run => run.fpsEffective)),
      fastestMs: Math.min(...runs.map(run => run.totalMs)),
      slowestMs: Math.max(...runs.map(run => run.totalMs)),
      targetMetAll: runs.every(run => run.totalMs <= 15000),
      targetMetWarm: warm.length >= 2 ? warm.every(run => run.totalMs <= 15000) : null,
      rankedByMedian: ranked,
      rankingBasis: warm.length >= 2 ? 'execuções com cache aquecido' : 'todas as execuções (cache não segregado)'
    }
  }
}
function format(result) {
  if (!result.ok) return ['Resumo inválido:', ...result.errors.map(msg => `  - ${msg}`)].join('\n')
  const b = result.benchmark
  const lines = [
    'Editor V6 — Rodada 07 · diagnóstico sanitizado',
    `300 quadros · 30 FPS · ${b.resolution} · Preset ${b.preset}`,
    '',
    ...result.runs.map(r => `Execução ${r.run} (${r.cacheState}): total ${seconds(r.totalMs)}, cabelo ${seconds(r.preparationMs)}, export ${seconds(r.exportMs)}, ${r.fpsEffective.toFixed(2)} FPS efetivos`),
    `Mediana total das três: ${seconds(b.medianAllMs)} · melhor ${seconds(b.fastestMs)} · pior ${seconds(b.slowestMs)}`,
    ...(b.medianWarmMs === null ? [] : [`Mediana aquecida: ${seconds(b.medianWarmMs)}`]),
    `Meta ≤15 s: ${b.targetMetAll ? 'atingida nas três execuções' : 'não demonstrada nas três execuções'}`,
    '',
    `Fases por mediana (${b.rankingBasis}, tempo de parede por fase):`,
    ...b.rankedByMedian.map((p, index) => `  ${index + 1}. ${p.label}: ${seconds(p.medianMs)}`),
    '',
    'Tempos de quadros por execução (maior total de uma parte; soma de workers pode se sobrepor):'
  ]
  for (const r of result.runs) {
    lines.push(`  Execução ${r.run}:`)
    for (const m of [...r.frameTopLevel, ...r.frameWithinWorker]) {
      lines.push(`    ${m.label}: maior parte ${seconds(m.maxPartMs)}, soma ${seconds(m.sumWorkerMs)} (${m.parts} parte(s))`)
    }
  }
  lines.push('', 'Interpretação: renderização inclui captura e FFmpeg; frameRoundTrip inclui IPC/desenho/captura; ipcDraw inclui subfases do renderer. Não some esses totais nem os confunda com tempo de parede.')
  lines.push('O benchmark não mede o tempo humano do diálogo de destino nem comprova paridade visual por si só.')
  if (result.warnings.length) lines.push('', 'Alertas:', ...result.warnings.map(msg => `  - ${msg}`))
  return lines.join('\n')
}
if (require.main === module) {
  const file = process.argv[2]
  if (!file || process.argv.length !== 3) {
    console.error('Uso: node scripts/editor-v6/analyze-hair-benchmark.cjs <stress-export-validation.json>')
    process.exitCode = 2
  } else {
    try {
      const result = analyze(JSON.parse(fs.readFileSync(file, 'utf8')))
      console.log(format(result))
      if (!result.ok) process.exitCode = 2
    } catch (error) {
      // File-system errors may include private absolute paths. Keep CLI output sanitized.
      console.error('Não foi possível ler ou interpretar o JSON do benchmark informado.')
      process.exitCode = 2
    }
  }
}
module.exports = { analyze, format, median, partMetric }
