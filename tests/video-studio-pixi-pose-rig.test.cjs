'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const interpSource = fs.readFileSync(path.resolve(__dirname, '../src/shared/videoCharacterInterpolation.ts'), 'utf8')
const interpModule = {exports:{}}
new Function('require','module','exports',ts.transpile(interpSource,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}))(
  name=>{throw Error('Unexpected dependency '+name)},interpModule,interpModule.exports)
const filename = '../src/renderer/src/features/videoStudio/pixiGachaPoseRig.ts'
const source = fs.readFileSync(path.resolve(__dirname, filename), 'utf8')
const gpuModule = {exports:{}}
new Function('require','module','exports',ts.transpile(source,{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}))(
  name=>{if(name==='../../../../shared/videoCharacterInterpolation')return interpModule.exports;throw Error(name)},gpuModule,gpuModule.exports)
const { PixiGachaPoseRig, orderedVisiblePoseParts }=gpuModule.exports
function fakePixi() {
  const stats={from:0,removes:0,destroys:0}
  class Container {
    children=[]
    addChild(sprite){this.children.push(sprite)}
    removeChildren(){stats.removes++;this.children=[]}
    destroy(){stats.destroys++}
  }
  class Sprite {
    constructor(texture){this.texture=texture;this.position={set:(x,y)=>{this.x=x;this.y=y}};this.anchor={set:(t)=>{this.pivot=t}}}
  }
  return {port:{Container,Sprite,Texture:{from:(url)=>{stats.from++;return {url}}}},stats}
}
const part=(id,x,rotation=0,asset='img:'+id)=>({id,x,y:20,width:30,height:40,rotation,dataUrl:asset})
const pose=(parts,layerOrder=parts.map(x=>x.id),hiddenPartIds=[])=>({width:300,height:300,parts,layerOrder,hiddenPartIds})
test('persistent Pixi rig updates a real articulated arm over 14 frames without rebuilding sprites or textures',()=>{
  const {port,stats}=fakePixi()
  const from=pose([part('body',50),part('arm',70,350)])
  const to=pose([part('body',50),part('arm',140,10)])
  const rig=new PixiGachaPoseRig(port)
  for(let frame=1;frame<=14;frame++)rig.setInterpolatedPose(from,to,frame/15)
  const s=rig.stats()
  assert.equal(s.spritesCreated,2)
  assert.equal(s.texturesCreated,2)
  assert.equal(s.poseUpdates,14)
  assert.equal(s.orderUpdates,1)
  assert.equal(stats.from,2)
  assert.equal(stats.removes,1)
  const arm=rig.stage.children[1]
  assert.ok(arm.x>70 && arm.x<170)
  assert.ok(arm.rotation>Math.PI*350/180 && arm.rotation<Math.PI*370/180)
  assert.equal(arm.pivot,.5)
  rig.dispose()
  assert.equal(stats.destroys,1)
  assert.equal(rig.stats().retainedSprites,0)
  assert.throws(()=>rig.setPose(from),/descartado/)
})
test('layer order and hidden parts match the canonical Canvas Gacha artwork ordering',()=>{
  const a=part('a',0),b=part('b',10),c=part('c',20)
  assert.deepEqual(orderedVisiblePoseParts(pose([a,b,c],['c','a','b'],['b'])).map(p=>p.id),['c','a'])
  const {port}=fakePixi(),rig=new PixiGachaPoseRig(port)
  rig.setPose(pose([a,b,c],['c','a','b'],['b']))
  assert.deepEqual(rig.stage.children.map(s=>s.texture.url),['img:c','img:a'])
  rig.setPose(pose([a,b,c],['c','a','b']))
  assert.deepEqual(rig.stage.children.map(s=>s.texture.url),['img:c','img:a','img:b'])
  assert.equal(rig.stats().orderUpdates,2)
  rig.dispose()
})
test('a changed texture for a part updates only that sprite; old versions are not repainted into the new sprite',()=>{
  const {port,stats}=fakePixi(),rig=new PixiGachaPoseRig(port)
  const first=pose([part('eyes',10,0,'eyes:open'),part('arm',25)])
  const second=pose([part('eyes',10,0,'eyes:closed'),part('arm',25)])
  rig.setPose(first)
  const original=rig.stage.children[0]
  rig.setPose(second)
  assert.strictEqual(original,rig.stage.children[0])
  assert.equal(original.texture.url,'eyes:closed')
  assert.equal(rig.stats().spritesCreated,2)
  assert.equal(rig.stats().texturesCreated,3)
  assert.equal(stats.from,3)
  rig.dispose()
})
test('same geometry with changing angles keeps the original sprite identity and correct degree-to-radian transform',()=>{
  const {port,stats}=fakePixi(),rig=new PixiGachaPoseRig(port)
  const a=pose([part('head',10,0)])
  const b=pose([part('head',10,90)])
  rig.setPose(a)
  const head=rig.stage.children[0]
  rig.setInterpolatedPose(a,b,.5)
  assert.equal(head.rotation,Math.PI/4)
  assert.equal(head.x,25)
  assert.equal(head.y,40)
  assert.equal(stats.from,1)
  rig.dispose()
})
