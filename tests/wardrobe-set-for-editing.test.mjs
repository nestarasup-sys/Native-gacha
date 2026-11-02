import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { loadWardrobeSetForEditing } from '../src/renderer/src/features/fabricator/wardrobe/loadWardrobeSetForEditing.ts'

const savedSet = {
  id: 'set-1',
  components: [
    { id: 'top', name: 'Blusa', attachedPartId: 'torso', binding: { boneId: 'torso' } },
    { id: 'glove', name: 'Luva', attachedPartId: 'hand', binding: { boneId: 'old-hand' } },
    { id: 'shoe', name: 'Sapato', attachedPartId: 'missing-bone' }
  ]
}

test('carrega o conjunto do slot e aceita vínculo existente no referencial original', async () => {
  const calls = []
  const result = await loadWardrobeSetForEditing(4, 'set-1', {
    loadWardrobeSet: async (slot, id) => { calls.push([slot, id]); return savedSet },
    referenceParts: [{ id: 'torso' }],
    currentModelParts: [{ id: 'hand' }]
  })

  assert.deepEqual(calls, [[4, 'set-1']])
  assert.equal(result.set, savedSet)
  assert.deepEqual(result.incompatibleComponents.map(({ id }) => id), ['glove', 'shoe'])
})

test('um binding ausente é permitido quando o osso existe no modelo atual', async () => {
  const set = { ...savedSet, components: [{ id: 'hat', attachedPartId: 'head' }] }
  const result = await loadWardrobeSetForEditing(2, 'set-2', {
    loadWardrobeSet: async () => set,
    referenceParts: [],
    currentModelParts: [{ id: 'head' }]
  })

  assert.deepEqual(result.incompatibleComponents, [])
})

test('não substitui nem grava os dados incompatíveis do conjunto carregado', async () => {
  const result = await loadWardrobeSetForEditing(2, 'set-3', {
    loadWardrobeSet: async () => savedSet,
    referenceParts: [],
    currentModelParts: []
  })

  assert.equal(result.set, savedSet)
  assert.equal(result.set.components[0].binding.boneId, 'torso')
  assert.deepEqual(result.incompatibleComponents.map(({ id }) => id), ['top', 'glove', 'shoe'])
})

test('conjunto removido entre a listagem e a abertura produz o erro de domínio existente', async () => {
  await assert.rejects(loadWardrobeSetForEditing(2, 'gone', {
    loadWardrobeSet: async () => null,
    referenceParts: [],
    currentModelParts: []
  }), /Não foi possível encontrar este conjunto/)
})

test('WardrobeWorkspace mantém o guard de resposta obsoleta antes de ativar o conjunto', async () => {
  const page = await readFile(new URL('../src/renderer/src/features/fabricator/wardrobe/WardrobeWorkspace.tsx', import.meta.url), 'utf8')
  const openSet = page.slice(page.indexOf('const openSet'), page.indexOf('const importSheet'))

  assert.match(openSet, /await loadWardrobeSetForEditing\(/)
  assert.match(openSet, /requestRef\.current !== requestId/)
  assert.match(openSet, /setDraft\(loaded\)/)
  assert.match(openSet, /incompatibleComponents/)
})
