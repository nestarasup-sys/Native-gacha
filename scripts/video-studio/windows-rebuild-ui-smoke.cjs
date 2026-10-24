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
    // The save command is asynchronous. A library read during the asset
    // transaction can encounter its temporary manifest; wait for IPC success.
    await until("Boolean(document.querySelector('.video-rebuild footer')?.textContent?.includes('Cópia gravada'))",'confirmação da gravação')
    const saved=await until("window.desktop.listVideoStudios().then(xs=>xs.length>0).catch(()=>false)",'cópia no serviço de persistência')
    assert.equal(saved,true)
    // Real Chromium pixel oracle: an asymmetric Gacha PNG has a RED top and
    // BLUE bottom. A vertical UV inversion is visible only to a pixel oracle,
    // not to a shader-source/unit test or an empty-project Play smoke.
    const sampleId='gpu-orientation-'+runId
    await evaluate(`(async()=>{
      const stamp=new Date().toISOString()
      const image=document.createElement('canvas');image.width=32;image.height=32
      const g=image.getContext('2d')
      g.fillStyle='#ff0000';g.fillRect(0,0,32,16)
      g.fillStyle='#0000ff';g.fillRect(0,16,32,16)
      const actor={id:'upright-actor',kind:'character',text:'',x:0,y:0,width:100,height:100,
        rotation:0,zIndex:0,flipX:false}
      const studio={schemaVersion:1,id:'${sampleId}',title:'ORIENTATION SYNTHETIC ${runId}',
        color:'#526ea9',createdAt:stamp,updatedAt:stamp,backgroundColor:'#000000',
        backgroundAssetId:null,backgroundX:0,backgroundY:0,backgroundWidth:100,
        backgroundHeight:100,backgroundRotation:0,assets:[],elements:[actor],
        videoTimeline:{schemaVersion:1,frameRate:60,durationFrames:120,playheadFrame:0,
          playing:false,characterKeys:[],textClips:[],saveMarkers:[],
          characterBases:{[actor.id]:{element:actor,imageDataUrl:image.toDataURL('image/png')}}}}
      await window.desktop.saveVideoStudio(studio)
      return true
    })()`)
    await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='Biblioteca');if(!b)throw Error('Biblioteca ausente');b.click();return true})()")
    await until("Boolean([...document.querySelectorAll('.video-rebuild-cards button')].find(x=>x.textContent.includes('ORIENTATION SYNTHETIC')))",'cópia sintética orientada')
    await evaluate("(()=>{const b=[...document.querySelectorAll('.video-rebuild-cards button')].find(x=>x.textContent.includes('ORIENTATION SYNTHETIC'));b.click();return true})()")
    await until("Boolean(document.querySelector('.video-rebuild-stage canvas'))",'palco sintético')
    await until("Number(document.querySelector('.video-rebuild-stage-row aside')?.textContent?.match(/Quadros apresentados: (\\d+)/)?.[1])>0",'frame de imagem assimétrica')
    await delay(250)
    const bounds=await evaluate("(()=>{const r=document.querySelector('.video-rebuild-stage canvas').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,dpr:devicePixelRatio}})()")
    const capture=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
    const sharp=require('sharp')
    const shot=sharp(Buffer.from(capture.data,'base64'))
    const {data:raw,info}=await shot.ensureAlpha().raw().toBuffer({resolveWithObject:true})
    const pixel=(fx,fy)=>{
      const x=Math.floor((bounds.x+bounds.width*fx)*bounds.dpr),y=Math.floor((bounds.y+bounds.height*fy)*bounds.dpr)
      if(x<0||y<0||x>=info.width||y>=info.height)throw Error('Palco fora da captura '+JSON.stringify({x,y,bounds,info}))
      return [...raw.subarray((y*info.width+x)*4,(y*info.width+x)*4+3)]
    }
    const upper=pixel(.5,.25),lower=pixel(.5,.75)
    if(!(upper[0]>180&&upper[2]<100&&lower[2]>180&&lower[0]<100))
      throw Error('Regressão GPU: personagem invertido ou ausente '+JSON.stringify({upper,lower,bounds}))
    // Short, progressive Windows gate: four different saved actors and two
    // authored image keyframes each. This is *synthetic* compositor load, not
    // real catalog/PT fidelity, and must not be called a 180s stress result.
    const fourId='gpu-4-actors-'+runId
    await evaluate(`(async()=>{
      const stamp=new Date().toISOString()
      const paints=['#e4574a','#50bbd6','#f7bd4b','#a47be4']
      const makeArt=(color,alternate)=>{
        const c=document.createElement('canvas');c.width=48;c.height=48
        const context=c.getContext('2d')
        context.fillStyle=alternate?'#ffffff':color
        context.fillRect(0,0,48,24)
        context.fillStyle=color
        context.fillRect(0,24,48,24)
        return c.toDataURL('image/png')
      }
      const elements=paints.map((color,i)=>({
        id:'actor-'+i,kind:'character',text:'',speakerName:'Synthetic '+i,
        x:-33+i*22,y:0,width:18,height:62,rotation:0,zIndex:i,flipX:false
      }))
      const bases=Object.fromEntries(elements.map((element,i)=>[
        element.id,{element,imageDataUrl:makeArt(paints[i],false)}
      ]))
      const keys=elements.flatMap((element,i)=>[120,240].map((frame,j)=>({
        id:'key-'+i+'-'+frame,elementId:element.id,frame,
        poseSlot:null,expressionCollectionId:null,expressionPresetId:null,faceMode:'idle',
        state:{element:{...element,rotation:j===0?8:0},
          imageDataUrl:makeArt(paints[i],j===0)}
      })))
      const studio={schemaVersion:1,id:'${fourId}',title:'FOUR ACTORS SYNTHETIC ${runId}',
        color:'#526ea9',createdAt:stamp,updatedAt:stamp,backgroundColor:'#101725',
        backgroundAssetId:null,backgroundX:0,backgroundY:0,backgroundWidth:100,
        backgroundHeight:100,backgroundRotation:0,assets:[],elements,
        videoTimeline:{schemaVersion:1,frameRate:60,durationFrames:300,playheadFrame:0,
          playing:false,characterKeys:keys,textClips:[],saveMarkers:[],characterBases:bases}}
      await window.desktop.saveVideoStudio(studio)
      return true
    })()`)
    await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent==='Biblioteca');if(!b)throw Error('Biblioteca ausente');b.click();return true})()")
    await until("Boolean([...document.querySelectorAll('.video-rebuild-cards button')].find(x=>x.textContent.includes('FOUR ACTORS SYNTHETIC')))",'quatro personagens sintéticos')
    await evaluate("(()=>{const b=[...document.querySelectorAll('.video-rebuild-cards button')].find(x=>x.textContent.includes('FOUR ACTORS SYNTHETIC'));b.click();return true})()")
    await until("Boolean(document.querySelector('.video-rebuild-stage canvas'))",'palco GPU quatro personagens')
    await until("Number(document.querySelector('.video-rebuild-stage-row aside')?.textContent?.match(/Quadros apresentados: (\\d+)/)?.[1])>0",'primeiro quadro com 4 atores')
    const metrics=async()=>evaluate("(()=>{const s=document.querySelector('.video-rebuild-stage-row aside')?.textContent??'';const m=s.match(/Quadros apresentados: (\\d+) · saltados: (\\d+)/);const bytes=document.querySelector('.video-rebuild-stage-row aside small')?.textContent??'';return {frame:Number(document.querySelector('input[aria-label=\"Frame absoluto\"]')?.value),presented:Number(m?.[1]??0),skipped:Number(m?.[2]??0),textureBytes:JSON.parse(bytes||'{}').retainedEstimatedBytes??0}})()")
    const start=await metrics()
    await evaluate("(()=>{const b=[...document.querySelectorAll('.video-rebuild-transport button')].find(x=>x.textContent==='Reproduzir');if(!b)throw Error('Play ausente');b.click();return true})()")
    const playedAt=Date.now()
    await delay(5200)
    const played=await metrics()
    const elapsed=Date.now()-playedAt
    if(played.frame<240||played.presented<=start.presented)
      throw Error('Novo compositor não reproduziu 5s de quatro personagens: '+JSON.stringify({start,played,elapsed}))
    const syntheticFourActors={
      timelineFrames:300,characters:4,elapsedMs:elapsed,frameReached:played.frame,
      presentedFrames:played.presented-start.presented,
      skippedFrames:played.skipped-start.skipped,
      presentedFps:Number(((played.presented-start.presented)*1000/elapsed).toFixed(2)),
      textureBytesEstimated:played.textureBytes,source:'synthetic assets, not full Gacha catalog'
    }
    const result={ok:true,renderBackend:'webgl2',playedFrame:progress.value,seekFrame:2700,
      persisted:true,projectIsolation:'synthetic',orientationPixelOracle:'top-red-bottom-blue',
      syntheticFourActors,runId}
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
