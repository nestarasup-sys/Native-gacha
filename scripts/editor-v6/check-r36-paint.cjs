/**
 * R36 experimental offscreen paint vs capturePage probe.
 * Runs in an isolated Electron profile; never changes production capture.
 * A mismatch is reported, not silently accepted as visual parity.
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const { analyzeR36Readback, compareR36ScenePixels } = require('./r36PaintMetrics.cjs')

async function main() {
  if (!process.versions.electron) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'native-gacha-r36-'))
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const code = await new Promise((resolve, reject) => {
      const child = spawn(require('electron'), [__filename, root], { env, stdio: 'inherit', windowsHide: true })
      child.once('error', reject)
      child.once('exit', resolve)
    })
    process.exitCode = code ?? 1
    return
  }
  const { app, BrowserWindow } = require('electron')
  const root = process.argv[2]
  app.setPath('userData', path.join(root, 'profile'))
  await app.whenReady()
  const window = new BrowserWindow({
    show: false, width: 280, height: 256, useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  const timer = setTimeout(() => app.exit(1), 60000)
  let captureErrors = 0
  try {
    await window.loadURL('data:text/html,' + encodeURIComponent('<!doctype html><html><body style="margin:0;background:transparent"><canvas id="c" width="280" height="256"></canvas></body></html>'))
    const results = []
    for (let i = 0; i < 7; i++) {
      // Paint events may be coalesced; subscribe before changing the scene.
      const token = i + 1
      let paintTimer
      const painted = new Promise((resolve, reject) => {
        const handler = (_event, _dirty, image) => {
          clearTimeout(paintTimer)
          window.webContents.removeListener('paint', handler)
          resolve({ image, time: performance.now() })
        }
        window.webContents.on('paint', handler)
        paintTimer = setTimeout(() => {
          window.webContents.removeListener('paint', handler)
          reject(new Error('R36: paint timeout for token ' + token))
        }, 7000)
      })
      const start = performance.now()
      await window.webContents.executeJavaScript(`(() => {
        const c = document.getElementById('c'), ctx = c.getContext('2d')
        ctx.clearRect(0, 0, 256, 256)
        ctx.fillStyle = 'rgba(25, 95, 210, 0.85)'
        ctx.fillRect(${10 + i * 7}, 20, 90, 120)
        ctx.fillStyle = 'rgb(220, 40, 120)'
        ctx.fillRect(180, ${i * 13}, 40, 40)
        // Physical 24-bit bitmap token outside the 256px scene, equivalent
        // to the export worker's out-of-frame marker protocol.
        for (let bit = 0; bit < 24; bit++) {
          ctx.fillStyle = ((${token} >>> bit) & 1) ? '#ff0000' : '#000000'
          ctx.fillRect(256 + (bit % 6) * 4, Math.floor(bit / 6) * 4, 4, 4)
        }
        document.body.dataset.frameToken = '${token}'
        return document.body.dataset.frameToken
      })()`)
      window.webContents.invalidate()
      const { image, time } = await painted
      const tokenAtPaint = await window.webContents.executeJavaScript('document.body.dataset.frameToken')
      const captureStart = performance.now()
      const captured = await window.webContents.capturePage()
      const captureMs = performance.now() - captureStart
      const paintReadback = analyzeR36Readback(image, 256, 256)
      const captureReadback = analyzeR36Readback(captured, 256, 256)
      const differentScenePixels = compareR36ScenePixels(paintReadback, captureReadback, 256, 256)
      const equal = differentScenePixels === 0
      if (!equal) captureErrors++
      results.push({ token, tokenAtPaint, paintMs: Math.round((time - start) * 1000) / 1000,
        captureMs: Math.round(captureMs * 1000) / 1000, width: paintReadback.width,
        height: paintReadback.height, byteEqual: equal,
        sameSize: paintReadback.width === captureReadback.width && paintReadback.height === captureReadback.height,
        paintBitmapToken: paintReadback.token, captureBitmapToken: captureReadback.token,
        differentScenePixels, scenePixels: 256 * 256 })
    }
    const output = path.resolve(process.env.NATIVE_GACHA_TEST_OUTPUT_DIR || path.join(__dirname, '../../out'))
    await fs.mkdir(path.join(output, 'editor-v6-r36-paint'), { recursive: true })
    const summary = { experimental: true, productionEnabled: false, frames: results.length,
      exactMatches: results.filter(x => x.byteEqual).length, mismatches: captureErrors,
      strictParityPassed: captureErrors === 0 && results.every(x => x.tokenAtPaint === String(x.token) &&
        x.paintBitmapToken === x.token && x.captureBitmapToken === x.token),
      resultKind: 'research-only', productionParityProven: false,
      warning: 'research-only physical tokens are measured per bitmap; parity here still does not authorize production paint capture', results }
    await fs.writeFile(path.join(output, 'editor-v6-r36-paint', 'result.json'), JSON.stringify(summary, null, 2))
    console.log(JSON.stringify(summary))
    // This is a research measurement, not a production parity gate. Electron's
    // paint events can be coalesced and do not carry the requested frame token.
    // A mismatch MUST remain visible in result.json, but is an expected
    // experimental outcome, not a failure of the Windows test infrastructure.
    // Explicit --require-parity restores strict exit semantics for developers.
    if (!results.every(r => Number.isFinite(r.paintMs) && Number.isFinite(r.captureMs) &&
      r.width > 0 && r.height > 0 && Number.isSafeInteger(r.token))) {
      throw Error('R36: invalid or incomplete paint measurements')
    }
    if (process.argv.includes('--require-parity') && !summary.strictParityPassed) {
      throw Error('R36: strict experimental parity failed; inspect result.json')
    }
    clearTimeout(timer)
    window.destroy()
    app.exit(0)
  } catch (error) {
    console.error(error)
    clearTimeout(timer)
    window.destroy()
    app.exit(1)
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
