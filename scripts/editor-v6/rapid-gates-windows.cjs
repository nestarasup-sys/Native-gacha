'use strict'
/**
 * Small Windows-only, headless/offscreen test gates for Editor V6.
 * Deliberately does not touch a personal profile, real project or build cache
 * in quick mode. Full MP4 is opt-in after the other gates pass.
 */
const { spawn, spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { performance } = require('node:perf_hooks')

const ROOT = path.resolve(__dirname, '../..')
const VALID_GATES = new Set(['doctor', 'unit', 'offscreen', 'integration'])
const VALID_SCOPES = new Set(['hair', 'character', 'render', 'all'])
const VITEST = path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs')
const TSC = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
const ELECTRON_VITE = path.join(ROOT, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')

const TESTS = {
  hair: [
    'tests/editor-v6/hairBakeBatch.test.ts',
    'tests/editor-v6/hairBakeEndpointGeometry.test.ts',
    'tests/editor-v6/motionAlphaCrop.test.ts',
    'tests/editor-v6/hairMotionMeshGeometry.test.ts',
    'tests/editor-v6/exportHairTransitionIndex.test.ts',
    'tests/editor-v6/motionAtlasLayout.test.ts'
  ],
  character: [
    'tests/editor-v6/characterImageCache.test.ts',
    'tests/editor-v6/characterImageTintCache.test.ts',
    'tests/editor-v6/characterPaletteTint.test.ts',
    'tests/editor-v6/bodyShapeSnapshotRefresh.test.ts',
    'tests/editor-v6/editorV6PoseReferencePersistence.test.ts'
  ],
  render: [
    'tests/editor-v6/exportFrameAssets.test.ts',
    'tests/editor-v6/exportVisibleFrameAssets.test.ts',
    'tests/editor-v6/exportCaptureBitmap.test.ts',
    'tests/editor-v6/exportBitmap.test.ts',
    'tests/editor-v6/sceneLayerMemo.test.ts',
    'tests/editor-v6/exportWorkers.test.ts',
    'tests/editor-v6/exportDrawPlan.test.ts'
  ]
}

function parseOptions(argv) {
  const values = new Map()
  for (const item of argv) {
    if (item === '--help') return { help: true }
    const match = item.match(/^--(gate|scope)=(.+)$/)
    if (item === '--with-mp4') {
      if (values.has('with-mp4')) throw Error('--with-mp4 duplicado.')
      values.set('with-mp4', 'true')
    } else if (!match || values.has(match[1])) {
      throw Error('Argumento desconhecido ou repetido. Use --help.')
    } else {
      values.set(match[1], match[2])
    }
  }
  const gate = values.get('gate') || 'unit'
  const scope = values.get('scope') || 'hair'
  const withMp4 = values.has('with-mp4')
  if (!VALID_GATES.has(gate) || !VALID_SCOPES.has(scope)) throw Error('Gate ou escopo inválido. Use --help.')
  if (withMp4 && gate !== 'integration') throw Error('--with-mp4 exige --gate=integration.')
  return { gate, scope, withMp4 }
}
function assertWindows(platform = process.platform, arch = process.arch) {
  if (platform !== 'win32' || arch !== 'x64') throw Error('Executor do Editor V6 limitado ao Windows x64; nenhum teste será iniciado.')
}
function step(id, file, args, timeoutMs) {
  return { id, args: [file, ...args], timeoutMs }
}
function planSteps(options) {
  if (options.gate === 'doctor') return []
  const scopes = options.scope === 'all' ? Object.keys(TESTS) : [options.scope]
  const paths = [...new Set(scopes.flatMap(scope => TESTS[scope]))]
  const steps = [
    step('node-unit', path.join(ROOT, 'tests', 'editor-v6', 'rapidWindowsGates.test.cjs'), [], 45_000),
    step('vitest-targeted', VITEST, ['run', '--config', 'vitest.editor-v6.config.ts', ...paths], 120_000)
  ]
  if (options.scope === 'render' || options.scope === 'all') {
    steps.push(step('native-compositor-unit', 'internal-node-test', ['tests/editor-v6/nativeCompositorSpike.test.cjs'], 60_000))
  }
  if (options.gate === 'offscreen' || options.gate === 'integration') {
    if (options.scope === 'hair' || options.scope === 'character' || options.scope === 'all') {
      steps.push(step('electron-hair-motion-offscreen', 'scripts/editor-v6/check-motion.cjs', [], 120_000))
    }
    if (options.scope === 'render' || options.scope === 'all') {
      steps.push(step('electron-scene-offscreen', 'scripts/editor-v6/check-scene-surface.cjs', [], 100_000))
    }
  }
  if (options.gate === 'integration') {
    steps.push(step('typecheck', TSC, ['--noEmit', '-p', 'tsconfig.json'], 240_000))
    for (const name of ['check-syntax.cjs', 'check-relative-imports.cjs', 'check-boundaries.cjs']) {
      steps.push(step('architecture-' + name, 'scripts/architecture/' + name, [], 100_000))
    }
    steps.push(step('vitest-full', VITEST, ['run', '--config', 'vitest.editor-v6.config.ts'], 240_000))
    steps.push(step('build', ELECTRON_VITE, ['build'], 300_000))
    if (options.withMp4) {
      steps.push(step('mp4-hair-offscreen', 'scripts/editor-v6/check-hair-motion-export.cjs', [], 600_000))
      steps.push(step('mp4-overlay-offscreen', 'scripts/editor-v6/check-overlay-parity.cjs', [], 600_000))
    }
  }
  return steps.map(item => ({
    ...item,
    args: item.args[0] === 'internal-node-test'
      ? ['--test', ...item.args.slice(1)]
      : [item.args[0], ...item.args.slice(1)]
  }))
}
function gitText(args) {
  try {
    const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 6_000 })
    return result.status === 0 ? result.stdout.trim() : null
  } catch { return null }
}
async function checkDoctor() {
  const branch = gitText(['branch', '--show-current'])
  const local = gitText(['rev-parse', 'HEAD'])
  const tracking = gitText(['rev-parse', '--verify', 'refs/remotes/origin/Dev-V2'])
  const dirty = gitText(['status', '--porcelain=v1', '-uno'])
  const results = {
    branch,
    sameAsFetchedRemote: Boolean(local && tracking && local === tracking),
    cleanTrackedFiles: dirty === '',
    available: {
      vitest: existsSync(VITEST),
      typescript: existsSync(TSC),
      electron: existsSync(path.join(ROOT, 'node_modules', 'electron')),
      electronVite: existsSync(ELECTRON_VITE)
    }
  }
  console.log(JSON.stringify(results, null, 2))
  if (branch !== 'Dev-V2') throw Error('Checkout não está na branch Dev-V2. Sincronize antes de testar.')
  if (!results.available.vitest || !results.available.typescript || !results.available.electron) {
    throw Error('Dependências de testes ausentes. Instale as dependências antes de começar.')
  }
  if (!results.sameAsFetchedRemote) {
    console.warn('Aviso: HEAD local difere do origin/Dev-V2 conhecido. Verifique fetch, commits locais e fast-forward antes de medir.')
  }
}
function terminateTree(pid) {
  if (!pid) return
  // The PID belongs only to a child started by this script. Never kill by
  // process name: that could terminate the user's running application.
  const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  killer.once('error', () => {})
}
async function executeStep(item) {
  const began = performance.now()
  const argv = item.args[0] === 'internal-node-test'
    ? ['--test', ...item.args.slice(1)]
    : item.args[0] === '--test' ? item.args : item.args
  console.log('>>> ' + item.id)
  let child
  try {
    child = spawn(process.execPath, argv, { cwd: ROOT, env: { ...process.env }, stdio: 'inherit', shell: false, windowsHide: true })
  } catch (error) {
    return { id: item.id, ok: false, elapsedMs: Math.round(performance.now() - began), failure: 'spawn failed' }
  }
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; terminateTree(child.pid) }, item.timeoutMs)
  const outcome = await new Promise(resolve => {
    child.once('error', () => resolve({ code: null, error: true }))
    child.once('close', code => resolve({ code, error: false }))
  })
  clearTimeout(timer)
  const duration = Math.round(performance.now() - began)
  const ok = outcome.code === 0 && !outcome.error && !timedOut
  console.log('<<< ' + item.id + ': ' + (ok ? 'OK' : 'FALHOU') + ' (' + duration + ' ms)')
  return { id: item.id, ok, elapsedMs: duration, exitCode: outcome.code, timedOut }
}
function helpText() {
  return [
    'Editor V6 — testes rápidos e invisíveis somente no Windows x64.',
    'Gate padrão: --gate=unit --scope=hair (sem Electron, build ou MP4).',
    '  --gate=doctor      ambiente e estado local (sem executar testes)',
    '  --gate=unit        node:test + Vitest direcionado',
    '  --gate=offscreen   unit + fixture Electron show:false/offscreen:true',
    '  --gate=integration unit + offscreen + typecheck + arquitetura + Vitest completo + build',
    '  --with-mp4         acrescenta MP4 offscreen, somente integration (LONGO)',
    '  --scope=hair|character|render|all',
    'Não há leitura ou alteração de projeto pessoal, nem cache entre exportações.',
    'Cada gate interrompe no primeiro erro; resumo sanitizado em out/editor-v6-rapid/runs.'
  ].join('\n')
}
async function main() {
  const options = parseOptions(process.argv.slice(2))
  if (options.help) { console.log(helpText()); return }
  assertWindows()
  if (options.gate === 'doctor') { await checkDoctor(); return }
  if (!existsSync(VITEST)) throw Error('Vitest não está instalado. Use doctor para checar o ambiente.')
  const folder = path.join(ROOT, 'out', 'editor-v6-rapid', 'runs', new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid)
  await fs.mkdir(folder, { recursive: false }).catch(async error => {
    if (error.code !== 'ENOENT') throw error
    await fs.mkdir(path.dirname(folder), { recursive: true })
    await fs.mkdir(folder, { recursive: false })
  })
  const startedAt = new Date().toISOString()
  const summary = {
    schemaVersion: 1, gate: options.gate, scope: options.scope, withMp4: options.withMp4,
    startedAt, platform: 'win32', architecture: 'x64', windowsBuild: os.release(),
    commit: gitText(['rev-parse', 'HEAD']), steps: [], ok: false
  }
  const began = performance.now()
  try {
    for (const item of planSteps(options)) {
      const outcome = await executeStep(item)
      summary.steps.push(outcome)
      if (!outcome.ok) throw Error('Gate interrompido no passo ' + item.id + '. Corrija ou descarte antes de prosseguir.')
    }
    summary.ok = true
  } finally {
    summary.finishedAt = new Date().toISOString()
    summary.totalMs = Math.round(performance.now() - began)
    await fs.writeFile(path.join(folder, 'summary.json'), JSON.stringify(summary, null, 2), { flag: 'wx' })
    console.log('Resultado: ' + (summary.ok ? 'APROVADO' : 'REPROVADO') + ' — ' + summary.totalMs + ' ms')
    console.log('Relatório local: out/editor-v6-rapid/runs/<execucao>/summary.json')
  }
}
if (require.main === module) {
  main().catch(error => {
    console.error('Editor V6 — gate interrompido: ' + (error instanceof Error ? error.message : 'erro desconhecido'))
    process.exitCode = 1
  })
}
module.exports = { parseOptions, assertWindows, planSteps, helpText }
