import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanWardrobeGreenEdges, reprocessWardrobeGreenChroma } from '../src/renderer/src/features/fabricator/wardrobe/wardrobeChroma.ts'

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

test('reprocesses connected green residue without removing enclosed green details', () => {
  const pixels = new Uint8ClampedArray(7 * 7 * 4)
  const set = (x, y, rgba) => pixels.set(rgba, (y * 7 + x) * 4)
  const alpha = (x, y) => pixels[(y * 7 + x) * 4 + 3]
  for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) set(x, y, [80, 80, 90, 255])
  set(1, 3, [0, 220, 0, 255])
  set(2, 3, [0, 220, 0, 255])
  set(4, 3, [0, 220, 0, 255])
  assert.ok(reprocessWardrobeGreenChroma(pixels, 7, 7) >= 2)
  assert.equal(alpha(1, 3), 0)
  assert.equal(alpha(2, 3), 0)
  assert.equal(alpha(4, 3), 255)
  assert.equal(alpha(3, 3), 255)
})
