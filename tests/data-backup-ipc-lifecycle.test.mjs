import test from 'node:test'
import assert from 'node:assert/strict'
import { registerDataBackupHandlers } from '../electron/domains/storage/dataBackupIpc.ts'

function deferred() {
  let resolve
  const promise = new Promise((yes) => { resolve = yes })
  return { promise, resolve }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

function createHarness({ service = {}, flushPendingWrites = async () => {}, showConfirmation = async () => ({ response: 0 }) } = {}) {
  const handlers = new Map()
  const backupService = {
    createBackup: async () => ({ id: 'safety-backup' }),
    listBackups: async () => [],
    verifyBackup: async () => ({ valid: true }),
    stageRestore: async () => ({ restoreId: 'restore-id' }),
    deleteBackup: async () => {},
    ...service
  }
  let relaunched = false
  let quit = false
  const lifecycle = registerDataBackupHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    assertTrustedSender: () => {},
    getStorageSummary: async () => ({ disk: {}, catalog: {} }),
    getService: () => backupService,
    flushPendingWrites,
    showConfirmation,
    relaunch: () => { relaunched = true },
    quit: () => { quit = true }
  })
  return {
    getActiveTasks: lifecycle.getActiveTasks,
    invoke: (channel, ...args) => handlers.get(channel)({}, ...args),
    wasRelaunched: () => relaunched,
    wasQuit: () => quit
  }
}

test('tracks manual backup creation from the write flush through verified backup completion', async () => {
  const flushGate = deferred()
  const backupGate = deferred()
  const flushStarted = deferred()
  const backupStarted = deferred()
  const harness = createHarness({
    flushPendingWrites: async () => { flushStarted.resolve(); await flushGate.promise },
    service: { createBackup: async () => { backupStarted.resolve(); await backupGate.promise; return { id: 'new-backup' } } }
  })

  const creation = harness.invoke('app:data-backups:create')
  await flushStarted.promise
  assert.equal(harness.getActiveTasks().length, 1)

  flushGate.resolve()
  await backupStarted.promise
  assert.equal(harness.getActiveTasks().length, 1)

  backupGate.resolve()
  assert.deepEqual(await creation, { id: 'new-backup' })
  await tick()
  assert.deepEqual(harness.getActiveTasks(), [])
})

test('tracks backup verification and deletion until each manifest operation finishes', async () => {
  const verifyGate = deferred()
  const deleteGate = deferred()
  const verifyStarted = deferred()
  const deleteStarted = deferred()
  const harness = createHarness({
    service: {
      verifyBackup: async () => { verifyStarted.resolve(); await verifyGate.promise; return { valid: true } },
      deleteBackup: async () => { deleteStarted.resolve(); await deleteGate.promise }
    }
  })

  const verification = harness.invoke('app:data-backups:verify', 'backup-id')
  await verifyStarted.promise
  assert.equal(harness.getActiveTasks().length, 1)
  verifyGate.resolve()
  assert.deepEqual(await verification, { valid: true })
  await tick()
  assert.deepEqual(harness.getActiveTasks(), [])

  const deletion = harness.invoke('app:data-backups:delete', 'backup-id')
  await deleteStarted.promise
  assert.equal(harness.getActiveTasks().length, 1)
  deleteGate.resolve()
  assert.deepEqual(await deletion, { deleted: true })
  await tick()
  assert.deepEqual(harness.getActiveTasks(), [])
})

test('tracks staged restore until its safety backup and restart staging finish', async () => {
  const safetyGate = deferred()
  const stageGate = deferred()
  const safetyStarted = deferred()
  const stageStarted = deferred()
  const sequence = []
  const harness = createHarness({
    flushPendingWrites: async () => { sequence.push('flush') },
    service: {
      createBackup: async () => { sequence.push('safety-backup'); safetyStarted.resolve(); await safetyGate.promise; return { id: 'safety-copy' } },
      stageRestore: async () => { sequence.push('stage-restore'); stageStarted.resolve(); await stageGate.promise; return { restoreId: 'restore-id', backupId: 'selected-backup' } }
    }
  })

  const restoration = harness.invoke('app:data-backups:restore', 'selected-backup')
  await safetyStarted.promise
  assert.equal(harness.getActiveTasks().length, 1)
  safetyGate.resolve()
  await stageStarted.promise
  assert.equal(harness.getActiveTasks().length, 1)

  stageGate.resolve()
  assert.deepEqual(await restoration, { cancelled: false, safetyBackupId: 'safety-copy', restoreId: 'restore-id', backupId: 'selected-backup' })
  assert.equal(harness.wasRelaunched(), true)
  assert.equal(harness.wasQuit(), true)
  assert.deepEqual(sequence, ['flush', 'safety-backup', 'stage-restore'])
  await tick()
  assert.deepEqual(harness.getActiveTasks(), [])
})
