import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { createRequire } from 'node:module'

const require=createRequire(import.meta.url)
const { verifyWorkspaceCaptures }=require('../scripts/fabricator/review-real-ui-captures.cjs')
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
async function fixture(t){
  const folder=await mkdtemp(join(tmpdir(),'native-workspace-shots-'))
  t.after(()=>rm(folder,{recursive:true,force:true}))
  const names=[
    ['Customizador','customizador.png'],
    ['Customizador','customizador-pose2.png'],
    ['Studio Principal — elenco salvo','studio.png'],
    ['Studio Principal — cena reaberta','studio-reaberto.png']
  ]
  const results=[]
  for (const [section,file] of names) {
    const bytes=await sharp({create:{width:360,height:260,channels:4,background:'#223344'}}).png().toBuffer()
    await writeFile(join(folder,file),bytes)
    results.push({section,file,dimensions:'360x260',sha256:hash(bytes)})
  }
  await writeFile(join(folder,'flow-state.json'),JSON.stringify({schemaVersion:1,syntheticOnly:true,characterId:'c-id',studioId:'s-id'}))
  await writeFile(join(folder,'wardrobe-pixels.json'),JSON.stringify({
    source:'customizer-overlay',
    colors:[{name:'coat',pixels:250,x:150,y:198},
      {name:'sleeve-left',pixels:175,x:110,y:210},
      {name:'sleeve-right',pixels:175,x:233,y:172}]
  }))
  await writeFile(join(folder,'wardrobe-hide-restore.json'),JSON.stringify({
    source:'customizer-overlay',syntheticOnly:true,poseSlot:1,
    checks:[{hidden:'sleeve-right',other:'sleeve-left',otherMovement:0,restoredMovement:0},
      {hidden:'sleeve-left',other:'sleeve-right',otherMovement:0,restoredMovement:0}]
  }))
  await writeFile(join(folder,'wardrobe-pose2-pixels.json'),JSON.stringify({
    source:'customizer-overlay',poseSlot:2,centroidMovement:48,
    colors:[{name:'coat',pixels:230,x:167,y:201},
      {name:'sleeve-left',pixels:160,x:121,y:219},
      {name:'sleeve-right',pixels:160,x:246,y:183}]
  }))
  await writeFile(join(folder,'electron-performance.json'),JSON.stringify({
    schemaVersion:1,syntheticOnly:true,source:'real-electron-renderer',
    poseOne:{sampledFps:59,frameP95Ms:19,rendererWorkingSetKb:42000,rendererPrivateKb:36000,jsHeapUsedBytes:20000000},
    poseTwo:{sampledFps:57,frameP95Ms:22,rendererWorkingSetKb:45000,rendererPrivateKb:null,jsHeapUsedBytes:null}
  }))
  await writeFile(join(folder,'workspace-manifest.json'),JSON.stringify({
    schemaVersion:1,mode:'real-electron-workspaces',syntheticOnly:true,results
  }))
  return {folder,results}
}
test('revisor exige screenshots Customizador e Studio com dimensões e hashes',async t=>{
  const {folder}=await fixture(t)
  assert.deepEqual(await verifyWorkspaceCaptures(folder),['customizador.png','customizador-pose2.png','studio.png','studio-reaberto.png'])
})
test('revisor recusa mudança de bytes e manifesto adulterado',async t=>{
  const {folder}=await fixture(t)
  await writeFile(join(folder,'studio.png'),Buffer.from('not a png'))
  await assert.rejects(verifyWorkspaceCaptures(folder),/unsupported image format|PNG|hash|Imagem/)
  const {folder:other}=await fixture(t)
  const path=join(other,'workspace-manifest.json')
  const m=JSON.parse(await readFile(path,'utf8'));m.syntheticOnly=false
  await writeFile(path,JSON.stringify(m))
  await assert.rejects(verifyWorkspaceCaptures(other),/incompleto/)
})

test('revisor recusa regressão dos offsets: duas mangas invertidas mesmo com PNGs válidos',async t=>{
  const {folder}=await fixture(t)
  const filepath=join(folder,'wardrobe-pixels.json')
  const m=JSON.parse(await readFile(filepath,'utf8'))
  m.colors[1].x=239
  await writeFile(filepath,JSON.stringify(m))
  await assert.rejects(verifyWorkspaceCaptures(folder),/Alinhamento visual X\/Y/)
})
test('revisor não aprova overlay ausente mesmo que a screenshot possua SHA256 válido',async t=>{
  const {folder}=await fixture(t)
  await rm(join(folder,'wardrobe-pixels.json'))
  await assert.rejects(verifyWorkspaceCaptures(folder),{code:'ENOENT'})
})

test('revisor exige pixels reais deslocados após troca para a segunda pose',async t=>{
  const {folder}=await fixture(t)
  const filename=join(folder,'wardrobe-pose2-pixels.json')
  const report=JSON.parse(await readFile(filename,'utf8'))
  report.centroidMovement=0
  await writeFile(filename,JSON.stringify(report))
  await assert.rejects(verifyWorkspaceCaptures(folder),/Segunda pose/)
})

test('revisor recusa amostras artificiais sem memória real do renderer',async t=>{
  const {folder}=await fixture(t)
  const filename=join(folder,'electron-performance.json')
  const report=JSON.parse(await readFile(filename,'utf8'))
  report.poseTwo.rendererWorkingSetKb=0
  await writeFile(filename,JSON.stringify(report))
  await assert.rejects(verifyWorkspaceCaptures(folder),/Amostra FPS\/memória/)
})

test('revisor recusa deslocamento de peça vizinha ao excluir e restaurar roupa',async t=>{
  const {folder}=await fixture(t)
  const filename=join(folder,'wardrobe-hide-restore.json')
  const report=JSON.parse(await readFile(filename,'utf8'))
  report.checks[0].otherMovement=18
  await writeFile(filename,JSON.stringify(report))
  await assert.rejects(verifyWorkspaceCaptures(folder),/Ocultar\/restaurar/)
})
