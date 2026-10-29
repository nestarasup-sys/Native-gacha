import test from 'node:test'
import assert from 'node:assert/strict'
import { registerFaceGuideHandlers } from '../electron/domains/fabricator/faceGuidesIpc.ts'
import { isFaceGuideProfile } from '../electron/domains/fabricator/faceGuidePersistence.ts'

function deferred() {
  let resolve
  const promise = new Promise((yes) => { resolve = yes })
  return { promise, resolve }
}

function createHarness(write) {
  const handlers = new Map()
  const service = registerFaceGuideHandlers({
    handle: (channel, handler) => handlers.set(channel, handler)
  }, () => {}, {
    isProfile: isFaceGuideProfile,
    read: async () => null,
    write
  })
  const save = handlers.get('fabricator:face-guides:save')
  return { save: (profile, guides) => save({}, profile, guides), service }
}

test('serializes writes to one guide profile while independent profiles proceed', async () => {
  const firstWrite = deferred()
  const started = []
  const { save, service } = createHarness(async (profile, guides) => {
    started.push(`${profile}:${guides.id}`)
    if (guides.id === 'first') await firstWrite.promise
  })

  const first = save('eyes', { id: 'first' })
  await new Promise((resolve) => setImmediate(resolve))
  const second = save('eyes', { id: 'second' })
  const independent = save('face', { id: 'independent' })
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(started, ['eyes:first', 'face:independent'])
  assert.equal(service.getPendingWrites().length, 1)

  firstWrite.resolve()
  await Promise.all([first, second, independent])
  assert.deepEqual(started, ['eyes:first', 'face:independent', 'eyes:second'])
  assert.deepEqual(service.getPendingWrites(), [])
})

test('keeps failed guide writes visible to the persistence drain until a later write succeeds', async () => {
  const { save, service } = createHarness(async (_profile, guides) => {
    if (guides.id === 'broken') throw new Error('disco indisponível')
  })

  await assert.rejects(save('shared', { id: 'broken' }), /disco indisponível/)
  const failedWrites = await Promise.allSettled(service.getPendingWrites())
  assert.equal(failedWrites.length, 1)
  assert.equal(failedWrites[0].status, 'rejected')

  await save('shared', { id: 'recovered' })
  assert.deepEqual(service.getPendingWrites(), [])
})
