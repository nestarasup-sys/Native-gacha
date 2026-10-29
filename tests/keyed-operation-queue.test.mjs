import test from 'node:test'
import assert from 'node:assert/strict'
import { createKeyedOperationQueue } from '../electron/domains/storage/keyedOperationQueue.ts'

test('operações da mesma chave mantêm FIFO e chaves diferentes avançam em paralelo', async () => {
  const queue = createKeyedOperationQueue()
  const events = []
  let releaseFirst
  let firstStarted
  const gate = new Promise(resolve => { releaseFirst = resolve })
  const started = new Promise(resolve => { firstStarted = resolve })

  const first = queue.run('studio-a', async () => {
    events.push('a:start')
    firstStarted()
    await gate
    events.push('a:end')
  })
  await started
  const nextForA = queue.run('studio-a', async () => { events.push('a:next') })
  const independentB = queue.run('studio-b', async () => { events.push('b') })

  await independentB
  assert.deepEqual(events, ['a:start', 'b'])
  releaseFirst()
  await Promise.all([first, nextForA])
  assert.deepEqual(events, ['a:start', 'b', 'a:end', 'a:next'])
})

test('uma falha é devolvida ao chamador sem bloquear a próxima operação da chave', async () => {
  const queue = createKeyedOperationQueue()
  const failure = queue.run('set-a', async () => { throw new Error('falha sintética') })
  const recovery = queue.run('set-a', async () => 'recuperado')

  await assert.rejects(failure, /falha sintética/)
  assert.equal(await recovery, 'recuperado')
})
