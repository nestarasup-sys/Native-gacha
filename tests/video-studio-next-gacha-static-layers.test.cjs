'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const source = fs.readFileSync(path.resolve(__dirname, '../src/renderer/src/characters/gachaStaticLayers.ts'), 'utf8')
const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })

function harness() {
  const canvases = []
  const document = {
    createElement(name) {
      assert.equal(name, 'canvas')
      const draws = []
      const canvas = {
        width: 0, height: 0, draws,
        getContext(kind) {
          assert.equal(kind, '2d')
          return { drawImage: (...args) => draws.push(args) }
        },
      }
      canvases.push(canvas)
      return canvas
    },
  }
  const mod = { exports: {} }
  new Function('module', 'exports', 'document', compiled)(mod, mod.exports, document)
  return { prepare: mod.exports.prepareGachaStaticLayers, canvases }
}

test('static body/wardrobe and hair layers preserve authored Gacha front/back occlusion order', () => {
  const { prepare, canvases } = harness()
  const body = { width: 700, height: 900, type: 'skin and back hair' }
  const wardrobe = { width: 700, height: 900, type: 'wardrobe' }
  const frontHair = { width: 700, height: 900, type: 'front hair' }
  const jacketAbove = { width: 700, height: 900, type: 'garment above hair' }
  const rig = prepare(body, wardrobe, frontHair, jacketAbove)
  assert.equal(canvases.length, 2)
  assert.equal(rig.behindFace.width, body.width)
  assert.equal(rig.inFrontOfFace.height, body.height)
  assert.deepEqual(rig.behindFace.draws.map(args => args[0]), [body, wardrobe])
  assert.deepEqual(rig.inFrontOfFace.draws.map(args => args[0]), [frontHair, jacketAbove])
  assert.ok(!rig.behindFace.draws.some(args => args[0] === frontHair))
  assert.ok(!rig.inFrontOfFace.draws.some(args => args[0] === body))
  assert.deepEqual(rig.behindFace.draws[0].slice(1), [0, 0, 700, 900])
})

test('no front hair/upper garment yields only one reusable lower layer', () => {
  const { prepare, canvases } = harness()
  const rig = prepare({ width: 100, height: 240 }, null, null, null)
  assert.equal(canvases.length, 1)
  assert.equal(rig.inFrontOfFace, null)
  assert.equal(rig.behindFace.draws.length, 1)
})

test('bad rigs reject before allocating new canvases', () => {
  const { prepare, canvases } = harness()
  assert.throws(() => prepare({ width: 0, height: 240 }, null, null, null), /Dimensões/)
  assert.throws(() => prepare({ width: 100, height: 0 }, null, null, null), /Dimensões/)
  assert.equal(canvases.length, 0)
})
