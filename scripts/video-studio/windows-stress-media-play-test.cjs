const fs = require('node:fs')
const path = require('node:path')

const projectTitle = 'STRESS TEST — 4 GACHA — 180 SEGUNDOS'

async function main() {
  const pages = await (await fetch('http://127.0.0.1:9229/json/list')).json()
  const page = pages.find((entry) => entry.type === 'page' && entry.url.startsWith('http://localhost:5173/'))
  if (!page) throw new Error('A sessão offscreen do Native Gacha não está disponível.')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
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
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
    return response.result?.value
  }
  const click = async (selector) => {
    const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Elemento ausente');const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, button: 'none' })
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  }
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  try {
    await evaluate(`location.hash='#/video-studio';true`)
    await pause(500)
    const hasEditor = await evaluate(`Boolean(document.querySelector('.video-studio-editor.video-workspace'))`)
    if (!hasEditor) {
      const opened = await evaluate(`(()=>[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')===${JSON.stringify(`Abrir ${projectTitle}`)})?.click())()`)
      if (!opened) throw new Error('Não foi possível abrir o projeto de estresse.')
      await pause(1000)
    }
    const install = await evaluate(`(()=>{window.__nativeGachaMediaPlayErrors=[];const original=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(...args){const media=this;let result;try{result=original.apply(this,args)}catch(error){window.__nativeGachaMediaPlayErrors.push({name:error?.name??null,message:error?.message??String(error),src:media.currentSrc,readyState:media.readyState});throw error}return result.catch(error=>{window.__nativeGachaMediaPlayErrors.push({name:error?.name??null,message:error?.message??String(error),src:media.currentSrc,readyState:media.readyState,networkState:media.networkState,paused:media.paused});throw error})};return{installed:true,visibility:document.visibilityState}})()`)
    const inputSelector = 'input[aria-label="Ir para segundo da timeline"]'
    await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(inputSelector)});const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'48');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));return true})()`)
    await pause(1400)
    const before = await evaluate(`(()=>({time:document.querySelector('.video-timeline-heading strong')?.textContent,button:document.querySelector('.video-timeline button.video-play-button')?.getAttribute('aria-label'),media:[...document.querySelectorAll('video')].map(v=>({readyState:v.readyState,currentTime:v.currentTime,duration:v.duration,width:v.videoWidth,height:v.videoHeight,error:v.error?.code??null,paused:v.paused,muted:v.muted,src:v.currentSrc}))}))()`)
    await click('.video-timeline button.video-play-button')
    await pause(5000)
    const after = await evaluate(`(()=>({time:document.querySelector('.video-timeline-heading strong')?.textContent,button:document.querySelector('.video-timeline button.video-play-button')?.getAttribute('aria-label'),busy:document.querySelector('.video-timeline button.video-play-button')?.getAttribute('aria-busy'),userActivationActive:navigator.userActivation?.isActive??null,media:[...document.querySelectorAll('video')].map(v=>({readyState:v.readyState,currentTime:v.currentTime,duration:v.duration,width:v.videoWidth,height:v.videoHeight,error:v.error?.code??null,paused:v.paused,muted:v.muted,src:v.currentSrc})),playErrors:window.__nativeGachaMediaPlayErrors,alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent.trim()).filter(Boolean)}))()`)
    if (after.button === 'Pausar reprodução') await click('.video-timeline button.video-play-button')
    const runRoot = path.join(process.cwd(), 'app-data', 'stress-runs')
    fs.mkdirSync(runRoot, { recursive: true })
    const runDir = path.join(runRoot, `media-play-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`)
    fs.mkdirSync(runDir)
    const report = { createdAt: new Date().toISOString(), offscreen: true, trustedCdpMouseInput: true, install, before, after }
    fs.writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' })
    console.log(JSON.stringify({ success: after.button === 'Pausar reprodução' && after.playErrors.length === 0 && after.alerts.length === 0, runDir, report }, null, 2))
  } finally {
    ws.close()
  }
}

main().catch((error) => { console.error(error?.stack ?? error); process.exitCode = 1 })
