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
const makeDoc=(title='Cena',videoTimeline=undefined)=>({
  schemaVersion:1,id,title,color:'#aabbcc',createdAt:'2026-10-22T08:00:00.000Z',
  updatedAt:'2026-10-22T08:00:00.000Z',
  backgroundColor:'#ffffff',backgroundAssetId:asset,
  backgroundX:0,backgroundY:0,backgroundWidth:100,backgroundHeight:100,backgroundRotation:0,
  assets:[{id:asset,category:'background',name:'Teste',mimeType:'image/png',dataUrl:'data:image/png;base64,'+pixel.toString('base64')}],
  elements:[],...(videoTimeline?{videoTimeline}:{})
})
async function setup(t,overrides={}){
  const root=await fs.mkdtemp(join(tmpdir(),'native-studio-document-'))
  t.after(()=>fs.rm(root,{recursive:true,force:true}))
  const studioPath=(sid,workspace)=>join(root,workspace,'studio-'+sid)
  let ensureCalls=0
  const deps={
    files:fs,studioPath,
    studioLibraryPath:workspace=>join(root,workspace),
    prepareVideoDelete:async()=>{ensureCalls++},
    validate:value=>value?.schemaVersion===1,
    decodeImage:dataUrl=>Buffer.from(dataUrl.slice(dataUrl.indexOf(',')+1),'base64'),
    normalizeImage:async bytes=>({bytes}),
    ensureVideoAssets:async()=>{ensureCalls++},
    videoStudioCardSummary:(value,sid)=>({id:sid,title:value.title,color:value.color,createdAt:value.createdAt,updatedAt:value.updatedAt}),
    ...overrides
  }
  return {root,studioPath,persistence:createStudioDocumentPersistence(deps),getEnsureCalls:()=>ensureCalls}
}
test('Studio grava e reidrata documento e PNG com hash idêntico no perfil isolado',async t=>{
  const {persistence,studioPath}=await setup(t)
  await persistence.writeStudio(makeDoc())
  const raw=JSON.parse(await fs.readFile(join(studioPath(id,'studio'),'studio.json'),'utf8'))
  assert.equal(raw.assets[0].dataUrl,undefined)
  const stored=await fs.readFile(join(studioPath(id,'studio'),'assets','backgrounds',asset+'.png'))
  assert.equal(createHash('sha256').update(stored).digest('hex'),createHash('sha256').update(pixel).digest('hex'))
  const restored=await persistence.readStudio(id,'studio')
  assert.equal(restored?.assets[0]?.dataUrl,'data:image/png;base64,'+pixel.toString('base64'))
  assert.equal(restored?.title,'Cena')
  assert.equal(await persistence.readStudio(other,'studio'),null)
  await assert.rejects(persistence.readStudio('../', 'studio'),/Identificador de Studio inválido/)
})
test('salvar Video Studio gera card leve e preserva quadro por hash entre leituras',async t=>{
  const {persistence,studioPath,getEnsureCalls}=await setup(t)
  const frame=Buffer.from('frame-data')
  const original='data:image/png;base64,'+frame.toString('base64')
  const state={element:{kind:'character',id,characterId:id,assetId:asset,x:0,y:0,width:100,height:100,rotation:0,zIndex:1},imageDataUrl:original}
  const timeline={
    schemaVersion:1,frameRate:60,durationFrames:120,playheadFrame:0,playing:false,
    videoAssets:[{id:other}],
    characterBases:{[id]:state},characterKeys:[{id:'frame',elementId:id,frame:0,state:{...state},poseSlot:null,expressionCollectionId:null,expressionPresetId:null,faceMode:'idle'}],
    textClips:[],saveMarkers:[]
  }
  await persistence.writeStudio(makeDoc('Clip',timeline),'video')
  assert.equal(getEnsureCalls(),1)
  const root=studioPath(id,'video')
  const raw=JSON.parse(await fs.readFile(join(root,'studio.json'),'utf8'))
  const hash=createHash('sha256').update(frame).digest('hex')
  assert.equal(raw.videoTimeline.characterBases[id].imageDataUrl,'@video-frame:'+hash)
  assert.equal((await fs.readFile(join(root,'assets','video-frames',hash+'.png'))).toString(),'frame-data')
  assert.equal(JSON.parse(await fs.readFile(join(root,'studio-card.json'),'utf8')).title,'Clip')
  for(let i=0;i<2;i++){
    const restored=await persistence.readStudio(id,'video')
    assert.equal(restored?.videoTimeline?.characterBases?.[id].imageDataUrl,original)
    assert.equal(restored?.videoTimeline?.characterKeys[0].state.imageDataUrl,original)
  }
})
test('falha antes da promoção do manifesto não altera a versão anterior nem outros projetos',async t=>{
  let fail=false
  const mock={...fs,rename:async(from,to)=>{
    if(fail && to.endsWith('studio.json')) {const err=new Error('crash antes da promoção');err.code='EIO';throw err}
    return fs.rename(from,to)
  }}
  const {persistence,studioPath}=await setup(t,{files:mock})
  await persistence.writeStudio(makeDoc('VERSAO_ANTIGA'))
  await fs.mkdir(studioPath(other,'studio'),{recursive:true})
  await fs.writeFile(join(studioPath(other,'studio'),'sentinel'),'outro perfil intacto')
  fail=true
  await assert.rejects(persistence.writeStudio(makeDoc('VERSAO_NOVA')),/crash antes/)
  const raw=JSON.parse(await fs.readFile(join(studioPath(id,'studio'),'studio.json'),'utf8'))
  assert.equal(raw.title,'VERSAO_ANTIGA')
  assert.equal(await fs.readFile(join(studioPath(other,'studio'),'sentinel'),'utf8'),'outro perfil intacto')
  const temp=(await fs.readdir(studioPath(id,'studio'))).filter(x=>x.includes('studio.json.')&&x.endsWith('.tmp'))
  assert.deepEqual(temp,[])
})

