import test from 'node:test'
import assert from 'node:assert/strict'
import { detectWardrobeJointSeam, expandWardrobeJointBridgeTriangle, fillWardrobeJointGapPixels } from '../src/renderer/src/characters/wardrobeJointBridge.ts'

const rectangleMask = (width, height, rectangles) => {
  const data = new Uint8Array(width * height)
  for (const { x, y, width: rectangleWidth, height: rectangleHeight } of rectangles) {
    for (let row = y; row < y + rectangleHeight; row += 1) {
      for (let column = x; column < x + rectangleWidth; column += 1) data[row * width + column] = 255
    }
  }
  return { width, height, data }
}

const rgbaForMasks = (width, height, upperRects, lowerRects) => {
  const data = new Uint8ClampedArray(width * height * 4)
  const paint = (rectangles, color) => {
    for (const { x, y, width: rectangleWidth, height: rectangleHeight } of rectangles) {
      for (let row = y; row < y + rectangleHeight; row += 1) {
        for (let column = x; column < x + rectangleWidth; column += 1) {
          data.set(color, (row * width + column) * 4)
        }
      }
    }
  }
  paint(upperRects, [35, 45, 65, 255])
  paint(lowerRects, [75, 85, 105, 255])
  return data
}

test('joint bridge triangle clips overlap slightly to hide rasterization seams', () => {
  const triangle = [{ x: 2, y: 1 }, { x: 12, y: 1 }, { x: 2, y: 9 }]
  const expanded = expandWardrobeJointBridgeTriangle(triangle, 1.25)
  const center = {
    x: triangle.reduce((total, point) => total + point.x, 0) / triangle.length,
    y: triangle.reduce((total, point) => total + point.y, 0) / triangle.length
  }

  for (let index = 0; index < triangle.length; index += 1) {
    const originalDistance = Math.hypot(triangle[index].x - center.x, triangle[index].y - center.y)
    const expandedDistance = Math.hypot(expanded[index].x - center.x, expanded[index].y - center.y)
    assert.ok(Math.abs(expandedDistance - originalDistance - 1.25) < 1e-9)
  }
  assert.deepEqual(triangle, [{ x: 2, y: 1 }, { x: 12, y: 1 }, { x: 2, y: 9 }], 'source triangle geometry must stay unchanged')
})

test('a tiny transparent joint gap is detected and filled from the two garment edges', () => {
  const width = 40, height = 28
  const upperRects = [{ x: 4, y: 3, width: 32, height: 9 }]
  const lowerRects = [{ x: 4, y: 13, width: 32, height: 9 }]
  const seam = detectWardrobeJointSeam(
    rectangleMask(width, height, upperRects),
    rectangleMask(width, height, lowerRects),
    4
  )

  assert.ok(seam?.gapSamples?.length, 'one transparent row between the parts should be recognized')
  const pixels = rgbaForMasks(width, height, upperRects, lowerRects)
  const patch = fillWardrobeJointGapPixels(pixels, width, height, seam)

  assert.ok(patch)
  assert.ok(patch[(12 * width + 20) * 4 + 3] > 0, 'the open row should receive garment pixels')
  assert.equal(patch[(0 * width + 0) * 4 + 3], 0, 'pixels outside the seam must stay untouched')
  assert.ok(pixels[(12 * width + 20) * 4 + 3] > 0, 'the bridge source must contain the repaired pixels')
})

test('a larger gap is left alone instead of stretching the garment across it', () => {
  const width = 40, height = 36
  const upperRects = [{ x: 4, y: 3, width: 32, height: 9 }]
  const lowerRects = [{ x: 4, y: 22, width: 32, height: 9 }]
  const seam = detectWardrobeJointSeam(
    rectangleMask(width, height, upperRects),
    rectangleMask(width, height, lowerRects),
    4
  )

  assert.equal(seam, null)
})

test('near-gap repair supplements a seam that already touches elsewhere', () => {
  const width = 40, height = 28
  const upperRects = [{ x: 4, y: 3, width: 32, height: 9 }]
  const lowerRects = [
    { x: 4, y: 13, width: 32, height: 9 },
    { x: 17, y: 12, width: 4, height: 1 }
  ]
  const seam = detectWardrobeJointSeam(
    rectangleMask(width, height, upperRects),
    rectangleMask(width, height, lowerRects),
    4
  )

  assert.ok(seam?.gapSamples?.length, 'the touching middle must not hide open sections of the joint')
  const pixels = rgbaForMasks(width, height, upperRects, lowerRects)
  const patch = fillWardrobeJointGapPixels(pixels, width, height, seam)
  assert.ok(patch?.[(12 * width + 8) * 4 + 3] > 0, 'the still-open edge should be filled')
})
