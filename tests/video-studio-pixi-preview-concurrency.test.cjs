'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')

function harness({gpuFails=false}={}){
 const phases=[], snapshots=[], statusEvents=[]
 const fakeCanvas={width:4,height:4,phase:''}
 const gpu={disposeCount:0,render(layers){
   if(gpuFails)throw Error('GPU lost')
   phases.push(layers.face.phase)
   fakeCanvas.phase=layers.face.phase
   return fakeCanvas
 },dispose(){this.disposeCount++}}
 const gpuFactory={create:async()=>gpu}
 const source=fs.readFileSync(path.join(__dirname,
   '../src/renderer/src/features/videoStudio/transitionRenderer.ts'),'utf8')
 const code=ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022})
 const mod={exports:{}}
 const deps={
  './characterGeometry':{faceRenderGeometry:()=>({}),trimTransparentImage:async()=>null},
  '../../../../shared/videoCharacterInterpolation':{},
  '../../characters/characterRenderer':{prepareSavedCharacterRenderer:async()=>{},
    loadStandardExpressionEffects:async()=>({})},
  '../../../../shared/videoStudioNext/boundedMemo':{
   VideoStudioBoundedMemo:class{clear(){}},
  },
  './videoGachaCanvasFrame':{},
  './pixiGachaLayerSurface':{PixiGachaLayerSurface:gpuFactory},
 }
 const window={__NATIVE_GACHA_GPU_PREVIEW_EXPERIMENTAL__:true,desktop:{},
  dispatchEvent(event){statusEvents.push({type:event.type,...event.detail});return true}}
 const document={createElement(name){
  assert.equal(name,'canvas')
  const output={width:0,height:0,phase:''}
  output.getContext=()=>({drawImage(source){
   output.phase=source.phase
   snapshots.push(output.phase)
  }})
  return output
 }}
 new Function('require','module','exports','window','document','CustomEvent',code)(
 name=>{if(Object.hasOwn(deps,name))return deps[name];throw Error('dependency '+name)},
 mod,mod.exports,window,document,
 class CustomEvent {constructor(type,options){this.type=type;this.detail=options.detail}})
 const renderer=new mod.exports.TransitionRenderer({})
 const sharedFace={phase:''}
 const prepared={
  width:4,height:4,
  async renderLayersToCanvas(_appearance,_transforms,_effects,mode){
   // Real Gacha renderer reuses the same mutable HTMLCanvasElement and its
   // face image pixels change on each recipe render.
   sharedFace.phase=mode
   await Promise.resolve()
   return {
    behindFace:{width:4,height:4},face:sharedFace,inFrontOfFace:null,
    width:4,height:4,outputWidth:4,outputHeight:4,shapeScaleX:1,shapeScaleY:1,
   }
  },
 }
 const request=mode=>renderer.drawExperimentalGpu('actor',prepared,undefined,{},{
  shadow:{enabled:false},blush:{enabled:false},mouthBlush:{enabled:false},
 },mode)
 return {renderer,gpu,request,phases,snapshots,statusEvents,window}
}

test('GPU render requests for the same character serialize mutable face without frame contamination',async()=>{
 const {renderer,request,gpu,phases,snapshots}=harness()
 const first=request('talk')
 const second=request('blink')
 const third=request('idle')
 const [a,b,c]=await Promise.all([first,second,third])
 assert.deepEqual(phases,['talk','blink','idle'])
 assert.deepEqual(snapshots,['talk','blink','idle'])
 assert.deepEqual([a.phase,b.phase,c.phase],['talk','blink','idle'])
 assert.notStrictEqual(a,b)
 assert.notStrictEqual(b,c)
 renderer.dispose()
 await new Promise(resolve=>setImmediate(resolve))
 assert.equal(gpu.disposeCount,1)
})
test('one rejected GPU character disables its backend without affecting another character',async()=>{
 const {renderer,request,gpu}=harness({gpuFails:true})
 assert.equal(await request('talk'),null)
 assert.equal(await request('blink'),null)
 const third=await renderer.drawExperimentalGpu('other',{renderLayersToCanvas:async()=>({
  behindFace:{},face:{phase:'idle'},inFrontOfFace:null,width:4,height:4,
  outputWidth:4,outputHeight:4,shapeScaleX:1,shapeScaleY:1,
 })},undefined,{},{} ,'idle')
 assert.equal(third,null)
 renderer.dispose()
 assert.equal(gpu.disposeCount>=1,true)
})
test('clearing prepared rig invalidates a running GPU recipe and prevents stale frame publication',async()=>{
 const {renderer,request}=harness()
 const work=request('talk')
 renderer.clearPrepared()
 const result=await work
 assert.equal(result,null)
 renderer.dispose()
})

test('successful GPU frames announce actual Pixi output instead of merely showing button ON',async()=>{
 const {renderer,request,statusEvents}=harness()
 await request('talk')
 assert.deepEqual(statusEvents,[{type:'native-gacha-pixi-preview-status',kind:'active',reason:undefined}])
 renderer.dispose()
})
test('a real GPU failure sends a visible Canvas fallback event with a human-readable reason',async()=>{
 const {renderer,request,statusEvents}=harness({gpuFails:true})
 await request('talk')
 assert.equal(statusEvents.length,1)
 assert.equal(statusEvents[0].type,'native-gacha-pixi-preview-status')
 assert.equal(statusEvents[0].kind,'fallback')
 assert.match(statusEvents[0].reason,/contexto WebGL\/GPU/)
 await request('idle')
 assert.equal(statusEvents.length,1,'disabled GPU actor must not claim rendering again')
 renderer.dispose()
})
test('turning GPU off prevents a stale render error from emitting a misleading fallback warning',async()=>{
 const {renderer,request,statusEvents,window}=harness({gpuFails:true})
 window.__NATIVE_GACHA_GPU_PREVIEW_EXPERIMENTAL__=false
 assert.equal(await request('talk'),null)
 assert.deepEqual(statusEvents,[])
 renderer.dispose()
})
