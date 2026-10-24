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

test('Canvas prepared rig adopts its own body and front hair surfaces without duplicate 2D buffers', () => {
  const { prepare, canvases } = harness()
  const body = { width: 320, height: 480, draws: [],
    getContext() { return { drawImage: (...args) => body.draws.push(args) } } }
  const hair = { width: 320, height: 480, draws: [],
    getContext() { return { drawImage: (...args) => hair.draws.push(args) } } }
  const clothes = { width: 320, height: 480, id: 'clothes' }
  const glasses = { width: 320, height: 480, id: 'above hair' }
  const result = prepare(body, clothes, hair, glasses, { adoptSourceCanvases: true })
  assert.equal(result.behindFace, body)
  assert.equal(result.inFrontOfFace, hair)
  assert.equal(canvases.length, 0, 'adopted pose needs no full-size duplicate layers')
  assert.deepEqual(body.draws.map(args => args[0]), [clothes])
  assert.deepEqual(hair.draws.map(args => args[0]), [glasses])
  assert.deepEqual(body.draws[0].slice(1), [0, 0, 320, 480])
})
test('adopted body with no front hair allocates upper canvas only for authored over-hair accessory', () => {
  const { prepare, canvases } = harness()
  const body = { width: 250, height: 350, draws: [],
    getContext() { return { drawImage: (...args) => body.draws.push(args) } } }
  const specs = { width: 250, height: 350, id: 'glasses' }
  const result = prepare(body, null, null, specs, { adoptSourceCanvases: true })
  assert.equal(result.behindFace, body)
  assert.equal(canvases.length, 1)
  assert.deepEqual(result.inFrontOfFace.draws[0][0], specs)
  assert.deepEqual(body.draws, [])
})
test('adopted head-only frame leaves body buffer unchanged and does not allocate', () => {
  const { prepare, canvases } = harness()
  const body = { width: 120, height: 200, draws: [],
    getContext() { return { drawImage: (...args) => body.draws.push(args) } } }
  const result = prepare(body, null, null, null, { adoptSourceCanvases: true })
  assert.strictEqual(result.behindFace, body)
  assert.equal(result.inFrontOfFace, null)
  assert.equal(canvases.length, 0)
  assert.equal(body.draws.length, 0)
})
