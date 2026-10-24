'use strict'

const { app, BrowserWindow, ipcMain, protocol } = require('electron')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { createReadStream } = require('node:fs')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Readable } = require('node:stream')
const { performance, PerformanceObserver } = require('node:perf_hooks')
const ts = require('typescript')

protocol.registerSchemesAsPrivileged([{ scheme: 'gacha-video', privileges: { secure: true, standard: true, stream: true, supportFetchAPI: true, corsEnabled: true } }])

const ffmpeg = process.env.GACHA_FFMPEG_PATH
const ffprobe = process.env.GACHA_FFPROBE_PATH
const encoder = process.env.GACHA_H264_ENCODER || 'h264_mf'
const scenario = process.env.GACHA_BENCH_SCENARIO || 'mixed'
const durationSeconds = Number(process.env.GACHA_BENCH_SECONDS || 5)
const frameRate = 60
const totalFrames = durationSeconds * frameRate
const width = 1920, height = 1080
const frameBytes = width * height * 4
const surfaceResourceBudgetMiB = 256
const jobId = '8e6c8c8a-9d52-4c4b-b5e2-74c313ecf738'
const studioId = '426aeed3-a82e-4a49-b286-8a4c73c7d837'
const assetId = 'f2ba1766-33bd-4362-b39d-e1755e7245a4'
const rendererFile = path.resolve(__dirname, '../../out/renderer/index.html')
const preloadPath = path.resolve(__dirname, '../../out/preload/video-export-preload.cjs')
const machine = {
  platform: process.platform,
  release: os.release(),
  cpuModel: os.cpus()[0]?.model ?? 'unknown',
  logicalCpuCount: os.cpus().length,
  totalMemoryBytes: os.totalmem(),
  freeMemoryBytesAtStart: os.freemem(),
}

function loadTs(relativePath) {
  const source = fs.readFileSync(path.resolve(__dirname, '../..', relativePath), 'utf8')
  const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(require, mod, mod.exports)
  return mod.exports
}
const raw = loadTs('electron/videoRawFrameWriter.ts')
function run(executable, args, encoding = 'utf8') {
  return execFileSync(executable, args, { encoding, timeout: 10 * 60 * 1000, windowsHide: true, maxBuffer: 32 * 1024 * 1024 })
}
function serve(request, file) {
  const info = fs.statSync(file)
  const range = request.headers.get('range')
  const headers = new Headers({ 'accept-ranges': 'bytes', 'content-type': 'video/mp4', 'cache-control': 'no-store' })
  if (request.method === 'HEAD') {
    headers.set('content-length', String(info.size))
    return new Response(null, { status: 200, headers })
  }
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (!match) return new Response(null, { status: 416 })
    const start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]))
    const end = match[2] && match[1] ? Math.min(info.size - 1, Number(match[2])) : info.size - 1
    headers.set('content-range', `bytes ${start}-${end}/${info.size}`)
    headers.set('content-length', String(end - start + 1))
    return new Response(Readable.toWeb(createReadStream(file, { start, end })), { status: 206, headers })
  }
  headers.set('content-length', String(info.size))
  return new Response(Readable.toWeb(createReadStream(file)), { status: 200, headers })
}
function percentile(values, fraction) {
  if (!values.length) return 0
  const ordered = [...values].sort((a, b) => a - b)
  return ordered[Math.min(ordered.length - 1, Math.ceil(fraction * ordered.length) - 1)]
}
function sum(values) { return values.reduce((total, value) => total + Number(value || 0), 0) }
function appMetrics() { return app.getAppMetrics() }
function processTreeWorkingSetBytes(metrics = appMetrics()) {
  return metrics.reduce((total, metric) => total + Number(metric.memory?.workingSetSize || 0), 0) * 1024
}
function createProcessSampler() {
  const initialBytes = processTreeWorkingSetBytes()
  let peakBytes = initialBytes, finalBytes = initialBytes
  let cpuSumPct = 0, cpuSamples = 0, cpuPeakPct = 0
  const timer = setInterval(() => {
    const metrics = appMetrics()
    finalBytes = processTreeWorkingSetBytes(metrics)
    peakBytes = Math.max(peakBytes, finalBytes)
    const cpuPct = metrics.reduce((total, metric) => total + Number(metric.cpu?.percentCPUUsage || 0), 0)
    cpuSumPct += cpuPct
    cpuSamples += 1
    cpuPeakPct = Math.max(cpuPeakPct, cpuPct)
  }, 100)
  timer.unref?.()
  return {
    stop() {
      clearInterval(timer)
      const metrics = appMetrics()
      finalBytes = processTreeWorkingSetBytes(metrics)
      peakBytes = Math.max(peakBytes, finalBytes)
      const cpuPct = metrics.reduce((total, metric) => total + Number(metric.cpu?.percentCPUUsage || 0), 0)
      cpuSumPct += cpuPct
      cpuSamples += 1
      cpuPeakPct = Math.max(cpuPeakPct, cpuPct)
      return { initialBytes, peakBytes, finalBytes, cpuAveragePct: cpuSamples ? cpuSumPct / cpuSamples : 0, cpuPeakPct, cpuSamples }
    },
  }
}

