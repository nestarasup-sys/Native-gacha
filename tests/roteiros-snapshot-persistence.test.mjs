import test from 'node:test'
import assert from 'node:assert/strict'
import { createRoteiroSnapshotPersistence } from '../src/renderer/src/features/roteiros/roteiroSnapshotPersistence.ts'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function createHarness(saveSnapshot = async () => {}) {
  const statuses = []
  const failures = []
  const persistence = createRoteiroSnapshotPersistence({
    saveSnapshot,
    setStatus: (status) => statuses.push(status),
    logFailure: (error) => failures.push(error)
  })
  return { persistence, statuses, failures }
}

test('registra o snapshot solicitado e publica sucesso apenas para a revisão mais recente', async () => {
  const firstGate = deferred()
  const latestGate = deferred()
  const snapshots = [{ id: 'first' }, { id: 'latest' }]
  let call = 0
  const { persistence, statuses } = createHarness(async () => {
    const gate = call++ === 0 ? firstGate : latestGate
    await gate.promise
  })

  const firstWrite = persistence.saveSnapshot(snapshots[0])
  const latestWrite = persistence.saveSnapshot(snapshots[1])
  assert.equal(persistence.isLastRequestedSnapshot(snapshots[1]), true)
  await Promise.resolve()
  firstGate.resolve()
  await firstWrite
  assert.deepEqual(statuses, ['saving', 'saving'])

  latestGate.resolve()
  await latestWrite
  assert.deepEqual(statuses, ['saving', 'saving', 'saved'])
})

test('falha de um write antigo não substitui o estado nem a referência do write atual', async () => {
  const firstGate = deferred()
  const latestGate = deferred()
  const snapshots = [{ id: 'first' }, { id: 'latest' }]
  let call = 0
  const { persistence, statuses, failures } = createHarness(async () => {
    const gate = call++ === 0 ? firstGate : latestGate
    await gate.promise
  })

  const firstWrite = persistence.saveSnapshot(snapshots[0])
  const latestWrite = persistence.saveSnapshot(snapshots[1])
  await Promise.resolve()
  const failure = new Error('write antigo falhou')
  firstGate.reject(failure)
  await assert.rejects(firstWrite, failure)
  assert.deepEqual(statuses, ['saving', 'saving'])
  assert.deepEqual(failures, [failure])
  assert.equal(persistence.isLastRequestedSnapshot(snapshots[1]), true)

  latestGate.resolve()
  await latestWrite
  assert.equal(statuses.at(-1), 'saved')
})

test('write atual com falha expõe o erro e permite tentar o mesmo snapshot de novo', async () => {
  const snapshot = { id: 'retry' }
  const failure = new Error('falha transitória')
  let attempts = 0
  const { persistence, statuses, failures } = createHarness(async () => {
    attempts += 1
    if (attempts === 1) throw failure
  })

  await assert.rejects(persistence.saveSnapshot(snapshot), failure)
  assert.deepEqual(statuses, ['saving', 'error'])
  assert.deepEqual(failures, [failure])
  assert.equal(persistence.isLastRequestedSnapshot(snapshot), false)

  await persistence.saveSnapshot(snapshot)
  assert.deepEqual(statuses, ['saving', 'error', 'saving', 'saved'])
})

test('flush antes de carregar não grava o snapshot inicial', async () => {
  let calls = 0
  const { persistence } = createHarness(async () => { calls += 1 })

  await persistence.flushPendingWrites(false, () => ({ id: 'initial' }))

  assert.equal(calls, 0)
})

test('flush persiste o snapshot atual mesmo quando nenhuma alteração foi enfileirada', async () => {
  const snapshot = { id: 'current' }
  const saved = []
  const { persistence } = createHarness(async (item) => { saved.push(item) })

  await persistence.flushPendingWrites(true, () => snapshot)

  assert.deepEqual(saved, [snapshot])
})

test('flush espera writes ativos e persiste a versão mais recente antes de terminar', async () => {
  const firstSnapshot = { id: 'first' }
  const latestSnapshot = { id: 'latest' }
  const firstGate = deferred()
  const saved = []
  const { persistence } = createHarness(async (snapshot) => {
    saved.push(snapshot)
    if (snapshot === firstSnapshot) await firstGate.promise
  })

  const firstWrite = persistence.saveSnapshot(firstSnapshot)
  await Promise.resolve()
  const flush = persistence.flushPendingWrites(true, () => latestSnapshot)
  firstGate.resolve()
  await Promise.all([firstWrite, flush])

  assert.deepEqual(saved, [firstSnapshot, latestSnapshot])
})

test('flush recupera falha pendente escrevendo o snapshot atual novamente', async () => {
  const snapshot = { id: 'recovered' }
  const firstGate = deferred()
  let attempts = 0
  const { persistence } = createHarness(async () => {
    attempts += 1
    if (attempts === 1) await firstGate.promise
    if (attempts === 1) throw new Error('primeira tentativa falhou')
  })

  const firstWrite = persistence.saveSnapshot(snapshot).catch(() => undefined)
  await Promise.resolve()
  const flush = persistence.flushPendingWrites(true, () => snapshot)
  firstGate.resolve()
  await Promise.all([firstWrite, flush])

  assert.equal(attempts, 2)
})
