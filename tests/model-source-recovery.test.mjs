import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { recoverModelSourceSlot } from '../electron/domains/fabricator/modelSourceRecovery.ts'

async function fixture(t) {
  const root = await fs.mkdtemp(join(tmpdir(), 'native-gacha-recover-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const official = join(root, 'slot-1')
  const backup = join(root, '.model-source-backup-1-01234567-89ab-cdef-0123-456789abcdef')
  async function write(folder, source='source-aaaa1111.png') {
    await fs.mkdir(join(folder, 'parts'), { recursive:true })
    await fs.writeFile(join(folder,source),'IMG')
    await fs.writeFile(join(folder,'parts','head.png'),'PIXELS')
    await fs.writeFile(join(folder,'project.json'),JSON.stringify({sourceFile:source,parts:[{id:'head'}]}))
  }
  return {root,official,backup,write}
}
test('recupera fonte anterior depois de interromper a renomeação',async t=>{
  const {official,backup,write}=await fixture(t)
  await write(backup)
  assert.equal(await recoverModelSourceSlot(1,()=>official,fs),'restored')
  assert.equal((await fs.readFile(join(official,'parts','head.png'),'utf8')),'PIXELS')
  assert.equal(await recoverModelSourceSlot(1,()=>official,fs),'intact')
})
test('nunca toca no slot oficial se já existir, mesmo que haja backups',async t=>{
  const {official,backup,write}=await fixture(t)
  await write(official)
  await write(backup)
  assert.equal(await recoverModelSourceSlot(1,()=>official,fs),'intact')
  await fs.access(join(backup,'project.json'))
})
test('não recupera manifesto sem PNGs completos e preserva dados para diagnóstico',async t=>{
  const {official,backup}=await fixture(t)
  await fs.mkdir(backup,{recursive:true})
  await fs.writeFile(join(backup,'project.json'),JSON.stringify({sourceFile:'source-aa.png',parts:[{id:'head'}]}))
  assert.equal(await recoverModelSourceSlot(1,()=>official,fs),'missing')
  await fs.access(join(backup,'project.json'))
})
test('mais de um backup válido exige recuperação manual; não escolhe arbitrariamente',async t=>{
  const {root,official,backup,write}=await fixture(t)
  const second=join(root,'.model-source-backup-1-11111111-2222-3333-4444-555555555555')
  await write(backup)
  await write(second)
  await assert.rejects(recoverModelSourceSlot(1,()=>official,fs),/múltiplos backups/)
  await fs.access(join(backup,'project.json'))
  await fs.access(join(second,'project.json'))
})
test('slot inválido é barrado antes de ler filesystem',async()=>{
  await assert.rejects(recoverModelSourceSlot(0,()=>{throw Error('não chamado')},fs),/Slot inválido/)
})

test('marcador da transação seleciona o backup correto mesmo com históricos anteriores',async t=>{
  const {root,official,backup,write}=await fixture(t)
  const old=join(root,'.model-source-backup-1-11111111-2222-3333-4444-555555555555')
  await write(backup)
  await write(old)
  await fs.writeFile(join(root,'.model-source-pending-1.json'),JSON.stringify({
    version:1,backup:'.model-source-backup-1-01234567-89ab-cdef-0123-456789abcdef'
  }))
  assert.equal(await recoverModelSourceSlot(1,()=>official,fs),'restored')
  await fs.access(join(old,'project.json'))
  assert.equal(await fs.readFile(join(official,'parts','head.png'),'utf8'),'PIXELS')
})
test('marcador com caminho inválido nunca sai da pasta do Fabricador',async t=>{
  const {root,official,backup,write}=await fixture(t)
  await write(backup)
  await fs.writeFile(join(root,'.model-source-pending-1.json'),JSON.stringify({version:1,backup:'../../segredo'}))
  assert.equal(await recoverModelSourceSlot(1,()=>official,fs),'restored')
})

test('slot lógico vazio exige marcador transacional antes de recuperar backup',async t=>{
  const {root,official,backup,write}=await fixture(t)
  await fs.mkdir(official,{recursive:true})
  await write(backup)
  assert.equal(await recoverModelSourceSlot(1,()=>official,fs),'intact')
  await fs.writeFile(join(root,'.model-source-pending-1.json'),JSON.stringify({
    version:1,backup:'.model-source-backup-1-01234567-89ab-cdef-0123-456789abcdef'
  }))
  assert.equal(await recoverModelSourceSlot(1,()=>official,fs),'restored')
  assert.equal(await fs.readFile(join(official,'parts','head.png'),'utf8'),'PIXELS')
})
