'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')

function harness(){
 const calls={decoded:[],encoded:[],canvases:[],sets:[]}
 const mockContext=canvas=>({
  canvas,drawImage:(image,...args)=>canvas.draws.push({image,args}),
  save(){},restore(){},scale(){},translate(){},rotate(){},
  transform(){},setTransform(){},clearRect(){},
  globalAlpha:1,
 })
 const document={createElement(tag){
  assert.equal(tag,'canvas')
  const canvas={width:0,height:0,draws:[],
   getContext(){return mockContext(canvas)},
   toDataURL(){calls.encoded.push(canvas);return 'data:image/png;base64,MOCK:'+calls.encoded.length},
  }
  calls.canvases.push(canvas)
  return canvas
 }}
 const body={id:'body',name:'body',x:0,y:0,width:80,height:90,rotation:0,dataUrl:'body-source'}
 const model={slot:1,updatedAt:'source-v1',parts:[body],width:80,height:90,layerOrder:['body']}
 const art={width:80,height:90,parts:[body],layerOrder:['body'],hiddenPartIds:[]}
 const coat={id:'coat',name:'Coat',category:'camisa',attachedPartId:'body',
  dataUrl:'coat-source',width:45,height:50}
 const specs={id:'specs',name:'Glasses',category:'oculos',attachedPartId:'body',
  dataUrl:'glasses-source',renderAboveHair:true,width:30,height:15}
 const details={'1:coat-set':{id:'coat-set',modelSlot:1,components:[coat]},
  '1:glasses-set':{id:'glasses-set',modelSlot:1,components:[specs]}}
 const groups=[
  {modelSlot:1,setId:'coat-set',category:'camisa',componentId:'coat',
    offsetX:0,offsetY:0,scaleX:1,scaleY:1,rotation:0},
  {modelSlot:1,setId:'glasses-set',category:'oculos',componentId:'specs',
    offsetX:0,offsetY:0,scaleX:1,scaleY:1,rotation:0},
 ]
 const provider={
  loadWardrobeSet:async(_slot,id)=>{calls.sets.push(id);return details['1:'+id]??null},
 }
 const imports={
  '../../../shared/hairCategories':{hairCategories:[]},
  '../../../shared/wardrobePose':{
   wardrobePosePadding:()=>({kneeOverlap:0,edgePadding:0}),
   mapWardrobeComponentToPose:()=>({
    origin:{x:40,y:45},localLeft:-20,localTop:-20,
    renderWidth:40,renderHeight:40,localRotation:0,
    matrix:'matrix(1,0,0,1,0,0)',
   }),
  },
  '../../../shared/modelRig':{normalizeLayerOrder:(_parts,order)=>order},
  '../../../shared/assetFlow':{validateWardrobeFlow:()=>({issues:[]})},
  '../../../shared/wardrobeAdjustment':{wardrobeAdjustmentMatrix:()=>[1,0,0,1,0,0]},
  './renderResolution':{MAX_CHARACTER_PREVIEW_PIXELS:4_000_000,
    configureCharacterSampling:()=>{}},
  './characterImageMemos':{
   loadCachedImage:async src=>{calls.decoded.push(src);return {src,width:80,height:90,naturalWidth:80,naturalHeight:90}},
   exportImageMemos:null,
  },
  '../../../shared/customizer':{},
  './characterSourceResolver':{},
  '../ui/image/eyeInteriorMask':{},
  './skinTint':{},
  './expressionEffectRender':{},
  '../../../shared/legacyExpressionEffects':{},
  './gachaStaticLayers':{},
  '../../../shared/studio':{},
 }
 const raw=fs.readFileSync(path.resolve(__dirname,
  '../src/renderer/src/characters/characterRenderer.ts'),'utf8')
 const compiled=ts.transpile(raw,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022})
 const mod={exports:{}}
 new Function('require','module','exports','document',compiled)(
  name=>{if(!Object.hasOwn(imports,name))throw Error('unexpected '+name);return imports[name]},
  mod,mod.exports,document)
 return {renderer:mod.exports,calls,model,art,groups,details,provider}
}

