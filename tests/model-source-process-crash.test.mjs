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
  }finally{ restarted.catalog.close() }
})