test('remoção de Studio protege outros projetos e exige ID válido',async t=>{
  const {persistence,studioPath,getEnsureCalls}=await setup(t)
  await persistence.writeStudio(makeDoc('Excluível'))
  await fs.mkdir(studioPath(other,'studio'),{recursive:true})
  await fs.writeFile(join(studioPath(other,'studio'),'sentinel'),'KEEP')
  await assert.rejects(persistence.removeStudio('../','studio'),/Identificador de Studio inválido/)
  await persistence.removeStudio(id,'studio')
  await assert.rejects(fs.access(studioPath(id,'studio')),{code:'ENOENT'})
  assert.equal(await fs.readFile(join(studioPath(other,'studio'),'sentinel'),'utf8'),'KEEP')
  assert.equal(getEnsureCalls(),0)
})
test('remoção de Video Studio consulta biblioteca antes de excluir',async t=>{
  const {persistence,studioPath,getEnsureCalls}=await setup(t)
  await fs.mkdir(studioPath(id,'video'),{recursive:true})
  await persistence.removeStudio(id,'video')
  assert.equal(getEnsureCalls(),1)
  await assert.rejects(fs.access(studioPath(id,'video')),{code:'ENOENT'})
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
 const reading=persistence.readStudio(id,'studio')
 gate.release()
 await Promise.all([old,fresh])
 assert.equal((await reading)?.title,'versao-2')
 assert.equal((await persistence.readStudio(id,'studio'))?.title,'versao-2')
})
test('IPC serializa remoção com salvamento no mesmo ID, não toca biblioteca do outro workspace',async t=>{
 const {persistence,studioPath}=await setup(t)
 await persistence.writeStudio(makeDoc('video-preservado'),'video')
 const tasks=[persistence.writeStudio(makeDoc('primeiro'),'studio'),
   persistence.writeStudio(makeDoc('segundo'),'studio')]
 await Promise.all(tasks)
 assert.equal((await persistence.readStudio(id,'studio'))?.title,'segundo')
 const removing=persistence.removeStudio(id,'studio')
 const savedVideo=await persistence.readStudio(id,'video')
 assert.equal(savedVideo?.title,'video-preservado')
 await removing
 assert.equal(await persistence.readStudio(id,'studio'),null)
 assert.equal((await fs.readFile(join(studioPath(id,'video'),'studio.json'),'utf8')).includes('video-preservado'),true)
})
