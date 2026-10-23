'use strict'
/**
 * Real Electron + Chromium smoke for the rebuilt Video Studio UI, Windows only.
 * All writes go to a newly generated authenticated synthetic profile under out/dev-ai/runs.
 * No user or project data is read, replaced or deleted.
 */
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const net=require('node:net')
const {spawn}=require('node:child_process')
const {randomUUID}=require('node:crypto')

if(process.platform!=='win32')throw Error('Este smoke é Windows-only.')
const root=path.resolve(__dirname,'../..')
const main=path.join(root,'out','main','main.js')
if(!fs.existsSync(main))throw Error('Execute npm run build antes do smoke.')
const runId=randomUUID()
const runRoot=path.join(root,'out','dev-ai','runs',runId)
const sandbox=path.join(runRoot,'sandbox')
fs.mkdirSync(sandbox,{recursive:true})
fs.writeFileSync(path.join(runRoot,'.dev-ai-sandbox.json'),
  JSON.stringify({schemaVersion:1,runId,syntheticOnly:true},null,2))
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const port=()=>new Promise((resolve,reject)=>{
  const server=net.createServer()
  server.once('error',reject)
  server.listen(0,'127.0.0.1',()=>{
    const chosen=server.address().port
    server.close(()=>resolve(chosen))
  })
})
async function run(){
  const debugPort=await port()
  const electron=require('electron')
  const env={...process.env,GACHA_DEV_AI_TEST:'1',GACHA_DEV_AI_SANDBOX:sandbox,
    GACHA_VIDEO_STRESS_OFFSCREEN:'1',GACHA_VIDEO_STRESS_DEBUG_PORT:String(debugPort)}
  const child=spawn(electron,[main],{cwd:root,env,stdio:'pipe'})
  let log='',ws=null
  const append=(value)=>{log+=String(value).slice(-4000);if(log.length>32000)log=log.slice(-32000)}
  child.stdout.on('data',append);child.stderr.on('data',append)
  const requestIds=new Map()
  let id=0
  try {
    let page=null
    for(let n=0;n<120;n++){
      if(child.exitCode!==null)throw Error('Electron encerrou antes de iniciar: '+log.slice(-3000))
      try{
        const response=await fetch('http://127.0.0.1:'+debugPort+'/json/list')
        const pages=await response.json()
        page=pages.find(x=>x.type==='page'&&/index\.html/.test(x.url))
        if(page)break
      }catch{}
      await delay(250)
    }
    if(!page)throw Error('CDP da nova UI não inicializou.')
    ws=new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})})
    ws.addEventListener('message',event=>{
      const message=JSON.parse(event.data)
      const entry=requestIds.get(message.id)
      if(!entry)return
      requestIds.delete(message.id)
      if(message.error)entry.reject(Error(message.error.message))
      else entry.resolve(message.result)
    })
    const send=(method,params={})=>new Promise((resolve,reject)=>{
      const requestId=++id
      requestIds.set(requestId,{resolve,reject})
      ws.send(JSON.stringify({id:requestId,method,params}))
    })
    const evaluate=async expression=>{
      const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})
      if(result.exceptionDetails)throw Error(result.exceptionDetails.text)
      return result.result?.value
    }
    const until=async (expr,description,maxMs=8000)=>{
      const start=Date.now()
      while(Date.now()-start<maxMs){
        const value=await evaluate(expr)
        if(value)return value
        await delay(120)
      }
      throw Error('Timeout esperando '+description)
    }
    await send('Runtime.enable')
    await evaluate("location.hash='#/video-studio';true")
    await until("Boolean(document.querySelector('.video-rebuild-library'))",'nova biblioteca')
    await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Novo projeto'));if(!b)throw Error('Novo projeto ausente');b.click();return true})()")
    await until("Boolean(document.querySelector('.video-rebuild-stage canvas'))",'novo palco GPU')
    const context=await evaluate("Boolean(document.querySelector('.video-rebuild-stage canvas')?.getContext('webgl2'))")
    if(!context)throw Error('WebGL2 indisponível neste runner Windows.')
    const ready=await until("Boolean(document.querySelector('.video-rebuild-transport button'))",'transporte novo')
    assert.equal(ready,true)
    await evaluate("(()=>{const b=[...document.querySelectorAll('.video-rebuild-transport button')].find(x=>x.textContent==='Reproduzir');b.click();return true})()")
    await delay(700)
    const progress=await evaluate("(()=>({value:Number(document.querySelector('input[aria-label=\"Frame absoluto\"]')?.value),error:document.querySelector('.video-rebuild footer')?.textContent}))()")
    if(progress.value<20)throw Error('Novo preview não avançou durante Play: '+JSON.stringify(progress))
    await evaluate("(()=>{const b=[...document.querySelectorAll('.video-rebuild-transport button')].find(x=>x.textContent==='Pausar');b?.click();return true})()")
    await evaluate("(()=>{const e=document.querySelector('input[aria-label=\"Frame absoluto\"]');const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,'2700');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()")
    await until("Number(document.querySelector('input[aria-label=\"Frame absoluto\"]')?.value)===2700",'seek absoluto')
    await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Salvar cópia'));b.click();return true})()")
    const saved=await until("window.desktop.listVideoStudios().then(xs=>xs.length>0)",'cópia no serviço de persistência')
    assert.equal(saved,true)
    const result={ok:true,renderBackend:'webgl2',playedFrame:progress.value,seekFrame:2700,
      persisted:true,projectIsolation:'synthetic',runId}
    fs.writeFileSync(path.join(runRoot,'rebuild-smoke.json'),JSON.stringify(result,null,2))
    console.log(JSON.stringify(result))
  }finally{
    try{ws?.close()}catch{}
    for(const pending of requestIds.values())pending.reject(Error('CDP encerrado.'))
    fs.writeFileSync(path.join(runRoot,'electron-log-tail.txt'),log.slice(-8000))
    try{child.kill()}catch{}
    // Tear down ONLY the synthetic process tree started by this smoke.
    await new Promise(resolve=>{
      const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'})
      killer.on('close',resolve);killer.on('error',resolve)
    })
  }
}
const watchdog=setTimeout(()=>{
  console.error('Smoke da nova UI excedeu 45 segundos; encerrando runner isolado.')
  process.exit(1)
},45000)
void run().catch(error=>{console.error(error.stack||String(error));process.exitCode=1})
  .finally(()=>clearTimeout(watchdog))
