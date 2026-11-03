import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveRefreshedFaceAppearance } from '../src/renderer/src/features/editorV6/editorV6RefreshAppearance.ts'

const oldAppearance = { modelSlot: 1, components: { eyes: { assetId: 'old-eye', color: 'blue' }, mouth: { assetId: 'mouth' } }, headExtras: {} }
const currentAppearance = { modelSlot: 1, components: { eyes: { assetId: 'new-eye', color: 'green' }, mouth: { assetId: 'mouth' } }, headExtras: { glasses: 'glasses' } }
const character = { updatedAt: 'new', customization: { faceAppearance: currentAppearance } }

test('refresh adopts changed source appearance including accessories and colors', () => {
  const state = { characterSourceUpdatedAt: 'old', faceAppearance: oldAppearance, expressionBase: { appearance: oldAppearance, transforms: {} } }
  assert.deepEqual(resolveRefreshedFaceAppearance(state, character), currentAppearance)
})

test('refresh preserves explicit scene facial changes and applies unrelated source changes', () => {
  const sceneAppearance = structuredClone(oldAppearance)
  sceneAppearance.components.mouth.assetId = 'scene-mouth'
  const state = { characterSourceUpdatedAt: 'old', faceAppearance: sceneAppearance, expressionBase: { appearance: oldAppearance, transforms: {} } }
  const result = resolveRefreshedFaceAppearance(state, character)
  assert.equal(result.components.mouth.assetId, 'scene-mouth')
  assert.deepEqual(result.components.eyes, currentAppearance.components.eyes)
  assert.deepEqual(result.headExtras, currentAppearance.headExtras)
})

test('keeps current scene edits and refreshes legacy states with no stored base', () => {
  const sceneAppearance = { ...oldAppearance, modelSlot: 9 }
  assert.equal(resolveRefreshedFaceAppearance({ characterSourceUpdatedAt: 'new', faceAppearance: sceneAppearance }, character), sceneAppearance)
  assert.equal(resolveRefreshedFaceAppearance({ characterSourceUpdatedAt: 'old', faceAppearance: sceneAppearance }, character), currentAppearance)
})
