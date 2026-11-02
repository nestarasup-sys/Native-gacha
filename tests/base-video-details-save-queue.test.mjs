import test from 'node:test'
import assert from 'node:assert/strict'
import { createBaseVideoDetailsSaveQueue } from '../src/renderer/src/features/baseVideos/baseVideoDetailsSaveQueue.ts'

function createQueue(saveDetails = async () => {}) {
  const timers = new Map()
  const statuses = []
  const errors = []
  let nextTimer = 0
  const queue = createBaseVideoDetailsSaveQueue({
    saveDetails,
    setStatus: (videoId, status) => statuses.push({ videoId, status }),
    setError: (reason) => errors.push(reason),
    setTimeout: (callback, delay) => {
      const id = ++nextTimer
      timers.set(id, { callback, delay })
      return id
    },
    clearTimeout: (id) => timers.delete(id)
  })
  return { queue, timers, statuses, errors }
}

const details = (description) => ({ videoId: 'video-a', description, categoryId: null, additionalContext: '', timeline: 'unspecified' })

test('coalesces edits by video and saves the latest detail after the debounce', async () => {
  const writes = []
  const { queue, timers } = createQueue(async (value) => writes.push(value))
  queue.scheduleSave(details('primeira edição'))
  queue.scheduleSave(details('edição mais recente'))

  assert.equal(timers.size, 1)
  assert.deepEqual([...timers.values()].map(({ delay }) => delay), [350])
  assert.equal(queue.hasPending('video-a'), true)

  const timer = [...timers.values()][0]
  timers.clear()
  timer.callback()
  await queue.flushPendingSaves()

  assert.deepEqual(writes.map((value) => value.description), ['edição mais recente'])
  assert.equal(queue.hasPending('video-a'), false)
})

test('uma gravação em curso termina antes de gravar a edição nova do mesmo vídeo', async () => {
  const writes = []
  const deferred = []
  const { queue } = createQueue((value) => {
    writes.push(value)
    return new Promise((resolve, reject) => deferred.push({ resolve, reject }))
  })
  queue.scheduleSave(details('edição um'))
  const flush = queue.flushPendingSave('video-a')
  assert.deepEqual(writes.map((value) => value.description), ['edição um'])

  queue.scheduleSave(details('edição dois'))
  deferred[0].resolve()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(writes.map((value) => value.description), ['edição um', 'edição dois'])
  deferred[1].resolve()
  await flush
  assert.equal(queue.hasPending('video-a'), false)
})

test('flush de encerramento aguarda trabalho em curso e também persiste mudanças recebidas durante a gravação', async () => {
  const writes = []
  const deferred = []
  const { queue, timers } = createQueue((value) => {
    writes.push(value)
    return new Promise((resolve) => deferred.push(resolve))
  })
  queue.scheduleSave(details('estado inicial'))
  const flush = queue.flushPendingSaves()
  assert.equal(timers.size, 0)
  queue.scheduleSave(details('estado final'))

  deferred[0]()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(writes.map((value) => value.description), ['estado inicial', 'estado final'])
  deferred[1]()
  await flush
  assert.equal(queue.hasPending('video-a'), false)
  assert.equal(timers.size, 0)
})

test('falha mantém a edição pendente para retry e propaga erro ao flusher', async () => {
  let fail = true
  const { queue, statuses, errors } = createQueue(async () => {
    if (fail) throw new Error('Falha sintética da biblioteca')
  })
  queue.scheduleSave(details('manter para retry'))

  await assert.rejects(queue.flushPendingSaves(), /Falha sintética da biblioteca/)
  assert.equal(queue.hasPending('video-a'), true)
  assert.equal(errors.length, 1)
  assert.equal(statuses.at(-1).status, 'error')

  fail = false
  await queue.flushPendingSave('video-a')
  assert.equal(queue.hasPending('video-a'), false)
  assert.equal(statuses.at(-1).status, 'saved')
})
