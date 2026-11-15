'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}
function selectedAttempt(report) {
  const attempts = Array.isArray(report.attempts) ? report.attempts : []
  return attempts.filter(attempt => !attempt.error && attempt.parts?.length).at(-1)
    ?? attempts.at(-1) ?? { parts: [] }
}

/** Read a real export report without conflating rendering time and hair preparation. */
function analyzeEditorV6ExportReport(report) {
  if (!report || !Number.isSafeInteger(report.totalFrames) || report.totalFrames < 1) {
    throw Error('Relatório do Editor V6 sem contagem válida de quadros.')
  }
  const attempt = selectedAttempt(report)
  const parts = Array.isArray(attempt.parts) ? attempt.parts : []
  const phase = report.phaseMilliseconds ?? {}
  const wallMilliseconds = numberOrNull(report.milliseconds)
    ?? (Number.isFinite(Date.parse(report.endedAt)) && Number.isFinite(Date.parse(report.startedAt))
      ? Date.parse(report.endedAt) - Date.parse(report.startedAt) : null)
  const hairPreparationMilliseconds = numberOrNull(report.hairPreparation?.totalMilliseconds) ?? 0
  const renderingMilliseconds = numberOrNull(phase.rendering)
  const frames = parts.reduce((sum, part) => sum + (numberOrNull(part.frames) ?? 0), 0)
  const metrics = ['hairRasterFrames', 'hairCompositeReuseFrames', 'hairRasterPixels', 'captureReadbacks', 'captureStaleReadbacks']
    .reduce((result, key) => {
      result[key] = parts.reduce((sum, part) => sum + (numberOrNull(part.frameMetrics?.[key]) ?? 0), 0)
      return result
    }, {})
  const durationMilliseconds = report.totalFrames / (numberOrNull(report.fps) || 30) * 1000
  return {
    state: report.state, encoder: report.options?.encoder ?? attempt.encoder ?? 'não informado',
    totalFrames: report.totalFrames, capturedFrames: frames, durationMilliseconds,
    wallMilliseconds, hairPreparationMilliseconds,
    totalWithHairMilliseconds: wallMilliseconds === null ? null : wallMilliseconds + hairPreparationMilliseconds,
    renderingMilliseconds,
    effectiveRenderFps: renderingMilliseconds ? report.totalFrames * 1000 / renderingMilliseconds : null,
    realTimeFactor: wallMilliseconds === null ? null : durationMilliseconds / (wallMilliseconds + hairPreparationMilliseconds),
    motionPreparationMilliseconds: numberOrNull(report.motionPreparation?.milliseconds),
    phaseMilliseconds: phase,
    metrics,
    parts: parts.map(part => ({
      index: part.index, frames: part.frames, milliseconds: numberOrNull(part.milliseconds),
      frameRafGate: part.frameRafGate, frameRestHairReuse: part.frameRestHairReuse,
      framePipelineOverlap: part.framePipelineOverlap,
      frameLayerCapture: part.frameLayerCapture ?? 'legacy-report',
      captureReadbacks: numberOrNull(part.frameMetrics?.captureReadbacks),
      frameTiming: part.frameTiming ?? {}
    }))
  }
}

function compareEditorV6Exports(before, after) {
  if (before.totalFrames !== after.totalFrames || before.encoder !== after.encoder) {
    throw Error('Para comparar, os relatórios precisam ter o mesmo intervalo e encoder.')
  }
  const delta = (oldValue, newValue) => oldValue && newValue !== null
    ? (newValue - oldValue) / oldValue * 100 : null
  return {
    totalWithHairPct: delta(before.totalWithHairMilliseconds, after.totalWithHairMilliseconds),
    renderingPct: delta(before.renderingMilliseconds, after.renderingMilliseconds),
    motionPreparationPct: delta(before.motionPreparationMilliseconds, after.motionPreparationMilliseconds)
  }
}

const seconds = ms => ms === null ? 'não medido' : `${(ms / 1000).toFixed(2)} s`
const percent = value => value === null ? 'não medido' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
function formatAnalysis(result) {
  const lines = [
    `Estado: ${result.state} · Encoder: ${result.encoder} · Quadros: ${result.totalFrames} (enviados: ${result.capturedFrames})`,
    `Duração do vídeo: ${seconds(result.durationMilliseconds)} · Execução: ${seconds(result.wallMilliseconds)} · Preparo do cabelo anterior à execução: ${seconds(result.hairPreparationMilliseconds)}`,
    `Execução + cabelo: ${seconds(result.totalWithHairMilliseconds)} · Velocidade vs tempo real: ${result.realTimeFactor === null ? 'não medida' : result.realTimeFactor.toFixed(2) + 'x'}`,
    `Preparação de poses/expressões: ${seconds(result.motionPreparationMilliseconds)} · Fase de renderização: ${seconds(result.renderingMilliseconds)} · FPS efetivo (fase renderização): ${result.effectiveRenderFps === null ? 'não medido' : result.effectiveRenderFps.toFixed(1)}`,
    `Cabelo: ${result.metrics.hairRasterFrames} rasterizações, ${result.metrics.hairCompositeReuseFrames} recomposições evitadas; capturas antigas: ${result.metrics.captureStaleReadbacks}`
  ]
  for (const part of result.parts) {
    const timings = ['frameRoundTripMs', 'rafWaitMs', 'capturePageMs', 'captureBitmapMs', 'ffmpegWriteMs', 'hairCompositionMs']
      .map(name => {
        const t = part.frameTiming[name]
        return t ? `${name}: p50 ${t.p50Ms}ms, p95 ${t.p95Ms}ms` : null
      }).filter(Boolean).join(' · ')
    lines.push(`Parte ${part.index}: ${part.frames} quadros; captura=${part.frameLayerCapture}; leituras=${part.captureReadbacks ?? '?'}; RAF antigo=${part.frameRafGate ?? '?'}; cabelo em repouso=${part.frameRestHairReuse ?? '?'}; overlap=${part.framePipelineOverlap ?? '?'}`)
    if (timings) lines.push('  ' + timings)
  }
  return lines.join('\n')
}

async function main(args) {
  if (args.length < 1 || args.length > 2) throw Error('Uso: node scripts/editor-v6/analyze-export-performance.cjs <relatorio-novo.report.json> [relatorio-antigo.report.json]')
  const current = analyzeEditorV6ExportReport(JSON.parse(await fs.readFile(path.resolve(args[0]), 'utf8')))
  console.log(formatAnalysis(current))
  if (args[1]) {
    const old = analyzeEditorV6ExportReport(JSON.parse(await fs.readFile(path.resolve(args[1]), 'utf8')))
    const compare = compareEditorV6Exports(old, current)
    console.log(`\nComparação antigo → novo (negativo = mais rápido): total ${percent(compare.totalWithHairPct)} · renderização ${percent(compare.renderingPct)} · preparação ${percent(compare.motionPreparationPct)}`)
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1 })
}

module.exports = { analyzeEditorV6ExportReport, compareEditorV6Exports, formatAnalysis }
