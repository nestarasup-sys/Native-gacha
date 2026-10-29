import test from 'node:test'
import assert from 'node:assert/strict'
import { createPreviewFrameScheduler } from '../src/renderer/src/features/fabricator/face/facePreviewFrame.ts'

function createFrameFixture() {
  let nextId = 0
  const frames = new Map()
  const cancelled = []
  const scheduler = createPreviewFrameScheduler(
    (callback) => {
      const id = ++nextId
      frames.set(id, callback)
      return id
    },
    (id) => {
      cancelled.push(id)
      frames.delete(id)
    }
  )
  return {
    scheduler,
    frames,
    cancelled,
    runNext() {
      const [id, callback] = frames.entries().next().value ?? []
      if (!callback) return false
      frames.delete(id)
      callback()
      return true
    }
  }
}

test('atualizações de arraste no mesmo quadro colapsam para a mais recente', () => {
  const fixture = createFrameFixture()
  const updates = []
  fixture.scheduler.schedule(() => updates.push('primeira'))
  fixture.scheduler.schedule(() => updates.push('intermediária'))
  fixture.scheduler.schedule(() => updates.push('final'))

  assert.equal(fixture.frames.size, 1)
  assert.equal(fixture.runNext(), true)
  assert.deepEqual(updates, ['final'])
  assert.equal(fixture.frames.size, 0)
})

test('soltar o ponteiro cancela o quadro pendente e aplica a posição final uma vez', () => {
  const fixture = createFrameFixture()
  const updates = []
  fixture.scheduler.schedule(() => updates.push('movimento'))
  fixture.scheduler.schedule(() => updates.push('posição final'))

  fixture.scheduler.flush()
  fixture.scheduler.flush()
  assert.deepEqual(updates, ['posição final'])
  assert.equal(fixture.frames.size, 0)
  assert.deepEqual(fixture.cancelled, [1])
})

test('cancelar o gesto descarta a atualização ainda não publicada', () => {
  const fixture = createFrameFixture()
  const updates = []
  fixture.scheduler.schedule(() => updates.push('obsoleta'))

  fixture.scheduler.cancel()
  assert.equal(fixture.runNext(), false)
  assert.deepEqual(updates, [])
  assert.deepEqual(fixture.cancelled, [1])
})
