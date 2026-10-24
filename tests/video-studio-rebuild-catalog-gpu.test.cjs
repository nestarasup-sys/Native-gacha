'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')
const load=(file,deps={})=>{
  const content=fs.readFileSync(path.resolve(__dirname,'..',file),'utf8')
  const code=ts.transpile(content,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022})
  const module={exports:{}}
  new Function('require','module','exports',code)(key=>{
    if(Object.hasOwn(deps,key))return deps[key]
    throw Error('Unexpected import '+key)
  },module,module.exports)
  return module.exports
}
const passes=['eye-left','pupil-left','pupil-right']
const base={width:8,height:8}
let builds=0
const drawings=[]
const fakePreparer=async()=>{
  builds++
  return {
    gpuStaticLayers:{behindFace:base,inFrontOfFace:null},
    renderGpuFacePass:async(pass,appearance,transforms,fx,mode)=>{
      drawings.push([pass,transforms?.['expression-component:pupil-left']?.x??0,mode])
      return {width:8,height:8,getContext:()=>({
        getImageData:()=>({data:new Uint8ClampedArray(8*8*4).fill(255)})
      })}
    }
  }
}
const moduleUnderTest=load('src/renderer/src/features/videoStudioRebuild/catalogGpuCompiler.ts',{
  '../../characters/characterRenderer':{
    GPU_FACE_PASSES:passes,prepareSavedCharacterRenderer:fakePreparer
  },
  '../../../../shared/videoStageGeometry':{videoCharacterElementSize:e=>({width:e.width,height:e.height})}
})
const {CatalogGpuCompiler,cropCatalogPart,catalogFaceRecipe,placeCatalogPart}=moduleUnderTest
const flush=()=>new Promise(resolve=>setImmediate(resolve))
const actor=(x=0)=>({
  elementId:'actor',automaticBlink:false,hidden:false,
  authoredState:{element:{
    id:'actor',characterId:'char',kind:'character',x:0,y:0,width:40,height:80,rotation:0,
    faceAppearance:{modelSlot:1,eyeState:0,mouthOpen:false,
      components:{'eye-left':{assetId:'e-left'},'eye-right':{assetId:'e-right'},
        'pupil-left':{assetId:'p-left'},'pupil-right':{assetId:'p-right'}}},
    faceTransforms:{'expression-component:pupil-left':{x,y:0,width:100,height:100,rotation:0}}
  },imageDataUrl:'data:image/png;base64,SAVED'}
})
const layer={type:'element',kind:'character',element:{id:'actor',kind:'character',
  x:0,y:0,width:40,height:80,rotation:0},assetDataUrl:'data:image/png;base64,SAVED'}
const characters=[{id:'char',updatedAt:'2026-10-23T00:00:00Z',
  name:'Real model',customization:{modelSlot:1,poseSlot:null}}]
