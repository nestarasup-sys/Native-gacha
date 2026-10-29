import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('flush, backup e encerramento usam um único inventário de gravações pendentes', async () => {
  const main = await readFile('electron/main.ts', 'utf8')
  const inventory = main.match(/function collectPendingPersistenceWrites\(\): Promise<unknown>\[\] \{([\s\S]*?)^\}/m)?.[1]

  assert.ok(inventory, 'o composition root deve declarar o inventário de gravações')
  for (const owner of [
    'fabricatorProjectIpc?.getPendingWrites()',
    'poseSaveWrites',
    'poseMigration',
    'fabricatorHairIpc?.getPendingWrites()',
    'animatorSaveQueue',
    'fabricatorWardrobeIpc?.getPendingWrites()',
    'fabricatorFaceCatalogIpc?.getPendingWrites()',
    'expressionPresetOperations.getPendingWrites()',
    'faceGuideSaveQueue',
    'customizerService.pendingWrites',
    'studioSaveQueues.studio',
    'editorV6SaveQueue',
    'roteirosSaveQueue'
  ]) assert.ok(inventory.includes(owner), `inventário sem a fila ${owner}`)

  assert.equal((main.match(/await flushPendingPersistenceWrites\(\)/g) ?? []).length, 2)
  assert.equal((main.match(/fabricatorProjectIpc\?\.getPendingWrites\(\)/g) ?? []).length, 1)
  assert.match(main, /\.\.\.collectPendingPersistenceWrites\(\),[\s\S]*?dataMigrationTask/)
})
