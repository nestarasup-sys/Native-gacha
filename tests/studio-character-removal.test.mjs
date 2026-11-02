import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { removeStudioCharacterElement } from '../src/renderer/src/features/studio/studioCharacterRemoval.ts'

const studioPageSource = await readFile(new URL('../src/renderer/src/features/studio/StudioPage.tsx', import.meta.url), 'utf8')

const removedAt = '2026-11-02T12:00:00.000Z'

function makeElement(id, kind, assetId) {
  return { id, kind, assetId, text: '', x: 0, y: 0, width: 20, height: 40, rotation: 0, zIndex: 1 }
}

function makeStudio({ backgroundAssetId = null, elements = [] } = {}) {
  return {
    schemaVersion: 1,
    id: 'studio-1',
    title: 'Studio 01',
    color: '#abcdef',
    createdAt: removedAt,
    updatedAt: '2026-11-01T12:00:00.000Z',
    backgroundColor: '#fff',
    backgroundAssetId,
    backgroundX: 0,
    backgroundY: 0,
    backgroundWidth: 100,
    backgroundHeight: 100,
    backgroundRotation: 0,
    assets: [
      { id: 'character-render', category: 'character', name: 'Personagem', mimeType: 'image/png', dataUrl: 'data:character' },
      { id: 'other-asset', category: 'object', name: 'Objeto', mimeType: 'image/png', dataUrl: 'data:object' }
    ],
    elements
  }
}

test('remover personagem descarta o render que ficou sem referências na cena', () => {
  const character = makeElement('actor-1', 'character', 'character-render')
  const studio = makeStudio({ elements: [character] })

  const next = removeStudioCharacterElement(studio, character, removedAt)

  assert.deepEqual(next.elements, [])
  assert.deepEqual(next.assets.map((asset) => asset.id), ['other-asset'])
  assert.equal(next.updatedAt, removedAt)
  assert.equal(studio.elements.length, 1)
  assert.equal(studio.assets.length, 2)
})

test('mantém o render enquanto outro elemento da cena referencia o mesmo asset', () => {
  const character = makeElement('actor-1', 'character', 'character-render')
  const otherCharacter = makeElement('actor-2', 'character', 'character-render')
  const studio = makeStudio({ elements: [character, otherCharacter] })

  const next = removeStudioCharacterElement(studio, character, removedAt)

  assert.deepEqual(next.elements, [otherCharacter])
  assert.ok(next.assets.some((asset) => asset.id === 'character-render'))
})

test('mantém o asset quando o fundo ainda aponta para ele', () => {
  const character = makeElement('actor-1', 'character', 'character-render')
  const studio = makeStudio({ backgroundAssetId: 'character-render', elements: [character] })

  const next = removeStudioCharacterElement(studio, character, removedAt)

  assert.equal(next.backgroundAssetId, 'character-render')
  assert.ok(next.assets.some((asset) => asset.id === 'character-render'))
})

test('remove apenas o asset do personagem e preserva assets locais não relacionados', () => {
  const character = makeElement('actor-1', 'character', 'character-render')
  const studio = makeStudio({ elements: [character, makeElement('image-1', 'image', 'other-asset')] })

  const next = removeStudioCharacterElement(studio, character, removedAt)

  assert.deepEqual(next.elements.map((element) => element.id), ['image-1'])
  assert.deepEqual(next.assets.map((asset) => asset.id), ['other-asset'])
})

test('StudioPage delega remoção da cena ao modelo e mantém a seleção na página', () => {
  assert.match(studioPageSource, /removeStudioCharacterElement\(studio, element, new Date\(\)\.toISOString\(\)\)/)
  assert.match(studioPageSource, /if \(selectedElementId === element\.id\) setSelectedElementId\(null\)/)
})