test('transparent sprite crop preserves the authored local coordinate and horizontal flip',()=>{
  const source={width:4,height:4,getContext:()=>({
    getImageData:()=>{const data=new Uint8ClampedArray(4*4*4)
      for(let y=1;y<3;y++)for(let x=0;x<2;x++)data[(y*4+x)*4+3]=255
      return {data}
    }
  })}
  const old=global.document
  let copied
  global.document={createElement:()=>({width:0,height:0,
    getContext:()=>({drawImage:(...args)=>{copied=args}})})}
  try{
    const part=cropCatalogPart(source)
    assert.deepEqual(part.crop,{x:0,y:1,width:2,height:2})
    assert.deepEqual(copied.slice(1,5),[0,1,2,2])
    assert.deepEqual(placeCatalogPart(part,{kind:'character',x:0,y:0,width:80,height:80,
      rotation:0,flipX:false}),{x:-20,y:0,width:40,height:40,rotation:0,flipX:false})
    assert.equal(placeCatalogPart(part,{kind:'character',x:0,y:0,width:80,height:80,
      rotation:0,flipX:true}).x,20)
  }finally{global.document=old}
})
test('PT pupil recipes do not invalidate the opposite pupil',()=>{
  const left=actor(5).authoredState.element,right=actor(11).authoredState.element
  const p=left.faceAppearance
  assert.notEqual(catalogFaceRecipe('pupil-left',p,left,'idle'),
    catalogFaceRecipe('pupil-left',p,right,'idle'))
  assert.equal(catalogFaceRecipe('pupil-right',p,left,'idle'),
    catalogFaceRecipe('pupil-right',p,right,'idle'))
  assert.notEqual(catalogFaceRecipe('pupil-right',p,left,'idle'),
    catalogFaceRecipe('pupil-right',p,left,'blink'))
})
test('catalog sprites compile asynchronously without blocking fallback PNG or changing rig on pupil edits',async()=>{
  const old=global.window
  global.window={desktop:{listCustomizerCharacters:async()=>characters}}
  builds=0;drawings.length=0
  let readyCount=0
  const compiler=new CatalogGpuCompiler(()=>{readyCount++})
  const full=async(a)=>{
    for(let step=0;step<40;step++){
      const result=compiler.sprites(layer,a)
      if(result)return result
      await flush()
    }
    throw Error('Catalog compiler never completed requested sprite parts')
  }
  try{
    assert.equal(compiler.sprites(layer,actor()),null,'Play must show saved PNG during cold setup')
    const previous=await full(actor(5))
    assert.deepEqual(previous.map(x=>x.textureId),[
      'catalog:actor:rig-behind-face','catalog:actor:face:eye-left',
      'catalog:actor:face:pupil-left','catalog:actor:face:pupil-right'])
    assert.equal(builds,1)
    assert.ok(readyCount>=4)
    const before=drawings.length
    const next=await full(actor(11))
    assert.strictEqual(next[0].source,previous[0].source,'body is a persistent rig texture')
    assert.strictEqual(next[1].source,previous[1].source,'left eye unchanged')
    assert.notStrictEqual(next[2].source,previous[2].source,'left PT pupil is independently regenerated')
    assert.strictEqual(next[3].source,previous[3].source,'right PT pupil is unchanged')
    assert.equal(drawings.length-before,1,'one catalog pass was regenerated, not the full body')
    assert.equal(builds,1)
  }finally{compiler.dispose();global.window=old}
})
test('an incomplete or absent model cannot replace the persisted V1 PNG',async()=>{
  const old=global.window
  global.window={desktop:{listCustomizerCharacters:async()=>[]}}
  const compiler=new CatalogGpuCompiler(()=>{})
  try{
    assert.equal(compiler.sprites(layer,actor()),null)
    await flush()
    assert.equal(compiler.sprites(layer,actor()),null)
    assert.equal(compiler.sprites({...layer,kind:'speech'},actor()),null)
    assert.equal(compiler.sprites(layer,{...actor(),transition:{}}),null)
  }finally{compiler.dispose();global.window=old}
})

test('GPU pass loading requests only relevant side and matching pupil mask',()=>{
  const {catalogComponentIdsForPass}=load('src/renderer/src/characters/gachaFaceComponentPass.ts')
  assert.deepEqual(catalogComponentIdsForPass('pupil-left'),['eye-left','pupil-left'])
  assert.deepEqual(catalogComponentIdsForPass('pupil-right'),['eye-right','pupil-right'])
  assert.deepEqual(catalogComponentIdsForPass('eye-left'),['eye-left'])
  assert.deepEqual(catalogComponentIdsForPass('eye-right'),['eye-right'])
  assert.deepEqual(catalogComponentIdsForPass('catalog'),[])
  assert.deepEqual(catalogComponentIdsForPass('details'),[])
  assert.equal(catalogComponentIdsForPass().length,6,'legacy full face keeps all components')
})
test('prepared Gacha sprite assembler retains source rig identity and normal draw order',async()=>{
  const old=global.document
  let operations=[]
  global.document={createElement:()=>({
    width:0,height:0,getContext:()=>({drawImage:(...args)=>operations.push(['draw',...args]),
      translate(){},scale(){}})
  })}
  const module=load('src/renderer/src/characters/gachaPreparedGpuLayers.ts',{
    './renderResolution':{configureCharacterSampling:()=>{}}
  })
  const original={width:16,height:16}
  const head={width:16,height:16}
  const passesDrawn=[]
  try{
    const rig=module.createPreparedGachaGpuLayers({
      rigLayers:{behindFace:original,inFrontOfFace:head},
      shapeScale:{x:1,y:1},outputWidth:16,outputHeight:16,
      artworkWidth:16,artworkHeight:16,modelSlot:1,
      appearance:{modelSlot:1},
      legacyFaceImage:null,
      drawFace:async(context,appearance,transforms,effects,mode,pass)=>passesDrawn.push(pass)
    })
    const render=await rig.renderGpuLayers()
    assert.strictEqual(rig.gpuStaticLayers.behindFace,original)
    assert.strictEqual(rig.gpuStaticLayers.inFrontOfFace,head)
    assert.deepEqual(render.map(l=>l.id),[
      'rig-behind-face',...module.GPU_FACE_PASSES.map(x=>'face:'+x),'rig-front'])
    assert.deepEqual(passesDrawn,[...module.GPU_FACE_PASSES])
  }finally{global.document=old}
})
