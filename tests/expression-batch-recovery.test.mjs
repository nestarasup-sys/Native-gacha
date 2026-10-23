import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { createExpressionBatchTransaction } from '../electron/domains/fabricator/expressionBatchTransaction.ts'

const preset=(id,revision)=>({schemaVersion:1,modelSlot:1,id,name:`Preset ${id}`,
  collectionId:'standard',expressionIndex:Number(id.slice(1)),selections:{},transforms:{},
  noseOpacity:1,updatedAt:revision})
async function fixture(t) {
  const root=await fs.mkdtemp(join(tmpdir(),'native-expression-batch-'))
  t.after(()=>fs.rm(root,{recursive:true,force:true}))
  const modelFolder=slot=>join(root,`model-${slot}`)
  const presetPath=(slot,id)=>join(modelFolder(slot),`preset-${id}.json`)
  const service=(files=fs)=>createExpressionBatchTransaction({
    files,modelFolder,presetPath,validModelSlot:slot=>slot===1,
    validPreset:(slot,item)=>item?.modelSlot===slot && item.schemaVersion===1 && typeof item.id==='string'
  })
  const original=Array.from({length:21},(_,i)=>preset(`p${i}`,'original'))
  const updated=original.map(item=>({...item,updatedAt:'new',name:item.name+' new'}))
  await fs.mkdir(modelFolder(1),{recursive:true})
  for(const item of original)await fs.writeFile(presetPath(1,item.id),JSON.stringify(item))
  return {root,modelFolder,presetPath,service,original,updated}
}
async function snapshot(fx){
  return Promise.all(fx.original.map(item=>fs.readFile(fx.presetPath(1,item.id),'utf8')))
}
const journal=fx=>join(fx.modelFolder(1),'.expression-batch-transaction')

test('21 expressões são publicadas juntas e comprovadas com journal limpo',async t=>{
  const fx=await fixture(t)
  await fx.service().save(1,fx.updated)
  const values=await Promise.all(fx.original.map(item=>fs.readFile(fx.presetPath(1,item.id),'utf8').then(JSON.parse)))
  assert.equal(values.length,21)
  assert.ok(values.every(item=>item.updatedAt==='new'))
  await assert.rejects(fs.access(journal(fx)),{code:'ENOENT'})
})

test('falha na expressão 11 desfaz todas as alterações e verifica byte a byte',async t=>{
  const fx=await fixture(t),before=await snapshot(fx)
  const files={...fs,rename:async(source,dest)=>{
    if(String(dest).endsWith('preset-p10.json') && String(source).endsWith('.batch-next.tmp'))throw Error('injecao na 11')
    return fs.rename(source,dest)
  }}
  await assert.rejects(fx.service(files).save(1,fx.updated),/injecao na 11/)
  assert.deepEqual(await snapshot(fx),before)
  await assert.rejects(fs.access(journal(fx)),{code:'ENOENT'})
  // Another operation can then write successfully without partial remnants.
  await fx.service().save(1,fx.updated)
  assert.ok((await snapshot(fx)).every(value=>JSON.parse(value).updatedAt==='new'))
})

test('falha também no rollback mantém journal recuperável e bloqueia troca de presets',async t=>{
  const fx=await fixture(t),before=await snapshot(fx)
  let failedWrite=false,failedRestore=false
  const files={...fs,rename:async(source,dest)=>{
    if(!failedWrite && String(source).endsWith('.batch-next.tmp') && String(dest).endsWith('preset-p6.json')){
      failedWrite=true;throw Error('falha primeira')
    }
    if(failedWrite && !failedRestore && String(source).endsWith('.batch-restore.tmp')){
      failedRestore=true;throw Error('falha restauro')
    }
    return fs.rename(source,dest)
  }}
  await assert.rejects(fx.service(files).save(1,fx.updated),/RESTAURAÇÃO INCOMPLETA/)
  assert.equal(failedRestore,true)
  await fs.access(join(journal(fx),'journal.json'))
  await fx.service().recover(1)
  assert.deepEqual(await snapshot(fx),before)
  await assert.rejects(fs.access(journal(fx)),{code:'ENOENT'})
})

