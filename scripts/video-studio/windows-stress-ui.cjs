const fs = require('node:fs')
const path = require('node:path')

const title = 'STRESS TEST — 4 GACHA — 180 SEGUNDOS'
const projectId = '1c9b7ef5-e020-40bd-bfb5-b56b6fac5241'

async function main() {
  const pages = await (await fetch('http://127.0.0.1:9229/json/list')).json()
  const page = pages.find((entry) => entry.type === 'page' && entry.url.startsWith('http://localhost:5173/'))
  if (!page) throw new Error('A sessão offscreen do Native Gacha não está disponível.')
  const outRoot = path.join(process.cwd(), 'app-data', 'stress-runs')
  fs.mkdirSync(outRoot, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const runDir = path.join(outRoot, `ui-${stamp}-${process.pid}`)
  fs.mkdirSync(runDir)
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  const pending = new Map()
  let nextId = 0
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!pending.has(message.id)) return
    const task = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) task.reject(new Error(message.error.message))
    else task.resolve(message.result)
  })
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression, timeoutMs = 60000) => {
    let timeoutId
    const timeout = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error(`CDP evaluate excedeu ${timeoutMs} ms.`)), timeoutMs) })
    const request = send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
    const response = await Promise.race([request, timeout]).finally(() => clearTimeout(timeoutId))
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
    return response.result?.value
  }
  const waitUntil = async (expression, description, timeoutMs = 30000) => {
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      const value = await evaluate(expression)
      if (value) return value
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    throw new Error(`Tempo limite aguardando: ${description}.`)
  }
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const screenshot = async (filename) => {
    const capture = await evaluate('window.desktop.captureVideoStressPage()', 30000)
    if (!capture?.pngBase64 || capture.width < 1 || capture.height < 1) throw new Error(`Captura offscreen inválida: ${JSON.stringify(capture)}`)
    fs.writeFileSync(path.join(runDir, filename), Buffer.from(capture.pngBase64, 'base64'), { flag: 'wx' })
    return { bytes: fs.statSync(path.join(runDir, filename)).size, width: capture.width, height: capture.height }
  }

  try {
    await send('Runtime.enable')
    await send('Page.enable')
    await evaluate(`location.hash = '#/customizar'; true`)
    await sleep(500)
    await evaluate(`location.hash = '#/video-studio'; true`)
    await waitUntil(`Boolean(document.querySelector('.video-studio-page'))`, 'biblioteca do Video Studio')
    const libraryCard = await waitUntil(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')===${JSON.stringify(`Abrir ${title}`)});return b?{label:b.getAttribute('aria-label'),disabled:b.disabled}:null})()`, 'cartão do projeto na biblioteca')
    if (!libraryCard || libraryCard.disabled) throw new Error(`Projeto ausente ou indisponível na biblioteca: ${JSON.stringify(libraryCard)}`)
    const libraryScreenshot = await screenshot('video-studio-library.png')
    await evaluate(`(()=>[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')===${JSON.stringify(`Abrir ${title}`)})?.click())()`)
    await waitUntil(`Boolean(document.querySelector('.video-studio-editor.video-workspace')&&document.querySelector('.video-timeline'))`, 'editor e timeline carregados')
    const editor = await evaluate(`(()=>({label:document.querySelector('.video-studio-editor')?.getAttribute('aria-label'),title:document.querySelector('.video-preview-header span')?.textContent??${JSON.stringify(title)},canvas:document.querySelector('.video-studio-scene-canvas')?.getBoundingClientRect().toJSON(),characters:document.querySelectorAll('.video-studio-element-character').length,characterImages:[...document.querySelectorAll('.video-studio-element-character img')].map(x=>({alt:x.alt,loaded:x.complete&&x.naturalWidth>0,width:x.naturalWidth,height:x.naturalHeight})),videoElements:document.querySelectorAll('video.video-studio-clip-preview').length,events:document.querySelector('.video-timeline-heading small')?.textContent,errors:[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent.trim()).filter(Boolean)}))()`)
    if (editor.characters !== 4 || editor.characterImages.length !== 4 || editor.characterImages.some((image) => !image.loaded)) throw new Error(`A prévia real não desenhou todos os personagens: ${JSON.stringify(editor)}`)

    const seekSequence = []
    for (const second of [5, 45, 90, 135, 179, 10]) {
      const state = await evaluate(`(()=>{const input=document.querySelector('input[aria-label="Ir para segundo da timeline"]');if(!input)throw Error('Controle de seek ausente');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,${second});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
      if (!state) throw new Error(`Não foi possível posicionar em ${second}s.`)
      await sleep(250)
      const measured = await evaluate(`(()=>({input:document.querySelector('input[aria-label="Ir para segundo da timeline"]')?.value,time:document.querySelector('.video-timeline-heading strong')?.textContent,characters:document.querySelectorAll('.video-studio-element-character').length,videos:document.querySelectorAll('video.video-studio-video-clip-preview').length,errors:[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent.trim()).filter(Boolean)}))()`)
      seekSequence.push({ requestedSeconds: second, ...measured })
      if (Number(measured.input) !== second) throw new Error(`Seek ${second}s terminou em ${JSON.stringify(measured)}.`)
    }

    const representativeFrames = []
    for (const second of [5, 25, 48, 72, 90, 115, 140, 165, 179]) {
      await evaluate(`(()=>{const input=document.querySelector('input[aria-label="Ir para segundo da timeline"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,${second});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
      await sleep(second === 48 ? 1800 : 350)
      const measured = await evaluate(`(()=>({input:document.querySelector('input[aria-label="Ir para segundo da timeline"]')?.value,time:document.querySelector('.video-timeline-heading strong')?.textContent,characters:document.querySelectorAll('.video-studio-element-character').length,characterImages:[...document.querySelectorAll('.video-studio-element-character img')].map(x=>({alt:x.alt,loaded:x.complete&&x.naturalWidth>0})),videos:[...document.querySelectorAll('video.video-studio-video-clip-preview')].map(x=>({readyState:x.readyState,error:x.error?.code??null,paused:x.paused,videoWidth:x.videoWidth,videoHeight:x.videoHeight,src:x.currentSrc})),visibleBubbles:document.querySelectorAll('.video-studio-element-speech,.video-studio-element-thought').length,errors:[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent.trim()).filter(Boolean)}))()`)
      const filename = `preview-${String(second).padStart(3, '0')}s.png`
      const capture = await screenshot(filename)
      representativeFrames.push({ requestedSeconds: second, ...measured, screenshot: filename, ...capture })
    }

    const zoomControl = 'input[aria-label="Zoom horizontal da timeline"]'
    const zoomBefore = await evaluate(`document.querySelector(${JSON.stringify(zoomControl)})?.value ?? null`)
    if (zoomBefore === null) throw new Error('Controle de zoom da timeline ausente.')
    const zoomTestValue = Math.min(120, Number(zoomBefore) + 3)
    await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(zoomControl)});const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,${zoomTestValue});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
    await sleep(250)
    const zoomChanged = await evaluate(`document.querySelector(${JSON.stringify(zoomControl)})?.value ?? null`)
    await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(zoomControl)});const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,${Number(zoomBefore)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
    await sleep(250)

    const transitionBefore = await evaluate(`document.querySelector('.video-transition-toggle')?.getAttribute('aria-pressed') ?? null`)
    await evaluate(`document.querySelector('.video-transition-toggle')?.click()`)
    await waitUntil(`document.querySelector('.video-transition-toggle')?.getAttribute('aria-pressed')!==${JSON.stringify(transitionBefore)}`, 'alteração temporária de transições')
    const transitionAfterEdit = await evaluate(`document.querySelector('.video-transition-toggle')?.getAttribute('aria-pressed') ?? null`)
    const undoButton = `document.querySelector('.video-timeline button[aria-label="Desfazer"]')`
    const redoButton = `document.querySelector('.video-timeline button[aria-label="Refazer"]')`
    const canUndo = await evaluate(`${undoButton} ? !${undoButton}.disabled : false`)
    if (!canUndo) throw new Error('O editor não habilitou Undo após a edição temporária.')
    await evaluate(`${undoButton}?.click()`)
    await waitUntil(`document.querySelector('.video-transition-toggle')?.getAttribute('aria-pressed')===${JSON.stringify(transitionBefore)}`, 'undo de animações')
    await evaluate(`${redoButton}?.click()`)
    await waitUntil(`document.querySelector('.video-transition-toggle')?.getAttribute('aria-pressed')===${JSON.stringify(transitionAfterEdit)}`, 'redo de animações')
    await evaluate(`${undoButton}?.click()`)
    await waitUntil(`document.querySelector('.video-transition-toggle')?.getAttribute('aria-pressed')===${JSON.stringify(transitionBefore)}`, 'restauração do estado original das animações')

    await evaluate(`(()=>{const input=document.querySelector('input[aria-label="Ir para segundo da timeline"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'0');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
    await sleep(300)
    await evaluate(`document.querySelector('button[aria-label^="Salvar"]')?.click();true`)
    await waitUntil(`window.desktop.loadVideoStudio(${JSON.stringify(projectId)}).then(x=>x?.videoTimeline?.playheadFrame===0)`, 'salvamento do playhead em zero', 30000)
    const persisted = await evaluate(`window.desktop.loadVideoStudio(${JSON.stringify(projectId)}).then(x=>({title:x?.title,durationFrames:x?.videoTimeline?.durationFrames,frameRate:x?.videoTimeline?.frameRate,keyCount:x?.videoTimeline?.characterKeys?.length,textClipCount:x?.videoTimeline?.textClips?.length,videoClipCount:x?.videoTimeline?.videoClips?.length,animateCharacterTransitions:x?.videoTimeline?.animateCharacterTransitions,timelineZoom:x?.videoTimeline?.timelineZoom,playheadFrame:x?.videoTimeline?.playheadFrame}))`)
    if (persisted?.durationFrames !== 10800 || persisted?.keyCount !== 213 || persisted?.animateCharacterTransitions !== true || persisted?.playheadFrame !== 0) throw new Error(`O estado voltou diferente após Undo/Redo e salvar: ${JSON.stringify(persisted)}`)
    const memory = await evaluate('window.desktop.getVideoStudioMemoryReport()')
    const summary = {
      createdAt: new Date().toISOString(), offscreen: true, rendererUrl: await evaluate('location.href'), projectId, runDirectory: runDir,
      library: { button: libraryCard, screenshot: 'video-studio-library.png', ...libraryScreenshot },
      editor, seekSequence, representativeFrames,
      zoom: { before: zoomBefore, changed: zoomChanged, restored: Number(zoomBefore) },
      undoRedo: { transitionBefore, transitionAfterEdit, restoredToOriginal: transitionBefore === 'true' && transitionAfterEdit === 'false' },
      persisted, memory,
    }
    fs.writeFileSync(path.join(runDir, 'ui-report.json'), JSON.stringify(summary, null, 2), { flag: 'wx' })
    console.log(JSON.stringify(summary, null, 2))
  } finally {
    ws.close()
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error)
  process.exitCode = 1
})
