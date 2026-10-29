import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('flush, backup e encerramento drenam persistências e aguardam operações de backup', async () => {
  const main = await readFile('electron/main.ts', 'utf8')
  const inventory = main.match(/function collectPendingPersistenceWrites\(\): Promise<unknown>\[\] \{([\s\S]*?)^\}/m)?.[1]

  assert.ok(inventory, 'o composition root deve declarar o inventário de gravações')
  for (const owner of [
    'fabricatorProjectIpc?.getPendingWrites()',
    'poseSaveWrites',
    'poseMigration',
    'fabricatorHairIpc?.getPendingWrites()',
    'fabricatorAnimatorIpc?.getPendingWrites()',
    'fabricatorWardrobeIpc?.getPendingWrites()',
    'fabricatorFaceCatalogIpc?.getPendingWrites()',
    'expressionPresetOperations.getPendingWrites()',
    'faceGuideIpc?.getPendingWrites()',
    'customizerService.pendingWrites',
    'studioSaveQueues.studio',
    'editorV6SaveQueue',
    'roteirosSaveQueue'
  ]) assert.ok(inventory.includes(owner), `inventário sem a fila ${owner}`)

  assert.equal((main.match(/await flushPendingPersistenceWrites\(\)/g) ?? []).length, 2)
  assert.equal((main.match(/fabricatorProjectIpc\?\.getPendingWrites\(\)/g) ?? []).length, 1)
  assert.match(main, /\.\.\.collectPendingPersistenceWrites\(\),[\s\S]*?dataMigrationTask/)
  assert.ok(main.includes('...(dataBackupIpc?.getActiveTasks() ?? [])'), 'o encerramento deve aguardar operações manuais de backup em andamento')
})