test('wardrobe direct Canvas never encodes or decodes a transient PNG, including above-hair accessories',async()=>{
 const {renderer,calls,model,art,groups,details}=harness()
 const output=await renderer.renderWardrobeOverlayCanvases(groups,details,art,1,model)
 assert.ok(output.canvas)
 assert.ok(output.aboveHairCanvas)
 assert.deepEqual(calls.encoded,[])
 assert.deepEqual(calls.decoded,['body-source','coat-source','glasses-source'])
 assert.deepEqual(output.canvas.draws.map(x=>x.image.src),['body-source','coat-source'])
 assert.deepEqual(output.aboveHairCanvas.draws.map(x=>x.image.src),['glasses-source'])
 assert.equal(output.canvas.width,art.width)
 assert.equal(output.canvas.height,art.height)
})
test('legacy wardrobe PNG API is retained with the same Canvas drawing order',async()=>{
 const {renderer,calls,model,art,groups,details}=harness()
 const png=await renderer.renderWardrobeOverlay(groups,details,art,1,model)
 assert.match(png.imageUrl,/^data:image\/png/)
 assert.match(png.aboveHairImageUrl,/^data:image\/png/)
 assert.equal(calls.encoded.length,2)
 assert.deepEqual(calls.encoded[0].draws.map(x=>x.image.src),['body-source','coat-source'])
 assert.deepEqual(calls.encoded[1].draws.map(x=>x.image.src),['glasses-source'])
})
test('render without selected clothes keeps null layers and does not allocate a Canvas',async()=>{
 const {renderer,calls,model,art,details}=harness()
 const direct=await renderer.renderWardrobeOverlayCanvases([],details,art,1,model)
 assert.deepEqual(direct,{canvas:null,aboveHairCanvas:null})
 assert.equal(calls.canvases.length,0)
 const png=await renderer.renderWardrobeOverlay([],details,art,1,model)
 assert.deepEqual(png,{imageUrl:null,aboveHairImageUrl:null})
})
test('material cache deduplicates concurrent wardrobe reads and is independent of expression/pose',async()=>{
 const {renderer,calls,groups,provider}=harness()
 const cache=new Map()
 const character={id:'actor',updatedAt:'rev1',
  customization:{modelSlot:1,wardrobeGroups:groups,faceAppearance:{expressionIndex:0},hairAppearance:null}}
 const first=await Promise.all([
  renderer.materialsForPreparedCharacter(character,1,provider,cache),
  renderer.materialsForPreparedCharacter({...character,customization:{
   ...character.customization,faceAppearance:{expressionIndex:7}}},1,provider,cache),
 ])
 assert.strictEqual(first[0],first[1])
 assert.deepEqual(calls.sets.sort(),['coat-set','glasses-set'])
 assert.equal(cache.size,1)
 assert.deepEqual(Object.keys(first[0].wardrobeDetails).sort(),['1:coat-set','1:glasses-set'])
 const changed={...character,customization:{...character.customization,
  wardrobeGroups:groups.slice(0,1)}}
 await renderer.materialsForPreparedCharacter(changed,1,provider,cache)
 assert.equal(cache.size,2,'editing an equipped part invalidates only its material manifest')
 const revision={...character,updatedAt:'rev2'}
 await renderer.materialsForPreparedCharacter(revision,1,provider,cache)
 assert.equal(cache.size,3,'new character asset revision cannot reuse stale library')
})
test('material cache stays bounded and a missing authorial wardrobe asset is never hidden',async()=>{
 const {renderer,provider,groups}=harness()
 const cache=new Map()
 for(let n=0;n<9;n++)await renderer.materialsForPreparedCharacter({
  id:'actor',updatedAt:'rev'+n,customization:{modelSlot:1,wardrobeGroups:groups},
 },1,provider,cache)
 assert.equal(cache.size,6)
 await assert.rejects(
  renderer.materialsForPreparedCharacter({id:'actor',updatedAt:'broken',
   customization:{modelSlot:1,wardrobeGroups:[{...groups[0],setId:'missing'}]}},
  1,provider,cache),/indisponível/)
 assert.ok(cache.size<=6,'failed manifest promises cannot poison the session cache')
})
test('the production Canvas path uses native wardrobe layers and reuses its shape surface',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,
  '../src/renderer/src/characters/characterRenderer.ts'),'utf8')
 const prepared=source.slice(source.indexOf('export async function prepareSavedCharacterRenderer('))
 assert.match(prepared,/renderWardrobeOverlayCanvases\(groups, materials\.wardrobeDetails/)
 assert.match(prepared,/const wardrobeImage = wardrobe\.canvas/)
 assert.match(prepared,/const wardrobeAboveHairImage = wardrobe\.aboveHairCanvas/)
 assert.doesNotMatch(prepared,/loadCachedImage\(wardrobe\.imageUrl\)/)
 assert.match(prepared,/let scaledOutput: HTMLCanvasElement \| null = null/)
 assert.match(prepared,/outputContext\.clearRect\(0, 0, outputWidth, outputHeight\)/)
 const shared=fs.readFileSync(path.resolve(__dirname,
 '../src/renderer/src/features/videoStudio/transitionRenderer.ts'),'utf8')
 assert.match(shared,/private readonly reusableMaterials/)
 assert.match(shared,/materialCache: this\.reusableMaterials/)
 assert.match(shared,/this\.reusableMaterials\.clear\(\)/)
})
