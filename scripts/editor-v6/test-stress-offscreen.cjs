const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { pathToFileURL } = require('node:url')
const { spawn, spawnSync } = require('node:child_process')
const { createSyntheticStressProfile } = require('./synthetic-stress-profile.cjs')
const root = path.resolve(__dirname, '../..')
const ffmpeg = path.join(root, 'resources', 'video-tools', 'ffmpeg.exe')
const ffprobe = path.join(root, 'resources', 'video-tools', 'ffprobe.exe')
const defaultRunId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`
const outputRoot = process.env.GACHA_EDITOR_V6_STRESS_OUTPUT_ROOT
  ? path.resolve(process.env.GACHA_EDITOR_V6_STRESS_OUTPUT_ROOT)
  : path.join(root, 'out', 'editor-v6-stress', 'runs', defaultRunId)
let projectRoot
const vitest = path.join(root, 'node_modules', 'vitest', 'vitest.mjs')
const runDurationMs = Number(process.env.GACHA_EDITOR_V6_STRESS_RUN_MS || 30_000)

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject))
  const port = server.address().port
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function waitForDebugger(port, child) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Electron fechou durante a inicialização (código ${child.exitCode}).`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      if (response.ok) {
        const targets = await response.json()
        const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl)
        if (page) return page
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error('O Electron offscreen não abriu a porta CDP em 120 segundos.')
}

