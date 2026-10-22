import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { publishModelSource } from '../electron/domains/fabricator/modelSource.ts'
import { recoverModelSourceSlot } from '../electron/domains/fabricator/modelSourceRecovery.ts'
const require = createRequire(import.meta.url)
const png = () => {
  const b=Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a','hex').copy(b)
  b.write('IHDR',12,'ascii');b.writeUInt32BE(24,16);b.writeUInt32BE(24,20)
  return 'data:image/png;base64,'+b.toString('base64')
}
const project = {
  schemaVersion:1,slot:1,name:'Chaostest',sourceName:'original.png',
  sourceAssetName:'source-aaaa1111.png',width:24,height:24,tolerance:70,
  updatedAt:'2026-10-22T12:00:00.000Z',joints:[],
  parts:[{id:'head',name:'Cabeça',x:0,y:0,width:24,height:24,rotation:0}]
}
const request={project,sourceDataUrl:png(),changedAssets:[{id:'head',dataUrl:png()}]}
const save = async(p,assets,stage,files)=>{
  await files.mkdir(join(stage,'parts'),{recursive:true})
  await files.writeFile(join(stage,'parts','head.png'),Buffer.from('UPDATED'))
  await files.writeFile(join(stage,'project.json'),JSON.stringify({...p,sourceFile:p.sourceAssetName}),'utf8')
}
function adapter(underlying, decide){
  let calls=0
  return Object.fromEntries(['mkdir','readFile','writeFile','readdir','rename','rm'].map(method=>[
    method,async(...args)=>{
      calls++
      if(decide?.(method,args,calls))throw Object.assign(new Error('INJECTED_'+method),{code:'EIO'})
      return underlying[method](...args)
    }
  ]))
}
async function fixture(t){
  const root=await mkdtemp(join(tmpdir(),'native-source-chaos-'))
  t.after(()=>fs.rm(root,{recursive:true,force:true}))
  const slot=join(root,'slot-1')
  await fs.mkdir(join(slot,'parts'),{recursive:true})
  await fs.writeFile(join(slot,'project.json'),JSON.stringify({...project,sourceFile:project.sourceAssetName}))
  await fs.writeFile(join(slot,'source-aaaa1111.png'),'ORIGINAL')
  await fs.writeFile(join(slot,'parts','head.png'),'OLD')
  return {root,slot}
}
for(const [label,inject] of [
  ['writing-staged-png',(method,args)=>method==='writeFile' && String(args[0]).includes('.model-source-stage-') && /^source-[0-9a-f-]+\.png$/.test(String(args[0]).split(/[\\/]/).at(-1))],
  ['renaming-official-slot',(method,args)=>method==='rename' && String(args[0]).endsWith('slot-1')],
  ['renaming-staging',(method,args)=>method==='rename' && String(args[0]).includes('.model-source-stage-')]
]){
 test('arquivo: falha injetada em '+label+' não publica manifesto parcial',async t=>{
   const {slot}=await fixture(t)
   const files=adapter(fs,inject)
   await assert.rejects(publishModelSource(request,()=>slot,(p,a,d)=>save(p,a,d,files),files),/INJECTED_/)
   assert.equal(JSON.parse(await fs.readFile(join(slot,'project.json'),'utf8')).sourceFile,project.sourceAssetName)
   assert.equal(await fs.readFile(join(slot,'parts','head.png'),'utf8'),'OLD')
 })
}
test('arquivo: falha de staging E de rollback permite recuperar backup transacional',async t=>{
 const {slot}=await fixture(t)
 const files=adapter(fs,(method,args)=>method==='rename' && (
   String(args[0]).includes('.model-source-stage-') ||
   String(args[0]).includes('.model-source-backup-')
 ))
 await assert.rejects(publishModelSource(request,()=>slot,(p,a,d)=>save(p,a,d,files),files),/INJECTED_/)
 assert.equal(await recoverModelSourceSlot(1,()=>slot,fs),'restored')
 assert.equal(await fs.readFile(join(slot,'parts','head.png'),'utf8'),'OLD')
})
let sqlite
try { require('better-sqlite3'); sqlite = {DataPlatform:require('../electron/dataPlatform.cjs').DataPlatform,DomainFileSystem:require('../electron/domainFileSystem.cjs').DomainFileSystem} }
catch { /* CI sem builds nativos: integração SQLite precisa npm install completo no Windows. */ }
test('SQLite ativo: publicar no DomainFileSystem com a mesma semântica de backup', { skip:!sqlite }, async t=>{
 const root=await mkdtemp(join(tmpdir(),'native-source-sqlite-'))
 t.after(()=>fs.rm(root,{recursive:true,force:true}))
 const dataRoot=join(root,'app-data')
 const profile=join(root,'profile')
 const catalog=new sqlite.DataPlatform(dataRoot).initialize()
 t.after(()=>catalog.close())
 catalog.setDomainState('fabricator.models','active',{fixture:true})
 const adapterInstance=new sqlite.DomainFileSystem(catalog,profile)
 const files=Object.fromEntries(['mkdir','readFile','writeFile','readdir','rename','rm'].map(key=>[key,(...args)=>adapterInstance[key](...args)]))
 const slot=join(profile,'fabricator','models','slot-1')
 await files.mkdir(join(slot,'parts'),{recursive:true})
 await files.writeFile(join(slot,'project.json'),JSON.stringify({...project,sourceFile:project.sourceAssetName}))
 await files.writeFile(join(slot,'source-aaaa1111.png'),Buffer.from('ORIGINAL'))
 await files.writeFile(join(slot,'parts','head.png'),Buffer.from('OLD'))
 const version=await publishModelSource(request,()=>slot,(p,a,d)=>save(p,a,d,files),files)
 assert.match(version,/^source-/)
 assert.equal(JSON.parse(await files.readFile(join(slot,'project.json'),'utf8')).sourceFile,version)
 assert.equal((await files.readFile(join(slot,'parts','head.png'))).toString(),'UPDATED')
 const injected=adapter(files,(method,args)=>method==='rename' && String(args[0]).includes('.model-source-stage-'))
 await assert.rejects(publishModelSource({
   ...request,project:{...request.project,sourceAssetName:version}
 },()=>slot,(p,a,d)=>save(p,a,d,injected),injected),/INJECTED_/)
 assert.equal(JSON.parse(await files.readFile(join(slot,'project.json'),'utf8')).sourceFile,version)
 assert.equal((await files.readFile(join(slot,'parts','head.png'))).toString(),'UPDATED')
})
