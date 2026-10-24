import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { recoverModelSourceSlot } from '../electron/domains/fabricator/modelSourceRecovery.ts'
const require=createRequire(import.meta.url)
let sqlite
try { require('better-sqlite3');sqlite={
  DataPlatform:require('../electron/dataPlatform.cjs').DataPlatform,
  DomainFileSystem:require('../electron/domainFileSystem.cjs').DomainFileSystem
}}catch { /* dependência nativa opcional para CI Linux */ }
const modes=['after-backup','after-commit']
for(const phase of modes)test('SQLite restart real: '+phase,{skip:!sqlite},async t=>{
  const root=await fs.realpath(await fs.mkdtemp(join(tmpdir(),'native-crash-sqlite-')))
  t.after(()=>fs.rm(root,{recursive:true,force:true}))
  const slot=join(root,'profile','fabricator','models','slot-1')
  function open(){
    const catalog=new sqlite.DataPlatform(join(root,'app-data')).initialize()
    catalog.setDomainState('fabricator.models','active',{crashTest:true})
    const io=new sqlite.DomainFileSystem(catalog,join(root,'profile'))
    const files=Object.fromEntries(['mkdir','readFile','writeFile','readdir','rename','rm'].map(k=>[k,(...args)=>io[k](...args)]))
    return {catalog,files}
  }
  const setup=open()
  await setup.files.mkdir(join(slot,'parts'),{recursive:true})
  await setup.files.writeFile(join(slot,'project.json'),JSON.stringify({
    schemaVersion:1,slot:1,name:'Modelo',sourceName:'old.png',
    sourceFile:'source-aaaa1111.png',sourceAssetName:'source-aaaa1111.png',
    width:24,height:24,tolerance:74,updatedAt:'2026-10-22T12:00:00Z',
    joints:[],parts:[{id:'head',name:'Cabeça',x:0,y:0,width:24,height:24,rotation:0}]
  }))
  await setup.files.writeFile(join(slot,'source-aaaa1111.png'),Buffer.from('OLD_SOURCE'))
  await setup.files.writeFile(join(slot,'parts','head.png'),Buffer.from('OLD_PART'))
  // Salvos antes do crash; Model Source não pode alterar snapshots ou outro perfil.
  const pose=join(root,'profile','fabricator','poses','model-1','slot-1')
  const wardrobe=join(root,'profile','fabricator','wardrobe','model-1','set-legacy')
  await setup.files.mkdir(join(pose,'parts'),{recursive:true})
  await setup.files.mkdir(join(wardrobe,'parts'),{recursive:true})
  const preserved=[
    [join(pose,'pose.json'),JSON.stringify({schemaVersion:1,slot:1,sourceModelSlot:1,parts:[{id:'head'}]})],
    [join(pose,'parts','head.png'),'POSE_SNAPSHOT'],
    [join(wardrobe,'wardrobe.json'),JSON.stringify({schemaVersion:1,id:'legacy',modelSlot:1,components:[{id:'coat'}]})],
    [join(wardrobe,'parts','coat.png'),'OUTFIT_SNAPSHOT']
  ]
  for(const [path,data] of preserved)await setup.files.writeFile(path,data)
  const secondProfile=join(root,'independent-profile','fabricator','models','slot-1')
  await fs.mkdir(secondProfile,{recursive:true})
  await fs.writeFile(join(secondProfile,'project.json'),JSON.stringify({schemaVersion:1,slot:1,name:'Outro perfil'}))
  const secondBefore=await fs.readFile(join(secondProfile,'project.json'))
  setup.catalog.close()
  const result=spawnSync(process.execPath,['--experimental-strip-types',
    resolve('scripts/fabricator/crash-model-source-sqlite.mjs'),root,phase],
    {encoding:'utf8',timeout:25000,env:{...process.env}})
  assert.equal(result.status,93,result.stderr || result.error?.message || 'Processo não caiu')
  const restarted=open()
  try{
    const recovery=await recoverModelSourceSlot(1,()=>slot,restarted.files)
    assert.equal(recovery,phase==='after-backup'?'restored':'intact')
    const manifest=JSON.parse(await restarted.files.readFile(join(slot,'project.json'),'utf8'))
    const data=(await restarted.files.readFile(join(slot,'parts','head.png'))).toString()
    assert.equal(data,phase==='after-backup'?'OLD_PART':'NEW')
    if(phase==='after-backup')assert.equal(manifest.sourceFile,'source-aaaa1111.png')
    else assert.match(manifest.sourceFile,/^source-[a-f0-9-]+\.png$/)
    for(const [path,data] of preserved)assert.equal((await restarted.files.readFile(path)).toString(),data)
    assert.deepEqual(await fs.readFile(join(secondProfile,'project.json')),secondBefore)
    assert.equal(await recoverModelSourceSlot(1,()=>slot,restarted.files),'intact')
    for(const [path,data] of preserved)assert.equal((await restarted.files.readFile(path)).toString(),data)
  }finally{ restarted.catalog.close() }
})
