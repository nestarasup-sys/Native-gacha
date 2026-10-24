'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')
const audioSource=ts.transpile(
  fs.readFileSync(path.resolve(__dirname,'../src/shared/videoAudio.ts'),'utf8'),
  {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
)
const audioMod={exports:{}}
new Function('module','exports',audioSource)(audioMod,audioMod.exports)
const code=ts.transpile(
  fs.readFileSync(path.resolve(__dirname,'../src/renderer/src/features/videoStudioRebuild/mediaEngine.ts'),'utf8'),
  {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
)
function setup(){
  const created=[]
  class FakeVideo {
    constructor(){
      this.src='';this.readyState=0;this.duration=10;this.paused=true
      this.currentTime=0;this.preload='';this.playsInline=false
      this.listeners=new Map();this.muted=false;this.volume=1
      created.push(this)
    }
    addEventListener(type,fn){this.listeners.set(type,fn)}
    removeEventListener(type,fn){if(this.listeners.get(type)===fn)this.listeners.delete(type)}
    dispatch(type){this.listeners.get(type)?.()}
    load(){
      if(!this.src)return
      if(this.src.includes('slow'))return
      this.readyState=1;queueMicrotask(()=>this.dispatch('loadedmetadata'))
    }
    pause(){this.paused=true}
    async play(){this.paused=false}
    removeAttribute(name){if(name==='src')this.src=''}
  }
  const doc={createElement:name=>{assert.equal(name,'video');return new FakeVideo()}}
  let ipcCalls=0
  const win={desktop:{
    prepareVideoPreviewMedia:async(id,asset)=>({proxyUrl:'gacha-video://preview/'+asset.name}),
    controlVideoMediaEngine:async()=>{ipcCalls++;return{frame:0,playing:false,audioMaster:false}}
  }}
  const mod={exports:{}}
  new Function('module','exports','require','document','window','crypto',code)(
    mod,mod.exports,key=>{
      if(key==='../../../../shared/videoAudio')return audioMod.exports
      throw Error('Unexpected '+key)
    },doc,win,{randomUUID:()=> 'session'})
  return {Engine:mod.exports.VideoStudioMediaEngine,created,getIpcCalls:()=>ipcCalls}
}
const scene=ids=>({
  frame:60,videos:ids.map((assetId,i)=>({assetId,clipId:'clip'+i,sourceTick:60,sourceTimeNumerator:60,sourceTimeDenominator:60}))
})

test('media service releases idle Chromium decoders so a third clip can open',async()=>{
  const {Engine,created}=setup()
  const media=new Engine('studio',[{id:'a',name:'a'},{id:'b',name:'b'},{id:'c',name:'c'}],2)
  assert.ok(await media.acquire('a'))
  assert.ok(await media.acquire('b'))
  assert.equal(created.length,2)
  media.sync(scene(['c']),false)
  assert.ok(await media.acquire('c'))
  assert.equal(created.length,3)
  assert.equal(created[0].src,'')
  assert.equal(created[1].src,'')
  media.dispose()
  assert.equal(created[2].src,'')
})

test('cancel stops an in-flight decoder before metadata arrives and discards stale publication',async()=>{
  const {Engine,created}=setup()
  const media=new Engine('studio',[{id:'slow',name:'slow'}])
  const pending=media.acquire('slow')
  for(let i=0;i<8;i++)await Promise.resolve()
  assert.equal(created.length,1)
  media.stop()
  assert.equal(await pending,null)
  assert.equal(created[0].src,'')
  assert.equal(created[0].listeners.size,0)
  media.dispose()
})

test('sound plan honors project and per-clip gain; muted first video cannot master the AV clock',async()=>{
  const {Engine,created}=setup()
  const media=new Engine('studio',[{id:'a',name:'a'},{id:'b',name:'b'}],2,{
    master:{volume:.5,muted:false},
    clips:[{id:'clip0',assetId:'a',audio:{volume:1,muted:true}},
      {id:'clip1',assetId:'b',audio:{volume:.4,muted:false}}]
  })
  await media.acquire('a');await media.acquire('b')
  const a=created[0],b=created[1]
  media.sync(scene(['a','b']),true)
  await Promise.resolve()
  assert.equal(a.muted,true)
  assert.equal(a.volume,.5)
  assert.equal(b.muted,false,'second video must be the only audible clock master')
  assert.equal(b.volume,.2)
  media.sync(scene(['a','b']),false)
  assert.equal(a.muted,true)
  assert.equal(b.muted,true)
  media.dispose()
})

test('global mute never promotes a muted video as AV master',async()=>{
  const {Engine,created}=setup()
  const media=new Engine('studio',[{id:'a',name:'a'}],2,{
    master:{volume:1,muted:true},clips:[{id:'clip0',assetId:'a',audio:{volume:1,muted:false}}]
  })
  await media.acquire('a')
  media.sync(scene(['a']),true)
  assert.equal(created[0].muted,true)
  media.dispose()
})
