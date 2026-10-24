import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { publishModelSource } from '../electron/domains/fabricator/modelSource.ts'
import { recoverModelSourceSlot } from '../electron/domains/fabricator/modelSourceRecovery.ts'
import { createModelSourceJournal, verifyModelSourceCommit } from '../electron/domains/fabricator/modelSourceJournal.ts'

function png(){
 const bytes=Buffer.alloc(24)
 Buffer.from('89504e470d0a1a0a','hex').copy(bytes)
 bytes.write('IHDR',12,'ascii')
 bytes.writeUInt32BE(24,16); bytes.writeUInt32BE(24,20)
 return 'data:image/png;base64,'+bytes.toString('base64')
}
const t0='2026-10-22T10:00:00Z'
const project=sourceFile=>({
 schemaVersion:1,slot:1,name:'Fonte contínua',sourceName:'old.png',
 sourceAssetName:sourceFile,width:24,height:24,tolerance:74,updatedAt:t0,
 joints:[],parts:[{id:'head',name:'Cabeça',x:0,y:0,width:24,height:24,rotation:0}]
})
async function fixture(t){
 const root=await fs.mkdtemp(join(tmpdir(),'native-journal-chain-'))
 t.after(()=>fs.rm(root,{recursive:true,force:true}))
 const slot=join(root,'slot-1')
 await fs.mkdir(join(slot,'parts'),{recursive:true})
 await fs.writeFile(join(slot,'project.json'),JSON.stringify({...project('source-aaaaaaaa.png'),sourceFile:'source-aaaaaaaa.png'}))
 await fs.writeFile(join(slot,'source-aaaaaaaa.png'),Buffer.from('ORIGINAL'))
 await fs.writeFile(join(slot,'parts','head.png'),Buffer.from('OLD'))
 return {root,slot}
}
const save=async(model,assets,folder)=>{
 await fs.mkdir(join(folder,'parts'),{recursive:true})
 await fs.writeFile(join(folder,'parts','head.png'),Buffer.from(assets[0].id))
 await fs.writeFile(join(folder,'project.json'),JSON.stringify({...model,sourceFile:model.sourceAssetName}))
}
test('journal aceita origem antiga e identifica nomes sem aceitar traversal',()=>{
 const tx='01234567-89ab-cdef-0123-456789abcdef'
 const record=createModelSourceJournal(1,tx,'source-aabbccdd.webp','source-aabbccdd.png')
 assert.equal(record.backup,'.model-source-backup-1-'+tx)
 assert.throws(()=>createModelSourceJournal(1,tx,'../../secret','source-aabbccdd.png'),/inválida/)
 assert.throws(()=>createModelSourceJournal(1,tx,'source-aabbccdd.png','source-aabbccdd.png'),/inválida/)
})
test('publicações múltiplas verificam staging e commit, recuperações repetidas não revertem fonte',async t=>{
 const {root,slot}=await fixture(t)
 let source='source-aaaaaaaa.png'
 for(let i=0;i<3;i++){
  source=await publishModelSource({
   project:project(source),sourceDataUrl:png(),changedAssets:[{id:'head',dataUrl:png()}]
  },()=>slot,save,fs)
  await verifyModelSourceCommit(slot,source,fs)
  assert.equal(await recoverModelSourceSlot(1,()=>slot,fs),'intact')
  assert.equal(await recoverModelSourceSlot(1,()=>slot,fs),'intact')
  await assert.rejects(fs.access(join(root,'.model-source-pending-1.json')),{code:'ENOENT'})
 }
 assert.equal((await fs.readdir(root)).filter(x=>x.startsWith('.model-source-backup-1-')).length,3)
 assert.equal(JSON.parse(await fs.readFile(join(slot,'project.json'),'utf8')).sourceFile,source)
})
test('não move slot original se o staging não contém todos os PNGs',async t=>{
 const {slot}=await fixture(t)
 const corruptSave=async(model,_assets,stage)=>{
  await fs.writeFile(join(stage,'project.json'),JSON.stringify({...model,sourceFile:model.sourceAssetName}))
  await fs.rm(join(stage,'parts','head.png'))
 }
 await assert.rejects(publishModelSource({
   project:project('source-aaaaaaaa.png'),sourceDataUrl:png(),changedAssets:[{id:'head',dataUrl:png()}]
 },()=>slot,corruptSave,fs),/ENOENT/)
 assert.equal(JSON.parse(await fs.readFile(join(slot,'project.json'),'utf8')).sourceFile,'source-aaaaaaaa.png')
 assert.equal(await fs.readFile(join(slot,'parts','head.png'),'utf8'),'OLD')
})
test('reinício depois de commit completo limpa apenas marcador pendente, não backup nem slot',async t=>{
 const {root,slot}=await fixture(t)
 const next=await publishModelSource({
   project:project('source-aaaaaaaa.png'),sourceDataUrl:png(),changedAssets:[{id:'head',dataUrl:png()}]
 },()=>slot,save,fs)
 const backup=(await fs.readdir(root)).find(name=>name.startsWith('.model-source-backup-1-'))
 const tx=backup.slice('.model-source-backup-1-'.length)
 await fs.writeFile(join(root,'.model-source-pending-1.json'),JSON.stringify(
   createModelSourceJournal(1,tx,'source-aaaaaaaa.png',next)
 ))
 assert.equal(await recoverModelSourceSlot(1,()=>slot,fs),'intact')
 await assert.rejects(fs.access(join(root,'.model-source-pending-1.json')),{code:'ENOENT'})
 await fs.access(join(root,backup,'project.json'))
 assert.equal(JSON.parse(await fs.readFile(join(slot,'project.json'),'utf8')).sourceFile,next)
})
