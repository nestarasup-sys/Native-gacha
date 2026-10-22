/** Processo-filho do teste de queda real SQLite.
 * Nenhum perfil de usuário: somente o root temporário recebido do processo pai.
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { publishModelSource } from '../../electron/domains/fabricator/modelSource.ts'
const require=createRequire(import.meta.url)
const { DataPlatform }=require('../../electron/dataPlatform.cjs')
const { DomainFileSystem }=require('../../electron/domainFileSystem.cjs')
const [root,phase]=process.argv.slice(2)
if(!root || !['after-backup','after-commit'].includes(phase))throw Error('Crash phase inválida.')
const catalog=new DataPlatform(join(root,'app-data')).initialize()
catalog.setDomainState('fabricator.models','active',{crashTest:true})
const io=new DomainFileSystem(catalog,join(root,'profile'))
const actual=Object.fromEntries(['mkdir','readFile','writeFile','readdir','rename','rm']
  .map(method=>[method,(...args)=>io[method](...args)]))
const fs={...actual,rename:async(from,to)=>{
  await actual.rename(from,to)
  if(phase==='after-backup' && from.endsWith('slot-1')
    || phase==='after-commit' && from.includes('.model-source-stage-')){
    // Exit imediato sem hooks/finally e sem fechar o SQLite: simulamos queda.
    process.exit(93)
  }
}}
const bytes=Buffer.alloc(24)
Buffer.from('89504e470d0a1a0a','hex').copy(bytes)
bytes.write('IHDR',12,'ascii');bytes.writeUInt32BE(24,16);bytes.writeUInt32BE(24,20)
const img='data:image/png;base64,'+bytes.toString('base64')
const request={
  project:{schemaVersion:1,slot:1,name:'Modelo',sourceName:'old.png',
    sourceAssetName:'source-aaaa1111.png',width:24,height:24,
    tolerance:74,updatedAt:'2026-10-22T12:00:00Z',
    joints:[],parts:[{id:'head',name:'Cabeça',x:0,y:0,width:24,height:24,rotation:0}]},
  sourceDataUrl:img,changedAssets:[{id:'head',dataUrl:img}]
}
const slot=join(root,'profile','fabricator','models','slot-1')
const save=async(project,_assets,stage)=>{
  await fs.mkdir(join(stage,'parts'),{recursive:true})
  await fs.writeFile(join(stage,'parts','head.png'),Buffer.from('NEW'))
  await fs.writeFile(join(stage,'project.json'),JSON.stringify({...project,sourceFile:project.sourceAssetName}))
}
await publishModelSource(request,()=>slot,save,fs)
throw Error('O processo deveria ter terminado no checkpoint de falha.')
