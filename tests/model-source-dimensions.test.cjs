import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const file = resolve('src/renderer/src/features/fabricator/models/modelSource.ts')
const compiled = ts.transpileModule(readFileSync(file,'utf8'), {
  compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText
const mod={exports:{}}
new Function('exports','module',compiled)(mod.exports,mod)
const {sourceRect,validateModelSourceDimensions}=mod.exports
const part=(id,x,y,width,height)=>({id,name:id,x,y,width,height,rotation:0,dataUrl:'data:image/png;base64,',sourceTransform:{x,y,width,height,rotation:0}})
const fixture=()=>({width:400,height:300,parts:[part('cabeca',20,20,80,80),part('torso',170,60,120,180)]})

test('dimensão de origem não usa posição da montagem alterada',()=>{
  const p=part('torso',170,60,120,180)
  p.x=18;p.y=210
  assert.deepEqual(sourceRect(p),{x:170,y:60,width:120,height:180})
})

test('rejeita recortes que ultrapassariam a folha',()=>{
  const model=fixture()
  assert.throws(()=>validateModelSourceDimensions(model,{cabeca:{width:600,height:80}}),/caber dentro/)
  assert.throws(()=>validateModelSourceDimensions(model,{cabeca:{width:-1,height:80}}),/caber dentro/)
})

test('rejeita expansão de peça sobre outra peça',()=>{
  const model=fixture()
  assert.throws(()=>validateModelSourceDimensions(model,{cabeca:{width:220,height:80}}),/invadir/)
  assert.doesNotThrow(()=>validateModelSourceDimensions(model,{cabeca:{width:110,height:65}}))
})

test('nunca permite mudar ID desconhecido ou ultrapassar limite de pixels',()=>{
  assert.throws(()=>validateModelSourceDimensions(fixture(),{desconhecido:{width:30,height:30}}),/não pertence/)
  assert.throws(()=>validateModelSourceDimensions({...fixture(),width:10000,height:4000},{}),/32 milhões/)
})
