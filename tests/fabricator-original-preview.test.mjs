import test from 'node:test'
import assert from 'node:assert/strict'
import { selectMountedModelSource, selectOriginalModelSource, projectForOriginalPreview } from '../src/shared/fabricatorModelViews.ts'

const fixture=()=>({
  slot:1,name:'Modelo',sourceName:'source.png',sourceDataUrl:'data:image/png;base64,',
  sourceAssetName:'source-1234abcd.png',width:256,height:256,tolerance:74,updatedAt:'2026-10-22T12:00:00Z',
  parts:[{
    id:'head',name:'Cabeça',x:100,y:80,width:80,height:72,rotation:15,
    dataUrl:'data:image/png;base64,UElYRUw=',
    jointAnchor:{x:130,y:140},sourceTransform:{x:8,y:12,width:62,height:58,rotation:0}
  }],joints:[{id:'neck',childPartId:'head',parentPartId:'body',fixed:true}],
  layerOrder:['head'],hiddenPartIds:[]
})
test('editores DEV apresentam a imagem-base sem gravar sobre a montagem',()=>{
 const model=fixture()
 const snapshot=structuredClone(model)
 const preview=projectForOriginalPreview(model)
 assert.deepEqual(preview.parts.map(x=>({x:x.x,y:x.y,width:x.width,height:x.height,rotation:x.rotation})),[
   {x:8,y:12,width:62,height:58,rotation:0}
 ])
 assert.deepEqual(selectOriginalModelSource(model).parts.map(x=>[x.x,x.y]),[[8,12]])
 assert.deepEqual(selectMountedModelSource(model).parts.map(x=>[x.x,x.y]),[[100,80]])
 assert.equal(preview.joints.length,1)
 assert.equal(preview.joints[0].childPartId,'head')
 assert.deepEqual(model,snapshot)
})
test('legado sem sourceTransform permanece renderizável e não é mutado',()=>{
 const model=fixture();delete model.parts[0].sourceTransform
 const preview=projectForOriginalPreview(model)
 assert.equal(preview.parts[0].x,100)
 assert.equal(preview.parts[0].y,80)
 assert.notEqual(preview.parts[0],model.parts[0])
 assert.equal(projectForOriginalPreview(null),null)
})
test('as versões de imagem ficam atreladas ao PNG publicado',()=>{
 const model=fixture()
 const first=projectForOriginalPreview(model)
 const next=projectForOriginalPreview({...model,sourceAssetName:'source-9999abcd.png'})
 assert.notEqual(first.sourceAssetName,next.sourceAssetName)
})
