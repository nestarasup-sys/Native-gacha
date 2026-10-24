import test from 'node:test'
import assert from 'node:assert/strict'
import {inspectFabricatorStorage} from '../src/shared/fabricatorStorageCompatibility.ts'

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
