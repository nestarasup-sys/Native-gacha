'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const source = fs.readFileSync(path.resolve(__dirname,
  '../src/renderer/src/features/videoStudio/pixiGachaArtworkPreparation.ts'), 'utf8')
const generated = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
const mod = { exports: {} }
new Function('require', 'module', 'exports', generated)((name) => {
  if (name === '../../characters/characterRenderer') return { loadSkinTintedImage: async url => ({ src: url }) }
  throw Error('Unrecognized GPU asset dependency: ' + name)
}, mod, mod.exports)
const { preparePixiSkinToneArtwork } = mod.exports
const part = (id, dataUrl) => ({ id, name: id, dataUrl, x: 12, y: 16, width: 20, height: 40, rotation: 21 })
const pose = (parts) => ({ width: 120, height: 160, parts, layerOrder: parts.map(p => p.id),
  hiddenPartIds: [], joints: [{ id: 'elbow', parentPartId: 'body', childPartId: 'arm' }] })

test('exact skin tone preparation reuses original skin tint compositor, once per unique art across both endpoint poses', async () => {
  const from = pose([part('body','data:body'),part('arm','data:arm')])
  const to = pose([part('body','data:body'),part('arm','data:arm')])
  const requests = []
  const tinted = await preparePixiSkinToneArtwork([from,to], '#b47d61',
    async (source, tone) => {
      requests.push([source,tone])
      return { src: 'data:tinted:' + tone + ':' + source }
    })
  assert.deepEqual(requests,[['data:body','#b47d61'],['data:arm','#b47d61']])
  assert.equal(tinted[0].parts[0].dataUrl,'data:tinted:#b47d61:data:body')
  assert.equal(tinted[1].parts[0].dataUrl,tinted[0].parts[0].dataUrl)
  assert.equal(tinted[1].parts[1].dataUrl,tinted[0].parts[1].dataUrl)
  assert.notStrictEqual(tinted[0],from)
  assert.notStrictEqual(tinted[0].parts[0],from.parts[0])
  assert.strictEqual(tinted[0].joints,from.joints)
  assert.strictEqual(tinted[0].layerOrder,from.layerOrder)
  assert.equal(from.parts[0].dataUrl,'data:body')
})

test('without a skin tone, pose objects pass through unchanged and no tint/decode occurs', async () => {
  const from = pose([part('arm','data:arm')])
  const input = [from]
  const tinted = await preparePixiSkinToneArtwork(input, '', () => { throw Error('should not tint') })
  assert.strictEqual(tinted,input)
  assert.strictEqual(tinted[0].parts[0],from.parts[0])
})

test('failed or empty skin texture preparation rejects GPU path without modifying authoring data', async () => {
  const from = pose([part('arm','data:arm')])
  await assert.rejects(preparePixiSkinToneArtwork([from], '#eeeeee',
    async () => ({ src: '' })), /ficou vazia/)
  await assert.rejects(preparePixiSkinToneArtwork([from], '#eeeeee',
    async () => { throw Error('corrupt skin PNG') }), /corrupt skin PNG/)
  assert.equal(from.parts[0].dataUrl,'data:arm')
})

test('the Pixi GPU surface prepares colorized body sources before they are painted', () => {
  const surface = fs.readFileSync(path.resolve(__dirname,
    '../src/renderer/src/features/videoStudio/pixiGachaPoseSurface.ts'), 'utf8')
  assert.match(surface, /preparePixiSkinToneArtwork\(poses, skinTone\)/)
  assert.match(surface, /await this\.prime\(gpuArtwork\)/)
  assert.match(surface, /async primeWithSkinTone/)
})
