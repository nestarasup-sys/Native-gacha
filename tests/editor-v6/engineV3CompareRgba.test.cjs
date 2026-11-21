'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { compareRgba } = require('../../scripts/editor-v6/engine-v3/compareRgba.cjs')

test('compares every RGBA pixel, reports alpha/edge/interior and bounds', () => {
  const reference = Buffer.alloc(5 * 3 * 4)
  for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
    const offset = (y * 5 + x) * 4
    reference.set([255, 0, 0, 255], offset)
  }
  const candidate = Buffer.from(reference)
  candidate[(0 * 5 + 3) * 4] = 240 // edge RGB divergence
  candidate[(1 * 5 + 1) * 4 + 3] = 128 // interior alpha divergence
  const report = compareRgba(reference, candidate, 5, 3)
  assert.equal(report.differingPixels, 2)
  assert.equal(report.differingPixelPercent, 200 / 15)
  assert.equal(report.differingChannels, 2)
  assert.equal(report.maxAbsoluteChannelError, 127)
  assert.equal(report.alpha.differingPixels, 1)
  assert.equal(report.edge.differingPixels, 1)
  assert.equal(report.interior.differingPixels, 1)
  assert.deepEqual(report.boundingBox, { x: 1, y: 0, width: 3, height: 2 })
  assert.equal(report.differenceMap.length, reference.length)
  assert.notEqual(report.referenceSha256, report.candidateSha256)
  assert.ok(report.differenceMapSha256)
})

test('negative visual control detects a deliberately changed parameter', () => {
  const reference = Buffer.alloc(4 * 4 * 4, 0)
  const changedParameter = Buffer.from(reference)
  changedParameter[(2 * 4 + 1) * 4] = 1
  const report = compareRgba(reference, changedParameter, 4, 4)
  assert.equal(report.differingPixels, 1)
  assert.equal(report.differingPixelPercent, 100 / 16)
  assert.deepEqual(report.boundingBox, { x: 1, y: 2, width: 1, height: 1 })
  assert.equal(report.differenceMap[(2 * 4 + 1) * 4], 1)
})

test('rejects malformed RGBA buffers instead of truncating', () => {
  assert.throws(() => compareRgba(Buffer.alloc(3), Buffer.alloc(3), 1, 1), /incompatíveis/)
})
