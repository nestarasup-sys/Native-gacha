'use strict'
/**
 * GPU parity benchmark uses the exact bundled PixiJS installation.
 * esbuild creates one classic script (not file:// ESM imports, which Chromium
 * may block due to null-origin CORS). Nothing is read from a user project.
 */
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const esbuild = require('esbuild')

app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  const features = app.getGPUFeatureStatus()
  const info = await app.getGPUInfo('basic').catch(() => null)
  const software = /swiftshader|software|llvmpipe|microsoft basic render/i.test(JSON.stringify(info))
  if (features.webgl !== 'enabled' || software) {
    console.log(JSON.stringify({ ok: true, skipped: true,
      reason: 'No hardware WebGL2 GPU detected; no performance claim', features }, null, 2))
    app.exit(0)
    return
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'native-gacha-pixi-rig-'))
  let win
  try {
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'pixi-gacha-pose-rig-benchmark.entry.ts')],
      bundle: true, format: 'iife', platform: 'browser', target: 'es2022',
      outfile: path.join(root, 'bundle.js'), logLevel: 'warning',
    })
    fs.writeFileSync(path.join(root, 'index.html'),
      '<!doctype html><html><head><meta charset="utf-8"></head><body><script src="./bundle.js"></script></body></html>')
    win = new BrowserWindow({ show: false, width: 360, height: 320,
      webPreferences: { contextIsolation: true, nodeIntegration: false,
        sandbox: true, backgroundThrottling: false } })
    const failures = []
    win.webContents.on('did-fail-load', (_, code, description) => failures.push({ code, description }))
    win.webContents.on('console-message', (_, level, message) => {
      if (level >= 2) failures.push({ level, message })
    })
    await win.loadFile(path.join(root, 'index.html'))
    const result = await Promise.race([
      win.webContents.executeJavaScript(`(async() => {
        for (let i = 0; i < 600; i++) {
          if (window.__pixiRigBenchmark) return window.__pixiRigBenchmark
          await new Promise(resolve => setTimeout(resolve, 100))
        }
        throw Error('Pixi benchmark result never initialized')
      })()`, true),
      new Promise((_, reject) => setTimeout(() => reject(Error('Pixi GPU smoke timed out')), 65000)),
    ])
    if (!result?.ok || result.stats.spritesCreated !== 3 || result.stats.texturesCreated !== 3
      || result.stats.poseUpdates !== 185 || result.stats.orderUpdates !== 1
      || result.samples.some(s => s.cpuOpaque === 0 || s.gpuOpaque === 0)) {
      throw Error('Pixi proof failed: ' + JSON.stringify({ result, failures }))
    }
    console.log(JSON.stringify({ ...result, machine: { os: process.platform, gpuInfo: info } }, null, 2))
  } finally {
    if (win && !win.isDestroyed()) win.destroy()
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 })
    app.exit(0)
  }
}).catch(error => { console.error(error.stack || error.message); app.exit(1) })
