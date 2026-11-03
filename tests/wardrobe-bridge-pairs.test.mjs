import test from 'node:test'
import assert from 'node:assert/strict'
import { findWardrobeBridgePairs } from '../src/renderer/src/characters/wardrobeBridgePairs.ts'

const joint = (upper, lower, family) => ({ upper: { id: upper }, lower: { id: lower }, family })
const piece = (id, category, bone, setId = 'set', extra = {}) => ({ group: { modelSlot: 1, setId }, component: { id, category, attachedPartId: bone, ...extra } })
const joints = [joint('thigh-l', 'shin-l', 'leg'), joint('thigh-r', 'shin-r', 'leg'), joint('arm-l', 'forearm-l', 'arm'), joint('arm-r', 'forearm-r', 'arm')]

test('recognizes each leg and arm from the model joints in the same set', () => {
  const items = [piece('tl', 'calca-coxa', 'thigh-l'), piece('sl', 'calca-canela', 'shin-l'), piece('tr', 'calca-coxa', 'thigh-r'), piece('sr', 'calca-canela', 'shin-r'), piece('al', 'manga-superior', 'arm-l'), piece('fl', 'manga-inferior', 'forearm-l'), piece('ar', 'manga-superior', 'arm-r'), piece('fr', 'manga-inferior', 'forearm-r')]
  assert.deepEqual(findWardrobeBridgePairs(items, joints).map(({ upper, lower }) => [upper.component.id, lower.component.id]), [['tl', 'sl'], ['tr', 'sr'], ['al', 'fl'], ['ar', 'fr']])
})

test('does not infer ambiguous pieces, different sets, or mismatched sides', () => {
  const items = [piece('a', 'calca-coxa', 'thigh-l'), piece('b', 'calca-coxa', 'thigh-l'), piece('c', 'calca-canela', 'shin-l'), piece('d', 'manga-superior', 'arm-l'), piece('e', 'manga-inferior', 'forearm-r'), piece('f', 'manga-inferior', 'forearm-l', 'other')]
  assert.deepEqual(findWardrobeBridgePairs(items, joints), [])
})

test('keeps existing explicit pairs without duplicating them', () => {
  const shared = { sleevePairId: 'pair', sleeveSide: 'left' }
  const upper = piece('a', 'manga-superior', 'arm-l', 'set', { ...shared, sleeveSegment: 'upper' })
  const lower = piece('b', 'manga-inferior', 'forearm-l', 'set', { ...shared, sleeveSegment: 'lower' })
  assert.deepEqual(findWardrobeBridgePairs([upper, lower], joints), [{ upper, lower }])
})
