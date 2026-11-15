'use strict'
const { existsSync } = require('node:fs')
const { execFileSync, spawnSync } = require('node:child_process')
const path = require('node:path')

if (process.platform !== 'win32') {
  throw new Error('O renderizador nativo do Editor V6 exige Windows e o Windows SDK.')
}

function findCmake() {
  const fromPath = spawnSync('where.exe', ['cmake.exe'], { encoding: 'utf8', windowsHide: true })
  const candidate = fromPath.status === 0 ? fromPath.stdout.split(/\r?\n/).find(Boolean) : undefined
  if (candidate && existsSync(candidate)) return candidate
  const vswhere = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe'
  if (!existsSync(vswhere)) throw new Error('CMake não está no PATH e o instalador do Visual Studio não foi encontrado.')
  const installPath = execFileSync(vswhere, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8', windowsHide: true }).trim()
  const bundled = path.join(installPath, 'Common7', 'IDE', 'CommonExtensions', 'Microsoft', 'CMake', 'CMake', 'bin', 'cmake.exe')
  if (!installPath || !existsSync(bundled)) throw new Error('CMake e a toolchain C++ do Visual Studio não foram encontrados.')
  return bundled
}

const root = path.resolve(__dirname, '../..')
const buildDir = path.join(root, 'out', 'native', 'editor-v6-renderer')
const cmake = findCmake()
for (const args of [
  ['-S', path.join(root, 'native', 'editor-v6-renderer'), '-B', buildDir, '-G', 'Visual Studio 17 2022', '-A', 'x64'],
  ['--build', buildDir, '--config', 'Release', '--parallel', String(Math.max(1, Math.min(4, require('node:os').availableParallelism())))]
]) {
  const result = spawnSync(cmake, args, { cwd: root, stdio: 'inherit', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
