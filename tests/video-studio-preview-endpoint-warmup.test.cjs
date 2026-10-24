'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.join(__dirname,
  '../src/renderer/src/features/videoStudio/previewEndpointWarmup.ts'), 'utf8')
const js = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
const mod = {exports:{}}
new Function('module','exports',js)(mod,mod.exports)
const Warmup = mod.exports.PreviewEndpointWarmup
const a = (start, id) => ({ startFrame:start, boundaryFrame:start+15,
  from:{imageDataUrl:'data:image/png;base64,F'+id},
  to:{imageDataUrl:'data:image/png;base64,T'+id} })
const images = [a(10,1),a(100,2),a(400,3),a(600,4)]
test('warm upcoming endpoint snapshots once; no 14 intermediate frame decode requests', () => {
  const old = global.Image
  const loads = []
  global.Image = class { set src(x) { loads.push(x) } decode() { return Promise.resolve() } }
  try {
    const warmup = new Warmup(8)
    warmup.prepare(images, 0, 240)
    assert.equal(loads.length, 4)
    assert.equal(warmup.cachedImages(), 4)
    warmup.prepare(images, 60, 240)
    assert.equal(loads.length, 4)
    assert.equal(warmup.cachedImages(), 4)
    warmup.clear()
    assert.equal(warmup.cachedImages(), 0)
  } finally { if (old === undefined) delete global.Image; else global.Image = old }
})
test('warmup respects memory limit and never decodes far-future blocks', () => {
  const old = global.Image
  const loads = []
  global.Image = class { set src(x) { loads.push(x) } decode() { return Promise.resolve() } }
  try {
    const warmup = new Warmup(2)
    warmup.prepare(images, 0, 240)
    assert.equal(loads.length, 4)
    assert.equal(warmup.cachedImages(), 2)
    warmup.prepare(images, 350, 240)
    assert.equal(loads.length, 6)
    assert.equal(warmup.cachedImages(), 2)
  } finally { if (old === undefined) delete global.Image; else global.Image = old }
})
