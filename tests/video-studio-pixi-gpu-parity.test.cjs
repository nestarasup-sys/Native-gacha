'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const esbuild = require('esbuild')
const entry = path.resolve(__dirname, '../scripts/video-studio/pixi-gacha-pose-rig-benchmark.entry.ts')

const mod = { exports: {} }
const source = fs.readFileSync(path.resolve(__dirname,
  '../src/renderer/src/features/videoStudio/pixiGachaParity.ts'), 'utf8')
new Function('require', 'module', 'exports',
  ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }))(
    () => { throw Error('Unexpected GPU parity dependency') }, mod, mod.exports)
const { compareGachaPixels } = mod.exports

test('transparent RGBA channels are not mistaken for visible Pixi mismatches', () => {
  const a = new Uint8Array([255, 23, 99, 0, 8, 10, 14, 255])
  const b = new Uint8Array([0, 0, 0, 0, 8, 10, 14, 255])
  const parity = compareGachaPixels(a, b, 2, 1)
  assert.equal(parity.changedPixels, 0)
  assert.equal(parity.maxChannelError, 0)
})
test('a changed visible part or missing alpha is detected', () => {
  const a = new Uint8Array([24, 12, 42, 255, 0, 0, 0, 0])
  const b = new Uint8Array([24, 12, 42, 0, 0, 0, 0, 0])
  const result = compareGachaPixels(a, b, 2, 1, 6)
  assert.equal(result.changedPixels, 1)
  assert.equal(result.changedRatio, .5)
  assert.equal(result.maxChannelError, 255)
  assert.equal(result.p99WorstChannelError, 255)
})
test('small GPU raster differences within the allowed threshold stay nonfatal', () => {
  const a = new Uint8Array([22, 44, 88, 255])
  const b = new Uint8Array([26, 48, 92, 255])
  const result = compareGachaPixels(a, b, 1, 1, 8)
  assert.equal(result.changedPixels, 0)
  assert.equal(result.meanWorstChannelError, 4)
})
test('mismatched buffers, dimensions and thresholds fail before pixel comparison', () => {
  const rgba = new Uint8Array(4)
  assert.throws(() => compareGachaPixels(rgba, new Uint8Array(8), 1, 1), /incompatíveis/)
  assert.throws(() => compareGachaPixels(rgba, rgba, 0, 1), /incompatíveis/)
  assert.throws(() => compareGachaPixels(rgba, rgba, 1, 1, 999), /inválida/)
})
test('the actual PixiJS WebGL benchmark is bundleable as a classic Electron script', () => {
  const result = esbuild.buildSync({
    entryPoints: [entry], bundle: true, format: 'iife', platform: 'browser',
    target: 'es2022', write: false, logLevel: 'silent',
  })
  assert.equal(result.outputFiles.length, 1)
  const bundled = result.outputFiles[0].text
  assert.match(bundled, /__pixiRigBenchmark/)
  assert.match(bundled, /compareGachaPixels/)
  assert.match(bundled, /PIXI/)
  assert.doesNotMatch(bundled, /from "pixi\.js"/)
})
