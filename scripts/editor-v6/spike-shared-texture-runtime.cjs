'use strict'

// Research-only Electron smoke for the experimental offscreen shared-texture API.
// Every Electron profile lives in a fresh OS temp directory and is deleted by
// the supervisor. Only a small JSON summary is kept under this LAB's run folder.
const { spawnSync } = require('node:child_process')
const { mkdtemp, mkdir, rm, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')

const root = resolve(__dirname, '../..')
const integerArgument = (name, fallback, minimum, maximum) => {
  const raw = process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3)
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw Error(`--${name} precisa ser inteiro entre ${minimum} e ${maximum}.`)
  return value
}
const width = integerArgument('width', 640, 640, 1920)
const height = integerArgument('height', 360, 360, 1080)
const samples = integerArgument('frames', 5, 1, 300)
const paintFrameRate = integerArgument('paint-fps', 60, 30, 60)
if (paintFrameRate !== 30 && paintFrameRate !== 60) throw Error('--paint-fps aceita apenas 30 ou 60.')
const output = join(root, 'out/editor-v6-stress/runs', `electron-shared-texture-runtime-2026-11-10-${width}x${height}-${samples}f-${paintFrameRate}fps`)

async function runElectron(scratch) {
  const { app, BrowserWindow, ipcMain, screen, sharedTexture } = require('electron')
  const startedAt = performance.now()
  app.setPath('userData', join(scratch, 'profile'))
  app.on('window-all-closed', () => {})
  let window
  try {
    await app.whenReady()
    if (!sharedTexture?.importSharedTexture) throw Error('Electron sharedTexture.importSharedTexture indisponível.')
    const preload = join(scratch, 'shared-texture-preload.cjs')
    await writeFile(preload, `const { ipcRenderer, sharedTexture } = require('electron')
let encoder
let encodedFrames = 0, encodedBytes = 0, encodeError
const config = { codec: 'avc1.640029', width: ${width}, height: ${height}, bitrate: 2000000, framerate: 30, hardwareAcceleration: 'prefer-hardware', latencyMode: 'quality', avc: { format: 'annexb' } }
const encoderReady = VideoEncoder.isConfigSupported(config).then(support => {
  if (!support.supported) throw Error('VideoEncoder H.264 não suporta o smoke.')
  encoder = new VideoEncoder({ output(chunk) { encodedFrames++; encodedBytes += chunk.byteLength }, error(error) { encodeError = String(error) } })
  encoder.configure(support.config)
})
sharedTexture.setSharedTextureReceiver(async ({ importedSharedTexture }, sample) => {
  let frame, cropped
  try {
    await encoderReady
    frame = importedSharedTexture.getVideoFrame()
    cropped = new VideoFrame(frame, { visibleRect: { x: 0, y: 0, width: ${width}, height: ${height} }, timestamp: sample * 33333 })
    encoder.encode(cropped, { keyFrame: sample === 0 })
    cropped.close(); cropped = undefined
    if (encoder.encodeQueueSize > 4) await new Promise(resolve => encoder.addEventListener('dequeue', resolve, { once: true }))
    ipcRenderer.send('shared-texture-probe-result', { sample, width: cropped?.codedWidth ?? ${width}, height: ${height}, sourceWidth: frame.codedWidth, sourceHeight: frame.codedHeight, timestamp: frame.timestamp, format: frame.format, frameClass: frame.constructor?.name ?? 'unknown', encodedQueue: encoder.encodeQueueSize })
  } catch (error) {
    ipcRenderer.send('shared-texture-probe-result', { sample, error: String(error) })
  } finally {
    try { cropped?.close(); frame?.close() } finally { importedSharedTexture.release() }
  }
})
ipcRenderer.on('shared-texture-probe-finish', async () => {
  try { await encoderReady; await encoder.flush(); encoder.close(); ipcRenderer.send('shared-texture-probe-finished', { encodedFrames, encodedBytes, encodeError }) }
  catch (error) { ipcRenderer.send('shared-texture-probe-finished', { encodedFrames, encodedBytes, encodeError: String(error) }) }
})\n`, { flag: 'wx' })
    window = new BrowserWindow({
      show: false, width, height, useContentSize: true, enableLargerThanScreen: true,
      webPreferences: {
        preload, backgroundThrottling: false, sandbox: true,
        contextIsolation: true, nodeIntegration: false,
        offscreen: { useSharedTexture: true, sharedTexturePixelFormat: 'argb' }
      }
    })
    window.setContentSize(width, height)
    window.webContents.setFrameRate(paintFrameRate)
    const html = join(scratch, 'worker.html')
    await writeFile(html, `<!doctype html><meta charset="utf-8"><body style="margin:0"><canvas id="c" width="${width}" height="${height}"></canvas></body>`, { flag: 'wx' })
    await window.loadFile(html)
    const results = []
    let missingTextureEvents = 0
    for (let sample = 0; sample < samples; sample++) {
      let timer
      const paint = new Promise((resolvePaint, rejectPaint) => {
        const listener = (event) => {
          const texture = event.texture
          if (!texture) { missingTextureEvents++; return }
          clearTimeout(timer)
          window.webContents.removeListener('paint', listener)
          resolvePaint(texture)
        }
        window.webContents.on('paint', listener)
        timer = setTimeout(() => {
          window.webContents.removeListener('paint', listener)
          rejectPaint(Error(`Timeout aguardando textura compartilhada no quadro ${sample}.`))
        }, 10000)
      })
      await window.webContents.executeJavaScript(`(() => {
        const c=document.getElementById('c'), x=c.getContext('2d',{alpha:false});
        x.fillStyle='rgb(${sample * 31},80,170)'; x.fillRect(0,0,${width},${height});
        x.fillStyle='rgb(240,210,90)'; x.fillRect(${sample * 11},40,160,120);
        document.body.dataset.sample='${sample}'; return true;
      })()`)
      window.webContents.invalidate()
      const texture = await paint
      const started = performance.now()
      let imported
      try {
        const textureInfo = texture.textureInfo
        imported = sharedTexture.importSharedTexture({ textureInfo })
        const resultPromise = new Promise((resolveResult, rejectResult) => {
          const timer = setTimeout(() => rejectResult(Error(`Timeout importando VideoFrame no renderer para ${sample}.`)), 10000)
          const listener = (event, result) => {
            if (event.sender.id !== window.webContents.id || result?.sample !== sample) return
            clearTimeout(timer)
            ipcMain.removeListener('shared-texture-probe-result', listener)
            resolveResult(result)
          }
          ipcMain.on('shared-texture-probe-result', listener)
        })
        await sharedTexture.sendSharedTexture({ frame: window.webContents.mainFrame, importedSharedTexture: imported }, sample)
        const videoFrame = await resultPromise
        results.push({
          sample,
          importAndFrameMs: Number((performance.now() - started).toFixed(3)),
          pixelFormat: textureInfo.pixelFormat,
          codedSize: textureInfo.codedSize,
          frameWidth: videoFrame.width,
          frameHeight: videoFrame.height,
          sourceWidth: videoFrame.sourceWidth,
          sourceHeight: videoFrame.sourceHeight,
          encodeQueue: videoFrame.encodedQueue,
          textureVisibleRect: textureInfo.visibleRect,
          frameClass: videoFrame.frameClass,
          frameFormat: videoFrame.format,
          frameTimestampUs: videoFrame.timestamp,
          error: videoFrame.error,
          handleFields: Object.keys(textureInfo.handle ?? {}).sort()
        })
      } finally {
        try { imported?.release() } finally { texture.release() }
      }
    }
    const encoderResult = await new Promise((resolveFinished, rejectFinished) => {
      const timer = setTimeout(() => rejectFinished(Error('Timeout aguardando flush do encoder H.264.')), 10000)
      const listener = (event, result) => {
        if (event.sender.id !== window.webContents.id) return
        clearTimeout(timer)
        ipcMain.removeListener('shared-texture-probe-finished', listener)
        resolveFinished(result)
      }
      ipcMain.on('shared-texture-probe-finished', listener)
      window.webContents.send('shared-texture-probe-finish')
    })
    return {
      passed: results.length === samples && results.every((entry) => entry.frameWidth === width && entry.frameHeight === height && !entry.error)
        && encoderResult.encodedFrames === samples && encoderResult.encodedBytes > 0 && !encoderResult.encodeError,
      researchOnly: true,
      productionEnabled: false,
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      platform: process.platform,
      userAgent: await window.webContents.executeJavaScript('navigator.userAgent'),
      windowBounds: window.getBounds(), windowSize: window.getSize(), windowContentSize: window.getContentSize(),
      workArea: screen.getPrimaryDisplay().workAreaSize,
      rendererViewport: await window.webContents.executeJavaScript('({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })'),
      width, height, samples, paintFrameRate, missingTextureEvents, results, encoderResult,
      processingWallMs: Number((performance.now() - startedAt).toFixed(2)),
      processedFramesPerSecond: Number((samples / ((performance.now() - startedAt) / 1000)).toFixed(2)),
      limitations: ['Synthetic canvas only; no pixel golden/readback', 'No FFmpeg mux, overlays, audio, cancellation, or comparison to capturePage']
    }
  } finally {
    if (window && !window.isDestroyed()) window.destroy()
  }
}

