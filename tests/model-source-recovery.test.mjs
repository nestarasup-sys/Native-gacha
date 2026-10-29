import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AmbiguousModelSourceRecoveryError, listModelSourceSlots, markAmbiguousModelSourceSlots, recoverModelSourceSlot } from '../electron/domains/fabricator/modelSourceRecovery.ts'
import { registerFabricatorProjectHandlers } from '../electron/domains/fabricator/projectIpc.ts'

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

function registerProjectHandlers(libraryPath) {
  const handlers = new Map()
  registerFabricatorProjectHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    assertTrustedSender: event => { if (!event.trusted) throw new Error('Origem inválida.') },
    isValidSlot: slot => Number.isInteger(slot) && slot >= 1 && slot <= 10,
    libraryPath: () => libraryPath,
    slotPath: slot => join(libraryPath, `slot-${slot}`),
    writeProject: async () => undefined,
    history: { read: async () => ({ undo: [], redo: [] }), write: async () => undefined },
    openImportDialog: async () => null,
    normalizeImage: async bytes => ({ bytes, bitDepth: 8, width: 1, height: 1 }),
    createId: () => '01234567-89ab-cdef-0123-456789abcdef',
    files: fs
  })
  return handlers
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

test('exclusão explícita do slot apaga seus backups e transações sem afetar outros slots', async t => {
  const { root, official, backup, write } = await fixture(t)
  const secondBackup = join(root, '.model-source-backup-1-11111111-2222-3333-4444-555555555555')
  const modelSourceStage = join(root, '.model-source-stage-1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  const duplicateStage = join(root, '.fabricator-duplicate-stage-1-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  const pending = join(root, '.model-source-pending-1.json')
  const otherSlotArtifacts = [
    join(root, '.model-source-backup-2-11111111-2222-3333-4444-555555555555'),
    join(root, '.model-source-stage-2-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
    join(root, '.fabricator-duplicate-stage-2-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  ]
  await write(official)
  await write(backup)
  await write(secondBackup)
  await fs.mkdir(modelSourceStage)
  await fs.mkdir(duplicateStage)
  await fs.writeFile(pending, JSON.stringify({ version: 1, backup: 'not-used-after-explicit-delete' }))
  for (const path of otherSlotArtifacts) await fs.mkdir(path)

  const handlers = registerProjectHandlers(root)
  await handlers.get('fabricator:delete-slot')({ trusted: true }, 1)

  for (const path of [official, backup, secondBackup, modelSourceStage, duplicateStage, pending]) {
    await assert.rejects(fs.access(path), { code: 'ENOENT' })
  }
  for (const path of otherSlotArtifacts) await fs.access(path)
  assert.equal(await recoverModelSourceSlot(1, () => official, fs), 'missing')
})

test('marca slots ambíguos com e sem manifesto, preservando resumo do modelo', () => {
  const summaries = [null, { slot: 2, name: 'Modelo existente', sourceName: 'folha.png', partCount: 10, updatedAt: '2026-01-01' }, null]
  const marked = markAmbiguousModelSourceSlots(summaries, [1, 2, 3, 11])
  assert.equal(marked[0].recoveryRequired, true)
  assert.equal(marked[1].name, 'Modelo existente')
  assert.equal(marked[1].recoveryRequired, true)
  const { recoveryRequired, ...preservedSummary } = marked[1]
  assert.equal(recoveryRequired, true)
  assert.deepEqual(preservedSummary, summaries[1])
  assert.equal(marked[2].recoveryRequired, true)
  assert.equal(summaries[0], null)
  assert.equal(summaries[1].recoveryRequired, undefined)
})

test('lista recuperação ambígua como estado de catálogo sem repetir warning por consulta', async () => {
  const summaries = [
    { slot: 1, name: 'Modelo 1', sourceName: 'folha.png', partCount: 8, updatedAt: '2026-01-01' },
    { slot: 2, name: 'Modelo 2', sourceName: 'folha.png', partCount: 10, updatedAt: '2026-01-02' },
    null
  ]
  const recoveredSlots = []
  const listed = await listModelSourceSlots(3, async (slot) => {
    recoveredSlots.push(slot)
    if (slot === 2 || slot === 3) throw new AmbiguousModelSourceRecoveryError()
    return 'intact'
  }, async () => summaries)
  assert.deepEqual(recoveredSlots, [1, 2, 3])
  assert.equal(listed[1].name, 'Modelo 2')
  assert.equal(listed[1].recoveryRequired, true)
  assert.equal(listed[2].recoveryRequired, true)
  assert.equal(summaries[1].recoveryRequired, undefined)

  const main = await fs.readFile(join(process.cwd(), 'electron', 'main.ts'), 'utf8')
  assert.match(main, /listSlots: \(\) => listModelSourceSlots\(slotCount, recoverSlot/)
  assert.doesNotMatch(main, /console\.warn\(`Recuperação pendente no slot/)
})
