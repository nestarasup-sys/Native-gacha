'use strict'

// Safe, local-only dependency reconciliation for ABRIR_DESENVOLVIMENTO.bat.
// It is intentionally separated from "npm run dev": no legacy profile migration.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

const MARKER = 'native-gacha-dev-v3-deps.json'

function expectedFingerprint(lockContent, { node = process.versions.modules, platform = process.platform, arch = process.arch } = {}) {
  return crypto.createHash('sha256')
    .update(lockContent).update('\n').update(String(node))
    .update('\n').update(platform).update('\n').update(arch).digest('hex')
}
function dependencyState(root, environment = {}) {
  const lock = path.join(root, 'package-lock.json')
  if (!fs.existsSync(lock)) throw Error('package-lock.json nao existe; recusa de instalar dependencias sem lockfile.')
  const fingerprint = expectedFingerprint(fs.readFileSync(lock), environment)
  const nodeModules = path.join(root, 'node_modules')
  const marker = path.join(nodeModules, '.cache', MARKER)
  const required = process.platform === 'win32'
    ? ['electron/dist/electron.exe', '.bin/electron-vite.cmd', 'sharp/package.json']
    : ['electron/package.json', '.bin/electron-vite', 'sharp/package.json']
  const allPresent = required.every(item => fs.existsSync(path.join(nodeModules, item)))
  let previous
  try { previous = JSON.parse(fs.readFileSync(marker, 'utf8')) } catch { previous = null }
  return { fingerprint, marker, needsInstall: !allPresent || previous?.fingerprint !== fingerprint }
}
function installDependencies(root) {
  const win = process.platform === 'win32'
  const executable = win ? (process.env.ComSpec || 'cmd.exe') : 'npm'
  const args = win ? ['/d', '/s', '/c', 'npm ci --no-audit --no-fund'] : ['ci', '--no-audit', '--no-fund']
  const result = spawnSync(executable, args, { cwd: root, stdio: 'inherit', windowsHide: false })
  if (result.error || result.status !== 0) throw Error('npm ci falhou; confirme Node, rede e ferramentas nativas. ' + (result.error?.message || ''))
}
function ensureDependencies(root = path.resolve(__dirname, '..', '..')) {
  const state = dependencyState(root)
  if (!state.needsInstall) {
    console.log('[Dev-v3] Dependencias ja correspondem ao package-lock.json.')
    return { installed: false }
  }
  console.log('[Dev-v3] Dependencias ausentes ou desatualizadas; executando npm ci em node_modules.')
  console.log('[Dev-v3] A instalacao NAO executa npm run dev nem migra app-data.')
  installDependencies(root)
  const required = ['electron/dist/electron.exe', '.bin/electron-vite.cmd', 'sharp/package.json']
  if (process.platform === 'win32' && required.some(item => !fs.existsSync(path.join(root, 'node_modules', item)))) {
    throw Error('A instalacao terminou sem Electron, Electron-Vite ou Sharp. Verifique os logs e nao inicie o app.')
  }
  fs.mkdirSync(path.dirname(state.marker), { recursive: true })
  const temporary = state.marker + '.' + process.pid + '.tmp'
  try {
    fs.writeFileSync(temporary, JSON.stringify({ fingerprint: state.fingerprint }, null, 2) + '\n', { flag: 'wx' })
    fs.renameSync(temporary, state.marker)
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary)
  }
  console.log('[Dev-v3] Dependencias sincronizadas com o commit local.')
  return { installed: true }
}
if (require.main === module) {
  try { ensureDependencies() } catch (error) {
    console.error('[Dev-v3] ' + (error instanceof Error ? error.message : String(error)))
    process.exitCode = 1
  }
}
module.exports = { expectedFingerprint, dependencyState, ensureDependencies }
