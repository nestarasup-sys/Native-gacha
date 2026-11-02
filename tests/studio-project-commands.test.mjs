import test from 'node:test'
import assert from 'node:assert/strict'
import { createStudioProjectCommands } from '../src/renderer/src/features/studio/studioProjectCommands.ts'

const now = '2026-10-24T12:00:00.000Z'

function createHarness({ studios = [], writeError } = {}) {
  const calls = []
  const state = { studios: [...studios], selectedId: null, saved: false, error: 'old error' }
  let id = 0
  const commands = createStudioProjectCommands({
    studios: () => state.studios,
    nextNumber: { current: 1 },
    createId: () => `generated-${++id}`,
    now: () => now,
    writeDocument: async (document) => {
      calls.push(['write', document])
      if (writeError) throw writeError
    },
    appendStudio: (document) => { calls.push(['append', document.id]); state.studios.push(document) },
    selectStudio: (studioId) => { calls.push(['select', studioId]); state.selectedId = studioId },
    setSaved: (saved) => { calls.push(['saved', saved]); state.saved = saved },
    setError: (error) => { calls.push(['error', error]); state.error = error }
  })
  return { calls, state, commands }
}

test('Studio cria a próxima cena e só atualiza a lista após persistir', async () => {
  const existing = { id: 'old', title: 'Studio 07' }
  const { calls, state, commands } = createHarness({ studios: [existing] })

  await commands.createStudio()

  const created = calls[1][1]
  assert.deepEqual(calls[0], ['error', null])
  assert.equal(calls[1][0], 'write')
  assert.equal(created.title, 'Studio 08')
  assert.equal(created.id, 'generated-1')
  assert.equal(created.createdAt, now)
  assert.equal(created.updatedAt, now)
  assert.equal(created.backgroundAssetId, null)
  assert.deepEqual(created.assets, [])
  assert.deepEqual(created.elements, [])
  assert.deepEqual(calls.slice(2), [
    ['append', created.id], ['select', created.id], ['saved', true]
  ])
  assert.deepEqual(state.studios, [existing, created])
  assert.equal(state.selectedId, created.id)
  assert.equal(state.saved, true)
  assert.equal(state.error, null)
})

test('duplicar Studio gera IDs novos e mantém vínculos de assets da cena', async () => {
  const source = {
    schemaVersion: 1,
    id: 'source',
    title: 'Studio 03',
    color: '#123456',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    backgroundColor: '#d7b5cd',
    backgroundAssetId: 'background',
    backgroundX: 2, backgroundY: 3, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
    assets: [{ id: 'background', dataUrl: 'data:bg' }, { id: 'object', dataUrl: 'data:object' }],
    elements: [{ id: 'element', assetId: 'object', kind: 'image', x: 10, y: 20 }]
  }
  const { calls, state, commands } = createHarness({ studios: [source] })

  await commands.duplicateStudio(source)

  const duplicate = calls[1][1]
  assert.deepEqual(calls[0], ['error', null])
  assert.equal(calls[1][0], 'write')
  assert.equal(duplicate.id, 'generated-3')
  assert.equal(duplicate.title, 'Studio 04')
  assert.notEqual(duplicate.assets[0].id, source.assets[0].id)
  assert.notEqual(duplicate.assets[1].id, source.assets[1].id)
  assert.equal(duplicate.backgroundAssetId, duplicate.assets[0].id)
  assert.equal(duplicate.elements[0].id, 'generated-4')
  assert.notEqual(duplicate.elements[0].id, source.elements[0].id)
  assert.equal(duplicate.elements[0].assetId, duplicate.assets[1].id)
  assert.equal(duplicate.createdAt, now)
  assert.deepEqual(calls.slice(2), [
    ['append', duplicate.id], ['select', duplicate.id], ['saved', true]
  ])
  assert.deepEqual(state.studios, [source, duplicate])
})

test('falha de persistência não publica ou seleciona a cena nova', async () => {
  const { calls, state, commands } = createHarness({ writeError: new Error('manifesto indisponível') })

  await commands.createStudio()

  assert.deepEqual(calls[0], ['error', null])
  assert.equal(calls[1][0], 'write')
  assert.deepEqual(calls.slice(2), [['error', 'manifesto indisponível']])
  assert.deepEqual(state.studios, [])
  assert.equal(state.selectedId, null)
  assert.equal(state.saved, false)
  assert.equal(state.error, 'manifesto indisponível')
})
