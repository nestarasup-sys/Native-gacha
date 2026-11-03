import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanWardrobeGreenEdges } from '../src/renderer/src/features/fabricator/wardrobe/wardrobeChroma.ts'

test('cleaning removes green spill at transparent edges while preserving the interior and other colors', () => {
  const pixels = new Uint8ClampedArray(5 * 5 * 4)
  const set = (x, y, rgba) => pixels.set(rgba, (y * 5 + x) * 4)
  const get = (x, y) => [...pixels.slice((y * 5 + x) * 4, (y * 5 + x) * 4 + 4)]
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) set(x, y, [80, 150, 80, 255])
  set(3, 1, [180, 40, 70, 255])
  cleanWardrobeGreenEdges(pixels, 5, 5, [0, 255, 0])
  assert.ok(get(1, 1)[1] < 150)
  assert.deepEqual(get(2, 2), [80, 150, 80, 255])
  assert.deepEqual(get(3, 1), [180, 40, 70, 255])
  assert.equal(get(0, 0)[3], 0)
})
