import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { createStudioDocumentPersistence } from '../electron/domains/studio/documentPersistence.ts'

const id='12345678-aaaa-4abc-8abc-123456789abc'
const other='12345678-aaaa-4abc-8abc-123456789abd'
const asset='12345678-aaaa-4abc-8abc-123456789abe'
const pixel=Buffer.from('test-image-bytes')
const makeDoc=(title='Cena',documentId=id)=>({
  schemaVersion:1,id:documentId,title,color:'#aabbcc',createdAt:'2026-10-22T08:00:00.000Z',
  updatedAt:'2026-10-22T08:00:00.000Z',
  backgroundColor:'#ffffff',backgroundAssetId:asset,
  backgroundX:0,backgroundY:0,backgroundWidth:100,backgroundHeight:100,backgroundRotation:0,
  assets:[{id:asset,category:'background',name:'Teste',mimeType:'image/png',dataUrl:'data:image/png;base64,'+pixel.toString('base64')}],
  elements:[]
})
async function setup(t,overrides={}){
  const root=await fs.mkdtemp(join(tmpdir(),'native-studio-document-'))
  t.after(()=>fs.rm(root,{recursive:true,force:true}))
  const libraryPath=join(root,'studios','Studio Principal')
  const studioPath=(sid)=>join(libraryPath,'studio-'+sid)
  const deps={
    files:fs,studioPath,
    studioLibraryPath:()=>libraryPath,
    validate:value=>value?.schemaVersion===1,
    decodeImage:dataUrl=>Buffer.from(dataUrl.slice(dataUrl.indexOf(',')+1),'base64'),
    normalizeImage:async bytes=>({bytes}),
    ...overrides
  }
  return {root,studioPath,persistence:createStudioDocumentPersistence(deps)}
}
test('Studio grava e reidrata documento e PNG com hash idêntico no perfil isolado',async t=>{
  const {persistence,studioPath}=await setup(t)
  await persistence.writeStudio(makeDoc())
  const raw=JSON.parse(await fs.readFile(join(studioPath(id),'studio.json'),'utf8'))
  assert.equal(raw.assets[0].dataUrl,undefined)
  const stored=await fs.readFile(join(studioPath(id),'assets','backgrounds',asset+'.png'))
  assert.equal(createHash('sha256').update(stored).digest('hex'),createHash('sha256').update(pixel).digest('hex'))
  const restored=await persistence.readStudio(id)
  assert.equal(restored?.assets[0]?.dataUrl,'data:image/png;base64,'+pixel.toString('base64'))
  assert.equal(restored?.title,'Cena')
  assert.equal(await persistence.readStudio(other),null)
  await assert.rejects(persistence.readStudio('../'),/Identificador de Studio inválido/)
})
test('falha antes da promoção do manifesto não altera a versão anterior nem outros projetos',async t=>{
  let fail=false
  const mock={...fs,rename:async(from,to)=>{
    if(fail && to.endsWith('studio.json')) {const err=new Error('crash antes da promoção');err.code='EIO';throw err}
    return fs.rename(from,to)
  }}
  const {persistence,studioPath}=await setup(t,{files:mock})
  await persistence.writeStudio(makeDoc('VERSAO_ANTIGA'))
  await fs.mkdir(studioPath(other),{recursive:true})
  await fs.writeFile(join(studioPath(other),'sentinel'),'outro projeto intacto')
  fail=true
  await assert.rejects(persistence.writeStudio(makeDoc('VERSAO_NOVA')),/crash antes/)
  const raw=JSON.parse(await fs.readFile(join(studioPath(id),'studio.json'),'utf8'))
  assert.equal(raw.title,'VERSAO_ANTIGA')
  assert.equal(await fs.readFile(join(studioPath(other),'sentinel'),'utf8'),'outro projeto intacto')
  const temp=(await fs.readdir(studioPath(id))).filter(x=>x.includes('studio.json.')&&x.endsWith('.tmp'))
  assert.deepEqual(temp,[])
})

test('remoção de Studio protege outros projetos e exige ID válido',async t=>{
  const {persistence,studioPath}=await setup(t)
  await persistence.writeStudio(makeDoc('Excluível'))
  await fs.mkdir(studioPath(other),{recursive:true})
  await fs.writeFile(join(studioPath(other),'sentinel'),'KEEP')
  await assert.rejects(persistence.removeStudio('../'),/Identificador de Studio inválido/)
  await persistence.removeStudio(id)
  await assert.rejects(fs.access(studioPath(id)),{code:'ENOENT'})
  assert.equal(await fs.readFile(join(studioPath(other),'sentinel'),'utf8'),'KEEP')
})

test('IPC concorrente: salvar v1 lenta, salvar v2 e ler reabertura nunca restauram v1',async t=>{
 const gate={release:null}
 const firstBlocked=new Promise(resolve=>{gate.release=resolve})
 let notify
 const entered=new Promise(resolve=>{notify=resolve})
 let writes=0
 const files={...fs,writeFile:async(file,data,...options)=>{
   if(String(file).endsWith(asset+'.png') && writes++===0){
     notify()
     await firstBlocked
   }
   return fs.writeFile(file,data,...options)
 }}
 const {persistence}=await setup(t,{files})
 const old=persistence.writeStudio(makeDoc('versao-1'))
 await entered
 const fresh=persistence.writeStudio(makeDoc('versao-2'))
 const reading=persistence.readStudio(id)
 gate.release()
 await Promise.all([old,fresh])
 assert.equal((await reading)?.title,'versao-2')
 assert.equal((await persistence.readStudio(id))?.title,'versao-2')
})
test('IPC serializa remoção e salvamento no mesmo ID, sem apagar outro Studio',async t=>{
 const {persistence,studioPath}=await setup(t)
 await persistence.writeStudio({ ...makeDoc('Outro projeto',other), assets: [] })
 const saving=persistence.writeStudio(makeDoc('Atualizado'))
 const removing=persistence.removeStudio(id)
 await Promise.all([saving,removing])
 assert.equal(await persistence.readStudio(id),null)
 assert.equal((await persistence.readStudio(other))?.title,'Outro projeto')
 assert.equal(JSON.parse(await fs.readFile(join(studioPath(other),'studio.json'),'utf8')).title,'Outro projeto')
})
