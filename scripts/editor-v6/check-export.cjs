const { build } = require('esbuild')
const { spawn } = require('node:child_process')
const { mkdtemp, readFile } = require('node:fs/promises')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
async function main() {
  const root = resolve(__dirname, '../..'), folder = await mkdtemp(join(tmpdir(), 'editor-v6-export-check-'))
  const entry = join(folder, 'export.electron.cjs')
  await build({ entryPoints: [join(root, 'tests/editor-v6/export.electron.ts')], outfile: entry, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'warning' })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(require('electron'), [entry, root, folder], { windowsHide: true, stdio: 'inherit', env })
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
  process.exitCode = typeof code === 'number' ? code : 1
  if (code === 0 && JSON.parse(await readFile(join(folder, 'result.json'), 'utf8')).passed !== true) throw Error('O teste não concluiu as verificações.')
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
