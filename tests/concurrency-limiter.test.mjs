import test from 'node:test'
import assert from 'node:assert/strict'
import { createConcurrencyLimiter } from '../src/renderer/src/ui/concurrencyLimiter.ts'
import { mapConcurrentItems } from '../src/renderer/src/ui/mapConcurrentItems.ts'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('limiter shares its ceiling across independent ordered batches', async () => {
  const limit = createConcurrencyLimiter(3)
  let active = 0
  let maximumActive = 0
  const runBatch = (prefix) => mapConcurrentItems(
    Array.from({ length: 8 }, (_, index) => `${prefix}-${index}`),
    (id) => limit(async () => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      try {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return id
      } finally {
        active -= 1
      }
    }, () => false),
    () => false,
    6
  )

  const [first, second] = await Promise.all([runBatch('first'), runBatch('second')])
  assert.equal(maximumActive, 3)
  assert.deepEqual(first, Array.from({ length: 8 }, (_, index) => `first-${index}`))
  assert.deepEqual(second, Array.from({ length: 8 }, (_, index) => `second-${index}`))
})

test('queued work is skipped if its view is cancelled before a slot opens', async () => {
  const limit = createConcurrencyLimiter(1)
  const activeGate = deferred()
  let started = false
  const active = limit(() => { started = true; return activeGate.promise }, () => false)
  while (!started) await Promise.resolve()
  let cancelled = false
  let queuedStarted = false
  const queued = limit(async () => { queuedStarted = true; return 'unexpected' }, () => cancelled)
  cancelled = true
  activeGate.resolve('active')

  assert.equal(await active, 'active')
  assert.equal(await queued, null)
  assert.equal(queuedStarted, false)
})

test('failed tasks release capacity and allow the next queued operation to run', async () => {
  const limit = createConcurrencyLimiter(1)
  const activeGate = deferred()
  const active = limit(() => activeGate.promise, () => false)
  const queued = limit(async () => 'next', () => false)
  activeGate.reject(new Error('falha'))

  await assert.rejects(active, /falha/)
  assert.equal(await queued, 'next')
})
