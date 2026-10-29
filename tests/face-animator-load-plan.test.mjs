import test from 'node:test'
import assert from 'node:assert/strict'
import { faceAnimatorAssetRequirements, standardFaceAnimatorPresetIds } from '../src/renderer/src/features/fabricator/faceAnimatorLoadPlan.ts'

test('Face Animator lista somente os presets do conjunto Padrão', () => {
  const summaries = [
    { id: 'standard-a', collectionId: 'standard' },
    { id: 'custom-a', collectionId: 'custom' },
    { id: 'legacy' }
  ]
  assert.deepEqual(standardFaceAnimatorPresetIds(summaries), ['standard-a'])
})

test('Face Animator carrega assets únicos referenciados pelos presets Padrão', () => {
  const preset = (collectionId, selections) => ({ collectionId, selections })
  const presets = [
    preset('standard', {
      eyes: { left: 'eye-left', right: 'eye-right' }, pupils: { left: 'pupil', right: 'pupil' },
      eyebrows: { left: null, right: 'brow' }, nose: { catalogId: 'nose', index: 0 },
      mouth: { catalogId: 'mouth', kind: 'mouth-closed', index: 1 }
    }),
    preset('standard', {
      eyes: { left: 'eye-left', right: null }, pupils: { left: null, right: null },
      eyebrows: { left: null, right: null }, nose: null, mouth: { catalogId: 'mouth', kind: 'mouth-open', index: 0 }
    }),
    preset('custom', {
      eyes: { left: 'unused-eye', right: null }, pupils: { left: null, right: null }, eyebrows: { left: null, right: null },
      nose: { catalogId: 'unused-nose', index: 0 }, mouth: null
    })
  ]

  assert.deepEqual(faceAnimatorAssetRequirements(presets), {
    componentIds: ['eye-left', 'eye-right', 'pupil', 'brow'],
    catalogIds: ['nose', 'mouth']
  })
})
