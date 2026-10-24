'use strict'
const { app, utilityProcess } = require('electron')
const { join } = require('node:path')
const { existsSync } = require('node:fs')
const assert = require('node:assert/strict')

/** Real Electron utility subprocess smoke. Windows only, no video/data writes.
 * Run after npm run build using an Electron binary installed locally.
 */
const workerPath = join(__dirname,'../../out/main/media-engine-worker.js')
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms))
let worker = null

async function request(child,id,op,other={}) {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.off('message',onMessage);reject(Error('AV utility smoke timed out.'))},3000)
    const onMessage=(reply)=>{
      if(reply?.id!==id)return
      clearTimeout(timer);child.off('message',onMessage)
      if(reply.ok)resolve(reply.result)
      else reject(Error(reply.error||'AV utility error'))
    }
    child.on('message',onMessage)
    child.postMessage({id,op,sessionId:'smoke-windows',...other})
  })
}

async function run() {
  if(process.platform!=='win32')throw Error('This smoke targets Windows only.')
  if(!existsSync(workerPath))throw Error('Missing bundled AV utility: '+workerPath)
  await app.whenReady()
  worker=utilityProcess.fork(workerPath,[],{serviceName:'Gacha AV smoke'})
  const initial=await request(worker,1,'sync',{frame:600,playing:true})
  assert.equal(initial.frame,600)
  await delay(250)
  const advanced=await request(worker,2,'status')
  assert.ok(advanced.frame>600&&advanced.frame<650)
  await request(worker,3,'cancel')
  const stopped=await request(worker,4,'status')
  await delay(100)
  const same=await request(worker,5,'status')
  assert.equal(stopped.frame,same.frame)
  const pt=await request(worker,6,'sync',{frame:1200,audioFrame:1260,playing:true})
  assert.equal(pt.frame,1260)
  assert.equal(pt.audioMaster,true)
  await request(worker,7,'close')
  assert.equal((await request(worker,8,'status')).frame,0)
  worker.kill();worker=null
  console.log(JSON.stringify({success:true,subprocess:true,clockAdvanced:advanced.frame,stoppedFrame:stopped.frame,audioSourceFrame:pt.frame}))
}
run().then(()=>{app.exit(0)}).catch(error=>{
  console.error(error.stack||String(error))
  try{worker?.kill()}catch{}
  app.exit(1)
})
