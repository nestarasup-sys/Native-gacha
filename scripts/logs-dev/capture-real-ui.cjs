'use strict'
/** Captures Logs Dev with Electron using only a fresh, marked synthetic sandbox. */
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { randomUUID } = require('node:crypto')

const root = path.resolve(__dirname, '../..')
const runId = randomUUID()
const runRoot = path.join(root, 'out', 'dev-ai', 'runs', runId)
const sandbox = path.join(runRoot, 'sandbox')
if (!fs.existsSync(path.join(root, 'out', 'main', 'main.js'))) {
  console.error('Build não encontrado. Execute npm run build antes da captura.')
  process.exit(1)
}
fs.mkdirSync(sandbox, { recursive: true })
fs.writeFileSync(path.join(runRoot, '.dev-ai-sandbox.json'), JSON.stringify({ schemaVersion: 1, runId, syntheticOnly: true }, null, 2))

const electron = require('electron')
const launchStartedAtMs = Date.now()
const env = {
  ...process.env,
  GACHA_DEV_AI_TEST: '1',
  GACHA_DEV_AI_SANDBOX: sandbox,
  GACHA_LOGS_DEV_REAL_UI_CAPTURE: '1',
  GACHA_LOGS_DEV_CAPTURE_LAUNCH_STARTED_AT_MS: String(launchStartedAtMs),
  GV5_IPC_PERF: '1',
  GACHA_FABRICATOR_REAL_UI_CAPTURE: '0',
  GACHA_EDITOR_V6_STRESS_AUTORUN: '0',
  GACHA_VIDEO_STRESS_OFFSCREEN: '0'
}
const child = spawn(electron, [path.join(root, 'out', 'main', 'main.js')], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
let finished = false
let childOutput = ''
function forwardOutput(stream, target) {
  stream.on('data', chunk => {
    const text = chunk.toString()
    childOutput = (childOutput + text).slice(-1_000_000)
    target.write(chunk)
  })
}
forwardOutput(child.stdout, process.stdout)
forwardOutput(child.stderr, process.stderr)
const timeout = setTimeout(() => {
  console.error('Tempo máximo da captura Electron da Logs Dev excedido.')
  child.kill()
  finish(1)
}, 120_000)
function verifyRoutePerformanceCapture() {
  const reportPath = path.join(sandbox, 'logs-dev-captures', 'route-performance.json')
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  const expectedIds = ['customizer', 'fabricator', 'studio', 'editor-v6', 'roteiros', 'base-videos', 'logs-dev']
  if (report.schemaVersion !== 1 || report.syntheticOnly !== true || report.source !== 'electron-renderer-route-shell') {
    throw new Error('Relatório de rotas sem marcação sintética ou versão suportada.')
  }
  if (!Array.isArray(report.samples) || report.samples.length !== expectedIds.length * 3 || !Array.isArray(report.summary)) {
    throw new Error('Captura de navegação não produziu três rodadas completas por rota.')
  }
  const nullableNonNegative = value => value === null || (Number.isFinite(value) && value >= 0)
  const startup = report.startup
  if (!startup || startup.initialRouteId !== 'customizer' || startup.initialRoute !== '/customizar' ||
      !Number.isFinite(startup.launchToFirstShellMs) || startup.launchToFirstShellMs < 0 ||
      !Number.isFinite(startup.electronProcessUptimeMs) || startup.electronProcessUptimeMs <= 0 ||
      !startup.rendererNavigation || !startup.rendererPaint ||
      !['domInteractiveMs', 'domContentLoadedMs', 'loadEventEndMs'].every(key => nullableNonNegative(startup.rendererNavigation[key])) ||
      !['firstPaintMs', 'firstContentfulPaintMs'].every(key => nullableNonNegative(startup.rendererPaint[key])) ||
      !Number.isFinite(startup.mainRssBytes) || startup.mainRssBytes <= 0 ||
      !Number.isFinite(startup.mainHeapUsedBytes) || startup.mainHeapUsedBytes < 0 ||
      !nullableNonNegative(startup.rendererWorkingSetKiB) || !nullableNonNegative(startup.rendererPrivateKiB) ||
      !nullableNonNegative(startup.rendererJsHeapBytes) ||
      !startup.ipcPerformance || startup.ipcPerformance.enabled !== true ||
      !Number.isFinite(startup.ipcPerformance.durationMs) || startup.ipcPerformance.durationMs < 0 ||
      !Array.isArray(startup.ipcPerformance.rows) ||
      !startup.ipcPerformance.rows.some(item => Number.isFinite(item.calls) && item.calls > 0) ||
      startup.ipcPerformance.rows.some(item => !/^[a-z][a-z0-9:_-]{1,127}$/.test(item.channel) ||
        !Number.isInteger(item.calls) || item.calls < 1 || !Number.isInteger(item.failures) || item.failures < 0 ||
        !Number.isFinite(item.averageMs) || item.averageMs < 0 || !Number.isFinite(item.worstMs) || item.worstMs < 0 || item.failures > 0)) {
    throw new Error('Captura sintética não registrou o primeiro shell e a primeira renderização.')
  }
  if (!report.ipcPerformance || report.ipcPerformance.enabled !== false ||
      !Number.isFinite(report.ipcPerformance.durationMs) || report.ipcPerformance.durationMs < 0 ||
      !Array.isArray(report.ipcPerformance.rows) ||
      !report.ipcPerformance.rows.some(item => Number.isFinite(item.calls) && item.calls > 0) ||
      report.ipcPerformance.rows.some(item => !/^[a-z][a-z0-9:_-]{1,127}$/.test(item.channel) ||
        !Number.isInteger(item.calls) || item.calls < 1 || !Number.isInteger(item.failures) || item.failures < 0 ||
        !Number.isFinite(item.averageMs) || item.averageMs < 0 || !Number.isFinite(item.worstMs) || item.worstMs < 0 || item.failures > 0)) {
    throw new Error('Captura sintética não produziu estatísticas IPC das rotas percorridas.')
  }
  for (const id of expectedIds) {
    const samples = report.samples.filter(item => item.id === id)
    const summary = report.summary.find(item => item.id === id)
    if (samples.length !== 3 || samples.some(item => !Number.isFinite(item.durationMs) || item.durationMs < 0 ||
        !Number.isFinite(item.shellDurationMs) || item.shellDurationMs < 0 || item.shellDurationMs > item.durationMs ||
        typeof item.longTaskSupported !== 'boolean' ||
        (item.longTaskSupported
          ? !Number.isInteger(item.longTaskCount) || item.longTaskCount < 0 ||
            !Number.isFinite(item.longTaskTotalMs) || item.longTaskTotalMs < 0 ||
            !Number.isFinite(item.longTaskMaxMs) || item.longTaskMaxMs < 0
          : item.longTaskCount !== null || item.longTaskTotalMs !== null || item.longTaskMaxMs !== null) ||
        !Number.isInteger(item.newResourceEntryCount) || item.newResourceEntryCount < 0 ||
        !nullableNonNegative(item.newResourceEncodedBytes) ||
        !nullableNonNegative(item.rendererCpuPercent) || !nullableNonNegative(item.mainCpuPercent) ||
        !nullableNonNegative(item.cpuSampleIntervalMs) || !nullableNonNegative(item.rendererWorkingSetKiB) ||
        !nullableNonNegative(item.rendererPrivateKiB) || !nullableNonNegative(item.rendererJsHeapBytes) ||
        !Number.isFinite(item.mainRssBytes) || item.mainRssBytes <= 0 ||
        !Number.isFinite(item.mainHeapUsedBytes) || item.mainHeapUsedBytes < 0) ||
        summary?.sampleCount !== 3 || !Number.isFinite(summary.medianMs)) {
      throw new Error('Amostras de navegação ausentes ou inválidas para a rota: ' + id)
    }
  }
  return { reportPath, summary: report.summary, startup, ipcRowCount: report.ipcPerformance.rows.length }
}
function finish(code) {
  if (finished) return
  finished = true
  clearTimeout(timeout)
  if (code === 0) {
    try {
      const handlerErrors = [...childOutput.matchAll(/Error occurred in handler for ['"]([^'"]+)['"]/g)].map(match => match[1])
      if (handlerErrors.length) throw new Error('Electron registrou falha IPC: ' + [...new Set(handlerErrors)].join(', '))
      const performanceCapture = verifyRoutePerformanceCapture()
      console.log('Seis capturas e 21 amostras de navegação em sandbox sintético:', path.join(sandbox, 'logs-dev-captures'))
      const startupCalls = performanceCapture.startup.ipcPerformance.rows.reduce((sum, row) => sum + row.calls, 0)
      console.log('Primeiro shell:', performanceCapture.startup.launchToFirstShellMs, 'ms; IPC no boot:', startupCalls, 'chamadas; canais por rota:', performanceCapture.ipcRowCount)
      console.log(JSON.stringify(performanceCapture.summary, null, 2))
    } catch (error) {
      console.error('A captura de navegação real ficou incompleta:', error)
      code = 1
    }
  }
  process.exitCode = code
}
child.on('error', error => { console.error(error); finish(1) })
child.on('close', code => finish(code ?? 1))
