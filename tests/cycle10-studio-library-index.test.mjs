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
  const folders={studio:join(root,'Studio Principal')}
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
