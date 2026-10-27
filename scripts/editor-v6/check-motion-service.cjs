const { build } = require('esbuild')
const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
async function main() {
  const root = path.resolve(__dirname, '../..'), folder = await fs.mkdtemp(path.join(os.tmpdir(), 'v6-motion-service-'))
  await build({ entryPoints: [path.join(root, 'tests/editor-v6/motion-service.electron.ts')], outfile: path.join(folder, 'main.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'warning' })
  await build({ entryPoints: [path.join(root, 'tests/editor-v6/motion-service.browser.ts')], outfile: path.join(folder, 'worker.js'), bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning' })
  await build({ entryPoints: [path.join(root, 'tests/editor-v6/motion-background.browser.tsx')], outfile: path.join(folder, 'background.js'), bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning' })
  await build({ entryPoints: [path.join(root, 'electron/editorV6MotionPreload.ts')], outfile: path.join(folder, 'preload.cjs'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'], logLevel: 'warning' })
  await fs.writeFile(path.join(folder, 'index.html'), '<!doctype html><html><body><script src="worker.js"></script></body></html>')
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(require('electron'), [path.join(folder, 'main.cjs'), folder], { windowsHide: true, stdio: 'inherit', env })
  process.exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve) })
  if (process.exitCode === 0) {
    const target = path.join(root, 'out/editor-v6-motion-service')
    await fs.mkdir(target, { recursive: true })
    await fs.copyFile(path.join(folder, 'result.json'), path.join(target, 'result.json'))
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
