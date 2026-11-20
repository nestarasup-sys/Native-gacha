'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { parseArgs, profile } = require('../../scripts/editor-v6/engine-v3/profileOffline.cjs')

test('F1 profiler limits dimensions and accepts only synthetic arguments', () => {
  assert.deepEqual(parseArgs(['--width=64', '--height=36', '--frames=4', '--atlas=64']), {
    width: 64, height: 36, frames: 4, atlas: 64, static: false
  })
  for (const args of [
    ['--width=1920', '--height=720'],
    ['--frames=301'],
    ['--atlas=99999'],
    ['--frames=0'],
    ['--width=63', '--height=36'],
    ['--static', '--static'],
    ['--width=64', '--width=64'],
    ['--output=C:\\foo'],
  ]) assert.throws(() => parseArgs(args))
})

test('F1 profiler exposes bounded, consistent raster stats and hashes', async () => {
  const options = parseArgs(['--width=64', '--height=36', '--frames=5', '--atlas=64'])
  const output = await profile(options)
  assert.equal(output.syntheticOnly, true)
  assert.equal(output.comparableToLegacyExport, false)
  assert.equal(output.frameTiming.count, 5)
  assert.equal(output.frameBytes, 64 * 36 * 4)
  assert.equal(output.width, 64)
  assert.equal(output.height, 36)
  assert.equal(output.atlasSize, 64)
  assert.match(output.firstSha256, /^[a-f0-9]{64}$/)
  assert.match(output.lastSha256, /^[a-f0-9]{64}$/)
  assert.notEqual(output.firstSha256, output.lastSha256)
  assert.ok(Number.isFinite(output.rasterMs) && output.rasterMs > 0)
  assert.ok(Number.isFinite(output.observedRssPeakBytes) && output.observedRssPeakBytes > 0)
  assert.ok(output.frameTiming.p95Ms >= output.frameTiming.p50Ms)
})

test('static profile remains pixel-deterministic across all sampled frames', async () => {
  const report = await profile(parseArgs(['--width=64', '--height=36', '--frames=3', '--atlas=64', '--static']))
  assert.equal(report.staticFrames, true)
  assert.equal(report.firstSha256, report.lastSha256)
})
