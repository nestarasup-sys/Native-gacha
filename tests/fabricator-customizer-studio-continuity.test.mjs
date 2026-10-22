import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { selectCharacterArtwork, auditCharacterContinuity, isPoseSnapshotForModel } from '../src/shared/characterSourceContinuity.ts'
import { selectOriginalModelSource, selectMountedModelSource } from '../src/shared/fabricatorModelViews.ts'

const pic = 'data:image/png;base64,U05BUFNIT1Q='
function model() {
  return {
    schemaVersion:1, slot:1,name:'Original',sourceName:'old.png',
    sourceAssetName:'source-aaaaaaaa.png',sourceDataUrl:pic, width:256,height:384,
    tolerance:74,updatedAt:'2026-10-22T08:00:00Z',joints:[],layerOrder:['body','head'],
    hiddenPartIds:[],parts:[
      {id:'body',name:'Corpo',x:70,y:120,width:100,height:200,rotation:0,dataUrl:pic,sourceTransform:{x:1,y:121,width:100,height:200,rotation:0}},
      {id:'head',name:'Cabeça',x:100,y:25,width:66,height:83,rotation:0,dataUrl:pic,sourceTransform:{x:180,y:5,width:66,height:83,rotation:0}}
    ]
  }
}
function pose(source) {
  return {
    schemaVersion:1,slot:1,name:'Pose montada',sourceModelSlot:source.slot,
    sourceModelName:source.name,sourceModelUpdatedAt:source.updatedAt,
    width:source.width,height:source.height,updatedAt:source.updatedAt,
    category:'Parado',parts:selectMountedModelSource(source).parts,
    joints:[],layerOrder:['body','head'],hiddenPartIds:[]
  }
}
const outfit=()=>({
  schemaVersion:1,id:'coat',modelSlot:1,modelName:'Original',name:'Jaqueta',
  width:256,height:384,updatedAt:'2026-10-22T08:00:00Z',
  components:[{id:'sleeve',name:'Manga',category:'camisa',attachedPartId:'body',
    x:75,y:120,width:60,height:100,rotation:0,dataUrl:pic}]
})
test('alterar Model Source muda a folha, mas não reescreve pose ou roupa do personagem',()=>{
 const old=model()
 const savedPose=pose(old)
 const savedOutfit=outfit()
 const frozenPose=structuredClone(savedPose)
 const frozenOutfit=structuredClone(savedOutfit)
 const updated={...old,sourceAssetName:'source-bbbbbbbb.png',updatedAt:'2026-10-22T10:00:00Z',
   sourceDataUrl:'data:image/png;base64,TkVXLVNPVVJDRQ==',
   parts:old.parts.map(part=>part.id==='head'?{
    ...part,sourceTransform:{...part.sourceTransform,x:190,width:70},dataUrl:'data:image/png;base64,TkVX'}
   :part)}
 assert.equal(selectOriginalModelSource(updated).parts[1].x,190)
 assert.equal(selectCharacterArtwork(updated,savedPose,1).parts[1].x,100)
 assert.equal(selectCharacterArtwork(updated,null,null).sourceAssetName,'source-bbbbbbbb.png')
 const audit=auditCharacterContinuity(updated,savedPose,[savedOutfit])
 assert.equal(audit.compatible,true)
 assert.equal(audit.hasOlderPoseSnapshot,true)
 assert.deepEqual(audit.missingAttachments,[])
 assert.deepEqual(audit.missingPosePieces,[])
 assert.deepEqual(savedPose,frozenPose)
 assert.deepEqual(savedOutfit,frozenOutfit)
})
test('Customizer e Studio rejeitam uma pose de outro slot ou modelo, sem usar PNG errado',()=>{
 const m=model()
 const p=pose(m)
 assert.equal(isPoseSnapshotForModel(p,1,1),true)
 assert.equal(isPoseSnapshotForModel(p,2,1),false)
 assert.equal(selectCharacterArtwork(m,{...p,sourceModelSlot:2},1),null)
 assert.equal(selectCharacterArtwork(m,{...p,slot:2},1),null)
 assert.equal(selectCharacterArtwork(m,null,1),null)
})
test('auditoria mostra anexos órfãos sem apagar roupas ou snapshot antigo',()=>{
 const m=model();const p=pose(m)
 const original=structuredClone(p)
 const o=outfit();o.components.push({...o.components[0],id:'scarf',attachedPartId:'missing'})
 const result=auditCharacterContinuity(m,p,[o])
 assert.deepEqual(result.missingAttachments,['scarf'])
 assert.deepEqual(p,original)
})
test('telas Customizador e Studio usam a barreira de continuidade compartilhada',async()=>{
 const customizer=await readFile('src/renderer/src/features/customizer/CustomizerPage.tsx','utf8')
 const studio=await readFile('src/renderer/src/features/studio/StudioPage.tsx','utf8')
 assert.match(customizer,/selectCharacterArtwork\(sourceProject, poseArtwork, pose\?\.slot \?\? null\)/)
 assert.match(studio,/isPoseSnapshotForModel\(artwork, pose.sourceModelSlot, pose.slot\)/)
})
