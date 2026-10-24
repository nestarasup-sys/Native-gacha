'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.resolve(__dirname,
 '../src/renderer/src/features/videoStudio/pixiGachaLayerSurface.ts'), 'utf8')
const transpiled = ts.transpile(source, { module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022 })
const mod={exports:{}}
new Function('require','module','exports',transpiled)((name)=>{
  if(name==='./pixiGachaLayerStack')return {PixiGachaLayerStack:class {}}
  throw Error('unexpected dependency '+name)
},mod,mod.exports)
const {drawGachaLayeredFrame}=mod.exports

test('exact Canvas remains available when experimental GPU path is disabled', async()=>{
  const prepared={renderToCanvas:async()=>({canvas:'canvas-canonical'}),renderLayersToCanvas:()=>{throw Error('unexpected GPU layers')}}
  assert.deepEqual(await drawGachaLayeredFrame(prepared,null),{canvas:'canvas-canonical',backend:'canvas'})
})

test('when full Gacha layers are valid GPU receives exact authored layers',async()=>{
  const layers={behindFace:'body/wardrobe',face:'pupil/mouth',inFrontOfFace:'front hair'}
  let called=0
  const prepared={renderToCanvas:()=>{throw Error('legacy fallback should not run')},renderLayersToCanvas:async()=>layers}
  const result=await drawGachaLayeredFrame(prepared,{render(input){called++;assert.strictEqual(input,layers);return 'GPU-CANVAS'}})
  assert.deepEqual(result,{canvas:'GPU-CANVAS',backend:'pixi'})
  assert.equal(called,1)
})

test('a lost GPU context safely falls back to the full historical Gacha Canvas',async()=>{
  let fallback=0
  const prepared={renderLayersToCanvas:async()=>({}),renderToCanvas:async()=>{fallback++;return{canvas:'perfect-legacy-frame'}}}
  const result=await drawGachaLayeredFrame(prepared,{render(){throw Error('webglcontextlost')}})
  assert.deepEqual(result,{canvas:'perfect-legacy-frame',backend:'canvas'})
  assert.equal(fallback,1)
})

test('a face or hair preparation failure also preserves the complete original picture',async()=>{
  const prepared={renderLayersToCanvas:async()=>{throw Error('missing PT eye')},renderToCanvas:async()=>({canvas:'normal-character'})}
  assert.deepEqual(await drawGachaLayeredFrame(prepared,{render(){throw Error('must not be called')}}),
    {canvas:'normal-character',backend:'canvas'})
})

test('GPU class has explicit context-loss guard, no own ticker and no change to current preview',()=>{
  assert.match(source,/webglcontextlost/)
  assert.match(source,/autoStart: false/)
  assert.match(source,/this\.stack\.setLayers\(layers\)/)
  assert.doesNotMatch(source,/requestAnimationFrame\(/)
  const editor=fs.readFileSync(path.resolve(__dirname,
    '../src/renderer/src/features/videoStudio/VideoStudioEditor.tsx'),'utf8')
  assert.doesNotMatch(editor,/PixiGachaLayerSurface/)
})
