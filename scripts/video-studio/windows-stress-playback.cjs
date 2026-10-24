const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const projectId = '1c9b7ef5-e020-40bd-bfb5-b56b6fac5241'
const projectTitle = 'STRESS TEST — 4 GACHA — 180 SEGUNDOS'
const frameCount = 10800
let activeWebSocket = null
let activeProbe = null
let activeProbeStopFile = null
let activeProbeDone = null
let activeRunDirectory = null
let activeCycleName = null
let activeLastState = null

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }
function percentile(values, p) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]
}
function folderBytes(root) {
  let bytes = 0, files = 0
  const visit = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name)
      const info = fs.lstatSync(full)
      if (info.isSymbolicLink()) continue
      if (info.isDirectory()) visit(full)
      else if (info.isFile()) { bytes += info.size; files++ }
    }
  }
  try { visit(root) } catch (error) { if (error.code !== 'ENOENT') throw error }
  return { bytes, files }
}
function parseCsvLine(line) {
  const cells = []
  let cell = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i++ }
      else quoted = !quoted
    } else if (char === ',' && !quoted) {
      cells.push(cell); cell = ''
    } else cell += char
  }
  cells.push(cell)
  return cells
}
function parseProbe(csvPath, processTypes) {
  const lines = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/)
  if (lines.length < 2) throw new Error(`A sonda de memória não gravou amostras: ${csvPath}`)
  const header = parseCsvLine(lines.shift())
  const rows = lines.map((line) => Object.fromEntries(parseCsvLine(line).map((value, index) => [header[index], value])))
  const groups = new Map()
  const perPid = new Map()
  for (const row of rows) {
    const sample = Number(row.Sample)
    const current = groups.get(sample) ?? { workingSetBytes: 0, privateBytes: 0, processCount: 0 }
    current.workingSetBytes += Number(row.WorkingSetBytes)
    current.privateBytes += Number(row.PrivateBytes)
    current.processCount++
    groups.set(sample, current)
    const pid = Number(row.Pid)
    const peak = perPid.get(pid) ?? { pid, type: processTypes.get(pid) ?? 'Electron/filho sem tipo classificado', processName: row.ProcessName, peakWorkingSetBytes: 0, peakPrivateBytes: 0 }
    peak.peakWorkingSetBytes = Math.max(peak.peakWorkingSetBytes, Number(row.WorkingSetBytes))
    peak.peakPrivateBytes = Math.max(peak.peakPrivateBytes, Number(row.PrivateBytes))
    perPid.set(pid, peak)
  }
  const samples = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([index, value]) => ({ index, ...value }))
  const working = samples.map((sample) => sample.workingSetBytes)
  const privateBytes = samples.map((sample) => sample.privateBytes)
  return {
    sampleCount: samples.length,
    processRows: rows.length,
    processTreeWorkingSetMiB: { p50: percentile(working, .50) / 1048576, p95: percentile(working, .95) / 1048576, p99: percentile(working, .99) / 1048576, peak: Math.max(...working) / 1048576 },
    processTreePrivateMiB: { p50: percentile(privateBytes, .50) / 1048576, p95: percentile(privateBytes, .95) / 1048576, p99: percentile(privateBytes, .99) / 1048576, peak: Math.max(...privateBytes) / 1048576 },
    peakProcessesPerSample: Math.max(...samples.map((sample) => sample.processCount)),
    perProcessPeaksMiB: [...perPid.values()].map((item) => ({ ...item, peakWorkingSetMiB: item.peakWorkingSetBytes / 1048576, peakPrivateMiB: item.peakPrivateBytes / 1048576 })),
    note: 'Working sets são somados por PID e podem duplicar páginas compartilhadas; Private Bytes mede compromisso privado. Sem estimativa de VRAM.',
  }
}
function parseTimeToFrame(text) {
  if (typeof text !== 'string') return null
  const parts = text.split(':').map(Number)
  if (parts.length === 3 && parts.every(Number.isFinite)) return (parts[0] * 60 + parts[1]) * 60 + parts[2]
  if (parts.length === 2 && parts.every(Number.isFinite)) return parts[0] * 60 * 60 + parts[1] * 60
  return null
}

