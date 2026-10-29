import assert from 'node:assert/strict'
import test from 'node:test'
import { registerDataBackupHandlers } from '../electron/domains/storage/dataBackupIpc.ts'
import { registerDataMigrationHandlers } from '../electron/domains/storage/dataMigrationIpc.ts'
import { createKeyedOperationQueue } from '../electron/domains/storage/keyedOperationQueue.ts'

function deferred() {
  let resolve
  const promise = new Promise((yes) => { resolve = yes })
  return { promise, resolve }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

function createMaintenanceHarness({ migrationService, backupService }) {
  const handlers = new Map()
  const queue = createKeyedOperationQueue()
  const runMaintenance = (operation) => queue.run('app-data-maintenance', operation)
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) }
  const migration = registerDataMigrationHandlers({
    ipcMain,
    assertTrustedSender: () => {},
    getService: () => migrationService,
    runMaintenance,
    relaunch: () => {},
    quit: () => {}
  })
  const backup = registerDataBackupHandlers({
    ipcMain,
    assertTrustedSender: () => {},
    getStorageSummary: async () => ({ disk: {}, catalog: {} }),
    getService: () => ({
      createBackup: async () => ({ id: 'backup' }),
      listBackups: async () => [],
      verifyBackup: async () => ({ valid: true }),
      stageRestore: async () => ({ restoreId: 'restore' }),
      deleteBackup: async () => {},
      ...backupService
    }),
    flushPendingWrites: async () => {},
    runMaintenance,
    showConfirmation: async () => ({ response: 0 }),
    relaunch: () => {},
    quit: () => {}
  })
  return {
    invoke: (channel, ...args) => handlers.get(channel)({}, ...args),
    getMigrationTask: migration.getActiveTask,
    getBackupTasks: backup.getActiveTasks
  }
}

test('backup espera uma migração em andamento antes de copiar arquivos e SQLite', async () => {
  const migrationGate = deferred()
  const migrationStarted = deferred()
  const backupStarted = deferred()
  const sequence = []
  let migrated = false
  const harness = createMaintenanceHarness({
    migrationService: {
      prepare: async () => ({ hasEnoughSpace: true, domains: [{ domainId: 'synthetic', state: migrated ? 'active' : 'legacy' }] }),
      migrateDomain: async () => {
        sequence.push('migration:start')
        migrationStarted.resolve()
        await migrationGate.promise
        migrated = true
        sequence.push('migration:end')
        return { domainId: 'synthetic', state: 'active' }
      }
    },
    backupService: { createBackup: async () => { sequence.push('backup:start'); backupStarted.resolve(); return { id: 'backup' } } }
  })

  const migration = harness.invoke('app:data-migration:run-all')
  await migrationStarted.promise
  assert.ok(harness.getMigrationTask(), 'a migração fica visível enquanto o domínio é copiado')
  const backup = harness.invoke('app:data-backups:create')
  await tick()

  assert.deepEqual(sequence, ['migration:start'])
  assert.equal(harness.getBackupTasks().length, 1)

  migrationGate.resolve()
  await Promise.all([migration, backup])
  assert.deepEqual(sequence, ['migration:start', 'migration:end', 'backup:start'])
  assert.equal(harness.getMigrationTask(), null)
})

test('migração espera um backup em andamento antes de alterar o catálogo', async () => {
  const backupGate = deferred()
  const backupStarted = deferred()
  const migrationStarted = deferred()
  const migrationGate = deferred()
  const sequence = []
  let migrated = false
  const harness = createMaintenanceHarness({
    migrationService: {
      prepare: async () => ({ hasEnoughSpace: true, domains: [{ domainId: 'synthetic', state: migrated ? 'active' : 'legacy' }] }),
      migrateDomain: async () => {
        sequence.push('migration:start')
        migrationStarted.resolve()
        await migrationGate.promise
        migrated = true
        sequence.push('migration:end')
        return { domainId: 'synthetic', state: 'active' }
      }
    },
    backupService: { createBackup: async () => { sequence.push('backup:start'); backupStarted.resolve(); await backupGate.promise; sequence.push('backup:end'); return { id: 'backup' } } }
  })

  const backup = harness.invoke('app:data-backups:create')
  await backupStarted.promise
  const migration = harness.invoke('app:data-migration:run-all')
  await tick()

  assert.deepEqual(sequence, ['backup:start'])
  assert.ok(harness.getMigrationTask(), 'a migração pendente também aparece no inventário')

  backupGate.resolve()
  await backup
  await migrationStarted.promise
  assert.deepEqual(sequence, ['backup:start', 'backup:end', 'migration:start'])
  migrationGate.resolve()
  await migration
  assert.deepEqual(sequence, ['backup:start', 'backup:end', 'migration:start', 'migration:end'])
})

test('migração espera o backup de segurança e o staging completo de uma restauração', async () => {
  const stageGate = deferred()
  const stageStarted = deferred()
  const migrationStarted = deferred()
  const migrationGate = deferred()
  const sequence = []
  let migrated = false
  const harness = createMaintenanceHarness({
    migrationService: {
      prepare: async () => ({ hasEnoughSpace: true, domains: [{ domainId: 'synthetic', state: migrated ? 'active' : 'legacy' }] }),
      migrateDomain: async () => {
        sequence.push('migration:start')
        migrationStarted.resolve()
        await migrationGate.promise
        migrated = true
        sequence.push('migration:end')
        return { domainId: 'synthetic', state: 'active' }
      }
    },
    backupService: {
      createBackup: async () => { sequence.push('restore:safety-backup'); return { id: 'safety' } },
      stageRestore: async () => { sequence.push('restore:stage-start'); stageStarted.resolve(); await stageGate.promise; sequence.push('restore:stage-end'); return { restoreId: 'restore' } }
    }
  })

  const restoration = harness.invoke('app:data-backups:restore', 'selected-backup')
  await stageStarted.promise
  const migration = harness.invoke('app:data-migration:run-all')
  await tick()

  assert.deepEqual(sequence, ['restore:safety-backup', 'restore:stage-start'])
  assert.ok(harness.getMigrationTask())

  stageGate.resolve()
  await restoration
  await migrationStarted.promise
  assert.deepEqual(sequence, ['restore:safety-backup', 'restore:stage-start', 'restore:stage-end', 'migration:start'])
  migrationGate.resolve()
  await migration
  assert.deepEqual(sequence, ['restore:safety-backup', 'restore:stage-start', 'restore:stage-end', 'migration:start', 'migration:end'])
})
