'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')
const esbuild=require('esbuild')

const file=path.resolve(__dirname,'../src/renderer/src/features/videoStudio/pixiGachaArticulatedAssets.ts')
const source=fs.readFileSync(file,'utf8')
const mod={exports:{}}
new Function('require','module','exports',ts.transpile(source,{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}))((name)=>{
  if(name==='../../../../shared/wardrobePose')return {
    wardrobePosePadding:()=>({kneeOverlap:0,edgePadding:0}),
    mapWardrobeComponentToPose:(_part,_base,bone)=>({
      origin:{x:bone.x+bone.width/2,y:bone.y+bone.height/2},
      localLeft:-12,localTop:-15,renderWidth:24,renderHeight:30,
      localRotation:0,matrix:'matrix(1,0,0,1,0,0)',
    }),
  }
  if(name==='../../../../shared/wardrobeAdjustment')return {
    wardrobeAdjustmentMatrix:()=>[1,0,0,1,0,0],
  }
  if(name==='../../../../shared/customizer')return {getCharacterProportions:()=>({})}
  if(name==='../../characters/characterRenderer')return {}
  if(name==='../../characters/characterSourceResolver')return {characterShapeScale:()=>({x:1,y:1})}
  if(name==='../../../../shared/modelRig')return {normalizeLayerOrder:(_,order)=>order}
  throw Error('Unexpected source import '+name)
},mod,mod.exports)

const { gachaArticulatedCommands,gachaFaceTransport,multiplyGachaAffine,invertGachaAffine }=mod.exports
function part(id,name,x,y,rotation=0,asset='asset:'+id) {
  return {id,name,x,y,rotation,width:40,height:60,dataUrl:asset}
}
const sourceParts=[part('head','Cabeça',40,10),part('arm','Arm',20,100)]
const sourceModel={parts:sourceParts,slot:1}
const from={width:200,height:250,parts:sourceParts,layerOrder:['arm','head'],hiddenPartIds:[]}
const to={...from,parts:[part('head','Cabeça',85,35,20),part('arm','Arm',60,125,45)]}
const group={modelSlot:1,setId:'outfit',category:'camisa',componentId:'coat',
  offsetX:0,offsetY:0,scaleX:1,scaleY:1,rotation:0}
const garment={id:'coat',url:'url:coat',width:24,height:30,group,
  component:{id:'coat',attachedPartId:'arm'},sequence:0,aboveHair:false}
const glasses={id:'glasses',url:'url:glasses',width:35,height:18,group,
  component:{id:'glasses',attachedPartId:'head'},sequence:1,aboveHair:true}
const hair={id:'fringe',url:'url:hair',width:60,height:30,side:'front',part:'frontHair',
  transform:{x:15,y:2,scaleX:1,scaleY:1,rotation:0}}
const assets={
 source:sourceModel,character:{customization:{}},
 body:new Map([['head:asset:head',{url:'url:head',width:40,height:60}],
   ['arm:asset:arm',{url:'url:arm',width:40,height:60}]]),
 hairBack:[{...hair,id:'rear',side:'back'}],hairFront:[hair],
 garments:[garment,glasses],pixelWidth:200,pixelHeight:250,shapeX:1,shapeY:1,
}
const apply=(m,x,y)=>({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]})

test('bone-linked clothing and hair preserve texture identity while moving between timeline poses',()=>{
  const a=gachaArticulatedCommands(assets,from)
  const b=gachaArticulatedCommands(assets,to)
  assert.deepEqual(a.behind.map(c=>c.id),
    ['rear','body:arm','body:head','wardrobe-body:arm','coat','wardrobe-body:head'])
  assert.deepEqual(a.front.map(c=>c.id),['fringe','glasses'])
  assert.deepEqual(a.behind.map(c=>c.url),b.behind.map(c=>c.url))
  const shirt1=a.behind.find(c=>c.id==='coat'),shirt2=b.behind.find(c=>c.id==='coat')
  assert.ok(shirt1&&shirt2)
  assert.notDeepEqual(shirt1.matrix,shirt2.matrix,'clothing follows arm bone, not a rasterized midpoint PNG')
  assert.notDeepEqual(a.front[0].matrix,b.front[0].matrix,'front hair follows head')
  assert.notDeepEqual(a.front[1].matrix,b.front[1].matrix,'glasses follow head')
})

test('face texture receives an invertible affine head transport even during rotation/resize',()=>{
 const a=sourceParts[0]
 const b={...a,x:100,y:60,width:72,height:36,rotation:36}
 const m=gachaFaceTransport(a,b)
 const fromCenter={x:a.x+a.width/2,y:a.y+a.height/2}
 const target=apply(m,fromCenter.x,fromCenter.y)
 assert.ok(Math.abs(target.x-(b.x+b.width/2))<1e-8)
 assert.ok(Math.abs(target.y-(b.y+b.height/2))<1e-8)
 const back=apply(invertGachaAffine(m),target.x,target.y)
 assert.ok(Math.abs(back.x-fromCenter.x)<1e-8)
 assert.ok(Math.abs(back.y-fromCenter.y)<1e-8)
 const identity=multiplyGachaAffine(m,invertGachaAffine(m))
 assert.deepEqual(identity.map(v=>Math.round(v*1e8)/1e8),[1,0,0,1,0,0])
})

test('hidden bones and absent upper hair cannot leave a ghost behind',()=>{
 const clean=gachaArticulatedCommands({...assets,hairFront:[],garments:[]},
   {...from,hiddenPartIds:['arm']})
 assert.deepEqual(clean.behind.map(p=>p.id),['rear','body:head'])
 assert.deepEqual(clean.front,[])
})

test('articulated face/wardrobe/hair Pixi module actually bundles for a Chromium renderer',()=>{
 const paths=['pixiGachaArticulatedAssets.ts','pixiGachaArticulatedSurface.ts',
 'pixiGachaArticulatedSession.ts']
 for(const name of paths){
   const full=path.resolve(__dirname,'../src/renderer/src/features/videoStudio',name)
   const result=esbuild.buildSync({entryPoints:[full],bundle:true,format:'iife',
     platform:'browser',target:'es2022',write:false,logLevel:'silent'})
   assert.equal(result.outputFiles.length,1)
   assert.ok(result.outputFiles[0].text.length>20000)
 }
})
test('the actual Video Studio preview can call accelerated bone animation before per-frame Canvas rig prep',()=>{
 const trans=fs.readFileSync(path.resolve(__dirname,
 '../src/renderer/src/features/videoStudio/transitionRenderer.ts'),'utf8')
 const early=trans.indexOf('const accelerated = await this.drawExperimentalArticulatedGpu')
 const legacy=trans.indexOf('const renderer = staticPose')
 assert.ok(early>0 && early<legacy)
 assert.match(trans,/this\.articulatedGpu\.clear\(\)/)
 assert.match(trans,/this\.disabledExperimentalGpu\.add\(id\)/)
 assert.match(trans,/stable\.getContext\('2d'\)/)
 assert.match(trans,/renderLayersToCanvas/)
 const session=fs.readFileSync(path.resolve(__dirname,
 '../src/renderer/src/features/videoStudio/pixiGachaArticulatedSession.ts'),'utf8')
 assert.match(session,/this\.faceRenderer\.renderLayersToCanvas/)
 assert.match(session,/this\.surface\.render\(artwork,face\)/)
 assert.match(session,/this\.verify\(pose,appearance,transforms,effects,mode\)/)
})
