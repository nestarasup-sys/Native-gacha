import test from 'node:test'
import assert from 'node:assert/strict'
import {
  projectSceneCharacters,
  sceneExpressionPresetSignature,
} from '../src/renderer/src/characters/sceneCharacterProjection.ts'

test('projeção seleciona personagens em ordem e mantém as mesmas referências', () => {
  const first = { id: 'actor-1', kind: 'character', characterId: 'chloe', activeExpressionPresetId: 'happy' }
  const background = { id: 'image-1', kind: 'image', activeExpressionPresetId: 'ignored' }
  const second = { id: 'actor-2', kind: 'character', characterId: 'alex' }

  const selected = projectSceneCharacters([first, background, second]).characters

  assert.equal(selected.length, 2)
  assert.equal(selected[0], first)
  assert.equal(selected[1], second)
})

test('assinatura de autosave mantém o contrato usado por Studio e Editor V6', () => {
  const elements = [
    { id: 'image-1', kind: 'image', activeExpressionPresetId: 'ignored' },
    { id: 'actor-1', kind: 'character', activeExpressionCollectionId: 'set-2', activeExpressionPresetId: 'sad', poseSlot: 4 },
    { id: 'actor-2', kind: 'character', activeExpressionPresetId: null }
  ]
  const before = structuredClone(elements)

  assert.equal(
    projectSceneCharacters(elements).autosaveSignature,
    JSON.stringify([
      ['actor-1', 'set-2', 'sad'],
      ['actor-2', undefined, null]
    ])
  )
  assert.deepEqual(elements, before)
  assert.notEqual(
    projectSceneCharacters(elements).autosaveSignature,
    projectSceneCharacters([{ ...elements[1], activeExpressionPresetId: 'happy' }]).autosaveSignature
  )
})

test('assinatura de revisão inclui somente personagem com preset ativo e origem identificada', () => {
  const elements = [
    { id: 'actor-1', kind: 'character', characterId: 'chloe', activeExpressionPresetId: 'happy' },
    { id: 'actor-2', kind: 'character', characterId: 'alex', activeExpressionPresetId: null },
    { id: 'actor-3', kind: 'character', activeExpressionPresetId: 'sad' },
    { id: 'text-1', kind: 'speech', characterId: 'chloe', activeExpressionPresetId: 'ignored' }
  ]

  assert.equal(sceneExpressionPresetSignature(elements), JSON.stringify([['chloe', 'happy']]))
})
