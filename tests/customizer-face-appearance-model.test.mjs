import test from 'node:test'
import assert from 'node:assert/strict'
import { customizerFaceAppearanceForModel, customizerMouthBlushAppearance } from '../src/renderer/src/features/customizer/customizerFaceAppearanceModel.ts'

test('novo modelo começa com valores faciais padrão e sem configuração herdada', () => {
  assert.deepEqual(customizerFaceAppearanceForModel(undefined, 2), {
    modelSlot: 2,
    eyeState: 0,
    eyebrows: true,
    noseIndex: 0,
    expressionIndex: 0,
    mouthOpen: false
  })
})

test('mesmo modelo preserva aparência facial em um novo objeto sem alterar a origem', () => {
  const previous = {
    modelSlot: 2,
    eyeState: 2,
    eyebrows: false,
    noseIndex: 3,
    expressionIndex: 4,
    mouthOpen: true,
    mouthBlushEnabled: true,
    mouthBlushColor: '#ab3481',
    mouthBlushOpacity: 0.42,
    facePalettes: { mouth: { base: '#abcdef' } }
  }

  const next = customizerFaceAppearanceForModel(previous, 2)
  assert.notEqual(next, previous)
  assert.deepEqual(next, previous)
  assert.deepEqual(previous, {
    modelSlot: 2,
    eyeState: 2,
    eyebrows: false,
    noseIndex: 3,
    expressionIndex: 4,
    mouthOpen: true,
    mouthBlushEnabled: true,
    mouthBlushColor: '#ab3481',
    mouthBlushOpacity: 0.42,
    facePalettes: { mouth: { base: '#abcdef' } }
  })
})

test('trocar modelo reinicia os valores e não transfere ajustes do modelo anterior', () => {
  const previous = {
    modelSlot: 1,
    eyeState: 2,
    eyebrows: false,
    noseIndex: 3,
    expressionIndex: 4,
    mouthOpen: true,
    mouthBlushEnabled: true,
    mouthBlushColor: '#ab3481',
    mouthBlushOpacity: 0.42
  }

  assert.deepEqual(customizerFaceAppearanceForModel(previous, 2), {
    modelSlot: 2,
    eyeState: 0,
    eyebrows: true,
    noseIndex: 0,
    expressionIndex: 0,
    mouthOpen: false
  })
})

test('blush na boca mantém preferências no mesmo modelo e começa desligado ao trocar', () => {
  const previous = {
    modelSlot: 1,
    eyeState: 2,
    eyebrows: false,
    noseIndex: 3,
    expressionIndex: 4,
    mouthOpen: true,
    mouthBlushEnabled: true,
    mouthBlushColor: '#ab3481',
    mouthBlushOpacity: 0.42
  }

  assert.deepEqual(customizerMouthBlushAppearance(previous, 1, { mouthBlushColor: '#3197db' }), {
    ...previous,
    mouthBlushColor: '#3197db'
  })
  assert.deepEqual(customizerMouthBlushAppearance(previous, 2, { mouthBlushColor: '#3197db' }), {
    modelSlot: 2,
    eyeState: 0,
    eyebrows: true,
    noseIndex: 0,
    expressionIndex: 0,
    mouthOpen: false,
    mouthBlushEnabled: false,
    mouthBlushColor: '#3197db'
  })
})
