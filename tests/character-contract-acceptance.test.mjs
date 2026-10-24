import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CustomizerCharacterRepository } from '../electron/domains/customizer/repository.ts'
import { selectCharacterArtwork,auditCharacterContinuity } from '../src/shared/characterSourceContinuity.ts'

const when='2026-10-23T03:00:00.000Z'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const img=tag=>'data:image/png;base64,'+Buffer.from(tag).toString('base64')
const part=(id,tag)=>({id,name:id,x:10,y:22,width:40,height:60,rotation:0,dataUrl:img(tag)})
const model={schemaVersion:1,slot:1,name:'Modelo de origem',sourceName:'old.png',
  sourceAssetName:'source-test.png',sourceDataUrl:img('model source'),width:256,height:384,
  tolerance:80,updatedAt:when,parts:[part('body','model-body'),part('head','model-head')],joints:[]}
const pose={schemaVersion:1,slot:1,sourceModelSlot:1,name:'Pose montada',
  sourceModelUpdatedAt:when,updatedAt:when,parts:[part('body','pose-body'),part('head','pose-head')],joints:[]}
const outfit={schemaVersion:1,id:'pants',modelSlot:1,name:'Calça',modelName:'Modelo de origem',
  updatedAt:when,components:[{id:'thigh-l',name:'Coxa esquerda',category:'calca-coxa',
    attachedPartId:'body',x:10,y:18,width:44,height:50,rotation:0,dataUrl:img('thigh-l')}]}
const oldCharacter={
  id:'legacy-gacha',name:'Personagem antigo',hair:'#101010',outfit:'#888888',skin:'#eabb96',
  createdAt:when,updatedAt:when,
  customization:{modelSlot:1,poseSlot:1,partOverrides:{},layerOrder:[],
    wardrobeColors:{base:'#e1b7e2'},wardrobeGroups:[{
      modelSlot:1,setId:'pants',category:'cinto-saia-1',
      offsetX:3,offsetY:2,scaleX:1,scaleY:1,rotation:0
    }]}
}
const modernCharacter={
  id:'modern-gacha',name:'Personagem atual',hair:'#101010',outfit:'#888888',skin:'#eabb96',
  createdAt:when,updatedAt:when,customization:{
    modelSlot:1,poseSlot:1,partOverrides:{head:{y:9,rotation:5}},layerOrder:['body','head'],
    wardrobeGroups:[{modelSlot:1,setId:'pants',category:'calca',componentId:'thigh-l',
      offsetX:9,offsetY:-3,scaleX:1.1,scaleY:.95,rotation:12}],
    hairAppearance:{modelSlot:1,styleId:'hair1',frontStyleId:'hair1',backStyleId:'hair1',
      colors:{base:'#776655'}},
    faceAppearance:{modelSlot:1,eyeState:0,eyebrows:true,noseIndex:0,expressionIndex:0,mouthOpen:false,
      components:{'eye-left':{assetId:'eye1',transform:{x:35,y:65,scaleX:1.2,scaleY:1,rotation:8}}},
      noseCatalogId:'nose1',mouthClosedCatalogId:'mouth1'}
  }}
test('reabrir personagens antigos e atuais preserva pose/catálogos sem duplicar PNGs',async t=>{
  const root=await fs.mkdtemp(join(tmpdir(),'native-contract-'))
  t.after(()=>fs.rm(root,{recursive:true,force:true}))
  const rootFabricator=join(root,'fabricator')
  const manifests=[
    ['models/slot-1/project.json',model],['poses/model-1/slot-1/pose.json',pose],
    ['wardrobe/model-1/set-pants/wardrobe.json',outfit],
    ['hair/model-1/styles/style-hair1/hair-style.json',{schemaVersion:1,id:'hair1',modelSlot:1}],
    ['faces/model-1/catalog/item-nose1/face.json',{schemaVersion:1,id:'nose1',modelSlot:1}]
  ]
  const images=[
    ['models/slot-1/parts/head.png','MODEL_HEAD_ORIGINAL'],
    ['poses/model-1/slot-1/parts/head.png','POSE_HEAD_SNAPSHOT'],
    ['wardrobe/model-1/set-pants/parts/thigh-l.png','PANTS_ORIGINAL'],
    ['hair/model-1/styles/style-hair1/images/front.png','HAIR_ORIGINAL'],
    ['faces/model-1/catalog/item-nose1/images/nose.png','FACE_ORIGINAL']
  ]
  for(const [path,value] of manifests){
    const dest=join(rootFabricator,path);await fs.mkdir(join(dest,'..'),{recursive:true})
    await fs.writeFile(dest,JSON.stringify(value))
  }
  for(const [path,value] of images){
    const dest=join(rootFabricator,path);await fs.mkdir(join(dest,'..'),{recursive:true})
    await fs.writeFile(dest,value)
  }
  const before=await Promise.all([...manifests,...images].map(async([path])=>sha(await fs.readFile(join(rootFabricator,path)))))
  const target=join(root,'customizer','characters','characters.json')
  await fs.mkdir(join(root,'customizer','characters'),{recursive:true})
  await fs.writeFile(target,JSON.stringify([oldCharacter,modernCharacter]))
  const repository=()=>new CustomizerCharacterRepository(()=>target,fs,[],()=> 'new-character',()=>when)
  const [legacy,modern]=await repository().list()
  assert.equal(legacy.customization.wardrobeGroups[0].category,'cinto')
  assert.equal(legacy.customization.wardrobeGroups[0].colors.base,'#e1b7e2')
  assert.equal(modern.customization.faceAppearance.components['eye-left'].assetId,'eye1')
  assert.equal(modern.customization.hairAppearance.styleId,'hair1')
  const updated={...modern,updatedAt:'2026-10-23T03:10:00.000Z',customization:{
    ...modern.customization,partOverrides:{...modern.customization.partOverrides,head:{y:20,rotation:15}}}}
  await repository().save([legacy,updated])
  const loaded=await repository().list()
  assert.deepEqual(loaded[1],updated)
  assert.equal(loaded[0].id,'legacy-gacha')
  assert.equal(loaded[1].customization.wardrobeGroups[0].offsetX,9)
  assert.deepEqual(selectCharacterArtwork(model,pose,updated.customization.poseSlot),pose)
  assert.deepEqual(auditCharacterContinuity(model,pose,[outfit]),{
    compatible:true,hasOlderPoseSnapshot:false,missingAttachments:[],missingPosePieces:[]
  })
  const after=await Promise.all([...manifests,...images].map(async([path])=>sha(await fs.readFile(join(rootFabricator,path)))))
  assert.deepEqual(after,before,'alterar e reabrir o personagem não reescreve biblioteca Fabricador/pose/roupas')
  await assert.rejects(fs.access(target+'.backup'),{code:'ENOENT'})
})
test('Studio consome snapshot do personagem, mas modificações do ator não alteram o Customizador',()=>{
  const frozen=structuredClone(modernCharacter)
  const actor={id:'scene-actor',kind:'character',characterId:modernCharacter.id,
    faceAppearance:structuredClone(modernCharacter.customization.faceAppearance),poseSlot:1,
    activeExpressionPresetId:'angry',activeExpressionGaze:'left'}
  const changed={...actor,faceAppearance:{...actor.faceAppearance,noseOpacity:.5},poseSlot:2}
  assert.notDeepEqual(changed.faceAppearance,frozen.customization.faceAppearance)
  assert.deepEqual(modernCharacter,frozen)
  assert.deepEqual(selectCharacterArtwork(model,{...pose,sourceModelSlot:2},1),null)
})
