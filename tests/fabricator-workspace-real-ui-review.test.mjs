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
  await writeFile(join(folder,'workspace-manifest.json'),JSON.stringify({
    schemaVersion:1,mode:'real-electron-workspaces',syntheticOnly:true,results
  }))
  return {folder,results}
}
test('revisor exige screenshots Customizador e Studio com dimensões e hashes',async t=>{
  const {folder}=await fixture(t)
  assert.deepEqual(await verifyWorkspaceCaptures(folder),['customizador.png','studio.png','studio-reaberto.png'])
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
