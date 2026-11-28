const { build } = require('esbuild')
const { spawn, execFileSync } = require('node:child_process')
const { existsSync, statfsSync } = require('node:fs')
const { copyFile, mkdir, mkdtemp, readFile, readdir, stat, writeFile } = require('node:fs/promises')
const { basename, join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const { createHash } = require('node:crypto')
const { resolveEditorV6TestOutputDirectory } = require('./testOutputDirectory.cjs')
const { removeEditorV6TemporaryFixture } = require('./temporaryFixture.cjs')

const goldenLimitBytes = 5_000_000
const minimumFreeBytes = 2_000_000_000
const fixturePrefix = 'editor-v6-golden-export-'

async function main() {
  if (process.platform !== 'win32') throw Error('O teste dourado de exportação requer Windows e Electron.')
  const root = resolve(__dirname, '../..')
  const recording = process.argv.includes('--record-reference')
  const unifiedCards = process.argv.includes('--unified-cards')
  const extendedFeatures = unifiedCards || process.argv.includes('--extended-features')
  if (unifiedCards && recording) throw Error('O teste de cards unificados não grava referência dourada.')
  const expectedFrames = extendedFeatures ? 135 : 90
  const filesystem = statfsSync(root)
  const freeBytes = filesystem.bavail * filesystem.bsize
  if (freeBytes < minimumFreeBytes) throw Error(`Espaço livre insuficiente: ${freeBytes} B; exigidos ${minimumFreeBytes} B.`)
  const folder = await mkdtemp(join(tmpdir(), fixturePrefix))
  const output = join(resolveEditorV6TestOutputDirectory(root), unifiedCards ? 'editor-v6-unified-cards' : extendedFeatures ? 'editor-v6-golden-export-v2' : 'editor-v6-golden-export')
  await mkdir(output, { recursive: true })
  const entry = join(folder, 'golden-export.electron.cjs')
  await build({ entryPoints: [join(root, 'tests/editor-v6/goldenExport.electron.ts')], outfile: entry, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'warning' })
  const env = { ...process.env, GACHA_EDITOR_V6_GOLDEN_REFERENCE_REVISION: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(require('electron'), [entry, root, folder, ...(extendedFeatures ? ['--extended-features'] : []), ...(unifiedCards ? ['--unified-cards'] : []), ...(recording ? ['--record-reference'] : [])], { windowsHide: true, stdio: 'inherit', env })
  const code = await new Promise((resolveCode, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(Error('O teste dourado excedeu 60 s.')) }, 60_000)
    child.once('error', error => { clearTimeout(timeout); reject(error) })
    child.once('exit', exitCode => { clearTimeout(timeout); resolveCode(exitCode) })
  })
  if (code !== 0) throw Error(`Electron saiu com código ${code}; fixture isolada preservada em ${folder}.`)
  const result = JSON.parse(await readFile(join(folder, 'result.json'), 'utf8'))
  if (result.passed !== true || result.fixture.frames !== expectedFrames || result.mp4.frames !== expectedFrames
    || result.fixture.version !== (extendedFeatures ? 2 : 1)) throw Error('O processo Electron não produziu o relatório dourado esperado.')
  const resultPath = join(output, 'result.json')
  await writeFile(resultPath, JSON.stringify({ ...result, freeBytesBeforeRun: freeBytes }, null, 2))
  if (recording) {
    const candidate = join(output, 'reference-candidate')
    if (existsSync(candidate)) throw Error(`A referência candidata já existe; recusando sobrescrever: ${candidate}`)
    await mkdir(candidate)
    for (const file of ['golden.json', 'scene.bgra.gz', 'background.bgra.gz', 'foreground.bgra.gz']) await copyFile(join(folder, file), join(candidate, file))
    const files = await readdir(candidate)
    const index = []
    let totalBytes = 0
    for (const file of files) {
      const fullPath = join(candidate, file), details = await stat(fullPath)
      totalBytes += details.size
      index.push({ file, bytes: details.size, sha256: createHash('sha256').update(await readFile(fullPath)).digest('hex') })
    }
    await writeFile(join(candidate, 'candidate-index.json'), JSON.stringify({ files: index, totalBytes }, null, 2))
    if (totalBytes > goldenLimitBytes) throw Error(`A referência comprimida tem ${totalBytes} B; o limite registrado é ${goldenLimitBytes} B.`)
    console.log(`Referência candidata isolada: ${candidate} (${totalBytes} B antes do índice). Confira e promova manualmente.`)
  }
  console.log(`Teste dourado concluído; resultado: ${resultPath}`)
  await removeEditorV6TemporaryFixture(folder, fixturePrefix)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
