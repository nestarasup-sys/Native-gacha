import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('flush, backup e encerramento drenam persistências e aguardam operações de backup', async () => {
  const main = await readFile('electron/main.ts', 'utf8')
  const inventory = main.match(/function collectPendingPersistenceWrites\(\): Promise<unknown>\[\] \{([\s\S]*?)^\}/m)?.[1]

  assert.ok(inventory, 'o composition root deve declarar o inventário de gravações')
  assert.ok(inventory.includes('dataMigrationIpc?.getActiveTask()'), 'backups e flush devem aguardar a migração ativa')
  assert.equal((main.match(/runMaintenance: runDataMaintenance/g) ?? []).length, 2, 'backup/restauração e migração devem compartilhar o mesmo coordenador')
  for (const owner of [
    'fabricatorProjectIpc?.getPendingWrites()',
    'fabricatorModelSourceDownloadIpc?.getPendingWrites()',
    'fabricatorFaceAnimationExportIpc?.getPendingWrites()',
    'fabricatorDesignSettingsIpc?.getPendingWrites()',
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
  assert.match(main, /\.\.\.collectPendingPersistenceWrites\(\),[\s\S]*?dataBackupIpc\?\.getActiveTasks\(\)/)
  assert.ok(main.includes('...(dataBackupIpc?.getActiveTasks() ?? [])'), 'o encerramento deve aguardar operações manuais de backup em andamento')
  assert.ok(main.includes('...(roteiroExportIpc ? [roteiroExportIpc.drain()] : [])'), 'o encerramento deve drenar os jobs de exportação de Roteiros')

  const designWorkspace = await readFile('src/renderer/src/features/fabricator/DesignWorkspace.tsx', 'utf8')
  assert.match(designWorkspace, /registerPendingWriteFlusher\(flushDesignSettings\)/, 'Design Dev deve drenar o autosave antes de navegar ou fechar')
})
