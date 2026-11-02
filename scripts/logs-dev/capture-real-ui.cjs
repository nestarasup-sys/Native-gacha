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
function finish(code) {
  if (finished) return
  finished = true
  clearTimeout(timeout)
  if (code === 0) console.log('Seis capturas da Logs Dev em sandbox sintético:', path.join(sandbox, 'logs-dev-captures'))
  process.exitCode = code
}
child.on('error', error => { console.error(error); finish(1) })
child.on('exit', code => finish(code ?? 1))
