import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createEyeSheetImportPlan,
  createEyebrowImportPlan,
  createFaceDetailImportEntry,
  initialFaceComponentTransform
} from '../src/renderer/src/features/fabricator/face/faceComponentImportModel.ts'

const head = { width: 100, height: 200 }
const fixedTime = '2026-10-29T15:00:00.000Z'

function idSequence() {
  let value = 0
  return () => `generated-${++value}`
}

test('eye sheet plan preserves pair IDs, mirrored sides and closed-eye fit', () => {
  const plan = createEyeSheetImportPlan({
    pieces: [
      { kind: 'eye', width: 20, height: 20, dataUrl: 'data:eye' },
      { kind: 'pupil', width: 10, height: 8, dataUrl: 'data:pupil' },
      { kind: 'eye-closed', width: 20, height: 10, dataUrl: 'data:closed' }
    ],
    fileName: 'folha.png', modelSlot: 3, head, createId: idSequence(), now: () => fixedTime
  })

  assert.equal(plan.entries.length, 6)
  assert.equal(plan.assets.every((asset) => asset.pairId === plan.assets[0].pairId), true)
  assert.equal(new Set(plan.assets.map((asset) => asset.id)).size, 6)
  assert.equal(plan.assets[0].name, 'folha · Olho esquerdo')
  assert.equal(plan.assets[1].defaultTransform.x, 63)
  assert.equal(plan.assets[1].defaultTransform.flipX, true)
  assert.equal(plan.assets[4].defaultTransform.y, plan.assets[0].defaultTransform.y)
  assert.equal(plan.assets[4].defaultTransform.scaleX, plan.assets[0].defaultTransform.scaleX)
  assert.equal(plan.assigned['eye-left'], plan.assets[0].id)
  assert.equal(plan.assigned['eye-closed-right'], plan.assets[5].id)
  assert.equal(plan.entries[0].dataUrl, 'data:eye')
  assert.equal(plan.assets[0].updatedAt, fixedTime)
})

test('eye sheet plan aligns each side to the saved import anchors', () => {
  const plan = createEyeSheetImportPlan({
    pieces: [{ kind: 'eye', width: 20, height: 20, dataUrl: 'data:eye' }],
    fileName: 'olhos.webp', modelSlot: 1, head,
    anchors: {
      eye: {
        left: { width: 30, height: 25, transform: { x: 42, y: 88, scaleX: 1.5, scaleY: 1.2, rotation: -3 } },
        right: { width: 40, height: 24, transform: { x: 57, y: 90, scaleX: .75, scaleY: .8, rotation: 4, flipX: true } }
      }
    },
    createId: idSequence(), now: () => fixedTime
  })

  const [left, right] = plan.assets.map((asset) => asset.defaultTransform)
  assert.deepEqual(left, { x: 42, y: 88, scaleX: 2.25, scaleY: 1.5, rotation: -3 })
  assert.deepEqual({ x: right.x, y: right.y, scaleX: right.scaleX, rotation: right.rotation, flipX: right.flipX }, { x: 57, y: 90, scaleX: 1.5, rotation: 4, flipX: true })
  assert.ok(Math.abs(right.scaleY - .96) < Number.EPSILON * 2)
})

test('eyebrow and face-detail plans preserve default placement and clean filenames', () => {
  const brow = createEyebrowImportPlan({
    fileName: 'franja.png', modelSlot: 2, head, width: 40, height: 12, dataUrl: 'data:brow',
    createId: idSequence(), now: () => fixedTime
  })
  assert.equal(brow.entries[0].asset.name, 'franja · Sobrancelha esquerda')
  assert.equal(brow.entries[0].asset.pairId, brow.entries[1].asset.pairId)
  assert.equal(brow.entries[1].asset.rightSidePositioned, true)
  assert.equal(brow.entries[0].asset.defaultTransform.x + brow.entries[1].asset.defaultTransform.x, head.width)
  assert.equal(brow.entries[1].asset.defaultTransform.flipX, true)
  assert.equal(brow.leftId, brow.entries[0].asset.id)
  assert.equal(brow.rightId, brow.entries[1].asset.id)

  const detail = createFaceDetailImportEntry({
    kind: 'blush', fileName: 'bochecha.png', fallbackName: 'Blush', modelSlot: 2, head,
    width: 10, height: 8, dataUrl: 'data:blush', createId: idSequence(), now: () => fixedTime
  })
  assert.equal(detail.asset.name, 'bochecha')
  assert.deepEqual(detail.asset.defaultTransform, { x: 50, y: 136, scaleX: 2.4, scaleY: 2.4, rotation: 0 })
  assert.deepEqual(initialFaceComponentTransform('eye', head, 20, 20), { x: 37, y: 92, scaleX: .95, scaleY: 1.7, rotation: 0 })
})

test('eye sheet plan rejects a closed-eye image that cannot fit the open-eye width', () => {
  assert.throws(() => createEyeSheetImportPlan({
    pieces: [
      { kind: 'eye', width: 20, height: 20, dataUrl: 'data:eye' },
      { kind: 'eye-closed', width: .04, height: 10, dataUrl: 'data:closed' }
    ],
    fileName: 'olhos.png', modelSlot: 1, head, createId: idSequence(), now: () => fixedTime
  }), /estreito demais/)
})
