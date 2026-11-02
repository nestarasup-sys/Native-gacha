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
const env = {
  ...process.env,
  GACHA_DEV_AI_TEST: '1',
  GACHA_DEV_AI_SANDBOX: sandbox,
  GACHA_LOGS_DEV_REAL_UI_CAPTURE: '1',
  GACHA_FABRICATOR_REAL_UI_CAPTURE: '0',
  GACHA_EDITOR_V6_STRESS_AUTORUN: '0',
  GACHA_VIDEO_STRESS_OFFSCREEN: '0'
}
const child = spawn(electron, [path.join(root, 'out', 'main', 'main.js')], { cwd: root, env, stdio: 'inherit' })
let finished = false
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
  for (const id of expectedIds) {
    const samples = report.samples.filter(item => item.id === id)
    const summary = report.summary.find(item => item.id === id)
    if (samples.length !== 3 || samples.some(item => !Number.isFinite(item.durationMs) || item.durationMs < 0) ||
        summary?.sampleCount !== 3 || !Number.isFinite(summary.medianMs)) {
      throw new Error('Amostras de navegação ausentes ou inválidas para a rota: ' + id)
    }
  }
  return { reportPath, summary: report.summary }
}
function finish(code) {
  if (finished) return
  finished = true
  clearTimeout(timeout)
  if (code === 0) {
    try {
      const performanceCapture = verifyRoutePerformanceCapture()
      console.log('Seis capturas e 21 amostras de navegação em sandbox sintético:', path.join(sandbox, 'logs-dev-captures'))
      console.log(JSON.stringify(performanceCapture.summary, null, 2))
    } catch (error) {
      console.error('A captura de navegação real ficou incompleta:', error)
      code = 1
    }
  }
  process.exitCode = code
}
child.on('error', error => { console.error(error); finish(1) })
child.on('exit', code => finish(code ?? 1))
