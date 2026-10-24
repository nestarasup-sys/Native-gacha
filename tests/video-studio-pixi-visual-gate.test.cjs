'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const parity = { exports: {} }
const paritySource = fs.readFileSync(path.resolve(__dirname,
  '../src/renderer/src/features/videoStudio/pixiGachaParity.ts'),'utf8')
new Function('module','exports',ts.transpile(paritySource,{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}))(parity,parity.exports)
const moduleObject = {exports:{}}
const gateSource = fs.readFileSync(path.resolve(__dirname,
  '../src/renderer/src/features/videoStudio/pixiGachaVisualGate.ts'),'utf8')
const drawn=[]
const referencePixels = new Uint8ClampedArray(4*4*4)
for(let i=0;i<referencePixels.length;i+=4){
 referencePixels.set([70,80,120,255],i)
}
const mockCanvas=()=>({
 width:0,height:0,
 getContext:()=>{
  return {
   setTransform(){},clearRect(){},save(){},restore(){},
   translate(){},scale(){},
   drawImage:source=>drawn.push(source),
   getImageData:()=>({data:referencePixels}),
  }
 }
})
new Function('require','module','exports','document',ts.transpile(gateSource,{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}))(
 name=>{if(name==='./pixiGachaParity')return parity.exports;throw Error(name)},
 moduleObject,moduleObject.exports,{createElement(name){assert.equal(name,'canvas');return mockCanvas()}}
)
const {PixiGachaVisualGate}=moduleObject.exports
const makeFrame=(back,face,front)=>({behindFace:back,face,inFrontOfFace:front,
 width:4,height:4,outputWidth:4,outputHeight:4,shapeScaleX:1,shapeScaleY:1})
const options={maxChangedRatio:0,maxMeanError:0,maxP99Error:0,channelTolerance:0,
 initialSamples:2,recheckEvery:8,maxReadbackPixels:64}
test('full body, face, hair and accessories retain original 3-layer Canvas order in verification',()=>{
 drawn.length=0
 const gate=new PixiGachaVisualGate(options)
 const back={width:4,height:4,id:'wardrobe and skin'}
 const face={width:4,height:4,id:'eyes/pupils and mouth'}
 const front={width:4,height:4,id:'fringe and accessories'}
 const frame=makeFrame(back,face,front)
 assert.equal(gate.shouldCheck(frame),true)
 gate.verify(frame,referencePixels)
 assert.deepEqual(drawn,[back,face,front])
 assert.equal(gate.shouldCheck(frame),true)
 gate.verify(frame,referencePixels)
 assert.equal(gate.shouldCheck(frame),false)
 for(let i=0;i<6;i++)gate.noteFastFrame()
 assert.equal(gate.shouldCheck(frame),true,'a periodic readback catches lost GPU precision')
 gate.verify(frame,referencePixels)
 assert.equal(gate.snapshot().checkedFrames,3)
 assert.equal(gate.snapshot().acceptedFrames,3)
 assert.equal(gate.snapshot().rejected,false)
 gate.dispose()
})
test('any actual change in opaque face pixels rejects GPU permanently',()=>{
 const gate=new PixiGachaVisualGate(options)
 const frame=makeFrame({width:4,height:4},{width:4,height:4},null)
 const modified=new Uint8Array(referencePixels)
 modified[0]=145
 assert.throws(()=>gate.verify(frame,modified),/restaurando o Canvas/)
 assert.equal(gate.snapshot().lastParity.changedPixels,1)
 assert.equal(gate.snapshot().rejected,true)
 assert.throws(()=>gate.shouldCheck(frame),/restaurando o Canvas/)
 assert.throws(()=>gate.noteFastFrame(),/restaurando o Canvas/)
 gate.dispose()
})
test('GPU readback budget refuses huge canvases before any pixels are copied',()=>{
 const gate=new PixiGachaVisualGate(options)
 const frame={...makeFrame({width:4,height:4},{width:4,height:4},null),
   outputWidth:12000,outputHeight:8000}
 assert.throws(()=>gate.verify(frame,new Uint8Array()),/orçamento/)
 assert.equal(gate.snapshot().rejected,true)
})
test('wardrobe, hair or static changes force new comparison even after successful warm-up',()=>{
 const gate=new PixiGachaVisualGate(options)
 const back={width:4,height:4},face={width:4,height:4}
 const frame=makeFrame(back,face,null)
 gate.verify(frame,referencePixels)
 gate.verify(frame,referencePixels)
 assert.equal(gate.shouldCheck(frame),false)
 const next={...frame,behindFace:{width:4,height:4}}
 assert.equal(gate.shouldCheck(next),true)
 gate.verify(next,referencePixels)
 assert.equal(gate.shouldCheck(next),false)
})
test('GPU surface invokes gate before displaying pixel output; failed GPU falls back to Canvas',()=>{
 const surface=fs.readFileSync(path.resolve(__dirname,
   '../src/renderer/src/features/videoStudio/pixiGachaLayerSurface.ts'),'utf8')
 assert.match(surface,/this\.parityGate\.verify\(layers, gpuPixels\)/)
 assert.match(surface,/this\.parityGate\.shouldCheck\(layers\)/)
 assert.match(surface,/this\.parityGate\.dispose\(\)/)
 assert.match(surface,/const exact = await prepared\.renderToCanvas\(\.\.\.args\)/)
})
