import test from 'node:test'
import assert from 'node:assert/strict'
import {
  snapshotStudioScene, withStudioSnapshot,
  studioCharacterRenderKey, studioElementSize
} from '../src/shared/studioSceneModel.ts'
import { selectRememberedCustomizerCharacter } from '../src/shared/customizerSelection.ts'

const BASE = {
  schemaVersion:1, id:'12345678-aaaa-4abc-8abc-123456789abc',
  title:'Cena', color:'#eee', createdAt:'2026-10-22T00:00:00Z',
  updatedAt:'2026-10-22T00:00:00Z', backgroundColor:'#fff',
  backgroundAssetId:null, backgroundX:0, backgroundY:0,
  backgroundWidth:100, backgroundHeight:100, backgroundRotation:0,
  assets:[], elements:[]
}
test('snapshot do Studio preserva campos e referências sem mutar a cena', () => {
  const primary=snapshotStudioScene(BASE)
  assert.equal(primary.assets,BASE.assets)
  assert.equal(primary.elements,BASE.elements)
  const edited=withStudioSnapshot(BASE,{...primary,backgroundX:42})
  assert.equal(edited.backgroundX,42)
  assert.equal(BASE.backgroundX,0)
  assert.equal(Date.parse(edited.updatedAt)>0,true)
})
test('tamanho de personagem distingue escala da transformação comum', () => {
  assert.deepEqual(studioElementSize({kind:'image',width:120,height:50}),{width:120,height:50})
  assert.deepEqual(studioElementSize({kind:'character',width:100,height:80,characterScale:150,characterWidthScale:80,characterHeightScale:50}),{width:120,height:60})
  assert.deepEqual(studioElementSize({kind:'character',width:100,height:80}),{width:100,height:80})
})
test('chave do personagem desconsidera expressão mas mantém pose e roupas', () => {
  const a={id:'abc',customization:{modelSlot:1,poseSlot:2,faceAppearance:{eyeState:1},wardrobeGroups:[{setId:'vestido'}]}}
  const b={...a,customization:{...a.customization,faceAppearance:{eyeState:2}}}
  const c={...a,customization:{...a.customization,poseSlot:3}}
  assert.equal(studioCharacterRenderKey(a),studioCharacterRenderKey(b))
  assert.notEqual(studioCharacterRenderKey(a),studioCharacterRenderKey(c))
})
test('seleção do Customizador preserva ID estável e fallback sem sobrescrever dados', () => {
  const chars=[{id:'first'},{id:'second'}]
  assert.equal(selectRememberedCustomizerCharacter(chars,'second'),'second')
  assert.equal(selectRememberedCustomizerCharacter(chars,'deleted'),'first')
  assert.equal(selectRememberedCustomizerCharacter([], 'deleted'),'')
  assert.deepEqual(chars,[{id:'first'},{id:'second'}])
})
