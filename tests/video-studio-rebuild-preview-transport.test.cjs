'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')
function load(relative,deps={}){
  const source=fs.readFileSync(path.join(__dirname,'..',relative),'utf8')
  const js=ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022})
  const mod={exports:{}}
  new Function('require','module','exports',js)(name=>{
    if(!Object.hasOwn(deps,name))throw Error('Unknown import '+name)
    return deps[name]
  },mod,mod.exports)
  return mod.exports
}
const {VideoStudioBoundedMemo}=load('src/shared/videoStudioNext/boundedMemo.ts')
const {VideoFrameScheduler}=load('src/shared/videoStudioRebuild/frameScheduler.ts')
const {VideoStudioPreviewTransport}=load('src/renderer/src/features/videoStudioRebuild/previewTransport.ts',{
  '../../../../shared/videoStudioNext/boundedMemo':{VideoStudioBoundedMemo},
  '../../../../shared/videoStudioRebuild/frameScheduler':{VideoFrameScheduler},
  '../../../../shared/videoStageGeometry':{videoCharacterElementSize:el=>({width:el.width,height:el.height})}
})
const flush=()=>new Promise(resolve=>setImmediate(resolve))
function setup(){
  let nextRaf=1
  const callbacks=new Map()
  global.requestAnimationFrame=cb=>{const id=nextRaf++;callbacks.set(id,cb);return id}
  global.cancelAnimationFrame=id=>callbacks.delete(id)
  const instances=[]
  global.Image=class FakeImage{
    naturalWidth=16;naturalHeight=16;onload=null;onerror=null;decoding='async'
    set src(value){this.value=value;instances.push(this);queueMicrotask(()=>this.onload?.())}
    get src(){return this.value}
  }
  const rendered=[],events=[],errors=[]
  const media={syncCalls:[],sync(scene,playing){this.syncCalls.push([scene.frame,playing])},
    currentFrame(frame){return frame},activeFrameSources(){return new Map()},dispose(){}}
  const gpu={draw(layers){rendered.push(layers.map(x=>x.textureId))},
    stats(){return{retainedEstimatedBytes:1024}},dispose(){}}
  const engine={durationFrames:10800,evaluate(frame){
    return {frame,background:{color:'#000000'},videos:[],layers:[
      {type:'element',assetDataUrl:'data:image/png;base64,TEST',kind:'character',
        element:{id:'actor',kind:'character',x:0,y:0,width:15,height:20,rotation:0}}
    ]}
  }}
  const transport=new VideoStudioPreviewTransport(engine,gpu,media,state=>events.push(state),error=>errors.push(error))
  const step=async(at=performance.now())=>{
    const entries=[...callbacks.entries()];callbacks.clear()
    for(const [,callback] of entries)callback(at)
    await flush();await flush()
  }
  return {transport,step,rendered,events,errors,media,instances,callbacks}
}

test('rendering is outside React state and decodes persistent Gacha source only once',async()=>{
  const h=setup()
  await h.step()
  assert.equal(h.rendered.length,1)
  assert.equal(h.instances.length,1)
  h.transport.seek(9400)
  await h.step()
  assert.equal(h.rendered.length,2)
  assert.equal(h.instances.length,1)
  assert.equal(h.transport.snapshot().frame,9400)
  assert.equal(h.transport.snapshot().presentedFrames,2)
  h.transport.dispose()
  assert.equal(h.callbacks.size,0)
  assert.equal(h.errors.length,0)
})

test('Play does not precompute other transition frames and advances with absolute 60fps time',async()=>{
  const h=setup()
  await h.step()
  const at=performance.now()
  h.transport.setPlaying(true)
  await h.step(at+1500)
  assert.ok(h.transport.snapshot().frame>=85)
  assert.ok(h.transport.snapshot().frame<=100)
  assert.ok(h.rendered.length<=2,'only frames requested by the transport are drawn')
  h.transport.setPlaying(false)
  assert.equal(h.transport.snapshot().playing,false)
  assert.equal(h.media.syncCalls.at(-1)[1],false)
  h.transport.dispose()
})

test('seek while an image is slow cancels obsolete presentation without waiting for decode',async()=>{
  const h=setup()
  // Force obsolete first request to be cancelled and new absolute frame drawn.
  await h.step()
  h.transport.seek(30)
  h.transport.seek(9000)
  await h.step()
  assert.equal(h.transport.snapshot().frame,9000)
  assert.equal(h.transport.snapshot().presentedFrames,2)
  assert.equal(h.transport.snapshot().rendering,false)
  h.transport.dispose()
})
