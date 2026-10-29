const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { build } = require('esbuild')

async function main() {
  const root = path.resolve(__dirname, '../..')
  await fs.access(path.join(root, 'out/renderer/index.html'))
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'gacha-bootstrap-'))
  await build({ entryPoints: [path.join(root, 'electron/windowNavigation.ts')], outfile: path.join(folder, 'navigation.cjs'), bundle: true, platform: 'node', format: 'cjs', logLevel: 'warning' })
  await fs.writeFile(path.join(folder, 'preload.cjs'), `
    const { contextBridge } = require('electron')
    let read = false
    contextBridge.exposeInMainWorld('editorV6MotionWorker', { payload: async () => { read = true; return null }, provider: {}, complete: async () => {} })
    contextBridge.exposeInMainWorld('bootstrapProbe', { read: () => read })
  `)
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(require('electron'), [path.join(root, 'tests/editor-v6/bootstrap.electron.cjs'), folder, path.join(root, 'out/renderer/index.html')], { env, windowsHide: true, stdio: 'inherit' })
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
  if (code !== 0) throw Error(`Bootstrap Electron falhou: ${code}`)
  const result = await fs.readFile(path.join(folder, 'result.json'), 'utf8')
  const output = path.join(root, 'out/editor-v6-bootstrap')
  await fs.mkdir(output, { recursive: true })
  await fs.writeFile(path.join(output, 'result.json'), result)
  console.log(result)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