test('backup corrompido falha fechado ANTES de restaurar qualquer preset',async t=>{
  const fx=await fixture(t)
  const dir=journal(fx)
  await fs.mkdir(dir)
  const entries=[{id:'p0',existed:true,sha256:'0'.repeat(64),nextSha256:'2'.repeat(64)},{id:'p1',existed:true,sha256:'1'.repeat(64),nextSha256:'3'.repeat(64)}]
  await fs.writeFile(join(dir,'journal.json'),JSON.stringify({schemaVersion:1,modelSlot:1,entries}))
  await fs.writeFile(join(dir,'p0.bak'),'bad')
  const before=await snapshot(fx)
  await assert.rejects(fx.service().recover(1),/Backup da expressão/)
  assert.deepEqual(await snapshot(fx),before)
  await fs.access(join(dir,'journal.json'))
})

test('lote duplicado ou inválido é recusado sem qualquer escrita',async t=>{
  const fx=await fixture(t),before=await snapshot(fx)
  await assert.rejects(fx.service().save(1,[fx.updated[0],fx.updated[0]]),/inválido/)
  await assert.rejects(fx.service().save(1,[{...fx.updated[0],id:'../escape'}]),/inválido/)
  await assert.rejects(fx.service().save(2,fx.updated),/Modelo/)
  assert.deepEqual(await snapshot(fx),before)
})

test('expressão nova criada durante lote é retirada se a transação falhar',async t=>{
  const fx=await fixture(t),before=await snapshot(fx)
  const novel=preset('p21','new')
  const files={...fs,rename:async(source,dest)=>{
    if(String(source).endsWith('.batch-next.tmp') && String(dest).endsWith('preset-p21.json'))
      throw Error('falha no preset novo')
    return fs.rename(source,dest)
  }}
  await assert.rejects(fx.service(files).save(1,[...fx.updated,novel]),/falha no preset novo/)
  assert.deepEqual(await snapshot(fx),before)
  await assert.rejects(fs.access(fx.presetPath(1,'p21')),{code:'ENOENT'})
})

test('caminho do renderer usa endpoint único; leituras passam pela fila serializada',async()=>{
  const [editor,main,preload,handlers]=await Promise.all([
    fs.readFile('src/renderer/src/features/fabricator/ExpressionPresetWorkspace.tsx','utf8'),
    fs.readFile('electron/main.ts','utf8'),
    fs.readFile('electron/preload.ts','utf8'),
    fs.readFile('electron/domains/fabricator/expressionIpc.ts','utf8')
  ])
  assert.match(editor,/saveFaceExpressionPresetBatch\(modelSlot, nextPresets\)/)
  assert.doesNotMatch(editor,/Promise\.allSettled\(nextPresets\.slice/)
  assert.match(main,/expressionBatch\.recover\(modelSlot\)/)
  assert.match(main,/queueExpressionWork\(/)
  assert.match(handlers,/fabricator:expression-presets:save-batch/)
  assert.match(main,/registerExpressionPresetHandlers\(/)
  assert.match(preload,/saveFaceExpressionPresetBatch:/)
})

test('queda de processo real no sexto preset é recuperada após reabrir a biblioteca',async t=>{
  const root=await fs.mkdtemp(join(tmpdir(),'native-expression-crash-'))
  t.after(()=>fs.rm(root,{recursive:true,force:true}))
  const modelFolder=slot=>join(root,`model-${slot}`)
  const presetPath=(slot,id)=>join(modelFolder(slot),`preset-${id}.json`)
  await fs.mkdir(modelFolder(1),{recursive:true})
  const originals=Array.from({length:21},(_,i)=>preset(`p${i}`,'original'))
  const bytes=originals.map(item=>JSON.stringify(item))
  await Promise.all(originals.map((item,i)=>fs.writeFile(presetPath(1,item.id),bytes[i])))
  const child=spawnSync(process.execPath,['--experimental-strip-types',
    resolve('scripts/fabricator/crash-expression-batch.mjs'),root],{encoding:'utf8',timeout:30000})
  assert.equal(child.status,96,child.stderr||child.error?.message||'Process did not hit checkpoint')
  assert.equal(JSON.parse(await fs.readFile(presetPath(1,'p0'),'utf8')).updatedAt,'new')
  const service=createExpressionBatchTransaction({files:fs,modelFolder,presetPath,
    validModelSlot:slot=>slot===1,validPreset:(slot,item)=>item?.modelSlot===slot})
  await service.recover(1)
  const after=await Promise.all(originals.map(item=>fs.readFile(presetPath(1,item.id),'utf8')))
  assert.deepEqual(after,bytes,'nenhum preset pessoal pode ficar parcialmente alterado')
  await service.recover(1)
  await assert.rejects(fs.access(join(modelFolder(1),'.expression-batch-transaction')),{code:'ENOENT'})
})
