import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { prepareStudioCastSelection } from '../src/renderer/src/features/studio/studioCastSelection.ts'

const existingCharacter = {
  id: 'character-1', name: 'Personagem mantido', updatedAt: '2026-10-28T12:00:00Z',
  customization: { poseSlot: null }
}
const newCharacter = {
  id: 'character-3', name: 'Personagem novo', updatedAt: '2026-10-29T12:00:00Z',
  customization: { poseSlot: 4, faceAppearance: { modelSlot: 2, expressionIndex: 1 } }
}
const studio = () => ({
  schemaVersion: 1,
  id: 'studio-1',
  title: 'Studio 01',
  assets: [
    { id: 'shared-asset', category: 'character', name: 'Compartilhado', mimeType: 'image/png', dataUrl: 'shared' },
    { id: 'retained-character-asset', category: 'character', name: 'Mantido', mimeType: 'image/png', dataUrl: 'retained' }
  ],
  elements: [
    { id: 'retained-character', kind: 'character', characterId: existingCharacter.id, assetId: 'retained-character-asset', zIndex: 5 },
    { id: 'removed-character', kind: 'character', characterId: 'character-2', assetId: 'shared-asset', zIndex: 8 },
    { id: 'text-on-shared-asset', kind: 'speech', assetId: 'shared-asset', zIndex: 10 }
  ]
})

test('prepara adições com pose neutra de referência e mantém assets ainda referenciados', async () => {
  const original = studio()
  const renderPoses = []
  let nextId = 0
  const prepared = await prepareStudioCastSelection({
    studio: original,
    selectedCharacterIds: [existingCharacter.id, newCharacter.id],
    availableCharacters: [existingCharacter, newCharacter],
    stageWidth: 1000,
    stageHeight: 562,
    faceRendererVersion: 7,
    renderCharacter: async (character) => {
      renderPoses.push([character.id, character.customization.poseSlot])
      return { dataUrl: `render:${character.customization.poseSlot ?? 'neutral'}`, width: 200, height: 400 }
    },
    cropArtwork: async (dataUrl) => ({ dataUrl: `crop:${dataUrl}`, width: 100, height: dataUrl.endsWith('neutral') ? 150 : 220 }),
    createId: () => `new-${++nextId}`
  })

  assert.deepEqual(renderPoses, [['character-3', 4], ['character-3', null]])
  assert.deepEqual(prepared.elements.map((element) => element.id), ['retained-character', 'text-on-shared-asset', 'new-2'])
  assert.deepEqual(prepared.addedElements.map((element) => element.id), ['new-2'])
  assert.equal(prepared.elements[2].assetId, 'new-1')
  assert.equal(prepared.elements[2].faceRendererVersion, 7)
  assert.equal(prepared.elements[2].characterSourceUpdatedAt, newCharacter.updatedAt)
  assert.deepEqual(prepared.elements[2].expressionBase.appearance, newCharacter.customization.faceAppearance)
  assert.ok(prepared.elements[2].characterCanvasWidth > 0)
  assert.equal(prepared.addedAssets[0].dataUrl, 'crop:render:4')
  assert.ok(prepared.removedCharacterAssetIds.has('shared-asset'))
  assert.ok(prepared.retainedAssetIds.has('shared-asset'))
  assert.deepEqual(original.elements.map((element) => element.id), ['retained-character', 'removed-character', 'text-on-shared-asset'])
  assert.equal(newCharacter.customization.poseSlot, 4)
})

test('remoção de elenco preserva elementos não-personagem e não renderiza sem adições', async () => {
  let renderCount = 0
  const prepared = await prepareStudioCastSelection({
    studio: studio(),
    selectedCharacterIds: [],
    availableCharacters: [newCharacter],
    stageWidth: 1000,
    stageHeight: 562,
    faceRendererVersion: 7,
    renderCharacter: async () => { renderCount += 1; throw new Error('não deveria renderizar') }
  })

  assert.equal(renderCount, 0)
  assert.deepEqual(prepared.elements.map((element) => element.id), ['text-on-shared-asset'])
  assert.deepEqual([...prepared.removedCharacterAssetIds], ['retained-character-asset', 'shared-asset'])
  assert.ok(prepared.retainedAssetIds.has('shared-asset'))
  assert.equal(prepared.addedAssets.length, 0)
})

test('Studio delega a preparação do elenco e mantém gravação/histórico na página', async () => {
  const page = await readFile('src/renderer/src/features/studio/StudioPage.tsx', 'utf8')
  assert.match(page, /prepareStudioCastSelection\(/)
  assert.match(page, /changeScene\(\(studio\) => \(\{/)
  assert.match(page, /prepared\.removedCharacterAssetIds\.has\(asset\.id\)/)
  assert.match(page, /prepared\.addedElements\.at\(-1\)/)
  assert.doesNotMatch(page, /fitStudioCharacterToStage|const retained = activeStudio\.elements\.filter/)
})
