'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(file, deps = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  const js = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', js)(name => {
    if (!Object.hasOwn(deps, name)) throw new Error('Unexpected dependency: ' + name)
    return deps[name]
  }, mod, mod.exports)
  return mod.exports
}
const interpolation = load('src/shared/videoCharacterInterpolation.ts')
const geometry = load('src/shared/videoStageGeometry.ts', {
  './videoMedia': { defaultVideoTransform: { x: 0, y: 0, width: 100, height: 100, rotation: 0 } }
})
const { planSnapshotSprites } = load('src/shared/videoStudioRebuild/previewSpritePlan.ts', {
  '../videoCharacterInterpolation': interpolation,
  '../videoStageGeometry': geometry
})
const imageA = 'data:image/png;base64,first', imageB = 'data:image/png;base64,second'
const actor = { id: 'actor', kind: 'character', x: -20, y: 2, width: 12, height: 30,
  rotation: 350, flipX: false, characterScale: 100, characterWidthScale: 100, characterHeightScale: 100 }
const target = { ...actor, x: 20, y: 8, width: 24, height: 50, rotation: 10, characterScale: 150, flipX: true }
const layer = { type: 'element', kind: 'character', element: actor, assetDataUrl: imageA }
const characters = (t, left = imageA, right = imageB) => [{
  elementId: 'actor', hidden: false, automaticBlink: false,
  transition: { startFrame: 10, boundaryFrame: 25,
    from: { element: actor, imageDataUrl: left },
    to: { element: target, imageDataUrl: right },
    progress: t, easedProgress: t }
}]

test('GPU snapshot transition interpolates stage geometry and uses exactly two stable PNG sources', () => {
  const sprites = planSnapshotSprites(layer, characters(.25))
  assert.equal(sprites.length, 2)
  assert.deepEqual(sprites.map(sprite => sprite.imageDataUrl), [imageA, imageB])
  assert.deepEqual(sprites.map(sprite => sprite.opacity), [.75, .25])
  assert.strictEqual(sprites[0].element, sprites[1].element)
  assert.equal(sprites[0].element.x, -10)
  assert.equal(sprites[0].element.y, 3.5)
  assert.equal(sprites[0].element.rotation, 355)
  assert.equal(sprites[0].element.width, 16.875)
  assert.equal(sprites[0].element.flipX, false)
})

test('no future frame prerender, no duplicated same-image texture and no authored state mutation', () => {
  assert.equal(planSnapshotSprites(layer, []).length, 1)
  const same = characters(.75, imageA, imageA)
  const untouched = same[0].transition.from
  assert.equal(planSnapshotSprites(layer, same).length, 1)
  assert.strictEqual(same[0].transition.from, untouched)
  assert.equal(planSnapshotSprites(layer, characters(0)).length, 1)
  assert.deepEqual(planSnapshotSprites(layer, characters(1)).map(x => x.imageDataUrl), [imageB])
  const none = { ...layer, assetDataUrl: undefined }
  assert.deepEqual(planSnapshotSprites(none, []), [])
  assert.deepEqual(planSnapshotSprites(none, characters(.5, '', '') ), [])
  assert.deepEqual(planSnapshotSprites(none, characters(.5, imageA, ''))
    .map(x => x.imageDataUrl), [imageA])
})

test('stage transform overrides animated geometry; non-character elements remain unchanged', () => {
  const scene = characters(.5)
  scene[0].stageTransform = { x: -4 }
  const sprites = planSnapshotSprites(layer, scene)
  assert.equal(sprites[0].element.x, -4)
  assert.equal(sprites[0].element.flipX, true)
  const prop = { ...layer, kind: 'speech', element: { ...actor, kind: 'speech' } }
  assert.equal(planSnapshotSprites(prop, scene).length, 1)
  assert.equal(planSnapshotSprites(prop, scene)[0].opacity, 1)
})
