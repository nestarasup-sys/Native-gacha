import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createStudioLibraryIndex } from '../electron/domains/studio/libraryIndex.ts'

const A='12345678-aaaa-4abc-8abc-123456789abc'
const B='12345678-aaaa-4abc-8abc-123456789abd'
const fixture = async t => {
  const root=await fs.mkdtemp(join(tmpdir(),'native-studio-index-'))
  t.after(()=>fs.rm(root,{recursive:true,force:true}))
  const folders={studio:join(root,'Studio Principal'),video:join(root,'Video Studio')}
  for(const folder of Object.values(folders)){
    await fs.mkdir(join(folder,'studio-'+A),{recursive:true})
    await fs.mkdir(join(folder,'studio-'+B),{recursive:true})
    await fs.mkdir(join(folder,'studio-untrusted'),{recursive:true})
  }
  const seen=[]
  const readStudio=async(id, workspace)=>{
    seen.push(workspace+':'+id)
    if(workspace==='studio'&&id===A)return {id,title:'Zeta',createdAt:'2026-01-01T00:00:00Z'}
    if(workspace==='studio'&&id===B)return {id,title:'Alpha',createdAt:'2026-01-01T00:00:00Z'}
    return null
  }
  return {root,folders,seen,index:createStudioLibraryIndex({
    files:fs,studioLibraryPath:workspace=>folders[workspace],readStudio
  })}
}
test('índice Studio ignora diretórios inválidos e ordena cenas sem mudar seus IDs',async t=>{
  const {index,seen}=await fixture(t)
  const all=await index.listStudios()
  assert.deepEqual(all.map(x=>x.id),[B,A])
  assert.deepEqual(seen.sort(),['studio:'+A,'studio:'+B].sort())
})
test('cards de Video Studio usam manifesto leve e regeneram só quando ausente',async t=>{
  const {folders,index,seen}=await fixture(t)
  const folder=folders.video
  await fs.writeFile(join(folder,'studio-'+A,'studio-card.json'),JSON.stringify({
    id:A,title:'Publicada',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',color:'#aaa'
  }))
  await fs.writeFile(join(folder,'studio-'+B,'studio.json'),JSON.stringify({
    id:B,title:'Rascunho',createdAt:'2026-02-01T00:00:00Z',
    updatedAt:'2026-02-01T00:00:00Z',color:'#bbb',
    videoTimeline:{coverDataUrl:'data:image/jpeg;base64,AA=='}
  }))
  const cards=await index.listVideoStudioCards()
  assert.deepEqual(cards.map(x=>x.id),[A,B])
  assert.equal(cards[0].title,'Publicada')
  assert.equal(cards[1].coverDataUrl,'data:image/jpeg;base64,AA==')
  assert.equal(JSON.parse(await fs.readFile(join(folder,'studio-'+B,'studio-card.json'),'utf8')).id,B)
  assert.equal(seen.length,0,'índice não deve hidratar projetos completos')
})
test('card com ID diferente é ignorado; erros de JSON não são silenciosamente apagados',async t=>{
  const {folders,index}=await fixture(t)
  const folder=folders.video
  await fs.writeFile(join(folder,'studio-'+A,'studio-card.json'),JSON.stringify({id:B}))
  await fs.writeFile(join(folder,'studio-'+B,'studio-card.json'),'NOT JSON')
  await assert.rejects(index.listVideoStudioCards(),SyntaxError)
  await fs.writeFile(join(folder,'studio-'+B,'studio-card.json'),JSON.stringify({id:B,createdAt:'2026-01-01',title:'ok'}))
  const cards=await index.listVideoStudioCards()
  assert.deepEqual(cards.map(x=>x.id),[B])
})
test('resumo de card preserva corte do título e limite de tamanho de capa',async t=>{
  const {index}=await fixture(t)
  const x=index.videoStudioCardSummary({title:'X'.repeat(150),videoTimeline:{coverDataUrl:'Y'.repeat(1_500_001)}},A)
  assert.equal(x.title.length,100)
  assert.equal('coverDataUrl' in x,false)
})