async function connectCdp(url) {
  const socket = new WebSocket(url)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let id = 0
  const pending = new Map()
  const handlers = new Set()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!message.id) { for (const handler of handlers) handler(message); return }
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    clearTimeout(request.timer)
    if (message.error) request.reject(new Error(message.error.message || JSON.stringify(message.error)))
    else request.resolve(message.result)
  })
  socket.addEventListener('close', () => {
    for (const request of pending.values()) request.reject(new Error('A sessão CDP do Electron foi encerrada.'))
    pending.clear()
  })
  const send = (method, params = {}, timeoutMs = 60_000) => new Promise((resolve, reject) => {
    const requestId = ++id
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP ${method} excedeu ${timeoutMs} ms.`)) }, timeoutMs)
    pending.set(requestId, { resolve, reject, timer })
    socket.send(JSON.stringify({ id: requestId, method, params }))
  })
  return { send, onEvent: (handler) => { handlers.add(handler); return () => handlers.delete(handler) }, close: () => socket.close() }
}

async function beginPlaybackTrace(cdp) {
  let finish
  const complete = new Promise((resolve) => { finish = resolve })
  const unsubscribe = cdp.onEvent((event) => {
    if (event.method === 'Tracing.tracingComplete') finish(event.params ?? {})
  })
  const categories = ['devtools.timeline', 'toplevel', 'v8', 'blink.user_timing', 'renderer.scheduler', 'cc']
  await cdp.send('Tracing.start', { transferMode:'ReturnAsStream', streamFormat:'json', traceConfig: { includedCategories: categories, recordMode: 'recordAsMuchAsPossible', enableArgumentFilter: true } })
  return { finish: complete, unsubscribe, categories: categories.join(','), startedAt: new Date().toISOString() }
}

async function finishPlaybackTrace(cdp, session, filePath, scenario, diagnostics) {
  try {
    await cdp.send('Tracing.end')
    const completion = await Promise.race([session.finish, new Promise((resolve) => setTimeout(() => resolve(null), 30_000))])
    if (!completion) throw Error('O Chromium não concluiu a captura CDP em 30 segundos.')
    let rawTrace
    if (completion.stream) {
      const handle=await fs.open(filePath,'w')
      try {
        let eof=false
        while(!eof) {
          const chunk=await cdp.send('IO.read',{handle:completion.stream,size:1024*1024})
          if(chunk.base64Encoded) await handle.write(Buffer.from(chunk.data,'base64'))
          else await handle.write(chunk.data)
          eof=chunk.eof===true
        }
      } finally { await handle.close(); await cdp.send('IO.close',{handle:completion.stream}).catch(()=>undefined) }
      rawTrace=JSON.parse(await fs.readFile(filePath,'utf8'))
    } else if (completion.traceEvents) rawTrace=completion
    else throw Error('O Chromium encerrou sem fornecer o trace stream nem eventos coletados.')
    const traceEvents=rawTrace.traceEvents??[]
    const metadata={ ...(rawTrace.metadata??{}), dataLossOccurred:completion.dataLossOccurred??rawTrace.metadata?.dataLossOccurred??null }
    const trace = { ...rawTrace, capturedAt: session.startedAt, scenario, durationMs: diagnostics.elapsedMs, categories: session.categories, eventCount: traceEvents.length, metadata, diagnostics, traceEvents }
    await fs.writeFile(filePath, JSON.stringify(trace), 'utf8')
    const { analyzeTrace } = require('./analyze-trace.cjs')
    const analysis = analyzeTrace(trace)
    const analysisPath = path.join(path.dirname(filePath), `${path.basename(filePath, '.json')}-analysis.json`)
    await fs.writeFile(analysisPath, JSON.stringify(analysis, null, 2), 'utf8')
    return { captured: true, eventCount: traceEvents.length, filePath, analysisPath, alignment: analysis.alignment, peaks: analysis.peaks.length, dataLossOccurred:analysis.traceIntegrity.dataLossOccurred }
  } catch (error) {
    await cdp.send('Tracing.end').catch(() => undefined)
    return { captured: false, error: error.message }
  } finally { session.unsubscribe() }
}

function runMediaTool(executable, args, label) {
  const result = spawnSync(executable, args, { cwd: root, encoding: 'utf8', timeout: 180_000, windowsHide: true })
  if (result.error || result.status !== 0) throw new Error(`${label} falhou: ${result.stderr || result.error?.message || `código ${result.status}`}`)
  return result.stdout
}

async function createMediaFixtures(folder) {
  await fs.mkdir(folder, { recursive: true })
  for (const name of ['video-h264.mp4', 'video-vp9.webm', 'audio-left.wav', 'audio-right.ogg']) {
    const output = path.join(folder, name)
    const input = name === 'audio-left.wav'
      ? ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=40', '-ac', '2', '-c:a', 'pcm_s16le']
      : name === 'audio-right.ogg'
        ? ['-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000:duration=40', '-ac', '2', '-c:a', 'libopus', '-b:a', '64k']
        : name === 'video-h264.mp4'
          ? ['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=40', '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000:duration=40', '-shortest', '-c:v', 'libopenh264', '-b:v', '450k', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart']
          : ['-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30:duration=40', '-f', 'lavfi', '-i', 'sine=frequency=550:sample_rate=48000:duration=40', '-shortest', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '350k', '-c:a', 'libopus', '-b:a', '48k']
    runMediaTool(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...input, output], `Geração da fixture ${name}`)
  }
  const probes = {}
  for (const name of ['video-h264.mp4', 'video-vp9.webm', 'audio-left.wav', 'audio-right.ogg']) {
    probes[name] = JSON.parse(runMediaTool(ffprobe, ['-v', 'error', '-show_entries', 'format=format_name,duration:stream=codec_name,codec_type,width,height,sample_rate,channels', '-of', 'json', path.join(folder, name)], `FFprobe ${name}`))
  }
  return probes
}

async function main() {
  await fs.mkdir(outputRoot, { recursive: true })
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'editor-v6-stress-offscreen-'))
  const dataRoot = path.join(tempRoot, 'app-data')
  projectRoot = path.join(dataRoot, 'runtime', 'profile', 'studios', 'Editor V6')
  const mediaRoot = path.join(tempRoot, 'media-fixtures')
  const mediaFixtureProbes = await createMediaFixtures(mediaRoot)
  const traceMode = process.argv.includes('--trace')
  const scenarioArgument = process.argv.find((argument) => argument.startsWith('--scenario='))
  const selectedScenario = scenarioArgument?.slice('--scenario='.length) ?? (traceMode ? 'heavy' : null)
  const memoArgument = process.argv.find((argument) => argument.startsWith('--memo='))
  const memoizationEnabled = memoArgument?.slice('--memo='.length) !== 'off'
  const runLabel = process.argv.find((argument) => argument.startsWith('--label='))?.slice('--label='.length) ?? null
  const experiment = process.argv.find((argument) => argument.startsWith('--experiment='))?.slice('--experiment='.length) ?? 'baseline'
  const tempProfile = path.join(dataRoot, 'runtime', 'profile')
  const syntheticProfile = await createSyntheticStressProfile(tempProfile)
  const bundlePath = path.join(tempRoot, 'synthetic-characters.json')
  const projectSummaryPath = path.join(tempRoot, 'projects-summary.json')
  const port = await freePort()
  const rendererPort = await freePort()
  const viteConfigPath = path.join(tempRoot, 'electron-vite.config.mts')
  await fs.writeFile(viteConfigPath, [
    `import baseConfig from ${JSON.stringify(pathToFileURL(path.join(root, 'electron.vite.config.ts')).href)}`,
    `export default { ...baseConfig, renderer: { ...baseConfig.renderer, server: { host: '127.0.0.1', port: ${rendererPort}, strictPort: true } } }`
  ].join('\n'), 'utf8')
  const env = {
    ...process.env,
    GACHA_VIDEO_STRESS_OFFSCREEN: '1',
    GACHA_VIDEO_STRESS_DEBUG_PORT: String(port),
    GACHA_EDITOR_V6_STRESS_DATA_ROOT: dataRoot,
    GV5_IPC_PERF: '1',
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
  }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(process.execPath, [path.join(root, 'node_modules', 'electron-vite', 'bin', 'electron-vite.js'), 'dev', '--watch', '--config', viteConfigPath], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  })
  let processOutput = ''
  child.stdout.on('data', (chunk) => { processOutput += chunk.toString(); process.stdout.write(chunk) })
  child.stderr.on('data', (chunk) => { processOutput += chunk.toString(); process.stderr.write(chunk) })
  let cdp
  let success = false
  try {
    console.log('[V6 stress] Iniciando o app Electron fora da área visível e habilitando CDP local.')
    const target = await waitForDebugger(port, child)
    cdp = await connectCdp(target.webSocketDebuggerUrl)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `try { sessionStorage.setItem('gv5:perf', '1') } catch {}; window.__editorV6DisableSceneLayerMemo=${!memoizationEnabled}; window.__editorV6TraceCapture=${traceMode}; window.__editorV6StressClockPairs=[]; window.__editorV6TraceMark=(name)=>{const performanceNowMs=performance.now();performance.mark(name,{detail:{performanceNowMs,timeOrigin:performance.timeOrigin}});window.__editorV6StressClockPairs.push({name,performanceNowMs});return performanceNowMs}; window.__editorV6StressMediaElements=new Set(); window.__editorV6StressMediaPlayEvents=[]; window.__editorV6StressMediaEvents=[]; window.__editorV6StressErrors=[]; window.addEventListener('error',event=>window.__editorV6StressErrors.push(String(event.message||'error'))); window.addEventListener('unhandledrejection',event=>window.__editorV6StressErrors.push(String(event.reason?.message||event.reason||'rejection'))); {const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...args){const media=this;window.__editorV6StressMediaElements.add(media);if(!media.__editorV6StressEventsBound){media.__editorV6StressEventsBound=true;for(const type of ['loadedmetadata','loadeddata','play','playing','waiting','stalled','seeking','seeked','timeupdate','pause','ended','error'])media.addEventListener(type,event=>{const item={type:event.type,tag:media.tagName.toLowerCase(),at:performance.now(),currentTime:media.currentTime,readyState:media.readyState,errorCode:media.error?.code??null};if(window.__editorV6StressMediaEvents.length<2000)window.__editorV6StressMediaEvents.push(item);if(window.__editorV6TraceCapture)window.__editorV6TraceMark('editor-v6:media:'+event.type)}); } if(window.__editorV6StressMediaPlayEvents.length<100)window.__editorV6StressMediaPlayEvents.push({type:this.tagName.toLowerCase(),extension:this.currentSrc?.split(/[?#]/)[0].split('.').at(-1)?.toLowerCase()??null,at:performance.now(),currentTime:this.currentTime});return play.apply(this,args)} }` })

    const origin = new URL(target.url).origin
    const captureUrl = `${origin}/?editorV6StressCapture=1&run=${Date.now()}#/editor-v6-stress-harness`
    await cdp.send('Page.navigate', { url: captureUrl })
    console.log('[V6 stress] Renderizando quatro personagens e poses sintéticos com o motor de produção do Editor V6.')
    const captureStatus = await waitForExpression(cdp, "window.__editorV6StressCapture?.status", (value) => value === 'done' || value === 'error', 180_000)
    if (captureStatus === 'error') {
      const details = await evaluate(cdp, 'window.__editorV6StressCapture?.error || "Erro desconhecido ao preparar personagens."')
      throw new Error(details)
    }
    const captured = await evaluate(cdp, 'window.__editorV6StressCapture.result')
    if (!Array.isArray(captured) || captured.length !== 4) throw new Error('A captura offscreen não entregou os quatro personagens STRESS.')
    await fs.writeFile(bundlePath, JSON.stringify(captured), 'utf8')
    console.log(`[V6 stress] ${captured.length} personagens capturados; bundle temporário: ${Math.round((await fs.stat(bundlePath)).size / 1024)} KB.`)

    const generate = spawnSync(process.execPath, [vitest, 'run', '--config', 'vitest.editor-v6.config.ts', 'tests/editor-v6/editorV6StressProjects.test.ts'], {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...env,
        GACHA_EDITOR_V6_STRESS_FIXTURES: '1',
        GACHA_EDITOR_V6_STRESS_ROOT: projectRoot,
        GACHA_EDITOR_V6_STRESS_CHARACTERS_BUNDLE: bundlePath,
        GACHA_EDITOR_V6_STRESS_MEDIA_ROOT: mediaRoot,
        GACHA_EDITOR_V6_STRESS_SUMMARY_PATH: projectSummaryPath,
        GACHA_EDITOR_V6_STRESS_EXPERIMENT: experiment
      },
      timeout: 180_000,
      windowsHide: true
    })
    if (generate.error) throw generate.error
    if (generate.status !== 0) throw new Error(`A geração/validação dos projetos falhou (Vitest ${generate.status}).`)
    const projectSummaries = JSON.parse(await fs.readFile(projectSummaryPath, 'utf8'))

    const scenarios = [
      { key: 'light', title: '[TESTE] Estresse leve — 4 personagens STRESS' },
      { key: 'medium', title: '[TESTE] Estresse médio — 4 personagens STRESS' },
      { key: 'heavy', title: '[TESTE] Estresse pesado — 4 personagens STRESS' },
      { key: 'multimedia', title: '[TESTE] Estresse multimídia — codecs e áudio' }
    ]
    if (selectedScenario && !scenarios.some((scenario) => scenario.key === selectedScenario)) throw new Error(`Cenário inválido para trace: ${selectedScenario}`)
    const scenariosToRun = selectedScenario ? scenarios.filter((scenario) => scenario.key === selectedScenario) : scenarios
    const measurements = []
    let traceCapture = null
    for (const scenario of scenariosToRun) {
      const appUrl = `${origin}/?editorV6Offscreen=${scenario.key}-${Date.now()}#/editor-v6`
      await cdp.send('Page.navigate', { url: appUrl })
      await waitForExpression(cdp, `Boolean(document.querySelector(${JSON.stringify(`button[aria-label="Abrir ${scenario.title}"]`)}))`, Boolean, 90_000)
      const opened = await evaluate(cdp, `(() => { const button = document.querySelector(${JSON.stringify(`button[aria-label="Abrir ${scenario.title}"]`)}); if (!button) return false; button.click(); return true })()`)
      if (!opened) throw new Error(`Não foi possível abrir o projeto ${scenario.key} na interface real do Editor V6.`)
      await waitForExpression(cdp, `Boolean(document.querySelector(${JSON.stringify(`.studio-editor[aria-label="Editor do ${scenario.title}"]`)}))`, Boolean, 90_000)
      await waitForExpression(cdp, 'document.querySelectorAll(".editor-v6-timeline-block").length > 0', Boolean, 30_000)
      const motionPreparation = await waitForMotionPreparation(cdp, 180_000)

      const prepared = projectSummaries.find((item) => item.key === scenario.key)
      const expectedStressIds = captured.map(({ character }) => character.id).sort().join(',')
      if (!prepared || prepared.missingMotions !== 0 || prepared.characters !== 4 || prepared.characterNames.join(',') !== captured.map(({ character }) => character.name).join(',') || prepared.characterIds.sort().join(',') !== expectedStressIds) {
        throw new Error(`${scenario.key}: o projeto aberto no app perdeu personagens STRESS ou transições 250 ms. Dados: ${JSON.stringify(prepared)}`)
      }
      await evaluate(cdp, 'document.querySelector("button[aria-label=\\"Fechar inspector\\"]")?.click()')
      await waitForExpression(cdp, 'Boolean(!document.querySelector(".studio-inspector"))', (value) => value === true, 5000)
      const playButton = await evaluate(cdp, 'document.querySelector(".editor-v6-timeline-actions button[aria-label=Reproduzir]") !== null')
      if (!playButton) throw new Error(`${scenario.key}: botão de reprodução não apareceu no Editor V6.`)
      const expectedSceneNames = captured.map(({ character }) => character.name)
      const visualSurface = await evaluate(cdp, `({ cast: document.querySelectorAll(".studio-cast-item").length, timeline: document.querySelectorAll(".editor-v6-timeline-block").length, scene: Boolean(document.querySelector(".v6-scene-canvas")), sceneCharacterNames: [...document.querySelectorAll(".v6-scene-surface g[data-element-id]")].map(element => element.getAttribute("aria-label")).filter(name => ${JSON.stringify(expectedSceneNames)}.includes(name)) })`)
      if (visualSurface.cast !== 4 || visualSurface.sceneCharacterNames.slice().sort().join(',') !== expectedSceneNames.slice().sort().join(',') || !visualSurface.scene || visualSurface.timeline === 0) throw new Error(`${scenario.key}: a interface não desenhou os quatro personagens sintéticos na cena. ${JSON.stringify(visualSurface)}`)
      await evaluate(cdp, 'document.querySelector(".editor-v6-timeline-actions button[aria-label=Reproduzir]")?.click()')
      await waitForExpression(cdp, 'Boolean(document.querySelector(".editor-v6-timeline-actions button[aria-label=Pausar]"))', Boolean, 5000)
      await new Promise((resolve) => setTimeout(resolve, 2000))
      await evaluate(cdp, 'document.querySelector(".editor-v6-timeline-actions button[aria-label=Pausar]")?.click()')
      await waitForExpression(cdp, 'Boolean(document.querySelector(".editor-v6-timeline-actions button[aria-label=Reproduzir]"))', Boolean, 5000)
      await evaluate(cdp, 'window.dispatchEvent(new KeyboardEvent("keydown",{key:"Home",bubbles:true}))')
      await waitForExpression(cdp, 'Number(document.querySelector(".v6-scene-surface")?.getAttribute("data-frame")) === 0', Boolean, 5000)
      let interactionMetrics = null
      if (scenario.key === 'medium') {
        const interactionStart = Date.now()
        const seekStartedAt = Date.now()
        await evaluate(cdp, `window.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))`)
        await waitForExpression(cdp, 'Number(document.querySelector(".v6-scene-surface")?.getAttribute("data-frame")) > 0', Boolean, 5000)
        await evaluate(cdp, `window.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))`)
        await waitForExpression(cdp, 'Number(document.querySelector(".v6-scene-surface")?.getAttribute("data-frame")) === 0', Boolean, 5000)
        const seekMs = Date.now() - seekStartedAt
        const pauseResumeStartedAt = Date.now()
        await evaluate(cdp, 'document.querySelector(".editor-v6-timeline-actions button[aria-label=Reproduzir]")?.click()')
        await waitForExpression(cdp, 'Boolean(document.querySelector(".editor-v6-timeline-actions button[aria-label=Pausar]"))', Boolean, 5000)
        await new Promise((resolve) => setTimeout(resolve, 350))
        await evaluate(cdp, 'document.querySelector(".editor-v6-timeline-actions button[aria-label=Pausar]")?.click()')
        await waitForExpression(cdp, 'Boolean(document.querySelector(".editor-v6-timeline-actions button[aria-label=Reproduzir]"))', Boolean, 5000)
        const blocksBefore = await evaluate(cdp, 'document.querySelectorAll(".editor-v6-timeline-block.kind-speech").length')
        const editStartedAt = Date.now()
        await evaluate(cdp, `document.querySelector('.editor-v6-timeline-block.kind-speech')?.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:200,clientY:200}))`)
        await waitForExpression(cdp, 'Boolean(document.querySelector(".v6-timeline-menu [role=menuitem]"))', Boolean, 5000)
        await evaluate(cdp, `([...document.querySelectorAll('.v6-timeline-menu [role=menuitem]')].find(item=>item.textContent.includes('Duplicar')))?.click()`)
        await waitForExpression(cdp, `document.querySelectorAll(".editor-v6-timeline-block.kind-speech").length > ${blocksBefore}`, Boolean, 5000)
        const blocksAfter = await evaluate(cdp, 'document.querySelectorAll(".editor-v6-timeline-block.kind-speech").length')
        const editMs = Date.now() - editStartedAt
        await evaluate(cdp, 'document.querySelector(".editor-v6-timeline-actions button[aria-label=Reproduzir]")?.click()')
        await waitForExpression(cdp, 'Boolean(document.querySelector(".editor-v6-timeline-actions button[aria-label=Pausar]"))', Boolean, 5000)
        await new Promise((resolve) => setTimeout(resolve, 350))
        const resumeFrame = await evaluate(cdp, 'Number(document.querySelector(".v6-scene-surface")?.getAttribute("data-frame"))')
        await evaluate(cdp, 'document.querySelector(".editor-v6-timeline-actions button[aria-label=Pausar]")?.click()')
        interactionMetrics = { totalMs: Date.now() - interactionStart, seekMs, editMs, pauseResumeMs: Date.now() - pauseResumeStartedAt, blocksBefore, blocksAfter, resumedFrame: resumeFrame, pauseResumeSeekPassed: blocksAfter === blocksBefore + 1 && resumeFrame > 0 }
        if (!interactionMetrics.pauseResumeSeekPassed) throw new Error('O cenário de interação não concluiu pause, seek, edição da timeline e retomada.')
      }
      const traceSession = traceMode ? await beginPlaybackTrace(cdp) : null
      let calibration = null
      if (traceMode) {
        calibration = await evaluate(cdp, `(() => new Promise(resolve => {
          const prefix = 'editor-v6:trace-sync:${scenario.key}:${Date.now()}'
          const startName = prefix + ':calibration-start', endName = prefix + ':calibration-end'
          const startPerformanceNowMs = window.__editorV6TraceMark(startName)
          setTimeout(() => {
            const endPerformanceNowMs = window.__editorV6TraceMark(endName)
            const measureName = prefix + ':calibration-measure'
            performance.measure(measureName, startName, endName)
            const measuredDurationMs = performance.getEntriesByName(measureName).at(-1)?.duration ?? null
            resolve({ startName, endName, startPerformanceNowMs, endPerformanceNowMs, measuredDurationMs, timeOrigin: performance.timeOrigin })
          }, 250)
        }))()`)
      }
      await evaluate(cdp, 'window.__gv5PerformanceReset?.()')
      await evaluate(cdp, `(() => {
        const observedWindows = ${JSON.stringify(prepared.motionWindows.filter((window) => window.startFrame < runDurationMs * 30 / 1000 + 10))}
        const motionWindowsByFrame = Object.create(null)
        for (const motionWindow of observedWindows) for (let sampleFrame=Math.floor(motionWindow.startFrame)+1;sampleFrame<=Math.ceil(motionWindow.endFrame)-1;sampleFrame++) (motionWindowsByFrame[sampleFrame] ||= []).push(motionWindow)
        const state = { samples: [], rafIntervals: [], motionFrames: {}, motionFrameEvents: [], motionBoundaryEvents: [], visualChangeEvents: [], sceneMutationEvents: [], domFrames: [], domFrameEvents: [], heapSamples: [], gcSamples: [], mediaStats: {}, motionWindowsByFrame, activeMotionWindows: new Set(), lastMotionFrameByWindow: new Map(), visualStateByCharacter: new Map(), last: null, started: performance.now(), timeOrigin: performance.timeOrigin, active: true, startFrame: Number(document.querySelector('.v6-scene-surface')?.getAttribute('data-frame')), memoryStart: performance.memory?.usedJSHeapSize ?? null }
        if (window.__editorV6TraceCapture) window.__editorV6TraceMark('editor-v6:scenario:${scenario.key}:window-start')
        window.__editorV6StressFrames = state
        try {
          if (PerformanceObserver.supportedEntryTypes.includes('gc')) {
            state.gcObserver = new PerformanceObserver(list => { for (const entry of list.getEntries()) state.gcSamples.push({ at:+entry.startTime.toFixed(2), duration:+entry.duration.toFixed(2), kind:entry.detail?.kind ?? null }) })
            state.gcObserver.observe({ entryTypes: ['gc'] })
          }
        } catch {}
        const sceneElement = document.querySelector('.v6-scene-surface')
        if (sceneElement) {
          state.domFrames.push(Number(sceneElement.getAttribute('data-frame')))
          state.domFrameEvents.push({ at: performance.now(), frame: Number(sceneElement.getAttribute('data-frame')) })
          state.domObserver = new MutationObserver(() => {
            const frame = Number(sceneElement.getAttribute('data-frame'))
            if (Number.isInteger(frame) && state.domFrames.at(-1) !== frame) { state.domFrames.push(frame); state.domFrameEvents.push({ at: performance.now(), frame }) }
          })
          state.domObserver.observe(sceneElement, { attributes: true, attributeFilter: ['data-frame'] })
          if (window.__editorV6TraceCapture) {
            state.sceneMutationObserver = new MutationObserver((records) => {
              const frame = Number(sceneElement.getAttribute('data-frame'))
              for (const record of records) {
                if (state.sceneMutationEvents.length >= 10000) break
                state.sceneMutationEvents.push({ at:+performance.now().toFixed(3), frame, type:record.type, attribute:record.attributeName ?? null, added:record.addedNodes?.length ?? 0, removed:record.removedNodes?.length ?? 0 })
              }
            })
            state.sceneMutationObserver.observe(sceneElement, { attributes:true, childList:true, subtree:true, attributeOldValue:false })
          }
        }
        const tick = (time) => {
          if (!state.active) return
          if (state.last !== null) { state.samples.push(time - state.last); state.rafIntervals.push({ startTimeMs: state.last, durationMs: time - state.last }) }
          state.last = time
          const scene = document.querySelector('.v6-scene-surface')
          const frame = Number(scene?.getAttribute('data-frame'))
          if (Number.isInteger(frame)) for (const character of scene.querySelectorAll('g[data-element-id]')) {
            const name = character.getAttribute('aria-label')
            if (!name?.startsWith('STRESS_')) continue
            const sprite = character.querySelector('svg[viewBox]')
            const image = character.querySelector('image')
            const viewBox = sprite?.getAttribute('viewBox') ?? null
            const href = image?.getAttribute('href') ?? image?.getAttributeNS('http://www.w3.org/1999/xlink','href') ?? null
            if (sprite) (state.motionFrames[name] ||= new Set()).add(frame)
            const previous = state.visualStateByCharacter.get(name)
            if (previous && (previous.href !== href || previous.viewBox !== viewBox)) {
              if (state.visualChangeEvents.length < 10000) state.visualChangeEvents.push({ at:+time.toFixed(3), frame, characterName:name, imageSourceChanged:previous.href !== href, spriteCropChanged:previous.viewBox !== viewBox })
            }
            state.visualStateByCharacter.set(name,{href,viewBox})
          }
          if (Number.isInteger(frame)) for (const motionWindow of state.motionWindowsByFrame[frame] ?? []) {
            const finalSampleFrame = Math.ceil(motionWindow.endFrame) - 1
            const key = motionWindow.characterName + ':' + motionWindow.startFrame + ':' + motionWindow.endFrame
            if (!state.activeMotionWindows.has(key)) {
              state.activeMotionWindows.add(key)
              const item = { type:'start', at:+time.toFixed(3), frame, characterName:motionWindow.characterName, startFrame:motionWindow.startFrame, boundaryFrame:motionWindow.endFrame, framesToBoundary:+(motionWindow.endFrame-frame).toFixed(2) }
              state.motionBoundaryEvents.push(item)
              if (globalThis.__editorV6TraceCapture) globalThis.__editorV6TraceMark('editor-v6:motion:start:' + motionWindow.characterName + ':' + motionWindow.endFrame)
            }
            if (state.lastMotionFrameByWindow.get(key) !== frame && state.motionFrameEvents.length < 20000) {
              state.lastMotionFrameByWindow.set(key,frame)
              state.motionFrameEvents.push({ at:+time.toFixed(3), frame, characterName:motionWindow.characterName, framesToBoundary:+(motionWindow.endFrame-frame).toFixed(2) })
            }
            if (frame >= finalSampleFrame && !motionWindow.__editorV6MotionEndRecorded) {
              motionWindow.__editorV6MotionEndRecorded = true
              state.motionBoundaryEvents.push({ type:'end', at:+time.toFixed(3), frame, characterName:motionWindow.characterName, startFrame:motionWindow.startFrame, boundaryFrame:motionWindow.endFrame, framesToBoundary:+(motionWindow.endFrame-frame).toFixed(2) })
              if (globalThis.__editorV6TraceCapture) globalThis.__editorV6TraceMark('editor-v6:motion:end:' + motionWindow.characterName + ':' + motionWindow.endFrame)
            }
          }
          if (state.samples.length % 60 === 0 && performance.memory) state.heapSamples.push({ at: +(performance.now() - state.started).toFixed(1), usedBytes: performance.memory.usedJSHeapSize })
          for (const media of window.__editorV6StressMediaElements ?? []) {
            const extension = media.currentSrc?.split(/[?#]/)[0].split('.').at(-1)?.toLowerCase() ?? 'unknown'
            const key = media.tagName.toLowerCase() + ':' + extension
            const targetTime = media.tagName === 'VIDEO' ? Number(media.dataset.targetTime) : frame / 30
            const stat = state.mediaStats[key] ||= { maxReadyState: 0, maxAbsDriftSeconds: 0, errorCodes: [] }
            stat.maxReadyState = Math.max(stat.maxReadyState, media.readyState)
            if (Number.isFinite(targetTime)) stat.maxAbsDriftSeconds = Math.max(stat.maxAbsDriftSeconds, Math.abs(media.currentTime-targetTime))
            if (media.error?.code && !stat.errorCodes.includes(media.error.code)) stat.errorCodes.push(media.error.code)
          }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })()`)
      await evaluate(cdp, 'document.querySelector(".editor-v6-timeline-actions button[aria-label=Reproduzir]").click()')
      const playbackStarted = await waitForExpression(cdp, 'Boolean(document.querySelector(".editor-v6-timeline-actions button[aria-label=Pausar]"))', (value) => value === true, 5000).catch(() => false)
      if (!playbackStarted) {
        const blocked = await evaluate(cdp, `({
          preview: document.querySelector('.v6-preview-time')?.textContent?.trim() ?? null,
          playButton: document.querySelector('.editor-v6-timeline-actions button[aria-label="Reproduzir"]')?.outerHTML ?? null,
          pauseButton: Boolean(document.querySelector('.editor-v6-timeline-actions button[aria-label="Pausar"]')),
          notices: [...document.querySelectorAll('.v6-timeline-notice,[role="alert"],[role="status"]')].map(item => item.textContent?.trim()).filter(Boolean).slice(0,8)
        })`)
        throw new Error(`${scenario.key}: o botão foi chamado, mas o Editor V6 não iniciou a reprodução. ${JSON.stringify(blocked)}`)
      }
      const clockAtStart = await evaluate(cdp, 'document.querySelector(".v6-preview-time")?.textContent?.trim() ?? null')
      await new Promise((resolve) => setTimeout(resolve, runDurationMs))
      const clockAtEnd = await evaluate(cdp, 'document.querySelector(".v6-preview-time")?.textContent?.trim() ?? null')
      if (!clockAtEnd?.startsWith('Reproduzindo') || clockAtEnd === clockAtStart) throw new Error(`${scenario.key}: a prévia não avançou durante a reprodução. ${clockAtStart} → ${clockAtEnd}`)
      await evaluate(cdp, 'document.querySelector(".editor-v6-timeline-actions button[aria-label=Pausar]")?.click()')
      const measurement = await evaluate(cdp, `(() => {
        const state = window.__editorV6StressFrames
        state.active = false
        const sorted = [...state.samples].sort((a,b) => a-b)
        const percentile = (p) => sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))].toFixed(2) : 0
        const mean = state.samples.length ? state.samples.reduce((a,b) => a+b,0) / state.samples.length : 0
        state.domObserver?.disconnect()
        state.sceneMutationObserver?.disconnect()
        const domGaps = state.domFrames.slice(1).flatMap((frame, index) => frame > state.domFrames[index] + 1 ? [{ from: state.domFrames[index], to: frame, skipped: frame - state.domFrames[index] - 1 }] : [])
        state.gcObserver?.disconnect()
        const elapsedMs = performance.now() - state.started
        const finalFrame = Number(document.querySelector('.v6-scene-surface')?.getAttribute('data-frame'))
        const performanceMemory = performance.memory?.usedJSHeapSize ?? null
        return {
          rafSamples: state.samples.length,
          elapsedMs: +elapsedMs.toFixed(1),
          windowStartMs: +state.started.toFixed(3),
          performanceTimeOrigin: state.timeOrigin,
          rafIntervals: state.rafIntervals.map((item) => ({ startTimeMs:+item.startTimeMs.toFixed(3), durationMs:+item.durationMs.toFixed(3) })),
          rafCallbackHz: elapsedMs ? +(state.samples.length * 1000 / elapsedMs).toFixed(1) : 0,
          domFrameUpdateRate: elapsedMs ? +((state.domFrames.length - 1) * 1000 / elapsedMs).toFixed(2) : 0,
          logicalFrameAdvanceFps: elapsedMs ? +((finalFrame - state.startFrame) * 1000 / elapsedMs).toFixed(2) : 0,
          physicalPresentedFrameRate: null,
          p50FrameMs: percentile(.5), p95FrameMs: percentile(.95), p99FrameMs: percentile(.99), worstFrameMs: sorted.at(-1) ? +sorted.at(-1).toFixed(2) : 0,
          framesOver33ms: state.samples.filter(frame => frame > 33.34).length,
          framesOver50ms: state.samples.filter(frame => frame > 50).length,
          domFrameSamples: state.domFrames.length,
          domFrameGaps: domGaps,
          domFrameEvents: state.domFrameEvents.map((item) => ({ at:+item.at.toFixed(3), frame:item.frame })),
          motionFrameEvents: state.motionFrameEvents,
          motionBoundaryEvents: state.motionBoundaryEvents,
          visualChangeEvents: state.visualChangeEvents,
          sceneMutationEvents: state.sceneMutationEvents,
          jsHeapStartBytes: state.memoryStart,
          jsHeapEndBytes: performanceMemory,
          jsHeapDeltaBytes: state.memoryStart === null || performanceMemory === null ? null : performanceMemory - state.memoryStart,
          jsHeapPeakBytes: state.heapSamples.length ? Math.max(...state.heapSamples.map(sample => sample.usedBytes)) : null,
          jsHeapSamples: state.heapSamples,
          gcEventCount: state.gcSamples.length,
          gcSupported: Boolean(state.gcObserver),
          gcSamples: state.gcSamples,
          mediaStats: state.mediaStats,
          mediaEvents: (window.__editorV6StressMediaEvents ?? []).map((event) => ({ ...event, at:+(event.at-state.started).toFixed(3) })),
          timelineFrame: Number(document.querySelector('.v6-scene-surface')?.getAttribute('data-frame')),
          mediaElements: [...(window.__editorV6StressMediaElements ?? [])].map(media => { const extension = media.currentSrc?.split(/[?#]/)[0].split('.').at(-1)?.toLowerCase() ?? null; const targetTime = media.tagName === 'VIDEO' ? Number(media.dataset.targetTime) : Number(document.querySelector('.v6-scene-surface')?.getAttribute('data-frame')) / 30; return { type: media.tagName.toLowerCase(), extension, currentTime: +media.currentTime.toFixed(3), targetTime: Number.isFinite(targetTime) ? +targetTime.toFixed(3) : null, driftSeconds: Number.isFinite(targetTime) ? +(media.currentTime - targetTime).toFixed(3) : null, duration: Number.isFinite(media.duration) ? +media.duration.toFixed(3) : null, readyState: media.readyState, networkState: media.networkState, paused: media.paused, errorCode: media.error?.code ?? null } }),
          pageErrors: [...(window.__editorV6StressErrors ?? [])],
          mediaPlayEvents: [...(window.__editorV6StressMediaPlayEvents ?? [])].map(event => ({ ...event, at: +(event.at - state.started).toFixed(1) })),
          motionFramesByCharacter: Object.fromEntries(Object.entries(state.motionFrames).map(([name, frames]) => [name, [...frames].sort((a,b) => a-b)])),
          clockAtStart: ${JSON.stringify(clockAtStart)},
          clockAtEnd: ${JSON.stringify(clockAtEnd)},
          playbackClock: document.querySelector('.v6-preview-time')?.textContent?.trim() ?? null,
          react: window.__gv5PerformanceReport?.() ?? []
        }
      })()`)
      if (traceMode) {
        await evaluate(cdp, `window.__editorV6TraceMark('editor-v6:scenario:${scenario.key}:window-end')`)
        const clockPairs = await evaluate(cdp, 'window.__editorV6StressClockPairs')
        traceCapture = await finishPlaybackTrace(cdp, traceSession, path.join(outputRoot, `${scenario.key}-playback-trace.json`), scenario.key, { ...measurement, clockPairs, calibration })
      }
      const expectedPoseChangeNames = [...new Set(prepared.motionWindows
        .filter((window) => window.startFrame < runDurationMs * 30 / 1000 + 10)
        .map((window) => window.characterName))].sort()
      const poseChangeNamesObserved = [...new Set(measurement.visualChangeEvents
        .filter((event) => event.imageSourceChanged)
        .map((event) => event.characterName))].sort()
      const poseChangesObserved = expectedPoseChangeNames.every((name) => poseChangeNamesObserved.includes(name))
      if (runDurationMs >= 30_000 && expectedPoseChangeNames.length && !poseChangesObserved) {
        throw new Error(`${scenario.key}: a prévia não exibiu as trocas de pose esperadas (${expectedPoseChangeNames.join(',')}). Observadas: ${poseChangeNamesObserved.join(',') || 'nenhuma'}. A prévia do Editor V6 usa snapshots estáticos; atlas de movimento são usados na exportação.`)
      }
      const mediaValidation = scenario.key === 'multimedia' ? (() => {
        const expected = ['mp4', 'webm', 'wav', 'ogg']
        const observed = [...new Set(measurement.mediaPlayEvents.map((item) => item.extension).filter(Boolean))].sort()
        return { expectedExtensions: expected, observedExtensions: observed, missingExtensions: expected.filter((extension) => !observed.includes(extension)), mediaErrors: measurement.mediaElements.filter((item) => item.errorCode !== null), readyMedia: measurement.mediaElements.filter((item) => item.readyState >= 2).length, maxVideoDriftSeconds: Math.max(0, ...measurement.mediaElements.filter((item) => item.type === 'video' && item.driftSeconds !== null).map((item) => Math.abs(item.driftSeconds))), maxAudioDriftSeconds: Math.max(0, ...measurement.mediaElements.filter((item) => item.type === 'audio' && item.driftSeconds !== null).map((item) => Math.abs(item.driftSeconds))) }
      })() : null
      const image = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      const screenshotPath = path.join(outputRoot, `${scenario.key}-offscreen.png`)
      await fs.writeFile(screenshotPath, Buffer.from(image.data, 'base64'))
      const sceneClip = await evaluate(cdp, `(() => { const rect=document.querySelector('.v6-scene-canvas')?.getBoundingClientRect(); return rect ? {x:rect.x,y:rect.y,width:rect.width,height:rect.height} : null })()`)
      let sceneScreenshotPath = null
      if (sceneClip?.width > 0 && sceneClip?.height > 0) {
        const sceneImage = await cdp.send('Page.captureScreenshot', { format:'png', captureBeyondViewport:true, clip:{...sceneClip,scale:1} })
        sceneScreenshotPath = path.join(outputRoot, `${scenario.key}-scene.png`)
        await fs.writeFile(sceneScreenshotPath, Buffer.from(sceneImage.data,'base64'))
      }
      const runtimeConfig = await evaluate(cdp, `({userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory??null,viewport:{width:innerWidth,height:innerHeight},screen:{width:screen.width,height:screen.height,refreshRate:screen.orientation?.type??null},timeOrigin:performance.timeOrigin})`)
      measurements.push({ ...scenario, project: prepared, visualSurface, interactionMetrics, mediaValidation, expectedPoseChangeNames, poseChangeNamesObserved, poseChangesObserved, motionPlaybackPreview: 'static-pose-snapshots; transition atlases are prepared for export', motionReadyWaitMs: motionPreparation.durationMs, memoizationEnabled, runtimeConfig, ...measurement, screenshotPath, sceneScreenshotPath })
      const playbackMetrics = measurement.react.find((item) => item.route === '/editor-v6')?.playback
      console.log(`[V6 stress] ${scenario.key}: ${runDurationMs} ms, ${prepared.blocks} blocos, RAF p95 ${measurement.p95FrameMs} ms, callbacks ${measurement.rafCallbackHz} Hz, DOM ${measurement.domFrameUpdateRate} updates/s, pior ${measurement.worstFrameMs} ms, commits ${measurement.react.find((item) => item.route === '/editor-v6')?.commits ?? 0}, logical gaps ${playbackMetrics?.logicalFrameGaps?.length ?? 'n/d'}, DOM gaps ${measurement.domFrameGaps.length}.`)

    }
    const report = {
      generatedAt: new Date().toISOString(),
      mode: 'Electron Chromium em janela fora dos monitores, perfil sintético temporário isolado; nenhum perfil local foi lido ou copiado; background throttling desativado; CDP local.',
      syntheticProfile: { characterNames: syntheticProfile.characterNames, sourceFile: syntheticProfile.sourceFile, partCount: syntheticProfile.partCount, poseSlots: syntheticProfile.poseSlots },
      playbackMotionContract: 'EditorV6PlaybackScene resolves preview with includeMotion=false. The playback benchmark checks visible pose snapshot changes; prepared transition atlases are validated in the project and consumed by export.',
      runLabel,
      experiment,
      runDurationMs,
      mediaFixtureProbes,
      traceCapture,
      presentationNote: 'A coleta de requestAnimationFrame e do atributo data-frame mede callbacks RAF e estado DOM após commit. Ela não prova que cada imagem foi fisicamente apresentada pelo monitor/compositor.',
      characters: captured.map(({ character, poses, transitions }) => ({ name: character.name, id: character.id, renderedPoses: poses.map(({ poseSlot, width, height }) => ({ poseSlot, width, height })), bakedTransitions: transitions.map(({ fromPoseSlot, toPoseSlot, metrics }) => ({ fromPoseSlot, toPoseSlot, ...metrics })) })),
      measurements
    }
    const reportPath = path.join(outputRoot, 'offscreen-performance.json')
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')
    console.log(`[V6 stress] Relatório completo: ${reportPath}`)
    success = true
  } finally {
    if (cdp) {
      await cdp.send('Browser.close', {}, 5000).catch(() => undefined)
      cdp.close()
    }
    await Promise.race([new Promise((resolve) => child.once('close', resolve)), new Promise((resolve) => setTimeout(resolve, 4000))])
    if (child.exitCode === null && process.platform === 'win32' && child.pid) {
      const stopped = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      if (stopped.error || stopped.status !== 0) child.kill()
    } else if (child.exitCode === null) child.kill()
    await Promise.race([new Promise((resolve) => child.once('close', resolve)), new Promise((resolve) => setTimeout(resolve, 5000))])
    if (success) {
      const reportPath = path.join(outputRoot, 'offscreen-performance.json')
      try {
        const report = JSON.parse(await fs.readFile(reportPath, 'utf8'))
        report.ipcMetrics = processOutput.split(/\r?\n/).filter((line) => /editor-v6:|averageMs|worstMs|failures/.test(line)).slice(-300)
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')
        if (runLabel) {
          if (!/^[a-z0-9_-]+$/i.test(runLabel)) throw new Error(`Etiqueta de execução inválida: ${runLabel}`)
          const abRoot = path.join(outputRoot, 'ab-memo')
          await fs.mkdir(abRoot, { recursive: true })
          await fs.copyFile(reportPath, path.join(abRoot, `${selectedScenario ?? 'all'}-${memoizationEnabled ? 'memo-on' : 'memo-off'}-${runLabel}.json`))
        }
      } catch (error) { console.error(`[V6 stress] Não foi possível anexar as métricas IPC ao relatório: ${error.message}`) }
    }
    let cleanupError
    for (let attempt = 0; attempt < 12; attempt++) {
      try { await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 }); cleanupError = undefined; break }
      catch (error) { cleanupError = error; await new Promise((resolve) => setTimeout(resolve, 500)) }
    }
    if (cleanupError) console.error(`[V6 stress] Perfil temporário preservado para diagnóstico: ${tempRoot}. ${cleanupError.message}`)
  }
  if (!success) process.exitCode = 1
}

async function evaluate(cdp, expression) {
  const response = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, 180_000)
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Falha de execução no renderer offscreen.')
  return response.result?.value
}

async function waitForExpression(cdp, expression, ready, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const value = await evaluate(cdp, expression)
      if (ready(value)) return value
    } catch (error) { lastError = error }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Tempo limite aguardando condição do teste offscreen: ${expression}${lastError ? ` (${lastError.message})` : ''}`)
}

async function waitForMotionPreparation(cdp, timeoutMs) {
  const startedAt = Date.now(), deadline = startedAt + timeoutMs
  let readySince = null
  while (Date.now() < deadline) {
    const state = await evaluate(cdp, `(() => {
      const pending = [...document.querySelectorAll('small[role="status"].studio-save-notice')].map(node => node.textContent?.trim() || '')
      const errors = [...document.querySelectorAll('small[role="status"].studio-error-message')].map(node => node.textContent?.trim() || '')
      return { pending: pending.some(text => /Preparando anima/i.test(text)), errors }
    })()`)
    if (state.errors.length) throw new Error(`Falha ao preparar a animação real no Editor V6: ${state.errors.join(' | ')}`)
    if (state.pending) readySince = null
    else if (readySince === null) readySince = Date.now()
    else if (Date.now() - readySince >= 700) return { durationMs: readySince - startedAt }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`O Editor V6 não terminou de preparar as transições em ${timeoutMs} ms.`)
}

main().catch((error) => { console.error('[V6 stress] Falha:', error); process.exitCode = 1 })