if (![5, 10].includes(durationSeconds)) throw new Error('GACHA_BENCH_SECONDS deve ser 5 ou 10 neste benchmark curto.')
if (!ffmpeg || !ffprobe) throw new Error('GACHA_FFMPEG_PATH e GACHA_FFPROBE_PATH são obrigatórios.')

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  const { createAnimatedGachaCharacterFixture } = require('./animated-gacha-character-fixture.cjs')
  const { configureGachaStressScenario } = require('./gacha-video-stress-scenario.cjs')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gv5-offscreen-ab-'))
  const source = path.join(root, 'deterministic-video.mp4')
  const fixtureOutcomes = []
  let activeWindows = new Set()
  try {
    run(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i',
      `testsrc2=size=640x360:rate=60:duration=${durationSeconds}`,
      '-an', '-c:v', 'h264_mf', '-b:v', '3M', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', source,
    ])
    const bootstrap = await createAnimatedGachaCharacterFixture({ jobId, studioId, assetId, durationFrames: totalFrames })
    const profile = configureGachaStressScenario(bootstrap, { scenario, durationFrames: totalFrames, assetId, videoPath: source, videoBytes: fs.statSync(source).size })
    protocol.handle('gacha-video', request => {
      const url = new URL(request.url)
      const [requestedJob, id] = url.pathname.split('/').filter(Boolean)
      const file = profile.sourceByAssetId.get(id)
      return url.hostname === 'export-job' && requestedJob === jobId && file ? serve(request, file) : new Response('not found', { status: 404 })
    })

    const sessions = new Map()
    const allowed = new Set()
    ipcMain.handle('video-studio:export-surface:prepare', (event, requestedJobId) => {
      if (requestedJobId !== jobId || !allowed.has(event.sender.id)) throw new Error('surface fora do harness A/B')
      return bootstrap
    })
    ipcMain.on('video-studio:export-surface:ready', (event, ready) => {
      const session = sessions.get(event.sender.id)
      if (!session) return
      if (ready.error) session.rejectReady(new Error(ready.error))
      else session.resolveReady()
    })
    ipcMain.on('video-studio:export-surface:frame-ready', (event, ready) => {
      const session = sessions.get(event.sender.id)
      const pending = session?.pending.get(ready.requestId)
      if (!pending) return
      session.pending.delete(ready.requestId)
      clearTimeout(pending.timeout)
      if (ready.error) pending.reject(new Error(ready.error))
      else if (!(ready.pixels instanceof Uint8Array) || ready.pixels.byteLength !== frameBytes) pending.reject(new Error('surface devolveu RGBA inválido'))
      else pending.resolve({ frame: ready.frame, pixels: Buffer.from(ready.pixels.buffer, ready.pixels.byteOffset, ready.pixels.byteLength), timings: ready.timings ?? {}, layerCache: ready.layerCache ?? null })
    })

    async function openSurface(backend) {
      const workerFlag = backend === 'offscreen-worker' ? '&characterWorker=1' : '&characterWorker=0'
      const win = new BrowserWindow({
        show: false, width, height, useContentSize: true, backgroundColor: '#000',
        webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, offscreen: true },
      })
      activeWindows.add(win)
      const diagnostics = []
      win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, url, isMainFrame) => diagnostics.push({ errorCode, errorDescription, url, isMainFrame }))
      win.webContents.on('render-process-gone', (_event, details) => diagnostics.push({ renderProcessGone: details }))
      let resolveReady, rejectReady
      const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
      const session = { pending: new Map(), resolveReady, rejectReady }
      sessions.set(win.webContents.id, session)
      allowed.add(win.webContents.id)
      const startupStarted = performance.now()
      const timeout = setTimeout(() => rejectReady(new Error('surface não inicializou em 60s')), 60_000)
      try {
        await Promise.all([win.loadFile(rendererFile, { hash: `/video-export-surface?jobId=${jobId}&layerCache=1&readbackCpu=1&resourceBudgetMiB=${surfaceResourceBudgetMiB}${workerFlag}` }), ready])
      } catch (error) {
        await new Promise(resolve => setTimeout(resolve, 100))
        throw new Error(`${error.message}; renderer=${JSON.stringify(diagnostics)}`)
      } finally { clearTimeout(timeout) }
      return {
        startupMs: performance.now() - startupStarted,
        async frame(frame) {
          const requestId = `${backend}-${frame}-${Math.random()}`
          return await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              if (session.pending.delete(requestId)) reject(new Error(`Frame ${frame} excedeu 60 segundos.`))
            }, 60_000)
            session.pending.set(requestId, { resolve, reject, timeout })
            win.webContents.send('video-studio:export-surface:render', { requestId, frame })
          })
        },
        close() {
          allowed.delete(win.webContents.id)
          sessions.delete(win.webContents.id)
          activeWindows.delete(win)
          if (!win.isDestroyed()) win.destroy()
        },
      }
    }

    async function benchmark(backend, label) {
      const out = path.join(root, `${backend}-${label}.mp4`)
      const framesOut = path.join(root, `${backend}-${label}-chunk.mp4`)
      const gcDurations = []
      const gcObserver = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) gcDurations.push(entry.duration)
      })
      try { gcObserver.observe({ entryTypes: ['gc'] }) } catch {}
      const processSampler = createProcessSampler()
      const startupStarted = performance.now()
      const surface = await openSurface(backend)
      const startupMs = surface.startupMs
      const writer = new raw.VideoRawFrameWriter({
        executable: ffmpeg,
        args: raw.buildVideoStudioChunkArgs(framesOut, totalFrames, 'rgba', encoder),
        outputPath: framesOut,
        frameBytes,
        frameCount: totalFrames,
      })
      const encoderReadyStarted = performance.now()
      await writer.ready()
      const encoderReadyMs = performance.now() - encoderReadyStarted
      const frameLatencyMs = []
      const rawHash = createHash('sha256')
      const perFrameSha256 = []
      const totals = {
        characterMs: 0, mediaDecodeMs: 0, composeMs: 0, readbackMs: 0,
        writerWaitMs: 0, workerRenderMs: 0, workerBitmapMs: 0, workerRoundTripMs: 0,
        workerPostMessageMs: 0, workerInitMs: 0, workerTransferBytes: 0, workerTransferCount: 0,
        workerMessages: 0, workerFallbacks: 0, workerCacheHits: 0, workerCacheMisses: 0,
        workerCacheInvalidations: 0, workerCacheBytesPeak: 0, workerImageCacheHits: 0,
        workerImageCacheMisses: 0, workerImageCacheFailures: 0, workerImageCacheInvalidations: 0,
        workerImageCacheBytesPeak: 0,
      }
      let orderedFrames = 0, duplicateFrames = 0, outOfOrderFrames = 0, lastFrame = -1
      const seenFrames = new Set()
      const renderStarted = performance.now()
      try {
        for (let frame = 0; frame < totalFrames; frame++) {
          const frameStarted = performance.now()
          const result = await surface.frame(frame)
          const latency = performance.now() - frameStarted
          frameLatencyMs.push(latency)
          if (result.frame !== frame) outOfOrderFrames += 1
          if (seenFrames.has(result.frame)) duplicateFrames += 1
          seenFrames.add(result.frame)
          if (result.frame <= lastFrame) outOfOrderFrames += 1
          lastFrame = result.frame
          orderedFrames += 1
          rawHash.update(result.pixels)
          perFrameSha256.push(createHash('sha256').update(result.pixels).digest('hex'))
          const metrics = result.timings
          totals.characterMs += Number(metrics.characterMs || 0)
          totals.mediaDecodeMs += Number(metrics.mediaDecodeMs || 0)
          totals.composeMs += Number(metrics.composeMs || 0)
          totals.readbackMs += Number(metrics.readbackMs || 0)
          totals.workerRenderMs += Number(metrics.characterWorkerRenderMs || 0)
          totals.workerBitmapMs += Number(metrics.characterWorkerBitmapMs || 0)
          totals.workerRoundTripMs += Number(metrics.characterWorkerRoundTripMs || 0)
          totals.workerPostMessageMs += Number(metrics.characterWorkerPostMessageMs || 0)
          totals.workerInitMs += Number(metrics.characterWorkerInitMs || 0)
          totals.workerTransferBytes += Number(metrics.characterWorkerTransferBytes || 0)
          totals.workerTransferCount += Number(metrics.characterWorkerTransferCount || 0)
          totals.workerMessages += Number(metrics.characterWorkerMessages || 0)
          totals.workerFallbacks += Number(metrics.characterWorkerFallbacks || 0)
          totals.workerCacheHits += Number(metrics.characterWorkerCacheHits || 0)
          totals.workerCacheMisses += Number(metrics.characterWorkerCacheMisses || 0)
          totals.workerCacheInvalidations += Number(metrics.characterWorkerCacheInvalidations || 0)
          totals.workerCacheBytesPeak = Math.max(totals.workerCacheBytesPeak, Number(metrics.characterWorkerCacheBytes || 0))
          totals.workerImageCacheHits += Number(metrics.characterWorkerImageCacheHits || 0)
          totals.workerImageCacheMisses += Number(metrics.characterWorkerImageCacheMisses || 0)
          totals.workerImageCacheFailures += Number(metrics.characterWorkerImageCacheFailures || 0)
          totals.workerImageCacheInvalidations += Number(metrics.characterWorkerImageCacheInvalidations || 0)
          totals.workerImageCacheBytesPeak = Math.max(totals.workerImageCacheBytesPeak, Number(metrics.characterWorkerImageCacheBytes || 0))
          const writeStarted = performance.now()
          await writer.writeFrame(result.pixels, { copy: false })
          totals.writerWaitMs += performance.now() - writeStarted
        }
        await writer.finish()
      } catch (error) {
        await writer.cancel().catch(() => {})
        throw error
      } finally { surface.close() }
      const renderEncodeMs = performance.now() - renderStarted
      const list = path.join(root, `${backend}-${label}-concat.txt`)
      fs.writeFileSync(list, `file '${framesOut.replace(/\\/g, '/')}'\n`)
      const assembleStarted = performance.now()
      run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-an', '-movflags', '+faststart', out])
      const assembleMs = performance.now() - assembleStarted
      const stream = JSON.parse(run(ffprobe, ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,nb_read_frames,duration', '-of', 'json', out])).streams?.[0]
      if (stream?.codec_name !== 'h264' || Number(stream.width) !== width || Number(stream.height) !== height || stream.r_frame_rate !== '60/1' || Number(stream.nb_read_frames) !== totalFrames) {
        throw new Error(`Saída ${backend} inválida: ${JSON.stringify(stream)}`)
      }
      run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-xerror', '-i', out, '-map', '0:v:0', '-f', 'null', '-'])
      const memory = processSampler.stop()
      gcObserver.disconnect()
      const elapsedMs = performance.now() - startupStarted
      const renderWallFps = totalFrames / (renderEncodeMs / 1000)
      return {
        backend, label, scenario, counts: profile.counts,
        durationSeconds, totalFrames, resolution: `${width}x${height}`, frameRate,
        surfaceResourceBudgetMiB,
        workerResourceBudgetMiB: backend === 'offscreen-worker' ? 224 : 0,
        workerImageCacheLimitMiB: backend === 'offscreen-worker' ? 96 : 0,
        startupMs, encoderReadyMs, renderEncodeMs, assembleMs, elapsedMs,
        renderWallFps, exportThroughputFps: totalFrames / (elapsedMs / 1000),
        realtimeFactor: durationSeconds / (elapsedMs / 1000),
        frameLatencyMs: { mean: sum(frameLatencyMs) / frameLatencyMs.length, median: percentile(frameLatencyMs, .5), p95: percentile(frameLatencyMs, .95), p99: percentile(frameLatencyMs, .99), max: Math.max(...frameLatencyMs) },
        timings: totals,
        memory: { ...memory, scope: 'Electron process tree working set and CPU; external FFmpeg child CPU/RAM excluded' },
        garbageCollection: { mainProcessEvents: gcDurations.length, totalMs: sum(gcDurations), maxPauseMs: Math.max(0, ...gcDurations), scope: 'Node Electron main process only; renderer/Worker GC is not exposed here' },
        frames: { requested: totalFrames, received: orderedFrames, unique: seenFrames.size, duplicateFrames, outOfOrderFrames, sha256: rawHash.digest('hex') },
        perFrameSha256,
        output: { bytes: fs.statSync(out).size, stream, sha256: createHash('sha256').update(fs.readFileSync(out)).digest('hex') },
      }
    }

    const gcObserver = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) fixtureOutcomes.push({ type: 'gc', durationMs: entry.duration })
    })
    try { gcObserver.observe({ entryTypes: ['gc'] }) } catch {}
    async function compareFramePixels(frame) {
      const canvas = await openSurface('canvas')
      const worker = await openSurface('offscreen-worker')
      try {
        const [a, b] = await Promise.all([canvas.frame(frame), worker.frame(frame)])
        const differences = []
        let differentPixels = 0, differentBytes = 0, maxDelta = 0, deltaSum = 0
        for (let index = 0; index < frameBytes; index++) {
          const delta = Math.abs(a.pixels[index] - b.pixels[index])
          if (!delta) continue
          differentBytes++
          deltaSum += delta
          maxDelta = Math.max(maxDelta, delta)
          if (index % 4 === 0) differentPixels++
          if (differences.length < 12 && index % 4 === 0) {
            const pixel = index / 4
            differences.push({ x: pixel % width, y: Math.floor(pixel / width), canvas: [...a.pixels.subarray(index, index + 4)], worker: [...b.pixels.subarray(index, index + 4)] })
          }
        }
        return { frame, equal: differentBytes === 0, differentPixels, differentBytes, maxChannelDelta: maxDelta, meanDeltaPerDifferentByte: differentBytes ? deltaSum / differentBytes : 0, firstDifferentPixels: differences }
      } finally {
        canvas.close()
        worker.close()
      }
    }
    function parityForRuns(a, b) {
      const differentFrames = []
      const count = Math.max(a.perFrameSha256.length, b.perFrameSha256.length)
      for (let index = 0; index < count; index++) {
        if (a.perFrameSha256[index] !== b.perFrameSha256[index]) differentFrames.push(index)
      }
      return {
        exactPixels: differentFrames.length === 0 && a.frames.received === b.frames.received,
        differentFrameCount: differentFrames.length,
        firstDifferentFrame: differentFrames[0] ?? null,
        lastDifferentFrame: differentFrames.at(-1) ?? null,
      }
    }
    const warmupCanvas = await benchmark('canvas', 'warmup')
    const warmupWorker = await benchmark('offscreen-worker', 'warmup')
    const warmupParity = parityForRuns(warmupCanvas, warmupWorker)
    if (warmupCanvas.frames.received !== totalFrames || warmupWorker.frames.received !== totalFrames
      || warmupCanvas.frames.duplicateFrames || warmupWorker.frames.duplicateFrames
      || warmupCanvas.frames.outOfOrderFrames || warmupWorker.frames.outOfOrderFrames) throw new Error('Aquecimento perdeu, duplicou ou reordenou frames.')

    const measured = []
    for (let repeat = 1; repeat <= 3; repeat++) {
      const canvas = await benchmark('canvas', `r${repeat}`)
      const worker = await benchmark('offscreen-worker', `r${repeat}`)
      const parity = parityForRuns(canvas, worker)
      if (canvas.frames.received !== totalFrames || worker.frames.received !== totalFrames
        || canvas.frames.duplicateFrames || worker.frames.duplicateFrames
        || canvas.frames.outOfOrderFrames || worker.frames.outOfOrderFrames) throw new Error('A/B perdeu, duplicou ou reordenou frames.')
      delete canvas.perFrameSha256
      delete worker.perFrameSha256
      measured.push({ repeat, ...parity, canvas, offscreenWorker: worker })
      console.log(JSON.stringify({ stage: 'repeat', repeat, canvasMs: canvas.elapsedMs, workerMs: worker.elapsedMs, canvasP95Ms: canvas.frameLatencyMs.p95, workerP95Ms: worker.frameLatencyMs.p95, ...parity }))
    }

    const firstMismatch = warmupParity.firstDifferentFrame ?? measured.find(pair => pair.firstDifferentFrame !== null)?.firstDifferentFrame ?? null
    const pixelDifferenceSample = firstMismatch === null ? null : await compareFramePixels(firstMismatch)
    delete warmupCanvas.perFrameSha256
    delete warmupWorker.perFrameSha256
    const exactPixelParity = warmupParity.exactPixels && measured.every(pair => pair.exactPixels)

    const median = values => percentile(values, .5)
    const summary = {
      canvasMedianExportMs: median(measured.map(pair => pair.canvas.elapsedMs)),
      offscreenMedianExportMs: median(measured.map(pair => pair.offscreenWorker.elapsedMs)),
      canvasMedianFrameP95Ms: median(measured.map(pair => pair.canvas.frameLatencyMs.p95)),
      offscreenMedianFrameP95Ms: median(measured.map(pair => pair.offscreenWorker.frameLatencyMs.p95)),
      speedup: median(measured.map(pair => pair.canvas.elapsedMs)) / median(measured.map(pair => pair.offscreenWorker.elapsedMs)),
      exactPixelParityAcrossRuns: exactPixelParity,
      visualGate: exactPixelParity ? 'PASS_EXACT_RGBA' : 'REJECTED_PIXEL_DIVERGENCE',
      warmupParity,
      parityByRepeat: measured.map(({ repeat, exactPixels, differentFrameCount, firstDifferentFrame, lastDifferentFrame }) => ({ repeat, exactPixels, differentFrameCount, firstDifferentFrame, lastDifferentFrame })),
      pixelDifferenceSample,
      fallbackCount: warmupWorker.timings.workerFallbacks + sum(measured.map(pair => pair.offscreenWorker.timings.workerFallbacks)),
      workerPipelineValidated: warmupWorker.timings.workerFallbacks + sum(measured.map(pair => pair.offscreenWorker.timings.workerFallbacks)) === 0,
      performanceComparisonValid: warmupWorker.timings.workerFallbacks + sum(measured.map(pair => pair.offscreenWorker.timings.workerFallbacks)) === 0,
    }
    const report = {
      ok: true,
      comparison: 'A: authorial Canvas main renderer; B: same VideoCharacterFrameRenderer + TransitionRenderer inside a Web Worker using OffscreenCanvas 2D. PixiJS disabled. BrowserWindow offscreen=true in both arms.',
      acceleration: 'Chromium hardware acceleration disabled in both arms; H.264 encoder identical.',
      machine, encoder, warmup: { canvas: warmupCanvas, offscreenWorker: warmupWorker }, measured, summary,
      notes: [
        'characterMs and mediaDecodeMs run concurrently with Promise.allSettled; do not add them as sequential wall time.',
        'CPU and RAM cover Electron process metrics and exclude the FFmpeg child process.',
        'Each export uses one Electron offscreen BrowserWindow and one surface request at a time; the Worker adds one character-render Worker only in B.',
      ],
    }
    const reportJson = `${JSON.stringify(report, null, 2)}\n`
    process.stdout.write(reportJson)
    if (process.env.GACHA_OFFSCREEN_BENCH_REPORT_PATH) fs.writeFileSync(process.env.GACHA_OFFSCREEN_BENCH_REPORT_PATH, reportJson)
  } finally {
    for (const win of activeWindows) if (!win.isDestroyed()) win.destroy()
    try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 }) } catch (error) { console.warn('Temp cleanup warning:', error.message) }
  }
  app.exit(0)
}).catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`)
  process.exitCode = 1
  app.exit(1)
})
