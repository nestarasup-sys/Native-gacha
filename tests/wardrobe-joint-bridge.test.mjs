import test from 'node:test'
import assert from 'node:assert/strict'
import { anchorWardrobeJointSeam, detectWardrobeJointSeam, drawWardrobeJointBridgeMesh, expandWardrobeJointBridgeTriangle, fillWardrobeJointGapPixels, wardrobeJointBridgeAnchorSearchRadius } from '../src/renderer/src/characters/wardrobeJointBridge.ts'

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

test('joint bridge follows the saved joint anchor and keeps its gap samples aligned', () => {
  const seam = {
    center: { x: 10, y: 20 }, tangent: { x: 1, y: 0 }, normal: { x: 0, y: 1 },
    minTangent: -8, maxTangent: 12,
    gapSamples: [{ tangent: 2, upperNormal: 3, lowerNormal: 1 }]
  }
  const anchored = anchorWardrobeJointSeam(seam, { x: 14, y: 23 })

  assert.deepEqual(anchored.center, { x: 14, y: 23 })
  assert.equal(anchored.minTangent, -12)
  assert.equal(anchored.maxTangent, 8)
  assert.deepEqual(anchored.gapSamples, [{ tangent: -2, upperNormal: 0, lowerNormal: -2 }])
  assert.deepEqual(seam.center, { x: 10, y: 20 }, 'aligning the seam must not mutate the detected source geometry')
})

test('joint bridge chooses local contact geometry around its anchor instead of a distant false seam', () => {
  const width = 80, height = 80
  const upperRects = [
    { x: 10, y: 10, width: 10, height: 10 },
    { x: 50, y: 50, width: 10, height: 10 }
  ]
  const lowerRects = [
    { x: 20, y: 10, width: 10, height: 10 },
    { x: 60, y: 50, width: 10, height: 10 }
  ]
  const upper = rectangleMask(width, height, upperRects)
  const lower = rectangleMask(width, height, lowerRects)
  const unrestricted = detectWardrobeJointSeam(upper, lower, 4)
  const anchored = detectWardrobeJointSeam(upper, lower, 4, { x: 20, y: 15 }, 12)

  assert.ok(unrestricted)
  assert.ok(anchored)
  assert.ok(Math.abs(unrestricted.tangent.x) > 0.2, 'distant contacts skew the unrestricted fit')
  assert.ok(Math.abs(anchored.tangent.x) < 0.05, 'the local seam remains vertical at the saved joint')
  assert.ok(Math.hypot(anchored.center.x - 20, anchored.center.y - 15) < 1)
})

test('joint bridge search covers wide thigh and calf cuts beyond 64 pixels', () => {
  const width = 240, height = 270
  const upper = rectangleMask(width, height, [{ x: 20, y: 15, width: 100, height: 240 }])
  const lower = rectangleMask(width, height, [{ x: 120, y: 15, width: 100, height: 240 }])
  const radius = wardrobeJointBridgeAnchorSearchRadius(
    { width: 240, height: 500 },
    { width: 220, height: 520 }
  )
  const seam = detectWardrobeJointSeam(upper, lower, 4, { x: 120, y: 135 }, radius)

  assert.equal(radius, 275)
  assert.ok(seam)
  assert.ok(seam.maxTangent - seam.minTangent > 230, 'the entire 240px knee cut must remain inside the local search')
})

