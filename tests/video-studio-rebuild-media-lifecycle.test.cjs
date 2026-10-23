'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')
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
      this.listeners=new Map();this.muted=false
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
  new Function('module','exports','document','window','crypto',code)(mod,mod.exports,doc,win,{randomUUID:()=> 'session'})
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