async function main() {
  const root = process.cwd()
  const outRoot = path.join(root, 'app-data', 'stress-runs')
  fs.mkdirSync(outRoot, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const runDir = path.join(outRoot, `playback-${stamp}-${process.pid}`)
  fs.mkdirSync(runDir)
  activeRunDirectory = runDir
  const proxyRoot = path.join(root, 'app-data', 'cache', 'video-studio', 'preview-media')
  const proxyCacheBefore = folderBytes(proxyRoot)
  const pages = await (await fetch('http://127.0.0.1:9229/json/list')).json()
  const page = pages.find((entry) => entry.type === 'page' && entry.url.startsWith('http://localhost:5173/'))
  if (!page) throw new Error('A sessão offscreen do Native Gacha não está disponível.')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  activeWebSocket = ws
  const pending = new Map()
  let nextId = 0
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    const task = pending.get(message.id)
    if (!task) return
    pending.delete(message.id)
    if (message.error) task.reject(new Error(message.error.message))
    else task.resolve(message.result)
  })
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression, timeoutMs = 60000) => {
    let timer
    const response = await Promise.race([
      send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`CDP excedeu ${timeoutMs} ms.`)), timeoutMs) }),
    ]).finally(() => clearTimeout(timer))
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
    return response.result?.value
  }
  const clickTrusted = async (selector) => {
    const rect = await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw Error('Botão de reprodução ausente');const r=element.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x: rect.x, y: rect.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 })
    }
  }
  const waitUntil = async (expression, label, timeoutMs = 30000) => {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const value = await evaluate(expression)
      if (value) return value
      await delay(300)
    }
    throw new Error(`Tempo limite aguardando ${label}.`)
  }
  const pageForTimeline = `(()=>Boolean(document.querySelector('.video-studio-editor.video-workspace')&&document.querySelector('.video-timeline')))()`
  await evaluate(`location.hash='#/video-studio';true`)
  const editorAlreadyOpen = await evaluate(pageForTimeline)
  if (!editorAlreadyOpen) await waitUntil(`Boolean(document.querySelector('.video-studio-page'))`, 'biblioteca do Video Studio')
  const card = editorAlreadyOpen ? true : await waitUntil(`(()=>{const button=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')===${JSON.stringify(`Abrir ${projectTitle}`)});return button&&!button.disabled})()`, 'cartão do projeto persistido')
  if (card && !editorAlreadyOpen) {
    await evaluate(`(()=>[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')===${JSON.stringify(`Abrir ${projectTitle}`)})?.click())()`)
  }
  await waitUntil(pageForTimeline, 'editor do projeto STRESS')
  const documentCheck = await evaluate(`window.desktop.loadVideoStudio(${JSON.stringify(projectId)}).then(x=>({title:x?.title,frameRate:x?.videoTimeline?.frameRate,durationFrames:x?.videoTimeline?.durationFrames,characterKeys:x?.videoTimeline?.characterKeys?.length,playheadFrame:x?.videoTimeline?.playheadFrame}))`)
  if (documentCheck.title !== projectTitle || documentCheck.durationFrames !== frameCount || documentCheck.frameRate !== 60 || documentCheck.characterKeys !== 213) throw new Error(`Projeto mudou antes do playback: ${JSON.stringify(documentCheck)}`)
  const cycles = []
  const processTypes = new Map()

  for (const cycle of [{ name: 'cold-after-app-restart' }, { name: 'warm-same-process' }]) {
    activeCycleName = cycle.name
    activeLastState = null
    await evaluate(`(()=>{const input=document.querySelector('input[aria-label="Ir para segundo da timeline"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'0');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
    await waitUntil(`document.querySelector('input[aria-label="Ir para segundo da timeline"]')?.value==='0'`, 'seek para início')
    await delay(500)
    const memoryBefore = await evaluate('window.desktop.getVideoStudioMemoryReport()')
    for (const item of memoryBefore.electronProcesses) processTypes.set(item.pid, item.type)
    const csvPath = path.join(runDir, `${cycle.name}-memory.csv`)
    const probe = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'scripts', 'video-studio', 'windows-memory-probe.ps1'),
      '-RootPid', String(memoryBefore.mainPid), '-Samples', '300', '-IntervalSeconds', '6', '-CsvPath', csvPath, '-StopFile', `${csvPath}.stop`,
    ], { windowsHide: true, stdio: 'ignore' })
    activeProbe = probe
    activeProbeStopFile = `${csvPath}.stop`
    let probeExit = null
    const probeDone = new Promise((resolve) => probe.once('exit', (code) => { probeExit = code; resolve(code) }))
    activeProbeDone = probeDone
    await evaluate(`(()=>{window.__nativeGachaStressRaf={active:true,previous:null,times:[],start:null,end:null};const state=window.__nativeGachaStressRaf;const tick=(ts)=>{if(!state.active)return;if(state.previous!==null)state.times.push(ts);state.previous=ts;requestAnimationFrame(tick)};requestAnimationFrame(tick);if(!window.__nativeGachaStressPlayHooked){window.__nativeGachaStressPlayHooked=true;window.__nativeGachaMediaPlayCalls=[];window.__nativeGachaMediaPlayErrors=[];const original=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...args){const media=this;const attempt={at:performance.now(),src:media.currentSrc,readyState:media.readyState,networkState:media.networkState,currentTime:media.currentTime,muted:media.muted,volume:media.volume};window.__nativeGachaMediaPlayCalls.push(attempt);if(window.__nativeGachaMediaPlayCalls.length>500)window.__nativeGachaMediaPlayCalls.shift();let result;try{result=original.apply(this,args)}catch(error){window.__nativeGachaMediaPlayErrors.push({...attempt,name:error?.name??null,message:error?.message??String(error)});throw error}return result.catch(error=>{window.__nativeGachaMediaPlayErrors.push({...attempt,name:error?.name??null,message:error?.message??String(error)});throw error})}}return true})()`)
    const clickedAt = Date.now()
    const playStartedAt = await evaluate(`(()=>{const s=window.__nativeGachaStressRaf;s.start=performance.now();return s.start})()`)
    await clickTrusted('.video-timeline button.video-play-button')
    await delay(300)
    const initialButtonState = await evaluate(`(()=>{const b=document.querySelector('.video-timeline button.video-play-button');return{label:b?.getAttribute('aria-label'),busy:b?.getAttribute('aria-busy')==='true',disabled:b?.disabled}})()`)
    if (initialButtonState.label === 'Reproduzir' && !initialButtonState.busy && !initialButtonState.disabled) {
      await evaluate(`document.querySelector('.video-timeline button.video-play-button')?.click();true`)
    }
    await waitUntil(`(()=>{const button=document.querySelector('.video-timeline button.video-play-button');return button?.getAttribute('aria-label')==='Pausar reprodução'||button?.getAttribute('aria-busy')==='true'||Boolean(document.querySelector('[role=alert]'))})()`, `${cycle.name}: reprodução ou preparação iniciada`, 30000)
    if (await evaluate(`Boolean(document.querySelector('[role=alert]'))`)) throw new Error(`${cycle.name}: o editor apresentou um erro ao iniciar a reprodução.`)
    const elapsedStart = clickedAt
    const samples = []
    let previousMemorySampleAt = 0
    let maxVideoElements = 0
    let maxReadyVideoElements = 0
    let maxCharacterElements = 0
    let lastState = null
    let completed = false
    let preparingSince = null
    let totalPreparationMs = 0
    let longestPreparationMs = 0
    let lastFrameMovementAt = clickedAt
    let lastObservedFrame = null
    let previousSampleAt = Date.now()
    const phaseSamples = { playing: 0, preparing: 0, stopped: 0 }
    const timelineFrameIntervalsMs = []
    let playStartedWall = null
    while (Date.now() - elapsedStart <= 1800000) {
      await delay(1000)
      const state = await evaluate(`(()=>{const button=document.querySelector('.video-timeline button.video-play-button');const calls=window.__nativeGachaMediaPlayCalls??[];const playErrors=window.__nativeGachaMediaPlayErrors??[];return{time:document.querySelector('.video-timeline-heading strong')?.textContent??null,seconds:Number(document.querySelector('input[aria-label="Ir para segundo da timeline"]')?.value??0),button:button?.getAttribute('aria-label')??null,preparing:button?.getAttribute('aria-busy')==='true',characters:document.querySelectorAll('.video-studio-element-character').length,videos:[...document.querySelectorAll('video.video-studio-video-clip-preview')].map(v=>({readyState:v.readyState,error:v.error?.code??null,currentTime:v.currentTime,duration:v.duration,width:v.videoWidth,height:v.videoHeight,paused:v.paused,muted:v.muted,networkState:v.networkState})),visibleBubbles:document.querySelectorAll('.video-studio-element-speech,.video-studio-element-thought').length,errors:[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent.trim()).filter(Boolean),mediaPlayCallsCount:calls.length,mediaPlayCalls:calls.slice(-12),mediaPlayErrorsCount:playErrors.length,mediaPlayErrors:playErrors.slice(-10),transitionMetrics:(()=>{const d=document.querySelector('.video-studio-scene-canvas')?.dataset;return{rendered:Number(d?.transitionRendered??0),cacheHits:Number(d?.transitionCacheHits??0),renderMs:Number(d?.transitionRenderMs??0),discarded:Number(d?.transitionDiscarded??0),cacheBytes:Number(d?.transitionCacheBytes??0)}})()}})()`)
      activeLastState = state
      const currentFrame = parseTimeToFrame(state.time)
      const sampledAt = Date.now()
      const phase = state.preparing ? 'preparing' : state.button === 'Pausar reprodução' ? 'playing' : 'stopped'
      phaseSamples[phase]++
      if (phase === 'playing' && playStartedWall === null) playStartedWall = sampledAt
      if (phase === 'preparing') {
        if (preparingSince === null) preparingSince = sampledAt
        const preparationDuration = sampledAt - preparingSince
        if (preparationDuration > 300000) throw new Error(`${cycle.name}: a preparação das animações está parada há ${Math.round(preparationDuration / 1000)}s em ${state.time}.`)
      } else if (preparingSince !== null) {
        const preparationDuration = sampledAt - preparingSince
        totalPreparationMs += preparationDuration
        longestPreparationMs = Math.max(longestPreparationMs, preparationDuration)
        preparingSince = null
      }
      if (currentFrame !== null && currentFrame !== lastObservedFrame) {
        if (lastObservedFrame !== null) timelineFrameIntervalsMs.push({ frames: currentFrame - lastObservedFrame, elapsedMs: sampledAt - previousSampleAt, phase })
        lastObservedFrame = currentFrame
        lastFrameMovementAt = sampledAt
      } else if (phase === 'playing' && sampledAt - lastFrameMovementAt > 120000) {
        throw new Error(`${cycle.name}: o botão indica reprodução, mas o playhead não avançou há 120s em ${state.time}.`)
      }
      previousSampleAt = sampledAt
      samples.push({ atElapsedMs: sampledAt - elapsedStart, time: state.time, seconds: state.seconds, frame: currentFrame, phase, preparing: state.preparing, characters: state.characters, videos: state.videos.length, readyVideos: state.videos.filter((video) => video.readyState >= 2 && !video.error).length, visibleBubbles: state.visibleBubbles, errorCount: state.errors.length, transitionMetrics: state.transitionMetrics })
      lastState = state
      maxVideoElements = Math.max(maxVideoElements, state.videos.length)
      maxReadyVideoElements = Math.max(maxReadyVideoElements, state.videos.filter((video) => video.readyState >= 2 && !video.error).length)
      maxCharacterElements = Math.max(maxCharacterElements, state.characters)
      if (state.errors.length) throw new Error(`${cycle.name}: erro de preview ${JSON.stringify({ errors: state.errors, videos: state.videos, mediaPlayErrors: state.mediaPlayErrors, mediaPlayCalls: state.mediaPlayCalls.slice(-12), time: state.time, button: state.button, preparing: state.preparing })}`)
      if (state.videos.some((video) => video.error)) throw new Error(`${cycle.name}: decoder de vídeo falhou ${JSON.stringify(state.videos)}`)
      if (Date.now() - previousMemorySampleAt >= 15000) {
        previousMemorySampleAt = Date.now()
        const memory = await evaluate('window.desktop.getVideoStudioMemoryReport()')
        for (const item of memory.electronProcesses) processTypes.set(item.pid, item.type)
        console.log(JSON.stringify({ cycle: cycle.name, elapsedSeconds: Math.round((Date.now() - elapsedStart) / 1000), frame: currentFrame, time: state.time, characters: state.characters, videos: state.videos.length, workingSetMiB: Math.round(memory.reportedWorkingSetKiB / 1024), privateMiB: Math.round(memory.reportedPrivateBytesKiB / 1024) }))
      }
      if (!state.preparing && state.button !== 'Pausar reprodução' && currentFrame !== null && currentFrame >= frameCount) {
        completed = true
        break
      }
      if (!state.preparing && state.button === 'Reproduzir' && currentFrame !== null && currentFrame < frameCount) {
        throw new Error(`${cycle.name}: reprodução parou antes do fim em ${state.time} (${currentFrame}/${frameCount} frames).`)
      }
    }
    const wallElapsedMs = Date.now() - elapsedStart
    await evaluate(`(()=>{const s=window.__nativeGachaStressRaf;s.end=performance.now();s.active=false;return true})()`)
    const raf = await evaluate(`(()=>{const s=window.__nativeGachaStressRaf;const a=s.times.filter(t=>s.start!==null&&t>=s.start&&t<=s.end);const intervals=a.slice(1).map((t,i)=>t-a[i]);const sort=[...intervals].sort((x,y)=>x-y);const pct=p=>sort.length?sort[Math.min(sort.length-1,Math.max(0,Math.ceil(p*sort.length)-1))]:null;return{callbackCount:a.length,intervalCount:intervals.length,p50Ms:pct(.5),p95Ms:pct(.95),p99Ms:pct(.99),meanFps:intervals.length?1000/(intervals.reduce((n,x)=>n+x,0)/intervals.length):null,callbacksOver20ms:intervals.filter(x=>x>20).length,callbacksOver50ms:intervals.filter(x=>x>50).length,maxIntervalMs:intervals.length?Math.max(...intervals):null}})()`)
    if (!completed) throw new Error(`${cycle.name}: não alcançou o frame final em 1800s. Último estado ${JSON.stringify(lastState)}`)
    const endPerf = await evaluate('performance.now()')
    const memoryAfter = await evaluate('window.desktop.getVideoStudioMemoryReport()')
    for (const item of memoryAfter.electronProcesses) processTypes.set(item.pid, item.type)
    fs.writeFileSync(activeProbeStopFile, 'finish', { flag: 'wx' })
    const probeCode = await Promise.race([probeDone, delay(30000).then(() => 'timeout')])
    if (probeCode === 'timeout') { probe.kill(); throw new Error(`A sonda de memória não encerrou: ${cycle.name}`) }
    activeProbe = null
    activeProbeStopFile = null
    activeProbeDone = null
    if (probeCode !== 0 || !fs.existsSync(csvPath)) throw new Error(`A sonda de memória terminou com código ${probeCode}: ${cycle.name}`)
    const memoryProbe = parseProbe(csvPath, processTypes)
    if (preparingSince !== null) {
      const preparationDuration = Date.now() - preparingSince
      totalPreparationMs += preparationDuration
      longestPreparationMs = Math.max(longestPreparationMs, preparationDuration)
    }
    const frameAdvance = timelineFrameIntervalsMs.map((sample) => sample.frames * 1000 / sample.elapsedMs)
    const cycleReport = {
      name: cycle.name,
      coldWarmDefinition: cycle.name === 'cold-after-app-restart' ? 'renderer/GPU caches were empty after a full hidden-app restart; disk video proxies were already warm' : 'same renderer process replay after the first complete pass',
      completed, totalFrames: frameCount, finalFrame: parseTimeToFrame(lastState.time),
      wallSeconds: wallElapsedMs / 1000, clickToPlaybackStartSeconds: playStartedWall === null ? null : (playStartedWall - clickedAt) / 1000, totalCycleSecondsIncludingPreparation: (Date.now() - clickedAt) / 1000,
      playbackStartPerformanceMs: playStartedAt, playbackEndPerformanceMs: endPerf,
      timelineRaf: raf, oneSecondSamples: samples,
      playbackPhases: { sampleCounts: phaseSamples, preparationCount: samples.filter((sample) => sample.preparing && !samples[samples.indexOf(sample) - 1]?.preparing).length, totalPreparationSeconds: totalPreparationMs / 1000, longestPreparationSeconds: longestPreparationMs / 1000, timelineAdvanceFramesPerSecond: { p50: percentile(frameAdvance, .5), p95: percentile(frameAdvance, .95), p99: percentile(frameAdvance, .99), samples: frameAdvance.length } },
      maxCharactersVisible: maxCharacterElements, maxVideoDecodersActive: maxVideoElements, maxReadyVideoDecoders: maxReadyVideoElements,
      memoryElectronStart: memoryBefore, memoryElectronEnd: memoryAfter, windowsProcessProbe: memoryProbe,
      memoryProbeCsv: path.basename(csvPath),
    }
    cycles.push(cycleReport)
    fs.writeFileSync(path.join(runDir, `${cycle.name}.json`), JSON.stringify(cycleReport, null, 2), { flag: 'wx' })
    console.log(JSON.stringify({ cycle: cycle.name, finished: true, wallSeconds: cycleReport.wallSeconds, rAF: cycleReport.timelineRaf, memory: memoryProbe.processTreeWorkingSetMiB }))
  }

  await evaluate(`(()=>{const input=document.querySelector('input[aria-label="Ir para segundo da timeline"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'0');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
  await waitUntil(`document.querySelector('input[aria-label="Ir para segundo da timeline"]')?.value==='0'`, 'retorno do playhead para 0s')
  await delay(300)
  await evaluate(`document.querySelector('button[aria-label^="Salvar"]')?.click();true`)
  await waitUntil(`window.desktop.loadVideoStudio(${JSON.stringify(projectId)}).then(x=>x?.videoTimeline?.playheadFrame===0)`, 'salvamento do playhead em 0s', 30000)
  const finalProject = await evaluate(`window.desktop.loadVideoStudio(${JSON.stringify(projectId)}).then(x=>({title:x?.title,durationFrames:x?.videoTimeline?.durationFrames,frameRate:x?.videoTimeline?.frameRate,playheadFrame:x?.videoTimeline?.playheadFrame,characterKeys:x?.videoTimeline?.characterKeys?.length}))`)
  const proxyCacheAfter = folderBytes(proxyRoot)
  const report = { createdAt: new Date().toISOString(), offscreen: true, projectId, runDirectory: runDir, projectBefore: documentCheck, finalProject, previewProxyCache: { before: proxyCacheBefore, after: proxyCacheAfter }, cycles }
  fs.writeFileSync(path.join(runDir, 'playback-report.json'), JSON.stringify(report, null, 2), { flag: 'wx' })
  console.log(JSON.stringify({ success: true, runDirectory: runDir, cycles: cycles.map(({ name, completed, finalFrame, wallSeconds, timelineRaf, windowsProcessProbe }) => ({ name, completed, finalFrame, wallSeconds, timelineRaf, processTreeWorkingSetMiB: windowsProcessProbe.processTreeWorkingSetMiB })), finalProject, previewProxyCache: report.previewProxyCache }, null, 2))
  ws.close()
  activeWebSocket = null
}

main().catch(async (error) => {
  if (activeRunDirectory) {
    try { fs.writeFileSync(path.join(activeRunDirectory, 'playback-abort.json'), JSON.stringify({ createdAt: new Date().toISOString(), cycle: activeCycleName, error: error?.message ?? String(error), lastState: activeLastState }, null, 2), { flag: 'wx' }) } catch {}
  }
  try { if (activeProbeStopFile && !fs.existsSync(activeProbeStopFile)) fs.writeFileSync(activeProbeStopFile, 'abort', { flag: 'wx' }) } catch {}
  if (activeProbeDone) await Promise.race([activeProbeDone, delay(10000)])
  try { if (activeProbe && activeProbe.exitCode === null) activeProbe.kill() } catch {}
  try { activeWebSocket?.close() } catch {}
  console.error(error?.stack ?? error)
  process.exitCode = 1
})
