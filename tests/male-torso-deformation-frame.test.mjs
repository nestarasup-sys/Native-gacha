import test from 'node:test'
import assert from 'node:assert/strict'
import { createMaleTorsoDeformationPatch } from '../src/renderer/src/features/fabricator/models/maleTorsoDeformation.ts'

test('deformar o tronco substitui os pixels sem alterar o tamanho ou a posição da prévia', () => {
  const source = {
    id: 'male-torso', name: 'Tronco masculino', x: 459, y: 338, width: 225, height: 305,
    rotation: 0, dataUrl: 'original.png', fakeSkinContours: [{ x: 0.5, y: 0.5 }]
  }
  const result = createMaleTorsoDeformationPatch(source, 'deformed.png')
  assert.equal(result.dataUrl, 'deformed.png')
  assert.deepEqual({ x: result.x, y: result.y, width: result.width, height: result.height, rotation: result.rotation },
    { x: 459, y: 338, width: 225, height: 305, rotation: 0 })
  assert.equal(result.fakeSkinContours, undefined)
  assert.equal(source.dataUrl, 'original.png')
})
