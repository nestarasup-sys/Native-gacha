import test from 'node:test'
import assert from 'node:assert/strict'
import { withCharacterGenderTorso } from '../src/renderer/src/characters/characterSourceResolver.ts'

const originalTorso = { id: 'torso', name: 'Tronco', x: 10, y: 20, width: 40, height: 50, rotation: 0, dataUrl: 'female.png' }
const source = { slot: 1, width: 200, height: 300, parts: [originalTorso], maleTorso: { ...originalTorso, id: 'male-torso', name: 'Tronco masculino', x: 8, y: 22, width: 50, height: 60, rotation: 5, dataUrl: 'male.png' } }

test('personagem masculino recebe a cópia masculina preservando a transformação relativa da pose', () => {
  const pose = { width: 200, height: 300, parts: [{ ...originalTorso, x: 30, y: 40, width: 80, height: 100, rotation: 10 }, { id: 'head', name: 'Cabeça', dataUrl: 'head.png' }] }
  const artwork = withCharacterGenderTorso(pose, source, 'male')
  assert.deepEqual(artwork.parts[0], { ...pose.parts[0], dataUrl: 'male.png', x: 28, y: 42, width: 100, height: 120, rotation: 15, fakeSkinContours: undefined })
  assert.equal(artwork.parts[1], pose.parts[1])
  assert.equal(pose.parts[0].dataUrl, 'female.png')
})

test('personagens femininos e masculinos sem cópia salva mantêm o tronco de origem', () => {
  assert.equal(withCharacterGenderTorso({ parts: [originalTorso] }, source, 'female').parts[0].dataUrl, 'female.png')
  const legacy = { ...source, maleTorso: undefined }
  assert.equal(withCharacterGenderTorso({ parts: [originalTorso] }, legacy, 'male').parts[0].dataUrl, 'female.png')
})
