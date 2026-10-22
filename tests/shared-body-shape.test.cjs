'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

// Pure TypeScript geometry; no Electron, DOM or user profile.
const sharedRoot = path.join(__dirname, '../src/shared')
const modules = new Map()
function load(name) {
  if (modules.has(name)) return modules.get(name).exports
  const file = path.join(sharedRoot, name + '.ts')
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const module = { exports: {} }
  modules.set(name, module)
  new Function('require', 'module', 'exports', compiled)((specifier) => {
    assert.match(specifier, /^\.\/[a-zA-Z]+$/, 'Only local shared geometry dependencies are allowed')
    return load(specifier.slice(2))
  }, module, module.exports)
  return module.exports
}
const { applyCharacterBodyShape } = load('bodyShape')
const defaults = { torsoWidth: 100, torsoHeight: 100, armsWidth: 100, armsHeight: 100, thighsWidth: 100, thighsHeight: 100, lowerLegsWidth: 100, lowerLegsHeight: 100, balance: 35 }
const fixture = () => ({
  width: 200, height: 240,
  parts: [
    { id: 'torso', name: 'Torso', x: 80, y: 85, width: 40, height: 70, rotation: 0 },
    { id: 'head', name: 'Cabeça', x: 80, y: 25, width: 40, height: 50, rotation: 0 },
    { id: 'arm', name: 'Braço', x: 125, y: 90, width: 22, height: 52, rotation: 10 }
  ],
  joints: [
    { id: 'neck', parentPartId: 'torso', childPartId: 'head', parentAnchor: { x: 100, y: 85 }, childAnchor: { x: 100, y: 75 }, fixed: true },
    { id: 'shoulder', parentPartId: 'torso', childPartId: 'arm', parentAnchor: { x: 120, y: 94 }, childAnchor: { x: 125, y: 94 }, fixed: true }
  ]
})

test('100% body size preserves the original object by reference', () => {
  const original = fixture()
  assert.strictEqual(applyCharacterBodyShape(original, defaults), original)
})
test('per-character body adjustments leave the Fabricator source unchanged', () => {
  const original = fixture()
  const source = structuredClone(original)
  const next = applyCharacterBodyShape(original, { ...defaults, torsoWidth: 125, armsHeight: 120 })
  assert.deepEqual(original, source)
  assert.notStrictEqual(next, original)
  assert.ok(next.parts.find(p => p.id === 'torso').width > 40)
  assert.ok(next.parts.find(p => p.id === 'arm').height > 52)
  assert.equal(next.parts.length, original.parts.length)
  for (const part of next.parts) {
    for (const prop of ['x', 'y', 'width', 'height', 'rotation']) assert.equal(Number.isFinite(part[prop]), true)
  }
  assert.deepEqual(next.joints.map(j => j.id), original.joints.map(j => j.id))
})
