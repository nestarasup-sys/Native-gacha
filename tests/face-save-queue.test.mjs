import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createFaceSaveQueue } from '../src/renderer/src/features/fabricator/face/faceSaveQueue.ts'

function createScheduler() {
  let nextId = 0
  const jobs = new Map()
  const delays = []
  const cancelled = []
  return {
    jobs,
    delays,
    cancelled,
    schedule(callback, delayMs) {
      const id = ++nextId
      jobs.set(id, callback)
      delays.push(delayMs)
      return id
    },
    cancel(id) {
      cancelled.push(id)
      jobs.delete(id)
    }
  }
}

function createFixture() {
  const scheduler = createScheduler()
  const updates = []
  const errors = []
  const queue = createFaceSaveQueue({
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    onAssetsUpdated: () => updates.push('updated'),
    onError: (reason) => errors.push(reason),
    debounceMs: 180
  })
  return { queue, scheduler, updates, errors }
}

function deferred() {
  let resolve
  const promise = new Promise((yes) => { resolve = yes })
  return { promise, resolve }
}

test('debounces each asset key and flushes only its newest save immediately', async () => {
  const state = createFixture()
  const writes = []
  state.queue.queueSave('catalog:1:mouth', async () => writes.push('old'))
  state.queue.queueSave('catalog:1:mouth', async () => writes.push('latest'))

  assert.deepEqual(state.scheduler.delays, [180, 180])
  assert.deepEqual(state.scheduler.cancelled, [1])
  await state.queue.flushAllSaves()

  assert.deepEqual(writes, ['latest'])
  assert.deepEqual(state.updates, ['updated'])
  assert.equal(state.scheduler.jobs.size, 0)
})

test('serializes writes for one asset and drains edits queued during an in-flight save', async () => {
  const state = createFixture()
  const firstStarted = deferred()
  const releaseFirst = deferred()
  const order = []
  state.queue.queueSave('component:1:eye', async () => {
    order.push('first:start')
    firstStarted.resolve()
    await releaseFirst.promise
    order.push('first:end')
  })
  const firstFlush = state.queue.flushSave('component:1:eye')
  await firstStarted.promise

  state.queue.queueSave('component:1:eye', async () => { order.push('second') })
  const completeFlush = state.queue.flushAllSaves()
  await Promise.resolve()
  assert.deepEqual(order, ['first:start'])

  releaseFirst.resolve()
  await Promise.all([firstFlush, completeFlush])
  assert.deepEqual(order, ['first:start', 'first:end', 'second'])
  assert.deepEqual(state.updates, ['updated', 'updated'])
})

test('different asset keys can save in parallel', async () => {
  const state = createFixture()
  const firstStarted = deferred()
  const secondStarted = deferred()
  const release = deferred()
  state.queue.queueSave('component:1:left', async () => { firstStarted.resolve(); await release.promise })
  state.queue.queueSave('component:1:right', async () => { secondStarted.resolve(); await release.promise })

  const flush = state.queue.flushAllSaves()
  await Promise.all([firstStarted.promise, secondStarted.promise])
  release.resolve()
  await flush
  assert.deepEqual(state.updates, ['updated', 'updated'])
})

test('retries one failed save once, then reports a second failure to the flush caller', async () => {
  const recovered = createFixture()
  let recoveredAttempts = 0
  recovered.queue.queueSave('catalog:2:nose', async () => {
    recoveredAttempts += 1
    if (recoveredAttempts === 1) throw new Error('falha transitória')
  })

  await recovered.queue.flushSave('catalog:2:nose')
  assert.equal(recoveredAttempts, 2)
  assert.equal(recovered.updates.length, 1)
  assert.equal(recovered.errors.length, 1)
  assert.match(recovered.errors[0].message, /falha transitória/)

  const failing = createFixture()
  let failingAttempts = 0
  failing.queue.queueSave('component:3:brow', async () => {
    failingAttempts += 1
    throw new Error(`falha ${failingAttempts}`)
  })

  await assert.rejects(failing.queue.flushAllSaves(), /falha 2/)
  assert.equal(failingAttempts, 2)
})

test('face workspace delegates its keyed persistence queue and keeps global flush registration', async () => {
  const page = await readFile('src/renderer/src/features/fabricator/face/FaceComponentsWorkspace.tsx', 'utf8')
  assert.match(page, /createFaceSaveQueue/)
  assert.match(page, /registerPendingWriteFlusher\(flushAllSaves\)/)
  assert.doesNotMatch(page, /pendingSaves|saveChains|saveRuns|function enqueueSave/)
})