async function main() {
  if (process.versions.electron) {
    const scratch = process.argv.find((value) => value.startsWith('--scratch='))?.slice('--scratch='.length)
    if (!scratch) throw Error('Perfil temporário deve ser informado pelo supervisor.')
    const result = await runElectron(scratch)
    await mkdir(output, { recursive: true })
    const summary = JSON.stringify(result, null, 2) + '\n'
    await writeFile(join(output, 'result.json'), summary)
    await new Promise((resolveWrite) => process.stdout.write(summary, resolveWrite))
    if (!result.passed) require('electron').app.exit(1)
    else require('electron').app.quit()
    return
  }
  const scratch = await mkdtemp(join(tmpdir(), 'editor-v6-shared-texture-'))
  try {
    const child = spawnSync(require('electron'), [__filename, ...process.argv.slice(2).filter((value) => !value.startsWith('--scratch=')), `--scratch=${scratch}`], {
      cwd: root, encoding: 'utf8', windowsHide: true, timeout: 90000, maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }
    })
    if (child.error) throw child.error
    if (child.status !== 0) throw Error(child.stderr || `Electron smoke encerrou com código ${child.status}.`)
    process.stdout.write(child.stdout)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error('[shared texture smoke]', error)
  if (process.versions.electron) require('electron').app.exit(1)
  else process.exitCode = 1
})
