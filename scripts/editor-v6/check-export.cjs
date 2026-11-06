const { build } = require('esbuild')
const { spawn } = require('node:child_process')
const { mkdtemp, readFile, mkdir, rm, writeFile } = require('node:fs/promises')
const { basename, join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const os = require('node:os')
const { resolveEditorV6TestOutputDirectory } = require('./testOutputDirectory.cjs')
async function main() {
  const root = resolve(__dirname, '../..'), folder = await mkdtemp(join(tmpdir(), 'editor-v6-export-check-'))
  const output = join(resolveEditorV6TestOutputDirectory(root), 'editor-v6-export-check')
  const reportPath = join(output, 'result.json')
  let completedResult
  try {
    await mkdir(output, { recursive: true })
    await writeFile(reportPath, JSON.stringify({ passed: false, state: 'running', fixtureDirectory: basename(folder) }))
    const entry = join(folder, 'export.electron.cjs')
    await build({ entryPoints: [join(root, 'tests/editor-v6/export.electron.ts')], outfile: entry, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'warning' })
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(require('electron'), [entry, root, folder], { windowsHide: true, stdio: 'inherit', env })
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
    if (code !== 0) {
      process.exitCode = typeof code === 'number' ? code : 1
      await writeFile(reportPath, JSON.stringify({ passed: false, state: 'failed', exitCode: code, fixtureDirectory: basename(folder) }))
      return
    }
    const contents = await readFile(join(folder, 'result.json'), 'utf8')
    const result = JSON.parse(contents)
    if (result.passed !== true) throw Error('O teste não concluiu as verificações.')
    result.outputProduced = Boolean(result.output)
    delete result.output
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
      delete result.mouthStress.output
      result.mouthStress.outputRemovedAfterValidation = true
    }
    completedResult = result
  } catch (error) {
    await writeFile(reportPath, JSON.stringify({ passed: false, state: 'failed', fixtureDirectory: basename(folder) })).catch(() => {})
    throw error
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
  if (completedResult) {
    completedResult.temporaryArtifactsRemoved = true
    await writeFile(reportPath, JSON.stringify(completedResult, null, 2))
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
