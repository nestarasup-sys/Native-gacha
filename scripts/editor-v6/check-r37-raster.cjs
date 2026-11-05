/** Synthetic, isolated Electron pixel gate for R37 plain-piece compositor. */
const { build } = require('esbuild')
const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

async function main() {
  if (!process.versions.electron) {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'r37-pixel-gate-'))
    await build({
      entryPoints: [path.resolve(__dirname, '../../tests/editor-v6/r37RasterParity.browser.ts')],
      outfile: path.join(folder, 'r37.js'), bundle: true, platform: 'browser',
      format: 'iife', globalName: 'R37', logLevel: 'warning'
    })
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(require('electron'), [__filename, folder], { stdio: 'inherit', windowsHide: true, env })
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', resolve)
    })
    process.exitCode = code === null ? 1 : code
    return
  }
  const { app, BrowserWindow } = require('electron')
  const folder = process.argv[2]
  app.setPath('userData', path.join(folder, 'profile'))
  await app.whenReady()
  const window = new BrowserWindow({
    show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true }
  })
  const timeout = setTimeout(() => app.exit(1), 90000)
  try {
    await fs.writeFile(path.join(folder, 'index.html'), '<!doctype html><html><body></body></html>')
    await window.loadFile(path.join(folder, 'index.html'))
    await window.webContents.executeJavaScript(await fs.readFile(path.join(folder, 'r37.js'), 'utf8'))
    const result = await window.webContents.executeJavaScript('R37.runR37RasterParity()')
    if (result.passed !== true || result.frames !== 309 || result.decodedImages !== 1 || result.exportReady !== false ||
      result.layered?.passed !== true || result.layered?.frames !== 30 ||
      result.layered?.decodedSources !== 5 || result.layered?.exportReady !== false) {
      throw Error('R37: incomplete pixel report')
    }
    const output = path.resolve(process.env.NATIVE_GACHA_TEST_OUTPUT_DIR || path.join(__dirname, '../../out'))
    await fs.mkdir(path.join(output, 'editor-v6-r37-pixel'), { recursive: true })
    const { captures, ...summary } = result
    for (const name of ['first', 'last']) {
      if (typeof captures?.[name] !== 'string' || !captures[name].startsWith('data:image/png;base64,')) {
        throw Error('R37: missing synthetic visual capture ' + name)
      }
      await fs.writeFile(path.join(output, 'editor-v6-r37-pixel', name + '.png'), Buffer.from(captures[name].split(',')[1], 'base64'))
    }
    await fs.writeFile(path.join(output, 'editor-v6-r37-pixel', 'result.json'), JSON.stringify(summary, null, 2))
    console.log(JSON.stringify(summary))
    clearTimeout(timeout)
    window.destroy()
    app.exit(0)
  } catch (error) {
    console.error(error)
    clearTimeout(timeout)
    window.destroy()
    app.exit(1)
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
