const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const ts = require('typescript')

const file = resolve('src/renderer/src/features/fabricator/models/modelSource.ts')
const compiled = ts.transpileModule(readFileSync(file,'utf8'), {
  compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText
const mod={exports:{}}
new Function('exports','module','require',compiled)(mod.exports,mod,(specifier) => {
  if (specifier === './resize') return { isHeadPart: part => /cabe[çc]a|head/i.test(part.name) }
  throw new Error('Import inesperado no domínio: ' + specifier)
})
const {sourceRect,validateModelSourceDimensions,validateModelSourceChroma}=mod.exports
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

test('somente a cabeça pode ser reposicionada na fonte, sem mover montagem',()=>{
  const model=fixture()
  const original={...model.parts[0]}
  assert.doesNotThrow(()=>validateModelSourceDimensions(model,{cabeca:{x:85,y:10,width:80,height:80}}))
  assert.deepEqual(sourceRect(model.parts[0],{x:85,y:10,width:80,height:80}),{x:85,y:10,width:80,height:80})
  assert.deepEqual(model.parts[0],original)
  assert.throws(()=>validateModelSourceDimensions(model,{torso:{x:160,y:70,width:120,height:180}}),/Somente a cabeça/)
  assert.throws(()=>validateModelSourceDimensions(model,{cabeca:{x:175,y:60,width:80,height:80}}),/invadir/)
})

test('chroma configurável permite intervalo 0–280',()=>{
  for(const n of [0,74,280]) assert.doesNotThrow(()=>validateModelSourceChroma(n))
  for(const n of [-1,281,1.5,NaN]) assert.throws(()=>validateModelSourceChroma(n),/Chroma Key/)
})
