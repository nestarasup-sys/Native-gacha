const { build } = require('esbuild')
const { spawn } = require('node:child_process')
const { mkdtemp, readFile, mkdir, writeFile, copyFile } = require('node:fs/promises')
const { basename, join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const os = require('node:os')
const { resolveEditorV6TestOutputDirectory } = require('./testOutputDirectory.cjs')
async function main() {
  const root = resolve(__dirname, '../..'), folder = await mkdtemp(join(tmpdir(), 'editor-v6-export-check-'))
  const output = join(resolveEditorV6TestOutputDirectory(root), 'editor-v6-export-check')
  await mkdir(output, { recursive: true })
  await writeFile(join(output, 'result.json'), JSON.stringify({ passed: false, state: 'running', fixtureDirectory: basename(folder) }))
  const entry = join(folder, 'export.electron.cjs')
  await build({ entryPoints: [join(root, 'tests/editor-v6/export.electron.ts')], outfile: entry, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'warning' })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(require('electron'), [entry, root, folder], { windowsHide: true, stdio: 'inherit', env })
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
  process.exitCode = typeof code === 'number' ? code : 1
  if (code !== 0) await writeFile(join(output, 'result.json'), JSON.stringify({ passed: false, state: 'failed', exitCode: code, fixtureDirectory: basename(folder) }))
  if (code === 0) {
    const contents = await readFile(join(folder, 'result.json'), 'utf8')
    const result = JSON.parse(contents)
    if (result.passed !== true) throw Error('O teste não concluiu as verificações.')
    result.benchmarkContext = {
      gameRunningByUserStatement: true,
      controlledBenchmark: false,
      node: process.version,
      electron: require('electron/package.json').version,
      platform: process.platform,
      architecture: process.arch,
      logicalCpuCount: os.cpus().length,
      syntheticMouthFixture: { width: 320, height: 180, frames: result.mouthStress?.frames ?? null, fps: result.mouthStress?.fps ?? null }
    }
    if (result.mouthStress?.output) {
      const mouthOutput = join(output, 'mouth-stress.mp4')
      await copyFile(result.mouthStress.output, mouthOutput)
      result.mouthStress.output = mouthOutput
    }
    await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2))
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
