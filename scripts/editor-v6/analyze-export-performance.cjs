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

function normalizeBenchmarkReport(report) {
  if (!Array.isArray(report.runs)) return report
  const run = report.runs.at(-1)
  if (!run) return report
  return {
    projectId: report.projectId,
    state: report.passed ? 'completed' : 'failed',
    totalFrames: run.totalFrames ?? report.durationFrames,
    fps: Number.parseInt(String(run.fps ?? report.fps), 10),
    options: { ...(run.options ?? {}), frameTransport: report.frameTransport ?? 'executeJavaScript' },
    milliseconds: run.mainExportWallMs ?? run.exportMilliseconds,
    clickToValidatedMilliseconds: run.clickToValidatedWallMs,
    hairPreparation: { totalMilliseconds: run.hairPreparationWallMs },
    phaseMilliseconds: run.phaseMilliseconds,
    motionPreparation: run.motionPreparation,
    mouthAnimation: run.mouthAnimation,
    attempts: run.attemptDiagnostics,
    validation: run.ffprobeValidation,
    cleanup: { errors: run.cleanupErrors ?? [] },
    processPeaks: run.processPeaks,
    frameTransport: report.frameTransport,
    captureMode: report.captureMode,
    runtime: { buildSha: report.sourceRevision, workingTreeDirty: report.workingTreeDirty }
  }
}

function summarizeRendererFrameWork(parts) {
  const total = name => {
    const values = parts.map(part => numberOrNull(part.frameTiming?.[name]?.totalMs)).filter(value => value !== null)
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null
  }
  const rendererFrameWorkMs = total('rendererFrameWorkMs')
  const ipcDrawMs = total('ipcDrawMs')
  const instrumentedStages = ['sceneResolutionMs', 'faceCompositionMs', 'hairCompositionMs', 'assetPreparationMs', 'reactCommitMs', 'rafWaitMs', 'nativePlanMs']
    .map(total).filter(value => value !== null)
  const instrumentedFrameWorkMs = instrumentedStages.length ? instrumentedStages.reduce((sum, value) => sum + value, 0) : null
  const samples = name => parts.reduce((sum, part) => sum + (numberOrNull(part.frameTiming?.[name]?.samples) ?? 0), 0)
  return rendererFrameWorkMs === null && ipcDrawMs === null ? null : {
    rendererFrameWorkMs,
    ipcDrawMs,
    instrumentedFrameWorkMs,
    unclassifiedRendererFrameWorkMs: rendererFrameWorkMs === null || instrumentedFrameWorkMs === null
      ? null : Math.max(0, rendererFrameWorkMs - instrumentedFrameWorkMs),
    executeJavaScriptRemainderMs: rendererFrameWorkMs === null || ipcDrawMs === null
      ? null : Math.max(0, ipcDrawMs - rendererFrameWorkMs),
    rendererFrameSamples: samples('rendererFrameWorkMs'),
    ipcDrawSamples: samples('ipcDrawMs')
  }
}

