'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const ts=require('typescript')
function compile(file,deps={}){
 const code=ts.transpile(fs.readFileSync(path.resolve(__dirname,file),'utf8'),
   {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022})
 const module={exports:{}}
 new Function('require','module','exports','Worker',code)(name=>{
  if(Object.hasOwn(deps,name))return deps[name]
  throw Error('unapproved import '+name)
 },module,module.exports,global.Worker)
 return module.exports
}
const interpolation=compile('../src/shared/videoCharacterInterpolation.ts')
const geometry=compile('../src/renderer/src/features/videoStudio/pixiGachaPoseGeometry.ts',
  {'../../../../shared/videoCharacterInterpolation':interpolation})
const {stripGachaPoseTextures,interpolateGachaPoseGeometry,restoreGachaPoseTextures}=geometry
function pose(x,rotation,asset){
 const main={id:'body',name:'body',x:30,y:35,width:60,height:110,rotation:0,dataUrl:'data:body'}
 const hand={id:'arm',name:'arm',x,y:55,width:20,height:60,rotation,dataUrl:asset,
   jointAnchor:{x:x+10,y:85}}
 return {width:180,height:220,parts:[main,hand],layerOrder:['body','arm'],
   joints:[{id:'joint',parentPartId:'body',childPartId:'arm',
     parentAnchor:{x:70,y:85},childAnchor:{x:x+10,y:85}}]}
}
test('Worker receives no authored PNGs/chroma backing assets and matches canonical joint constraints',()=>{
 const from=pose(95,350,'data:arm-A'),to=pose(105,10,'data:arm-B')
 const strippedFrom=stripGachaPoseTextures(from),strippedTo=stripGachaPoseTextures(to)
 assert.equal(strippedFrom.parts[1].dataUrl,'')
 assert.ok(!JSON.stringify(strippedFrom).includes('data:arm'))
 assert.equal(from.parts[1].dataUrl,'data:arm-A')
 const geometryFrame=interpolateGachaPoseGeometry(strippedFrom,strippedTo,.25)
 const output=restoreGachaPoseTextures(from,to,.25,geometryFrame)
 const canonical=interpolation.mixPoseArtwork(from,to,.25)
 assert.equal(output.parts[1].dataUrl,'data:arm-A')
 assert.deepEqual(output.parts.map(p=>[p.id,p.x,p.y,p.width,p.height,p.rotation,p.jointAnchor]),
   canonical.parts.map(p=>[p.id,p.x,p.y,p.width,p.height,p.rotation,p.jointAnchor]))
 assert.deepEqual(output.joints,canonical.joints)
 assert.equal(output.parts[1].name,'arm')
 const right=restoreGachaPoseTextures(from,to,.75,
    interpolateGachaPoseGeometry(strippedFrom,strippedTo,.75))
 assert.equal(right.parts[1].dataUrl,'data:arm-B')
})
test('invalid geometry progress is rejected instead of projecting NaN into GPU transforms',()=>{
 const from=stripGachaPoseTextures(pose(0,0,'a'))
 for(const v of [NaN,Infinity,-.001,1.01])assert.throws(()=>interpolateGachaPoseGeometry(from,from,v),/inválido/)
})
class FakeWorker {
 listeners=new Map()
 requests=[]
 terminated=false
 addEventListener(kind,fn){this.listeners.set(kind,fn)}
 removeEventListener(kind){this.listeners.delete(kind)}
 postMessage(data){this.requests.push(data)}
 terminate(){this.terminated=true}
 respond(data){this.listeners.get('message')?.({data})}
}
test('pose Worker client sends image-free endpoints only once, receives numeric frames and rejects canceled stale seek',async()=>{
 const worker=new FakeWorker()
 const client=compile('../src/renderer/src/features/videoStudio/pixiGachaPoseGeometrySession.ts',{
  './pixiGachaPoseGeometry':geometry,
 }).PixiGachaPoseGeometrySession
 const from=pose(95,350,'data:arm-A'),to=pose(105,10,'data:arm-B')
 const session=new client(from,to,worker)
 assert.equal(worker.requests.length,1)
 assert.ok(!JSON.stringify(worker.requests[0]).includes('data:arm-A'))
 worker.respond({kind:'ready',session:1})
 assert.equal(session.initialized,true)
 const previous=session.interpolate(.25)
 const req=worker.requests[1]
 const abort=new AbortController()
 const canceled=session.interpolate(.5,abort.signal)
 const cancelReq=worker.requests[2]
 abort.abort(new Error('seek'))
 await assert.rejects(canceled,/seek/)
 // A late old request may be delivered but cannot repaint a stale seek.
 worker.respond({kind:'result',session:1,request:cancelReq.request,geometry:{}})
 const strippedFrom=stripGachaPoseTextures(from),strippedTo=stripGachaPoseTextures(to)
 worker.respond({kind:'result',session:1,request:req.request,
   geometry:interpolateGachaPoseGeometry(strippedFrom,strippedTo,.25)})
 const result=await previous
 assert.equal(result.parts[1].dataUrl,'data:arm-A')
 assert.equal(result.parts.length,2)
 const pending=session.interpolate(.8)
 session.dispose()
 await assert.rejects(pending,/seek|substituída/)
 assert.equal(worker.terminated,true)
 assert.equal(worker.listeners.size,0)
 await assert.rejects(session.interpolate(.4),/descartado/)
})
