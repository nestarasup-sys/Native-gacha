/** Isolated Electron/FFmpeg parity test. Never reads user data or personal media. */
const { build } = require('esbuild')
const { spawn } = require('node:child_process')
const { mkdtemp, readFile, mkdir, writeFile } = require('node:fs/promises')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')

async function main() {
  if (process.platform !== 'win32') throw Error('This real MP4 integration check requires Windows.')
  const root = resolve(__dirname, '../..')
  const folder = await mkdtemp(join(tmpdir(), 'editor-v6-overlay-parity-'))
  const output = join(root, 'out/editor-v6-overlay-parity')
  await mkdir(output, { recursive: true })
  const entry = join(folder, 'overlay-parity.electron.cjs')
  await build({ entryPoints: [join(root, 'tests/editor-v6/exportOverlayParity.electron.ts')],
    outfile: entry, bundle: true, platform: 'node', format: 'cjs',
    external: ['electron'], logLevel: 'warning' })
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(require('electron'), [entry, root, folder], {
    windowsHide: true, stdio: 'inherit', env
  })
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
  if (code !== 0) {
    await writeFile(join(output, 'result.json'), JSON.stringify({ passed: false, exitCode: code }))
    throw Error('Real MP4 overlay parity failed with Electron exit ' + code)
  }
  const summary = JSON.parse(await readFile(join(folder, 'result.json'), 'utf8'))
  if (summary.passed !== true || summary.frames !== 60 || summary.turboParts !== 2) {
    throw Error('Electron ended without an approved pixel-level parity report.')
  }
  await writeFile(join(output, 'result.json'), JSON.stringify(summary, null, 2))
  console.log('Real MP4 overlap parity verified:', join(output, 'result.json'))
}
main().catch(reason => { console.error(reason); process.exitCode = 1 })
