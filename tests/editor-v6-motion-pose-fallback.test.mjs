import test from 'node:test'
import assert from 'node:assert/strict'
import { createMotionPoseResolver } from '../src/renderer/src/features/editorV6/motion/motionPoseResolver.ts'

test('pose excluída usa a primeira pose sobrevivente do mesmo modelo', async () => {
  const source = { slot: 3 }, existing = { slot: 4, sourceModelSlot: 3 }
  const reads = []
  const resolve = createMotionPoseResolver(source, { loadFabricatorPose: async (model, slot) => {
    reads.push([model, slot])
    return slot === 4 ? existing : null
  } })
  assert.equal(await resolve(2), existing)
  assert.equal(await resolve(7), existing)
  assert.ok(reads.every(([model]) => model === 3))
  assert.equal(reads.filter(([, slot]) => slot === 4).length, 1)
})

test('mantém a pose existente e o modelo explícito; biblioteca vazia usa a montagem', async () => {
  const source = { slot: 1 }, pose = { slot: 6 }
  const resolve = createMotionPoseResolver(source, { loadFabricatorPose: async (_, slot) => slot === 6 ? pose : null })
  assert.equal(await resolve(6), pose)
  assert.equal(await resolve(null), source)
  const empty = createMotionPoseResolver(source, { loadFabricatorPose: async () => null })
  assert.equal(await empty(2), source)
})
