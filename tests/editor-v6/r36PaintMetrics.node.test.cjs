const { test } = require('node:test')
const assert = require('node:assert/strict')
const { analyzeR36Readback, compareR36ScenePixels, TOKEN_STRIP_WIDTH } = require('../../scripts/editor-v6/r36PaintMetrics.cjs')

function image(width, height, token, pixelIndex = -1) {
  const buffer = Buffer.alloc(width * height * 4)
  if (pixelIndex >= 0) buffer[pixelIndex * 4 + 2] = 77
  for (let bit = 0; bit < 24; bit++) {
    const x = width - TOKEN_STRIP_WIDTH + (bit % 6) * 4 + 2
    const y = Math.floor(bit / 6) * 4 + 2
    const offset = (y * width + x) * 4
    buffer[offset + 2] = (token >>> bit) & 1 ? 255 : 0
    buffer[offset + 3] = 255
  }
  return { getSize: () => ({ width, height }), toBitmap: () => buffer }
}
test('decodes each 24-bit bitmap marker from its own physical pixels', () => {
  for (const token of [0, 1, 2, 5, 127, 65535, 0xffffff]) {
    assert.equal(analyzeR36Readback(image(280, 256, token), 256, 256).token, token)
  }
})
test('reports actual changed scene pixels, never counting the marker strip', () => {
  const a = analyzeR36Readback(image(280, 256, 1), 256, 256)
  const b = analyzeR36Readback(image(280, 256, 2, 2 + 5 * 280), 256, 256)
  assert.equal(compareR36ScenePixels(a, b, 256, 256), 1)
  assert.equal(a.token, 1)
  assert.equal(b.token, 2)
})
test('fails closed on missing strip, corrupt alpha, or unexpected bitmap length', () => {
  assert.equal(analyzeR36Readback(image(256, 256, 7), 256, 256).token, null)
  const corrupted = image(280, 256, 7)
  const bitmap = corrupted.toBitmap()
  bitmap[(2 * 280 + 258) * 4 + 3] = 0
  assert.equal(analyzeR36Readback(corrupted, 256, 256).token, null)
  const broken = { getSize: () => ({ width: 280, height: 256 }), toBitmap: () => Buffer.alloc(4) }
  const unreadable = analyzeR36Readback(broken, 256, 256)
  assert.equal(unreadable.token, null)
  assert.equal(compareR36ScenePixels(unreadable, analyzeR36Readback(image(280, 256, 2), 256, 256), 256, 256), null)
})