/** Read a real export report without conflating rendering time and hair preparation. */
function analyzeEditorV6ExportReport(report) {
  report = normalizeBenchmarkReport(report)
  if (!report || !Number.isSafeInteger(report.totalFrames) || report.totalFrames < 1) {
    throw Error('Relatório do Editor V6 sem contagem válida de quadros.')
  }
  const attempt = selectedAttempt(report)
  const parts = Array.isArray(attempt.parts) ? attempt.parts : []
  const phase = report.phaseMilliseconds ?? {}
  const clickToValidatedMilliseconds = numberOrNull(report.clickToValidatedMilliseconds)
  const mainProcessMilliseconds = numberOrNull(report.milliseconds)
  const wallMilliseconds = clickToValidatedMilliseconds ?? mainProcessMilliseconds
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
  const workerTimingTotalsMilliseconds = {}
  for (const part of parts) for (const [phaseName, timing] of Object.entries(part.frameTiming ?? {})) {
    const total = numberOrNull(timing?.totalMs)
    if (total !== null) workerTimingTotalsMilliseconds[phaseName] = (workerTimingTotalsMilliseconds[phaseName] ?? 0) + total
  }
  const durationMilliseconds = report.totalFrames / (numberOrNull(report.fps) || 30) * 1000
  const totalWithHairMilliseconds = clickToValidatedMilliseconds
    ?? (mainProcessMilliseconds === null ? null : mainProcessMilliseconds + hairPreparationMilliseconds)
  return {
    state: report.state, encoder: report.options?.encoder ?? attempt.encoder ?? 'não informado',
    projectId: report.projectId ?? null,
    sourceRevision: report.runtime?.buildSha ?? null,
    workingTreeDirty: report.runtime?.workingTreeDirty ?? null,
    totalFrames: report.totalFrames, capturedFrames: frames, durationMilliseconds,
    wallMilliseconds, mainProcessMilliseconds, clickToValidatedMilliseconds, hairPreparationMilliseconds,
    totalTimeBasis: clickToValidatedMilliseconds !== null ? 'click-to-validated'
      : mainProcessMilliseconds !== null && hairPreparationMilliseconds ? 'main-plus-hair-estimate' : 'main-process',
    totalWithHairMilliseconds,
    renderingMilliseconds,
    effectiveRenderFps: renderingMilliseconds ? report.totalFrames * 1000 / renderingMilliseconds : null,
    realTimeFactor: totalWithHairMilliseconds === null ? null : durationMilliseconds / totalWithHairMilliseconds,
    motionPreparationMilliseconds: numberOrNull(report.motionPreparation?.milliseconds),
    phaseMilliseconds: phase,
    workerTimingTotalsMilliseconds,
    rendererFrameWork: summarizeRendererFrameWork(parts),
    processPeaks: Array.isArray(report.processPeaks) ? report.processPeaks.map(item => ({
      role: item.role, peakWorkingSetBytes: item.peakWorkingSetBytes, peakCpuPercent: item.peakCpuPercent
    })) : [],
    captureMode: report.captureMode ?? null,
    frameTransport: report.frameTransport ?? report.options?.frameTransport ?? null,
    validation: report.validation ?? null,
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
const gibibytes = bytes => bytes === null ? 'não medido' : `${(bytes / 1024 ** 3).toFixed(2)} GiB`
function formatAnalysis(result) {
  const lines = [
    `Estado: ${result.state} · Encoder: ${result.encoder} · Quadros: ${result.totalFrames} (enviados: ${result.capturedFrames})`,
    `Duração: ${seconds(result.durationMilliseconds)} · Total: ${seconds(result.totalWithHairMilliseconds)} (${result.totalTimeBasis}) · Main: ${seconds(result.mainProcessMilliseconds)} · Cabelo: ${seconds(result.hairPreparationMilliseconds)}`,
    `Velocidade vs tempo real: ${result.realTimeFactor === null ? 'não medida' : result.realTimeFactor.toFixed(2) + 'x'} · Projeto: ${result.projectId ?? 'não informado'} · Revisão: ${result.sourceRevision ?? 'não informada'} · Dirty: ${result.workingTreeDirty ?? 'não informado'}`,
    `Captura: ${result.captureMode ?? 'não informada'} · Transporte de quadro: ${result.frameTransport ?? 'não informado'} · Picos do processo: ${result.processPeaks.map(item => `${item.role} ${gibibytes(item.peakWorkingSetBytes)}, CPU ${item.peakCpuPercent?.toFixed(0) ?? '?'}%`).join(' · ') || 'não medidos'}`,
    `Preparação de poses/expressões: ${seconds(result.motionPreparationMilliseconds)} · Fase de renderização: ${seconds(result.renderingMilliseconds)} · FPS efetivo (fase renderização): ${result.effectiveRenderFps === null ? 'não medido' : result.effectiveRenderFps.toFixed(1)}`,
    `Somas sobrepostas dos workers (não são tempo de parede): frame roundtrip ${seconds(result.workerTimingTotalsMilliseconds.frameRoundTripMs)} · capturePage ${seconds(result.workerTimingTotalsMilliseconds.capturePageMs)} · cópia BGRA ${seconds(result.workerTimingTotalsMilliseconds.captureBitmapMs)} · escrita FFmpeg ${seconds(result.workerTimingTotalsMilliseconds.ffmpegWriteMs)} · pipe descoberto ${seconds(result.workerTimingTotalsMilliseconds.ffmpegWriteUncoveredMs)}`,
    `Cabelo: ${result.metrics.hairRasterFrames} rasterizações, ${result.metrics.hairCompositeReuseFrames} recomposições evitadas; capturas antigas: ${result.metrics.captureStaleReadbacks}`
  ]
  if (result.rendererFrameWork) {
    const detail = result.rendererFrameWork
    lines.push(`Renderer (somas de worker, sobrepostas): função ${seconds(detail.rendererFrameWorkMs)}; subfases instrumentadas ${seconds(detail.instrumentedFrameWorkMs)}; trabalho interno ainda sem subfase ${seconds(detail.unclassifiedRendererFrameWorkMs)}; resíduo de ida/volta executeJavaScript ≈${seconds(detail.executeJavaScriptRemainderMs)}; amostras renderer/IPC ${detail.rendererFrameSamples}/${detail.ipcDrawSamples}.`)
  }
  for (const part of result.parts) {
    const timings = ['frameRoundTripMs', 'rendererFrameWorkMs', 'ipcDrawMs', 'rafWaitMs', 'capturePageMs', 'captureBitmapMs', 'ffmpegWriteMs', 'hairCompositionMs']
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

module.exports = { analyzeEditorV6ExportReport, compareEditorV6Exports, formatAnalysis, normalizeBenchmarkReport, summarizeRendererFrameWork }