test('joint bridge composites neighboring triangles through one replacement surface', () => {
  class FakeContext {
    calls = []
    globalCompositeOperation = 'source-over'
    imageSmoothingEnabled = false
    imageSmoothingQuality = 'low'
    state = []
    save() { this.state.push(this.globalCompositeOperation) }
    restore() { this.globalCompositeOperation = this.state.pop() ?? 'source-over' }
    setTransform(...values) { this.calls.push({ type: 'setTransform', values }) }
    beginPath() {}
    moveTo() {}
    lineTo() {}
    closePath() {}
    clip() {}
    transform(...values) { this.calls.push({ type: 'transform', values }) }
    drawImage(...values) { this.calls.push({ type: 'drawImage', operation: this.globalCompositeOperation, values }) }
  }
  class FakeCanvas {
    width = 0
    height = 0
    context = new FakeContext()
    getContext(type) { return type === '2d' ? this.context : null }
  }
  const surfaces = []
  const previousDocument = globalThis.document
  globalThis.document = { createElement: () => { const canvas = new FakeCanvas(); surfaces.push(canvas); return canvas } }
  try {
    const triangleA = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
    const triangleB = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const triangles = [triangleA, triangleB].map((points) => ({ source: points, target: points }))
    const target = new FakeContext()

    assert.equal(drawWardrobeJointBridgeMesh(target, {}, triangles, 1), true)
    const meshDraws = surfaces[0].context.calls.filter((call) => call.type === 'drawImage')
    const finalDraws = target.calls.filter((call) => call.type === 'drawImage')
    assert.equal(meshDraws.length, 2)
    assert.ok(meshDraws.every((call) => call.operation === 'copy'), 'overlapping antialiased triangles must replace each other instead of darkening the seam')
    assert.equal(finalDraws.length, 1, 'the completed bridge band is composited onto the model once')
  } finally {
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  }
})

test('joint bridge can preserve translucent mesh overlaps for body skin', () => {
  class FakeContext {
    calls = []
    globalCompositeOperation = 'source-over'
    imageSmoothingEnabled = false
    imageSmoothingQuality = 'low'
    state = []
    save() { this.state.push(this.globalCompositeOperation) }
    restore() { this.globalCompositeOperation = this.state.pop() ?? 'source-over' }
    setTransform(...values) { this.calls.push({ type: 'setTransform', values }) }
    beginPath() {}
    moveTo() {}
    lineTo() {}
    closePath() {}
    clip() {}
    transform(...values) { this.calls.push({ type: 'transform', values }) }
    drawImage(...values) { this.calls.push({ type: 'drawImage', operation: this.globalCompositeOperation, values }) }
    getImageData(x, y, width, height) {
      this.calls.push({ type: 'getImageData', x, y, width, height })
      return { data: new Uint8ClampedArray(width * height * 4), width, height }
    }
    putImageData(pixels, x, y) { this.calls.push({ type: 'putImageData', pixels, x, y }) }
  }
  class FakeCanvas {
    width = 0
    height = 0
    context = new FakeContext()
    getContext(type) { return type === '2d' ? this.context : null }
  }
  const surfaces = []
  const previousDocument = globalThis.document
  globalThis.document = { createElement: () => { const canvas = new FakeCanvas(); surfaces.push(canvas); return canvas } }
  try {
    const triangleA = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]
    const triangleB = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const triangles = [triangleA, triangleB].map((points) => ({ source: points, target: points }))
    const target = new FakeContext()

    const processed = []
    assert.equal(drawWardrobeJointBridgeMesh(target, {}, triangles, 1, 'source-over', (pixels, rasterScale) => {
      processed.push({ width: pixels.width, height: pixels.height, rasterScale })
    }), true)
    const meshDraws = surfaces[0].context.calls.filter((call) => call.type === 'drawImage')
    assert.equal(meshDraws.length, 2)
    assert.ok(meshDraws.every((call) => call.operation === 'source-over'), 'transparent overlap pixels must leave the neighboring skin cell intact')
    assert.equal(processed.length, 1)
    assert.ok(processed[0].width > 0 && processed[0].height > 0)
    assert.equal(processed[0].rasterScale, 1)
    assert.ok(surfaces[0].context.calls.findIndex((call) => call.type === 'putImageData') > surfaces[0].context.calls.findIndex((call) => call.type === 'getImageData'))
    assert.equal(target.calls.filter((call) => call.type === 'drawImage').length, 1)
  } finally {
    if (previousDocument === undefined) delete globalThis.document
    else globalThis.document = previousDocument
  }
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
