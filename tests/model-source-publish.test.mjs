import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publishModelSource, validateModelSourceImage } from '../electron/domains/fabricator/modelSource.ts'

const testPng = (width = 24, height = 24) => {
  const bytes = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes)
  bytes.write('IHDR', 12, 'ascii')
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return 'data:image/png;base64,' + bytes.toString('base64')
}

const request = {
  sourceDataUrl: testPng(),
  changedAssets: [{id:'torso',dataUrl:testPng()}],
  project: {
    schemaVersion:1,slot:1,name:'Modelo',sourceName:'folha.png',sourceAssetName:'source-aaaa1111.png',
    width:24,height:24,tolerance:70,updatedAt:'2026-10-22T12:00:00.000Z',
    joints:[],parts:[{id:'torso',name:'Torso',x:0,y:0,width:24,height:24,rotation:0}]
  }
}

test('validação de PNG exige dimensões corretas e limite de memória', () => {
  assert.equal(validateModelSourceImage(testPng(),24,24).readUInt32BE(16),24)
  assert.throws(() => validateModelSourceImage(testPng(),20,24),/Dimensões/)
  assert.throws(() => validateModelSourceImage('data:image/png;base64,AAAA',24,24),/PNG/)
  assert.throws(() => validateModelSourceImage(testPng(8000,8000),8000,8000),/Dimensões/)
})

test('publicação mantém fonte antiga em backup oculto e atualiza somente slot oficial', async t => {
  const home = await mkdtemp(join(tmpdir(),'native-model-source-'))
  t.after(() => rm(home,{recursive:true,force:true}))
  const slot=join(home,'slot-1')
  await mkdir(join(slot,'parts'),{recursive:true})
  await writeFile(join(slot,'source-aaaa1111.png'),'OLD_PIXELS')
  await writeFile(join(slot,'project.json'),JSON.stringify({ sourceFile:'source-aaaa1111.png' }))
  await writeFile(join(slot,'parts','torso.png'),'OLD_PART')
  const filename=await publishModelSource(request,()=>slot,async (project,assets,destination)=>{
    assert.notEqual(destination,slot)
    assert.equal(assets.length,1)
    await writeFile(join(destination,'parts','torso.png'),'NEW_PART')
    await writeFile(join(destination,'project.json'),JSON.stringify({...project,sourceFile:project.sourceAssetName}))
  })
  assert.match(filename,/^source-[a-f0-9-]+\.png$/)
  assert.equal((JSON.parse(await readFile(join(slot,'project.json'),'utf8'))).sourceFile,filename)
  assert.equal((await readFile(join(slot,'parts','torso.png'),'utf8')),'NEW_PART')
  const names=await readdir(home)
  const backup=names.find(name=>name.startsWith('.model-source-backup-1-'))
  assert.ok(backup)
  assert.equal((await readFile(join(home,backup,'source-aaaa1111.png'),'utf8')),'OLD_PIXELS')
})

test('falha de staging preserva projeto e partes originais',async t=>{
  const home=await mkdtemp(join(tmpdir(),'native-model-source-fail-'))
  t.after(()=>rm(home,{recursive:true,force:true}))
  const slot=join(home,'slot-1')
  await mkdir(join(slot,'parts'),{recursive:true})
  await writeFile(join(slot,'project.json'),JSON.stringify({sourceFile:'source-aaaa1111.png'}))
  await writeFile(join(slot,'parts','torso.png'),'ORIGINAL')
  await assert.rejects(publishModelSource(request,()=>slot,async()=>{throw new Error('falhou')}),/falhou/)
  assert.equal(await readFile(join(slot,'parts','torso.png'),'utf8'),'ORIGINAL')
  assert.equal(JSON.parse(await readFile(join(slot,'project.json'),'utf8')).sourceFile,'source-aaaa1111.png')
  assert.equal((await readdir(home)).length,1)
})

test('usa o adaptador injetado do armazenamento, sem acesso nativo implícito', async t => {
  const home = await mkdtemp(join(tmpdir(), 'native-model-source-adapter-'))
  t.after(() => rm(home, {recursive:true,force:true}))
  const slot = join(home, 'slot-1')
  await mkdir(join(slot,'parts'), {recursive:true})
  await writeFile(join(slot,'project.json'),JSON.stringify({sourceFile:'source-aaaa1111.png'}))
  await writeFile(join(slot,'parts','torso.png'),'ORIGINAL')
  const fs = await import('node:fs/promises')
  const calls = []
  const adapter = Object.fromEntries(['mkdir','readFile','writeFile','readdir','rename','rm'].map(name => [
    name, async (...args) => { calls.push(name); return fs[name](...args) }
  ]))
  await publishModelSource(request, () => slot, async (next,assets,destination) => {
    assert.equal(next.parts.length, 1)
    await adapter.writeFile(join(destination,'parts','torso.png'),'NEW')
    await adapter.writeFile(join(destination,'project.json'),JSON.stringify({...next, sourceFile:next.sourceAssetName}))
  },adapter)
  assert.ok(calls.includes('readdir'))
  assert.ok(calls.includes('readFile'))
  assert.ok(calls.includes('rename'))
  assert.equal(await readFile(join(slot,'parts','torso.png'),'utf8'),'NEW')
})

test('recusa peças duplicadas, identificadores inseguros e PNGs inválidos antes do acesso ao disco', async () => {
  const refuse = async (requestWithInvalidData, pattern) => {
    let accessed = false
    await assert.rejects(publishModelSource(requestWithInvalidData, () => {
      accessed = true
      throw new Error('Não deveria abrir o slot')
    }, async () => { throw new Error('Não deveria salvar') }), pattern)
    assert.equal(accessed, false)
  }
  await refuse({ ...request, project: {...request.project, parts:[{...request.project.parts[0],id:'../escape'}]},
    changedAssets:[{id:'../escape',dataUrl:testPng()}] }, /Peça duplicada, insegura/)
  await refuse({...request,changedAssets:[{id:'torso',dataUrl:'data:image/png;base64,AAAA'}]},/PNG/)
  await refuse({...request,project:{...request.project,tolerance:900}},/Manifesto ou recortes/)
  await refuse({...request,project:{...request.project,parts:[request.project.parts[0],request.project.parts[0]]},
    changedAssets:[{id:'torso',dataUrl:testPng()},{id:'torso',dataUrl:testPng()}]}, /Peça duplicada, insegura/)
})
