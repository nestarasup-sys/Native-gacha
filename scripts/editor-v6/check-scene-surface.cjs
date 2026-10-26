/** Real Chromium rendering test; uses its own hidden window and temporary profile. */
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

async function main() {
  if (!process.versions.electron) {
    const { build } = require('esbuild')
    const { spawn } = require('node:child_process')
    const root = path.resolve(__dirname, '../..')
    const taskRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'editor-v6-scene-check-'))
    const bundle = path.join(taskRoot, 'surface.browser.js')
    await build({ entryPoints: [path.join(root, 'tests/editor-v6/surface.browser.tsx')], outfile: bundle, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', target: 'chrome140', define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning' })
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(require('electron'), [__filename, bundle, taskRoot], { stdio: 'inherit', windowsHide: true, env })
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve) })
    process.exitCode = typeof code === 'number' ? code : 1
    return
  }
  const { app, BrowserWindow } = require('electron')
  const bundle = path.resolve(process.argv[2]), taskRoot = path.resolve(process.argv[3])
  if (!taskRoot.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(taskRoot).startsWith('editor-v6-scene-check-') || path.dirname(bundle) !== taskRoot) throw Error('Perfil isolado inválido.')
  app.setPath('userData', path.join(taskRoot, 'profile'))
  app.commandLine.appendSwitch('force-device-scale-factor', '1')
  await app.whenReady()
  const window = new BrowserWindow({ show: false, useContentSize: true, width: 960, height: 540, webPreferences: { backgroundThrottling: false, contextIsolation: true, sandbox: true, offscreen: true } })
  const timeout = setTimeout(() => { console.error('SceneSurface: tempo limite de 45 segundos.'); app.exit(1) }, 45000)
  try {
    const htmlPath = path.join(taskRoot, 'surface.html')
    await fs.copyFile(path.resolve(__dirname, '../../src/renderer/src/ui/styles.css'), path.join(taskRoot, 'app.css'))
    await fs.writeFile(htmlPath, '<!doctype html><html><head><link rel="stylesheet" href="app.css"></head><body style="margin:0"><div id="surface-test" style="width:960px;height:540px"></div></body></html>')
    await window.loadFile(htmlPath)
    await window.webContents.executeJavaScript(await fs.readFile(bundle, 'utf8'))
    const result = await window.webContents.executeJavaScript('globalThis.runSurfaceCheck()')
    await window.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    const screenshot = await window.webContents.capturePage({ x: 0, y: 0, width: 960, height: 540 })
    await fs.writeFile(path.join(taskRoot, 'native-preview.png'), screenshot.toPNG())
    await fs.writeFile(path.join(taskRoot, 'expected-capture.png'), Buffer.from(result.capture.split(',')[1], 'base64'))
    result.nativePreviewComparison = await window.webContents.executeJavaScript(`globalThis.compareNativeSurface(${JSON.stringify(screenshot.toDataURL())})`)
    result.exportPanel = await window.webContents.executeJavaScript('globalThis.checkExportPanel()')
    await fs.writeFile(path.join(taskRoot, 'export-panel.png'), (await window.webContents.capturePage()).toPNG())
    await window.webContents.executeJavaScript('globalThis.closeExportPanelCheck()')
    const capturePath = path.join(taskRoot, 'scene-surface.png')
    await fs.writeFile(capturePath, Buffer.from(result.capture.split(',')[1], 'base64'))
    delete result.capture
    console.log(JSON.stringify({ ...result, capturePath }, null, 2))
    clearTimeout(timeout)
    window.destroy()
    app.exit(0)
  } catch (error) {
    clearTimeout(timeout)
    console.error(error)
    console.error('Arquivos de comparação:', taskRoot)
    window.destroy()
    app.exit(1)
  }
}

main().catch((error) => { console.error(error); process.exit(1) })
