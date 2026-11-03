const { build } = require('esbuild')
const { spawn } = require('node:child_process')
const { mkdtemp, readFile, mkdir, writeFile, copyFile } = require('node:fs/promises')
const { createHash } = require('node:crypto')
const { basename, join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const { resolveEditorV6TestOutputDirectory } = require('./testOutputDirectory.cjs')

async function main() {
  const root = resolve(__dirname, '../..')
  const folder = await mkdtemp(join(tmpdir(), 'editor-v6-hair-motion-'))
  const output = join(resolveEditorV6TestOutputDirectory(root), 'editor-v6-hair-motion-check')
  await mkdir(output, { recursive: true })
  await writeFile(join(output, 'result.json'), JSON.stringify({ passed: false, state: 'running', fixtureDirectory: basename(folder) }))
  const entry = join(folder, 'hair-motion.electron.cjs')
  await build({ entryPoints: [join(root, 'tests/editor-v6/hairMotionExport.electron.ts')], outfile: entry, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'warning' })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(require('electron'), [entry, root, folder, ...process.argv.slice(2)], { windowsHide: true, stdio: 'inherit', env })
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
  if (code !== 0) {
    await writeFile(join(output, 'result.json'), JSON.stringify({ passed: false, state: 'failed', exitCode: code, fixtureDirectory: basename(folder) }))
    process.exitCode = typeof code === 'number' ? code : 1
    return
  }
  const result = JSON.parse(await readFile(join(folder, 'result.json'), 'utf8'))
  if (result.passed !== true) throw Error('A validação da animação de cabelo não concluiu as verificações.')
  const artifacts = ['hair-frame-000.png', 'hair-frame-000-alpha-layer.png', 'hair-frame-023-transition-start.png', 'hair-frame-030-after-transition.png', 'hair-frame-010-720p-rgba.png', 'hair-background-white.png', 'hair-background-black.png', 'hair-background-colored.png', 'hair-background-checkerboard.png', 'geometry.json', 'geometry-frames.json', 'background-checks.json', 'resolution-checks.json', 'hair-motion-720p-safe.mp4', 'hair-motion-720p-turbo-a.mp4', 'hair-motion-720p-safe-repeat.mp4', 'hair-motion-720p-turbo-b.mp4', 'hair-motion-1080p-turbo-start-late.mp4']
  if (result.longCombinedProfile?.passed === true) artifacts.push('hair-mouth-5min-720p.mp4', 'hair-mouth-5min-720p.mp4.report.json', 'hair-mouth-5min-memory-profile.json')
  const artifactFolder = join(output, 'artifacts')
  await mkdir(artifactFolder, { recursive: true })
  const manifest = []
  for (const name of artifacts) {
    const source = join(folder, name), destination = join(artifactFolder, name)
    const bytes = await readFile(source)
    await copyFile(source, destination)
    manifest.push({ file: `artifacts/${name}`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  await writeFile(join(output, 'artifact-manifest.json'), JSON.stringify({ syntheticOnly: true, artifacts: manifest }, null, 2))
  await writeFile(join(output, 'result.json'), JSON.stringify({ ...result, fixtureDirectory: basename(folder) }, null, 2))
}

main().catch(error => { console.error(error); process.exitCode = 1 })
