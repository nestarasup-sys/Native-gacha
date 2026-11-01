import test from 'node:test'
import assert from 'node:assert/strict'
import { extractAlphaContourPoints, nearestAlphaContourPoint } from '../src/renderer/src/features/fabricator/models/maleTorsoContour.ts'

test('extrai a borda alfa da silhueta para servir de alvo ao puxar contorno', () => {
  const width = 5
  const height = 5
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 1; y <= 3; y += 1) for (let x = 1; x <= 3; x += 1) rgba[(y * width + x) * 4 + 3] = 255
  const contour = extractAlphaContourPoints(rgba, width, height)
  assert.equal(contour.length, 8)
  assert.deepEqual(nearestAlphaContourPoint(contour, { x: 0.5, y: 2.5 }), { point: { x: 1.5, y: 2.5 }, distance: 1 })
})

test('retorna contorno vazio para imagem sem pixels opacos ou dimensões inválidas', () => {
  assert.deepEqual(extractAlphaContourPoints(new Uint8ClampedArray(16), 2, 2), [])
  assert.deepEqual(extractAlphaContourPoints(new Uint8ClampedArray(), 0, 4), [])
  assert.equal(nearestAlphaContourPoint([], { x: 0, y: 0 }), null)
})
