import test from 'node:test'
import assert from 'node:assert/strict'
import { selectWardrobePreviewComponents } from '../src/renderer/src/features/fabricator/wardrobe/wardrobeWorkspaceModel.ts'

const shirt = { id: 'shirt' }
const shoeLeft = { id: 'left', sleevePairId: 'shoe-pair', sleeveSide: 'left' }
const shoeRight = { id: 'right', sleevePairId: 'shoe-pair', sleeveSide: 'right' }
const other = { id: 'other', sleevePairId: 'other-pair' }
const components = [shirt, shoeLeft, shoeRight, other]

test('complete outfit keeps every piece visible when selecting a paired or unpaired garment', () => {
  for (const selected of [shirt, shoeLeft, shoeRight, null]) assert.deepEqual(selectWardrobePreviewComponents(components, undefined, selected), components)
})

test('paired sheet previews keep showing only the chosen pair', () => {
  assert.deepEqual(selectWardrobePreviewComponents(components, 'shoe-grid-3x4', shoeLeft), [shoeLeft, shoeRight])
  assert.deepEqual(selectWardrobePreviewComponents(components, 'shoe-grid-3x4', shirt), [shirt])
  assert.deepEqual(selectWardrobePreviewComponents(components, 'shoe-grid-3x4', null), [])
})
