async function main() {
  const pages = await (await fetch('http://127.0.0.1:9229/json/list')).json()
  const page = pages.find((entry) => entry.type === 'page' && entry.url.startsWith('http://localhost:5173/'))
  if (!page) throw new Error('A sessão offscreen do Native Gacha não está disponível.')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
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
    const next = ++id
    pending.set(next, { resolve, reject })
    ws.send(JSON.stringify({ id: next, method, params }))
  })
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
    return response.result?.value
  }
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  try {
    await evaluate(`(()=>{window.__nativeGachaOffscreenRaf={active:true,count:0};const s=window.__nativeGachaOffscreenRaf;const tick=()=>{if(!s.active)return;s.count++;requestAnimationFrame(tick)};requestAnimationFrame(tick);return{screenX,screenY,outerWidth,outerHeight}})()`)
    await sleep(3000)
    const offscreen = await evaluate(`(()=>{const s=window.__nativeGachaOffscreenRaf;s.active=false;return{screenX,screenY,outerWidth,outerHeight,rafCallbacks:s.count}})()`)
    const samples = []
    for (let i = 0; i < 18; i++) {
      const sample = await evaluate(`(()=>{const button=document.querySelector('.video-timeline button.video-play-button');const r=button?.getBoundingClientRect();return{time:document.querySelector('.video-timeline-heading strong')?.textContent??null,button:button?.getAttribute('aria-label')??null,buttonText:button?.innerText??null,buttonRect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,busy:button?.getAttribute('aria-busy')==='true',visibility:document.visibilityState,rafCount:window.__nativeGachaStressRaf?.times?.length??null,rafActive:window.__nativeGachaStressRaf?.active??null,videos:[...document.querySelectorAll('video')].map(v=>({paused:v.paused,currentTime:v.currentTime,readyState:v.readyState,error:v.error?.code??null})),alerts:[...document.querySelectorAll('[role=alert]')].map(x=>x.textContent.trim()).filter(Boolean),playErrors:window.__nativeGachaMediaPlayErrors??[]}})()`)
      samples.push({ at: new Date().toISOString(), ...sample })
      if (!sample.busy && sample.button !== 'Cancelar preparação das animações') break
      await sleep(5000)
    }
    console.log(JSON.stringify({ offscreen, samples }, null, 2))
  } finally { ws.close() }
}
main().catch((error) => { console.error(error?.stack ?? error); process.exitCode = 1 })
