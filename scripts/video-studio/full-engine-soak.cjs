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

const seconds = Number(process.env.GACHA_FULL_ENGINE_SOAK_SECONDS || process.argv[2] || 180)
const fps = 60
const totalFrames = seconds * fps
const chunkFrames = 600
const width = 1920, height = 1080
const frameBytes = width * height * 4
const surfaceResourceBudgetMiB = 256
const encoder = process.env.GACHA_H264_ENCODER || 'h264_mf'
const backend = process.env.GACHA_FULL_ENGINE_SOAK_BACKEND || process.argv[3] || 'canvas'
const scenario = process.env.GACHA_FULL_ENGINE_SOAK_SCENARIO || process.argv[4] || (seconds === 180 ? 'mixed' : 'basic')
const includeAudio = scenario === 'mixed'
const ffmpeg = process.env.GACHA_FFMPEG_PATH
const ffprobe = process.env.GACHA_FFPROBE_PATH
const rendererFile = path.resolve(__dirname, '../../out/renderer/index.html')
const preloadPath = path.resolve(__dirname, '../../out/preload/video-export-preload.cjs')
const jobId = '6a0ce770-d2b4-4d95-a11c-27ebd9849c0d'
const studioId = '0327f6c9-bbda-4164-9388-2f3d51a0c3a0'
const assetId = '12f40a44-1264-43fc-8d3a-4d94bb58c858'
const machine = {
  platform: process.platform,
  release: os.release(),
  cpuModel: os.cpus()[0]?.model ?? 'unknown',
  logicalCpuCount: os.cpus().length,
  totalMemoryBytes: os.totalmem(),
  freeMemoryBytesAtStart: os.freemem(),
}

function loadTs(relativePath, dependencies = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, '../..', relativePath), 'utf8')
  const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', compiled)((name) => name in dependencies ? dependencies[name] : require(name), mod, mod.exports)
  return mod.exports
}
const raw = loadTs('electron/videoRawFrameWriter.ts')
const videoAudio = loadTs('src/shared/videoAudio.ts')
const audioPlanModule = loadTs('src/shared/videoStudioAudioPlan.ts', { './videoAudio': videoAudio })

