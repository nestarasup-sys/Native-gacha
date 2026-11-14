'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { compareBgra } = require('../../scripts/editor-v6/compare-planb-quality.cjs')

test('qualidade: quadros idênticos têm SSIM 1 e erro PSNR zero', () => {
  const frame = Buffer.alloc(4 * 8 * 8, 128)
  const result = compareBgra(frame, Buffer.from(frame), 8, 8)
  assert.equal(result.psnrRgbDb, null)
  assert.equal(result.ssimLuma8x8, 1)
  assert.equal(result.samplePixels, 64)
})

test('qualidade: diferenças de pixel reduzem PSNR e SSIM', () => {
  const reference = Buffer.alloc(4 * 8 * 8, 128)
  const changed = Buffer.from(reference)
  changed[0] = 0
  const result = compareBgra(reference, changed, 8, 8)
  assert.ok(result.psnrRgbDb < 60)
  assert.ok(result.ssimLuma8x8 < 1)
})

test('qualidade: rejeita dimensões incompatíveis', () => {
  assert.throws(() => compareBgra(Buffer.alloc(4), Buffer.alloc(8), 1, 1), /incompatível/)
})
