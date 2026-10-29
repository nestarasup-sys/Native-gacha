import test from 'node:test'
import assert from 'node:assert/strict'
import {inspectFabricatorStorage} from '../src/shared/fabricatorStorageCompatibility.ts'
import {createFabricatorExpressionValidators} from '../electron/domains/fabricator/expressionValidation.ts'

const cases=[
 ['model',{schemaVersion:1,parts:[],joints:[]}],
 ['pose',{schemaVersion:1,parts:[],joints:[]}],
 ['animator',{schemaVersion:1,parts:[],frames:[]}],
 ['wardrobe',{schemaVersion:1,components:[]}],
 ['hair',{schemaVersion:1,transforms:{}}],
 ['hair-style',{schemaVersion:1,transforms:{}}],
 ['face',{schemaVersion:1,sheets:{},pieces:[]}],
 ['face-catalog',{schemaVersion:1,sheet:{},pieces:[]}],
 ['face-component',{schemaVersion:1,defaultTransform:{}}],
 ['expression',{schemaVersion:1,selections:{},transforms:{}}]
]
for(const [kind,legacy] of cases){
 test('compatibilidade: aceita '+kind+' legado sem regravar dados',()=>{
  const original=JSON.stringify(legacy)
  const result=inspectFabricatorStorage(kind,legacy)
  assert.equal(result.compatible,true)
  assert.equal(JSON.stringify(legacy),original)
  assert.equal(inspectFabricatorStorage(kind,{...legacy,schemaVersion:2}).compatible,false)
  assert.equal(inspectFabricatorStorage(kind,null).compatible,false)
 })
}
test('roupas edição 1, 2 e antiga sem edição continuam válidas',()=>{
 const base={schemaVersion:1,components:[]}
 for(const edition of [undefined,1,2])assert.equal(inspectFabricatorStorage('wardrobe',{...base,edition}).compatible,true)
 assert.equal(inspectFabricatorStorage('wardrobe',{...base,edition:3}).compatible,false)
})
test('modelo e poses recusam arrays enormes e nenhuma versão futura é atualizada automaticamente',()=>{
 const large=Array.from({length:501},()=>({id:'a'}))
 assert.equal(inspectFabricatorStorage('model',{schemaVersion:1,parts:large,joints:[]}).compatible,false)
 assert.equal(inspectFabricatorStorage('pose',{schemaVersion:1,parts:[],joints:large}).compatible,false)
})

const expressionValidators=createFabricatorExpressionValidators(slot=>Number.isInteger(slot)&&slot>=1&&slot<=10)
const expressionTimestamp='2026-10-29T12:00:00.000Z'
const faceTransform=()=>({x:0,y:0,scaleX:1,scaleY:1,rotation:0})
const expressionTransforms=()=>({
 eyeLeft:faceTransform(),eyeRight:faceTransform(),pupilLeft:faceTransform(),pupilRight:faceTransform(),
 browLeft:faceTransform(),browRight:faceTransform(),nose:faceTransform(),mouth:faceTransform()
})
const expressionSelections=()=>({
 eyes:{left:'eye-left',right:null},pupils:{left:'pupil-left',right:null},
 eyebrows:{left:null,right:null},nose:{catalogId:'nose-set',index:0,kind:'nose'},
 mouth:{catalogId:'mouth-set',index:1,kind:'mouth-open'}
})
const expressionEffects=()=>Object.fromEntries(['shadow','blush','mouthBlush'].map(key=>[key,{
 enabled:true,color:'#aa6688',opacity:0.5,softness:0.3,size:0.8,offsetY:0.1
}]))
const faceExpressionPreset=()=>({
 schemaVersion:1,id:'happy',modelSlot:1,name:'Feliz',collectionId:'standard',expressionIndex:1,
 selections:expressionSelections(),transforms:expressionTransforms(),
 portableMotion:{version:1,layers:{mouth:{dx:0,dy:0,sx:1,sy:1,rotation:0,flip:false}}},
 ptPupils:{left:{x:0,y:0,rotation:0}},ptPupilMotion:{version:1,layers:{left:{dx:0,dy:0,rotation:0}}},
 noseOpacity:0.8,effects:expressionEffects(),updatedAt:expressionTimestamp
})
const faceExpressionEntry=()=>({
 id:'draft',selections:expressionSelections(),transforms:expressionTransforms(),
 ptPupils:{left:{x:0,y:0,rotation:0}},noseOpacity:0.8,effects:expressionEffects()
})

test('validador de expressão preserva presets atuais e recusa campos fora dos limites',()=>{
 const preset=faceExpressionPreset()
 const original=JSON.stringify(preset)
 assert.equal(expressionValidators.validFaceExpressionPreset(1,preset),true)
 assert.equal(JSON.stringify(preset),original)
 assert.equal(expressionValidators.validFaceExpressionPreset(11,preset),false)
 assert.equal(expressionValidators.validFaceExpressionPreset(1,{...preset,noseOpacity:1.01}),false)
 assert.equal(expressionValidators.validFaceExpressionPreset(1,{
  ...preset,transforms:{...preset.transforms,mouth:{...preset.transforms.mouth,scaleX:0}}
 }),false)
 assert.equal(expressionValidators.validFaceExpressionPreset(1,{
  ...preset,selections:{...preset.selections,mouth:{catalogId:'mouth-set',index:21,kind:'mouth-open'}}
 }),false)
 assert.equal(expressionValidators.validFaceExpressionPreset(1,{
  ...preset,portableMotion:{version:1,layers:{mouth:{dx:0,dy:0,sx:0,sy:1,rotation:0,flip:false}}}
 }),false)
})

test('validador de rascunho verifica seleção, cópias de trabalho e limite de entradas',()=>{
 const draft={
  schemaVersion:1,modelSlot:1,selectedCollectionId:'standard',selectedExpressionIndex:0,
  current:faceExpressionEntry(),workingCopies:{'standard:1':faceExpressionEntry()},
  customExpressionNames:{'standard:2':'Feliz 2'},updatedAt:expressionTimestamp
 }
 assert.equal(expressionValidators.validFaceExpressionWorkspaceDraft(1,draft),true)
 assert.equal(expressionValidators.validFaceExpressionWorkspaceDraft(1,{...draft,selectedExpressionIndex:1000}),false)
 assert.equal(expressionValidators.validFaceExpressionWorkspaceDraft(1,{
  ...draft,workingCopies:Object.fromEntries(Array.from({length:1001},(_,index)=>[`standard:${index}`,faceExpressionEntry()]))
 }),false)
 assert.equal(expressionValidators.validFaceExpressionWorkspaceDraft(1,{
  ...draft,customExpressionNames:{'standard:2':'   '}
 }),false)
})