function run(executable, args, encoding = 'utf8') {
  return execFileSync(executable, args, { encoding, timeout: 60 * 60 * 1000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
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
function treeMetrics() { return app.getAppMetrics() }
function workingSetBytes(metrics = treeMetrics()) {
  return metrics.reduce((total, metric) => total + Number(metric.memory?.workingSetSize || 0), 0) * 1024
}
function cpuPercent(metrics = treeMetrics()) {
  return metrics.reduce((total, metric) => total + Number(metric.cpu?.percentCPUUsage || 0), 0)
}
function createProcessSampler() {
  const initialBytes = workingSetBytes()
  let peakBytes = initialBytes, finalBytes = initialBytes, cpuSumPct = 0, cpuPeakPct = 0, samples = 0
  const sample = () => {
    const metrics = treeMetrics()
    finalBytes = workingSetBytes(metrics)
    peakBytes = Math.max(peakBytes, finalBytes)
    const cpu = cpuPercent(metrics)
    cpuSumPct += cpu
    cpuPeakPct = Math.max(cpuPeakPct, cpu)
    samples += 1
  }
  const timer = setInterval(sample, 100)
  timer.unref?.()
  return {
    stop() {
      clearInterval(timer)
      sample()
      return { initialBytes, peakBytes, finalBytes, cpuAveragePct: samples ? cpuSumPct / samples : 0, cpuPeakPct, samples }
    },
  }
}
function safeHash(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex') }

if (![5, 10, 30, 90, 180, 900].includes(seconds)) throw new Error('Full-engine soak aceita 5, 10, 30, 90, 180 ou 900 segundos.')
if (!ffmpeg || !ffprobe) throw new Error('GACHA_FFMPEG_PATH e GACHA_FFPROBE_PATH são obrigatórios.')
if (!['canvas', 'offscreen-worker'].includes(backend)) throw new Error('GACHA_FULL_ENGINE_SOAK_BACKEND deve ser canvas ou offscreen-worker.')

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  const { createAnimatedGachaCharacterFixture } = require('./animated-gacha-character-fixture.cjs')
  const { configureGachaStressScenario } = require('./gacha-video-stress-scenario.cjs')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `gv5-full-engine-soak-${scenario}-${seconds}-`))
  const source = path.join(root, 'imported-media.mp4')
  const preparationStarted = performance.now()
  let bootstrap
  let profile
  let win = null
  let activeWriter = null
  let sampler = null
  let gcDurations = []
  const gcObserver = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) gcDurations.push(entry.duration)
  })
  try { gcObserver.observe({ entryTypes: ['gc'] }) } catch {}

  try {
    if (scenario === 'mixed') {
      const mediaInputs = [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', `testsrc2=size=480x270:rate=60:duration=${seconds}`,
      ]
      if (includeAudio) mediaInputs.push('-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${seconds}`)
      mediaInputs.push('-map', '0:v:0')
      if (includeAudio) mediaInputs.push('-map', '1:a:0')
      mediaInputs.push(
        '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-crf', '29', '-pix_fmt', 'yuv420p',
      )
      if (includeAudio) mediaInputs.push('-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2')
      else mediaInputs.push('-an')
      mediaInputs.push('-shortest', '-movflags', '+faststart', source)
      run(ffmpeg, mediaInputs)
    }

    bootstrap = await createAnimatedGachaCharacterFixture({ jobId, studioId, assetId, durationFrames: totalFrames })
    profile = configureGachaStressScenario(bootstrap, {
      scenario, durationFrames: totalFrames, assetId,
      videoPath: scenario === 'mixed' ? source : undefined,
      videoBytes: scenario === 'mixed' ? fs.statSync(source).size : 1,
      audio: includeAudio,
      transitionSpacing: 30,
    })
    const preparationMs = performance.now() - preparationStarted
    if (profile.counts.characters < 1 || profile.counts.transitions < 1) throw new Error('Fixture de estresse não tem atores/transições reais.')

    protocol.handle('gacha-video', request => {
      const url = new URL(request.url)
      const [requestedJob, id] = url.pathname.split('/').filter(Boolean)
      const mediaPath = profile.sourceByAssetId.get(id)
      return url.hostname === 'export-job' && requestedJob === jobId && mediaPath
        ? serve(request, mediaPath)
        : new Response('not found', { status: 404 })
    })

    const allowed = new Set()
    const sessions = new Map()
    ipcMain.handle('video-studio:export-surface:prepare', (event, requestedJob) => {
      if (requestedJob !== jobId || !allowed.has(event.sender.id)) throw new Error('job/sender fora do harness isolado.')
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
      const surfaceRoundTripMs = performance.now() - pending.requestedAt
      if (ready.error) pending.reject(new Error(ready.error))
      else if (!(ready.pixels instanceof Uint8Array) || ready.pixels.byteLength !== frameBytes) pending.reject(new Error(`Frame RGBA inválido: ${ready.pixels?.byteLength ?? 0} bytes.`))
      else pending.resolve({
        frame: ready.frame,
        surfaceRoundTripMs,
        pixels: Buffer.from(ready.pixels.buffer, ready.pixels.byteOffset, ready.pixels.byteLength),
        timings: ready.timings ?? {},
        layerCache: ready.layerCache ?? null,
      })
    })

    sampler = createProcessSampler()
    const exportStartedAt = performance.now()
    let readyResolve, readyReject
    const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject })
    win = new BrowserWindow({
      show: false, frame: false, width, height, useContentSize: true,
      webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, offscreen: true },
    })
    const diagnostics = []
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, url, isMainFrame) => diagnostics.push({ errorCode, errorDescription, url, isMainFrame }))
    win.webContents.on('render-process-gone', (_event, details) => diagnostics.push({ renderProcessGone: details }))
    allowed.add(win.webContents.id)
    const session = { pending: new Map(), resolveReady: readyResolve, rejectReady: readyReject }
    sessions.set(win.webContents.id, session)
    const workerParam = backend === 'offscreen-worker' ? '&characterWorker=1' : '&characterWorker=0'
    const startupStarted = performance.now()
    const startupTimeout = setTimeout(() => readyReject(new Error('export surface excedeu 60 segundos na inicialização.')), 60_000)
    try {
      await Promise.all([
        win.loadFile(rendererFile, { hash: `/video-export-surface?jobId=${jobId}&layerCache=1&readbackCpu=1&resourceBudgetMiB=${surfaceResourceBudgetMiB}${workerParam}` }),
        ready,
      ])
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 100))
      throw new Error(`${error.message}; renderer=${JSON.stringify(diagnostics)}`)
    } finally { clearTimeout(startupTimeout) }
    const surfaceStartupMs = performance.now() - startupStarted

    function requestFrame(frame) {
      const requestId = `soak-${frame}-${Math.random()}`
      return new Promise((resolve, reject) => {
        const requestedAt = performance.now()
        const timeout = setTimeout(() => {
          if (session.pending.delete(requestId)) reject(new Error(`Frame ${frame} excedeu 60 segundos.`))
        }, 60_000)
        session.pending.set(requestId, { frame, requestedAt, resolve, reject, timeout })
        win.webContents.send('video-studio:export-surface:render', { requestId, frame })
      })
    }

    const pipelineStartedAt = performance.now()
    const chunkCount = Math.ceil(totalFrames / chunkFrames)
    const chunkPaths = []
    const renderLatencies = []
    const frameHashes = createHash('sha256')
    const seenFrames = new Set()
    const timings = {
      characterMs: 0, mediaDecodeMs: 0, composeMs: 0, readbackMs: 0,
      surfaceRoundTripMs: 0, writerWaitMs: 0, workerRenderMs: 0, workerBitmapMs: 0,
      workerRoundTripMs: 0, workerPostMessageMs: 0, workerInitMs: 0,
      workerTransferBytes: 0, workerTransferCount: 0, workerMessages: 0, workerFallbacks: 0,
      workerCacheHits: 0, workerCacheMisses: 0, workerCacheInvalidations: 0,
      workerCacheBytesPeak: 0, workerImageCacheHits: 0, workerImageCacheMisses: 0,
      workerImageCacheFailures: 0, workerImageCacheInvalidations: 0, workerImageCacheBytesPeak: 0,
    }
    const layerCache = { hits: 0, misses: 0, evictions: 0, bytesPeak: 0, maxBytes: 0 }
    let renderedFrames = 0, duplicateFrames = 0, outOfOrderFrames = 0, lastFrame = -1
    for (let index = 0; index < chunkCount; index++) {
      const start = index * chunkFrames
      const end = Math.min(totalFrames, start + chunkFrames)
      const chunkSize = end - start
      const chunkPath = path.join(root, `chunk-${String(index).padStart(4, '0')}.mp4`)
      const writer = new raw.VideoRawFrameWriter({
        executable: ffmpeg,
        args: raw.buildVideoStudioChunkArgs(chunkPath, chunkSize, 'rgba', encoder),
        outputPath: chunkPath,
        frameBytes,
        frameCount: chunkSize,
      })
      activeWriter = writer
      await writer.ready()
      let pendingFrame = requestFrame(start)
      for (let frame = start; frame < end; frame++) {
        const result = await pendingFrame
        renderLatencies.push(result.surfaceRoundTripMs)
        if (result.frame !== frame || result.frame <= lastFrame) outOfOrderFrames += 1
        if (seenFrames.has(result.frame)) duplicateFrames += 1
        seenFrames.add(result.frame)
        lastFrame = result.frame
        renderedFrames += 1
        frameHashes.update(result.pixels)
        const m = result.timings
        timings.surfaceRoundTripMs += result.surfaceRoundTripMs
        for (const key of ['characterMs', 'mediaDecodeMs', 'composeMs', 'readbackMs']) timings[key] += Number(m[key] || 0)
        timings.workerRenderMs += Number(m.characterWorkerRenderMs || 0)
        timings.workerBitmapMs += Number(m.characterWorkerBitmapMs || 0)
        timings.workerRoundTripMs += Number(m.characterWorkerRoundTripMs || 0)
        timings.workerPostMessageMs += Number(m.characterWorkerPostMessageMs || 0)
        timings.workerInitMs += Number(m.characterWorkerInitMs || 0)
        timings.workerTransferBytes += Number(m.characterWorkerTransferBytes || 0)
        timings.workerTransferCount += Number(m.characterWorkerTransferCount || 0)
        timings.workerMessages += Number(m.characterWorkerMessages || 0)
        timings.workerFallbacks += Number(m.characterWorkerFallbacks || 0)
        timings.workerCacheHits += Number(m.characterWorkerCacheHits || 0)
        timings.workerCacheMisses += Number(m.characterWorkerCacheMisses || 0)
        timings.workerCacheInvalidations += Number(m.characterWorkerCacheInvalidations || 0)
        timings.workerCacheBytesPeak = Math.max(timings.workerCacheBytesPeak, Number(m.characterWorkerCacheBytes || 0))
        timings.workerImageCacheHits += Number(m.characterWorkerImageCacheHits || 0)
        timings.workerImageCacheMisses += Number(m.characterWorkerImageCacheMisses || 0)
        timings.workerImageCacheFailures += Number(m.characterWorkerImageCacheFailures || 0)
        timings.workerImageCacheInvalidations += Number(m.characterWorkerImageCacheInvalidations || 0)
        timings.workerImageCacheBytesPeak = Math.max(timings.workerImageCacheBytesPeak, Number(m.characterWorkerImageCacheBytes || 0))
        if (result.layerCache) {
          layerCache.hits = Math.max(layerCache.hits, Number(result.layerCache.hits || 0))
          layerCache.misses = Math.max(layerCache.misses, Number(result.layerCache.misses || 0))
          layerCache.evictions = Math.max(layerCache.evictions, Number(result.layerCache.evictions || 0))
          layerCache.bytesPeak = Math.max(layerCache.bytesPeak, Number(result.layerCache.bytes || 0))
          layerCache.maxBytes = Math.max(layerCache.maxBytes, Number(result.layerCache.maxBytes || 0))
        }
        if (frame + 1 < end) pendingFrame = requestFrame(frame + 1)
        const writerStarted = performance.now()
        await writer.writeFrame(result.pixels, { copy: false })
        timings.writerWaitMs += performance.now() - writerStarted
      }
      await writer.finish()
      activeWriter = null
      chunkPaths.push(chunkPath)
      console.log(JSON.stringify({ stage: 'chunk', index: index + 1, count: chunkCount, completedFrames: end, renderedFrames, elapsedMs: performance.now() - pipelineStartedAt, peakWorkingSetBytes: workingSetBytes() }))
    }

    if (renderedFrames !== totalFrames || seenFrames.size !== totalFrames || duplicateFrames || outOfOrderFrames) {
      throw new Error(`Integridade de frames falhou: rendered=${renderedFrames}/${totalFrames}, unique=${seenFrames.size}, duplicate=${duplicateFrames}, outOfOrder=${outOfOrderFrames}.`)
    }
    const concatList = path.join(root, 'concat.txt')
    fs.writeFileSync(concatList, chunkPaths.map(file => `file '${file.replace(/\\/g, '/')}'`).join('\n') + '\n')
    const audioPlan = audioPlanModule.buildVideoStudioAudioPlan(
      bootstrap.snapshot.timeline,
      new Map(profile.sourceByAssetId.size ? [[assetId, { path: source, hasAudio: includeAudio }]] : []),
      1,
    )
    const renderEncodeMs = performance.now() - pipelineStartedAt
    const output = path.join(root, 'final.mp4')
    const assembleArgs = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concatList, ...audioPlan.inputArgs]
    if (audioPlan.enabled && audioPlan.filterComplex) assembleArgs.push('-filter_complex', audioPlan.filterComplex, '-map', '0:v:0', ...audioPlan.outputArgs)
    else assembleArgs.push('-map', '0:v:0', '-c:a', 'copy', '-an')
    assembleArgs.push('-c:v', 'copy', '-movflags', '+faststart', output)
    const assembleStarted = performance.now()
    run(ffmpeg, assembleArgs)
    const assembleMs = performance.now() - assembleStarted
    const probe = JSON.parse(run(ffprobe, [
      '-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames,duration,sample_rate,channels',
      '-of', 'json', output,
    ]))
    const video = probe.streams?.find(stream => stream.codec_type === 'video') ?? probe.streams?.[0]
    const audio = probe.streams?.find(stream => stream.codec_type === 'audio') ?? null
    if (!video || video.codec_name !== 'h264' || Number(video.width) !== width || Number(video.height) !== height
      || video.r_frame_rate !== '60/1' || Number(video.nb_read_frames) !== totalFrames
      || Math.abs(Number(video.duration) - seconds) > 0.15) {
      throw new Error(`Export H.264 inválido: ${JSON.stringify({ video, expectedFrames: totalFrames, seconds })}`)
    }
    if (includeAudio && (!audio || audio.codec_name !== 'aac' || Number(audio.sample_rate) !== 48000 || Number(audio.channels) !== 2)) {
      throw new Error(`Cenário misto não preservou áudio AAC 48 kHz estéreo: ${JSON.stringify(audio)}`)
    }
    run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-xerror', '-i', output, '-map', '0:v:0', ...(audio ? ['-map', '0:a:0'] : []), '-f', 'null', '-'])
    const totalMs = performance.now() - exportStartedAt
    const memory = sampler.stop()
    sampler = null
    const report = {
      ok: true,
      harness: 'Electron VideoExportSurfacePage + VideoSceneIR + VideoCharacterFrameRenderer + FFmpeg raw-frame writer; isolated tmpdir only.',
      backend,
      scenario,
      renderVariant: bootstrap.renderVariant,
      configuration: {
        seconds, resolution: `${width}x${height}`, fps, totalFrames,
        expectedFrames: seconds * 60,
        encoder, audio: includeAudio,
        browserWindowOffscreen: true,
        offscreenCanvasWorker: backend === 'offscreen-worker',
        surfaceResourceBudgetMiB,
        workerResourceBudgetMiB: backend === 'offscreen-worker' ? 224 : 0,
        workerImageCacheLimitMiB: backend === 'offscreen-worker' ? 96 : 0,
        pixiGpu: false,
        hardwareAcceleration: 'disabled for both Chromium paths',
        chunkFrames,
      },
      fixture: profile.counts,
      preparationMs,
      surfaceStartupMs,
      renderEncodeMs,
      assembleMs,
      totalExportMs: totalMs,
      renderFps: renderedFrames / (renderEncodeMs / 1000),
      exportThroughputFps: renderedFrames / (totalMs / 1000),
      realtimeFactor: seconds / (totalMs / 1000),
      frameLatencyMs: {
        mean: sum(renderLatencies) / renderLatencies.length,
        median: percentile(renderLatencies, .5),
        p95: percentile(renderLatencies, .95),
        p99: percentile(renderLatencies, .99),
        max: Math.max(...renderLatencies),
      },
      timings,
      layersCache: layerCache,
      frameIntegrity: { requested: totalFrames, rendered: renderedFrames, unique: seenFrames.size, duplicateFrames, outOfOrderFrames, rawFrameSha256: frameHashes.digest('hex') },
      memory: { ...memory, scope: 'Electron process tree working set and CPU; FFmpeg child is excluded' },
      garbageCollection: {
        mainProcessEvents: gcDurations.length,
        totalMs: sum(gcDurations),
        maxPauseMs: Math.max(0, ...gcDurations),
        scope: 'Node Electron main process only; Chromium renderer and Worker GC pause events are not exposed by this harness',
      },
      output: { bytes: fs.statSync(output).size, sha256: safeHash(output), video, audio },
      observations: [
        'characterMs e mediaDecodeMs são tarefas concorrentes por frame; não somar como tempos sequenciais.',
        'Um pedido de surface fica em voo por vez; o writer aceita backpressure com uma pré-busca de um frame.',
        'O Worker experimental tem orçamento de 224 MiB compartilhado entre caches de personagem; o cache de imagens tem teto próprio de 96 MiB e fecha ImageBitmap ao expulsar.',
      ],
    }
    const reportJson = `${JSON.stringify(report, null, 2)}\n`
    process.stdout.write(reportJson)
    if (process.env.GACHA_FULL_ENGINE_SOAK_REPORT_PATH) fs.writeFileSync(process.env.GACHA_FULL_ENGINE_SOAK_REPORT_PATH, reportJson)
    gcObserver.disconnect()
  } catch (error) {
    gcObserver.disconnect()
    if (activeWriter) await activeWriter.cancel().catch(() => {})
    if (win && !win.isDestroyed()) win.destroy()
    throw new Error(`${error.stack || error.message}\nHarness diagnostic: scenario=${scenario}, backend=${backend}, seconds=${seconds}, appData untouched; tempRoot=${root}`)
  } finally {
    sampler?.stop()
    if (win && !win.isDestroyed()) win.destroy()
    await new Promise(resolve => setTimeout(resolve, 350))
    try { fs.rmSync(root, { recursive: true, force: true, maxRetries: 40, retryDelay: 250 }) } catch (error) { console.warn('Temp cleanup warning:', error.message) }
  }
  app.exit(0)
}).catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`)
  process.exitCode = 1
  app.exit(1)
})
