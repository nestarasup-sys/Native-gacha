import test from 'node:test'
import assert from 'node:assert/strict'
import { wardrobePreviewGenderOf, wardrobePreviewTorsoImage } from '../src/renderer/src/features/fabricator/wardrobe/wardrobePreviewGender.ts'

const maleTorso = { dataUrl: 'data:image/png;base64,male-torso' }

test('gênero ausente em conjuntos antigos usa referência feminina', () => {
  assert.equal(wardrobePreviewGenderOf(undefined), 'female')
  assert.equal(wardrobePreviewTorsoImage({ name: 'Tronco' }, maleTorso, undefined), null)
})

test('referência masculina substitui apenas a imagem do tronco', () => {
  assert.equal(wardrobePreviewTorsoImage({ name: 'Tronco' }, maleTorso, 'male'), maleTorso.dataUrl)
  assert.equal(wardrobePreviewTorsoImage({ name: 'Braço esquerdo' }, maleTorso, 'male'), null)
  assert.equal(wardrobePreviewTorsoImage({ name: 'Tronco' }, undefined, 'male'), null)
})
