import test from 'node:test'
import assert from 'node:assert/strict'
import { createRoteirosWriteQueue } from '../electron/domains/roteiros/writeQueue.ts'

test('Roteiros serializa gravações na ordem em que chegam', async () => {
  const queue = createRoteirosWriteQueue()
  const order = []
  let releaseFirst
  let markFirstStarted
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve })
  const firstGate = new Promise((resolve) => { releaseFirst = resolve })

  const first = queue.enqueue(async () => {
    order.push('primeira iniciou')
    markFirstStarted()
    await firstGate
    order.push('primeira terminou')
  })
  const second = queue.enqueue(() => { order.push('segunda iniciou') })

  await firstStarted
  assert.deepEqual(order, ['primeira iniciou'])
  assert.equal(queue.getPendingWrites().length, 1)

  releaseFirst()
  await Promise.all([first, second])
  assert.deepEqual(order, ['primeira iniciou', 'primeira terminou', 'segunda iniciou'])
})

test('falha de uma gravação continua visível e não impede as próximas', async () => {
  const queue = createRoteirosWriteQueue()
  const failure = new Error('falha simulada')
  let nextOperationRan = false

  await assert.rejects(queue.enqueue(() => { throw failure }), failure)
  assert.equal(queue.getPendingWrites().length, 1)
  await queue.waitForPendingWrites()

  await queue.enqueue(() => { nextOperationRan = true })
  await queue.waitForPendingWrites()
  assert.equal(nextOperationRan, true)
})
