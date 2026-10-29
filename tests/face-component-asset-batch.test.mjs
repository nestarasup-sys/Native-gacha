import test from 'node:test'
import assert from 'node:assert/strict'
import { assertFaceComponentImportActive, saveFaceComponentAssetBatch } from '../src/renderer/src/features/fabricator/face/faceComponentAssetBatch.ts'

function entry(id) {
  return { asset: { id, modelSlot: 2 }, dataUrl: `data:${id}` }
}

function writer({ failId, afterSave } = {}) {
  const calls = []
  return {
    calls,
    api: {
      saveFaceComponentAsset: async (slot, asset, dataUrl) => {
        calls.push(['save', slot, asset.id, dataUrl])
        await afterSave?.(asset.id)
        if (asset.id === failId) throw new Error(`falha ${asset.id}`)
      },
      deleteFaceComponentAsset: async (slot, id) => { calls.push(['delete', slot, id]) }
    }
  }
}

test('asset batch saves entries in order and keeps them when the whole batch succeeds', async () => {
  const state = writer()
  await saveFaceComponentAssetBatch(state.api, 2, [entry('first'), entry('second')])

  assert.deepEqual(state.calls, [
    ['save', 2, 'first', 'data:first'],
    ['save', 2, 'second', 'data:second']
  ])
})

test('asset batch rolls back every attempted generated ID when a write fails', async () => {
  const state = writer({ failId: 'second' })

  await assert.rejects(saveFaceComponentAssetBatch(state.api, 2, [entry('first'), entry('second'), entry('third')]), /falha second/)
  assert.deepEqual(state.calls, [
    ['save', 2, 'first', 'data:first'],
    ['save', 2, 'second', 'data:second'],
    ['delete', 2, 'first'],
    ['delete', 2, 'second']
  ])
})

test('aborting between writes stops the batch and removes the completed write', async () => {
  const controller = new AbortController()
  const state = writer({ afterSave: async (id) => { if (id === 'first') controller.abort() } })

  await assert.rejects(saveFaceComponentAssetBatch(state.api, 2, [entry('first'), entry('second')], controller.signal), { name: 'AbortError' })
  assert.deepEqual(state.calls, [
    ['save', 2, 'first', 'data:first'],
    ['delete', 2, 'first']
  ])
})

test('an already aborted import is rejected before any asset operation', async () => {
  const controller = new AbortController()
  controller.abort()
  const state = writer()

  assert.throws(() => assertFaceComponentImportActive(controller.signal), { name: 'AbortError' })
  await assert.rejects(saveFaceComponentAssetBatch(state.api, 2, [entry('first')], controller.signal), { name: 'AbortError' })
  assert.deepEqual(state.calls, [])
})
