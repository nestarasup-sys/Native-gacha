import test from 'node:test'
import assert from 'node:assert/strict'
import { duplicateWardrobeOpposite, oppositeWardrobePart } from '../src/renderer/src/features/fabricator/wardrobe/duplicateWardrobeOpposite.ts'
import { pairedWardrobeShoeComponents } from '../src/renderer/src/features/customizer/wardrobePanelModel.ts'
import { wardrobePairImageMode } from '../src/renderer/src/features/fabricator/wardrobe/wardrobePairedSheetPolicy.ts'

const left = { id: 'left', name: 'Pé esquerdo', x: 20, y: 30, width: 20, height: 30, rotation: 0 }
const right = { id: 'right', name: 'Pé direito', x: 100, y: 40, width: 20, height: 30, rotation: 0 }
const shoe = { id: 'shoe', name: 'Sapato · direita', category: 'sapato', attachedPartId: 'right', x: 110, y: 42, width: 15, height: 20, rotation: 5, dataUrl: 'original', glue: { version: 1, mode: 'loose' }, deformationOriginalDataUrl: 'backup', deformationOriginalFrame: { x: 108, y: 41, width: 16, height: 21 } }

test('duplicates a shoe to the opposite foot, preserves geometry and links the pair', () => {
  assert.equal(oppositeWardrobePart(shoe, [left, right]), left)
  const { original, copy } = duplicateWardrobeOpposite(shoe, right, left, 'copy', 'pair')
  assert.equal(copy.attachedPartId, 'left')
  assert.deepEqual([copy.x, copy.y, copy.rotation, copy.dataUrl], [30, 32, 5, 'original'])
  assert.deepEqual([copy.deformationOriginalFrame.x, copy.deformationOriginalFrame.y, copy.deformationOriginalDataUrl], [28, 31, 'backup'])
  assert.equal(copy.name, 'Sapato · esquerda')
  assert.equal(shoe.sleevePairId, undefined)
  assert.deepEqual(pairedWardrobeShoeComponents({ components: [original, copy] }, copy).map((item) => item.id).sort(), ['copy', 'shoe'])
  assert.equal(wardrobePairImageMode(undefined, 'sapato'), 'copy')
})

test('does not reuse an existing pair or invent an ambiguous opposite side', () => {
  const existing = { ...shoe, sleevePairId: 'existing', sleeveSide: 'right', sleeveSegment: 'whole' }
  const { original, copy } = duplicateWardrobeOpposite(existing, right, left, 'copy', 'new-pair')
  assert.equal(original.sleevePairId, 'existing')
  assert.equal(copy.sleevePairId, undefined)
  assert.equal(oppositeWardrobePart(shoe, [left, { ...left, id: 'other' }, right]), null)
})
