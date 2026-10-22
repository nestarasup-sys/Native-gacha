import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { publishJsonManifest } from '../electron/domains/storage/atomicManifest.ts'

async function fixture(t) {
  const folder=await fs.mkdtemp(join(tmpdir(),'native-atomic-manifest-'))
  t.after(()=>fs.rm(folder,{recursive:true,force:true}))
  const target=join(folder,'studio.json'),temporary=join(folder,'studio.json.tx.tmp')
  await fs.writeFile(target,JSON.stringify({schemaVersion:1,revision:'OLD'}))
  return {folder,target,temporary}
}
test('manifesto anterior permanece intacto em falha de promoção sem apagar outros perfis',async t=>{
  const {folder,target,temporary}=await fixture(t)
  const other=join(folder,'other-studio.json')
  await fs.writeFile(other,'UNCHANGED')
  const mock={...fs,rename:async()=>{const err=new Error('disk failure');err.code='EIO';throw err}}
  await assert.rejects(publishJsonManifest({
    files:mock,target,temporary,value:{schemaVersion:1,revision:'NEW'}
  }),/disk failure/)
  assert.equal(JSON.parse(await fs.readFile(target,'utf8')).revision,'OLD')
  assert.equal(await fs.readFile(other,'utf8'),'UNCHANGED')
  await assert.rejects(fs.access(temporary),{code:'ENOENT'})
})
test('retentativa Windows apenas para bloqueios transitórios; publica no máximo uma vez',async t=>{
  const {target,temporary}=await fixture(t)
  let count=0
  const delays=[]
  const mock={...fs,rename:async(from,to)=>{
    count++
    if(count<3){const err=new Error('busy');err.code='EPERM';throw err}
    return fs.rename(from,to)
  }}
  await publishJsonManifest({
    files:mock,target,temporary,platform:'win32',delay:async ms=>{delays.push(ms)},
    value:{schemaVersion:1,revision:'NEW'},indent:2
  })
  assert.equal(count,3)
  assert.deepEqual(delays,[20,40])
  assert.equal(JSON.parse(await fs.readFile(target,'utf8')).revision,'NEW')
  await assert.rejects(fs.access(temporary),{code:'ENOENT'})
})
test('callback pós-commit roda após o manifesto existir e paths temporários são limitados',async t=>{
  const {folder,target,temporary}=await fixture(t)
  let observed=null
  await publishJsonManifest({
    files:fs,target,temporary,value:{schemaVersion:1,revision:'FINAL'},
    afterCommit:async()=>{observed=JSON.parse(await fs.readFile(target,'utf8')).revision}
  })
  assert.equal(observed,'FINAL')
  await assert.rejects(publishJsonManifest({
    files:fs,target,temporary:join(folder,'..','outside.tmp'),value:{schemaVersion:1}
  }),/fora da pasta/)
  await assert.rejects(publishJsonManifest({files:fs,target,temporary:target,value:{schemaVersion:1}}),/fora da pasta/)
  assert.equal(JSON.parse(await fs.readFile(target,'utf8')).revision,'FINAL')
})

test('falha durante escrita parcial remove apenas temporário e preserva versão anterior', async t => {
  const { target, temporary } = await fixture(t)
  const partial = { ...fs, writeFile: async (file, data, encoding) => {
    await fs.writeFile(file, String(data).slice(0, 11), encoding)
    const error = new Error('write interrupted')
    error.code = 'EIO'
    throw error
  } }
  await assert.rejects(publishJsonManifest({
    files: partial, target, temporary, value: {schemaVersion:1,revision:'NEW'}
  }), /write interrupted/)
  assert.equal(JSON.parse(await fs.readFile(target,'utf8')).revision,'OLD')
  await assert.rejects(fs.access(temporary), {code:'ENOENT'})
})
