import test from 'node:test'
import assert from 'node:assert/strict'
import { registerRoteiroExportHandlers } from '../electron/domains/roteiros/exportIpc.ts'

function deferred() {
  let resolve
  const promise = new Promise((yes) => { resolve = yes })
  return { promise, resolve }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

function createHarness(service = {}) {
  const handlers = new Map()
  let destroyed = false
  let onDestroyed
  const sender = {
    id: 12,
    isDestroyed: () => destroyed,
    once: (event, listener) => { if (event === 'destroyed') onDestroyed = listener }
  }
  const defaults = {
    exportAssets: async () => ({ path: 'project', files: 1 }),
    ensureExportFolder: async () => 'project',
    startCharacterExport: async () => ({ jobId: 'job-1', folderName: 'script', assetCountLimit: 10 }),
    writeCharacterExportAsset: async () => {},
    finishCharacterExport: async () => ({ folderName: 'script', path: 'project', characters: 1, files: 1 }),
    cancelCharacterExport: async () => {}
  }
  const lifecycle = registerRoteiroExportHandlers({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    assertTrustedSender: () => {},
    openPath: async () => '',
    service: { ...defaults, ...service }
  })
  return {
    lifecycle,
    invoke: (channel, ...args) => handlers.get(channel)({ sender }, ...args),
    destroySender: () => { destroyed = true; onDestroyed?.() }
  }
}

test('drain waits for one-shot file exports and blocks new ones until shutdown aborts', async () => {
  const gate = deferred()
  const started = deferred()
  const harness = createHarness({ exportAssets: async () => { started.resolve(); await gate.promise; return { path: 'project', files: 2 } } })

  const exporting = harness.invoke('roteiros:assets-export', { id: 'fixture' })
  await started.promise
  const draining = harness.lifecycle.drain()
  await tick()
  await assert.rejects(harness.invoke('roteiros:assets-export', { id: 'late' }), /encerrando/)

  gate.resolve()
  assert.deepEqual(await exporting, { path: 'project', files: 2 })
  await draining
  harness.lifecycle.resumeAfterFailedShutdown()
  assert.deepEqual(await harness.invoke('roteiros:assets-export', { id: 'retry' }), { path: 'project', files: 2 })
})

test('drain serializes cleanup behind an in-flight character asset write', async () => {
  const assetGate = deferred()
  const assetStarted = deferred()
  const cancelGate = deferred()
  const cancelStarted = deferred()
  const calls = []
  const harness = createHarness({
    writeCharacterExportAsset: async () => { calls.push('asset'); assetStarted.resolve(); await assetGate.promise },
    cancelCharacterExport: async () => { calls.push('cancel'); cancelStarted.resolve(); await cancelGate.promise }
  })

  const job = await harness.invoke('roteiros:characters-export:start', { fixture: true })
  const asset = harness.invoke('roteiros:characters-export:asset', job.jobId, { fixture: true })
  await assetStarted.promise
  const draining = harness.lifecycle.drain()
  await tick()
  assert.deepEqual(calls, ['asset'])

  assetGate.resolve()
  await asset
  await cancelStarted.promise
  assert.deepEqual(calls, ['asset', 'cancel'])
  cancelGate.resolve()
  await draining
})

test('drain lets a character export finish before its queued cancellation check', async () => {
  const finishGate = deferred()
  const finishStarted = deferred()
  let cancelCalls = 0
  const harness = createHarness({
    finishCharacterExport: async () => { finishStarted.resolve(); await finishGate.promise; return { folderName: 'script', path: 'project', characters: 1, files: 2 } },
    cancelCharacterExport: async () => { cancelCalls += 1 }
  })

  const job = await harness.invoke('roteiros:characters-export:start', { fixture: true })
  const finishing = harness.invoke('roteiros:characters-export:finish', job.jobId)
  await finishStarted.promise
  const draining = harness.lifecycle.drain()
  await tick()
  finishGate.resolve()

  assert.deepEqual(await finishing, { folderName: 'script', path: 'project', characters: 1, files: 2 })
  await draining
  assert.equal(cancelCalls, 0)
})

test('window destruction cancels its open export and shutdown waits for cleanup', async () => {
  const cancelGate = deferred()
  const cancelStarted = deferred()
  let cancelCalls = 0
  const harness = createHarness({ cancelCharacterExport: async () => { cancelCalls += 1; cancelStarted.resolve(); await cancelGate.promise } })

  await harness.invoke('roteiros:characters-export:start', { fixture: true })
  harness.destroySender()
  await cancelStarted.promise
  const draining = harness.lifecycle.drain()
  await tick()
  cancelGate.resolve()
  await draining
  assert.equal(cancelCalls, 1)
})
