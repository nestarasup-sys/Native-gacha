import test from 'node:test'
import assert from 'node:assert/strict'
import { articulateJoinedLimbSplit, canArticulateJoinedLimbSplit } from '../src/renderer/src/features/fabricator/models/joinedLimbSplit.ts'
import { findBodyJointBridgePairs } from '../src/renderer/src/characters/bodyJointBridge.ts'

const part = (id, name, x, y, width = 20, height = 30, extra = {}) => ({
  id, name, x, y, width, height, rotation: 0,
  dataUrl: 'data:image/png;base64,AA==',
  sourceTransform: { x, y, width, height, rotation: 0 },
  ...extra
})

test('joined arm split names both segments, preserves the shoulder link, and links the elbow to the new lower id', () => {
  const torso = part('torso', 'Tronco', 80, -40, 60, 45)
  const original = part('arm', 'Braço Esquerdo', 96, 0, 20, 100, { jointAnchor: { x: 100, y: 2 } })
  const hand = part('hand', 'Mão Esquerda', 96, 100)
  const upper = part('arm', 'Braço Esquerdo', 96, 0, 20, 50, { jointAnchor: { x: 100, y: 2 } })
  const lower = part('lower', 'Braço Esquerdo - parte', 96, 50, 20, 50, { splitOriginPartId: 'arm' })
  const joints = [
    { id: 'shoulder', parentPartId: 'torso', childPartId: 'arm', parentAnchor: { x: 100, y: 0 }, childAnchor: { x: 100, y: 2 } },
    { id: 'wrist', parentPartId: 'arm', childPartId: 'hand', parentAnchor: { x: 100, y: 100 }, childAnchor: { x: 100, y: 100 } }
  ]

  const result = articulateJoinedLimbSplit({
    original,
    splitParts: [upper, lower],
    parts: [torso, original, hand],
    joints,
    start: { x: 0, y: 50 },
    end: { x: 20, y: 50 },
    createId: () => 'elbow'
  })

  assert.ok(result)
  assert.equal(result.upper.id, 'arm')
  assert.equal(result.upper.name, 'Braço esquerdo')
  assert.equal(result.lower.name, 'Antebraço esquerdo')
  assert.equal(result.lower.splitOriginPartId, 'arm')
  assert.deepEqual(result.joints.map(({ id, parentPartId, childPartId }) => ({ id, parentPartId, childPartId })), [
    { id: 'shoulder', parentPartId: 'torso', childPartId: 'arm' },
    { id: 'wrist', parentPartId: 'lower', childPartId: 'hand' },
    { id: 'elbow', parentPartId: 'arm', childPartId: 'lower' }
  ])
  assert.equal(result.joints[2].fixed, true)
  assert.deepEqual(result.joints[2].pivot, { x: 106, y: 50 })
})

test('joined leg is cut into hip-side thigh and knee-side shin; already segmented pieces stay generic', () => {
  const torso = part('torso', 'Corpo', 80, -20, 60, 40)
  const original = part('leg', 'Perna Direita', 105, 20, 24, 100)
  const upper = part('leg', 'Perna Direita', 105, 20, 24, 45)
  const lower = part('lower', 'Perna Direita - parte', 105, 65, 24, 55, { splitOriginPartId: 'leg' })
  const result = articulateJoinedLimbSplit({
    original, splitParts: [upper, lower], parts: [torso, original], joints: [],
    start: { x: 0, y: 45 }, end: { x: 24, y: 45 }, createId: () => 'knee'
  })

  assert.ok(result)
  assert.equal(result.family, 'leg')
  assert.equal(result.upper.name, 'Coxa direito')
  assert.equal(result.lower.name, 'Canela direito')
  assert.equal(articulateJoinedLimbSplit({
    original: part('thigh', 'Coxa esquerda', 0, 0),
    splitParts: [upper, lower],
    parts: [torso, part('shin', 'Canela esquerda', 0, 30)],
    joints: [{ id: 'knee-existing', parentPartId: 'thigh', childPartId: 'shin', parentAnchor: { x: 0, y: 20 }, childAnchor: { x: 0, y: 30 } }],
    start: { x: 0, y: 1 }, end: { x: 4, y: 1 }
  }), null)
})

test('divisor de juntas só fica disponível para membro inteiro ainda não dividido', () => {
  const torso = part('torso', 'Tronco', 80, -40, 60, 45)
  const wholeArm = part('arm', 'Braço esquerdo', 96, 0, 20, 100)
  const upperArm = part('upper', 'Braço esquerdo', 96, 0, 20, 50)
  const forearm = part('forearm', 'Antebraço esquerdo', 96, 50, 20, 50)

  assert.equal(canArticulateJoinedLimbSplit(wholeArm, [torso, wholeArm], []), true)
  assert.equal(canArticulateJoinedLimbSplit(upperArm, [torso, upperArm, forearm], [
    { id: 'elbow', parentPartId: 'upper', childPartId: 'forearm', parentAnchor: { x: 0, y: 0 }, childAnchor: { x: 0, y: 0 } }
  ]), false)
})

test('body bridge is opt-in and only accepts linked matching limb segments on the same side', () => {
  const upperArm = part('arm', 'Braço esquerdo', 0, 0)
  const lowerArm = part('forearm', 'Antebraço esquerdo', 0, 30)
  const upperLeg = part('thigh', 'Coxa direita', 40, 0)
  const lowerLeg = part('shin', 'Canela direita', 40, 30)
  const mismatched = part('wrong', 'Canela esquerda', 70, 30)
  const joints = [
    { id: 'arm', parentPartId: 'forearm', childPartId: 'arm', parentAnchor: { x: 0, y: 0 }, childAnchor: { x: 0, y: 0 } },
    { id: 'leg', parentPartId: 'thigh', childPartId: 'shin', parentAnchor: { x: 0, y: 0 }, childAnchor: { x: 0, y: 0 } },
    { id: 'bad-side', parentPartId: 'arm', childPartId: 'wrong', parentAnchor: { x: 0, y: 0 }, childAnchor: { x: 0, y: 0 } }
  ]
  const artwork = { parts: [upperArm, lowerArm, upperLeg, lowerLeg, mismatched], joints, hiddenPartIds: [] }

  assert.deepEqual(findBodyJointBridgePairs({ ...artwork, bodyJointBridgeEnabled: false }), [])
  assert.deepEqual(findBodyJointBridgePairs({ ...artwork, bodyJointBridgeEnabled: true }).map(({ upper, lower, family }) => [upper.id, lower.id, family]), [
    ['arm', 'forearm', 'arm'],
    ['thigh', 'shin', 'leg']
  ])
  assert.deepEqual(findBodyJointBridgePairs({ ...artwork, bodyJointBridgeEnabled: true, hiddenPartIds: ['forearm'] }).map(({ family }) => family), ['leg'])
})
