import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp,rm,writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const require=createRequire(import.meta.url)
const { ORIGINAL_SHA256,required,assessTrackedPaths,trackedPaths,hashZip,audit }=require('../scripts/diagnostics/audit-gv5-import.cjs')

test('a base G-V5 tem fontes versionados, lockfile e nenhum diretório pessoal listado no Git', async()=>{
  const summary=await audit()
  assert.equal(summary.tracked.passed,true,JSON.stringify(summary.tracked))
  assert.ok(summary.tracked.sourceFiles>50,'um repositório só com configuração não é a importação do código')
  assert.equal(summary.originalZipNotAvailable,true,'sem o original, jamais declarar SHA verificado')
  assert.equal(summary.fullyVerified,false)
  assert.deepEqual(assessTrackedPaths(trackedPaths()).unsafe,[])
})
test('auditoria impede perfis reais, credenciais, SQLite e ZIP original no histórico rastreado',()=>{
  for(const path of ['node_modules/a.js','app-data/private.db','data/profile/avatar.png',
    'profile/users.json','.env.production','data/credentials.json','keys/root.pem',
    'cache/characters.sqlite','G-V5-evolucao-estrutural-2026-10-22.zip']){
    const result=assessTrackedPaths([...required,path])
    assert.equal(result.passed,false,path)
    assert.ok(result.unsafe.includes(path),path)
  }
  assert.deepEqual(assessTrackedPaths(required).missing,[])
  assert.ok(assessTrackedPaths(required.filter(p=>p!=='package-lock.json')).missing.includes('package-lock.json'))
})
test('comparação do ZIP exige hash ORIGINAL, não apenas um nome parecido',async t=>{
  const root=await mkdtemp(join(tmpdir(),'native-import-audit-'))
  t.after(()=>rm(root,{recursive:true,force:true}))
  const example=join(root,'G-V5-evolucao-estrutural-2026-10-22.zip')
  await writeFile(example,'THIS IS A TEST FIXTURE AND NOT THE REAL ZIP')
  const digest=await hashZip(example)
  assert.equal(digest.length,64)
  assert.notEqual(digest,ORIGINAL_SHA256)
})
