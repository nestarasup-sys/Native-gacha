const { build } = require('esbuild')
const { spawn } = require('node:child_process')
const { mkdtemp, readFile, mkdir, writeFile } = require('node:fs/promises')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')

async function main() {
  const root = resolve(__dirname, '../..')
  const folder = await mkdtemp(join(tmpdir(), 'editor-v6-face-export-'))
  const output = join(root, 'out/editor-v6-face-export-check')
  await mkdir(output, { recursive: true })
  await writeFile(join(output, 'result.json'), JSON.stringify({ passed: false, state: 'running', fixtureDirectory: folder }))
  const entry = join(folder, 'face-export.electron.cjs')
  await build({ entryPoints: [join(root, 'tests/editor-v6/faceExport.electron.ts')], outfile: entry, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'warning' })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(require('electron'), [entry, root, folder], { windowsHide: true, stdio: 'inherit', env })
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
  process.exitCode = typeof code === 'number' ? code : 1
  if (code !== 0) {
    await writeFile(join(output, 'result.json'), JSON.stringify({ passed: false, state: 'failed', exitCode: code, fixtureDirectory: folder }))
    return
  }
  const contents = await readFile(join(folder, 'result.json'), 'utf8')
  if (JSON.parse(contents).passed !== true) throw Error('A validação silenciosa de faces não concluiu as verificações.')
  await writeFile(join(output, 'result.json'), contents)
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
