'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(file, deps = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, file), 'utf8')
  const js = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', js)(name => {
    if (Object.hasOwn(deps, name)) return deps[name]
    throw Error('Unexpected dependency: ' + name)
  }, mod, mod.exports)
  return mod.exports
}
function rig({ failCanvas = false } = {}) {
  const calls = { canvas: 0, png: 0, encode: 0, dispose: 0 }
  const character = { id: 'actor', customization: { modelSlot: 1, poseSlot: 1,
    faceAppearance: { modelSlot: 1, expressionIndex: 0 } } }
  const provider = {
    loadFabricatorSlot: async () => ({ width: 64, height: 64 }),
    loadFabricatorPose: async () => ({ width: 64, height: 64, parts: [] }),
    loadFaceComponentAsset: async () => null,
    loadFaceCatalogItem: async () => null,
  }
  const prepared = {
    width: 64, height: 64,
    renderToCanvas: async () => {
      calls.canvas++
      if (failCanvas) throw Error('Canvas unavailable')
      return { width: 64, height: 64, canvas: { width: 64, height: 64 } }
    },
    render: async () => { calls.png++; return { width: 64, height: 64,
      dataUrl: 'data:image/png;base64,LEGACY' } },
  }
  const interpolation = {
    mixAppearance: a => a, mixEffects: a => a, mixPoseArtwork: a => a,
    mixStageElement: a => a, mixStudioTransforms: a => a,
    smoothProgress: x => x, transitionProgress: () => 0.5,
  }
  const { VideoStudioBoundedMemo } = load('../src/shared/videoStudioNext/boundedMemo.ts')
  const deps = {
    './characterGeometry': { faceRenderGeometry: () => ({width: 25,height: 25}),
      trimTransparentImage: async () => null },
    '../../../../shared/videoCharacterInterpolation': interpolation,
    '../../characters/characterRenderer': {
      prepareSavedCharacterRenderer: async () => prepared,
      loadStandardExpressionEffects: async () => ({}),
    },
    '../../../../shared/videoStudioNext/boundedMemo': { VideoStudioBoundedMemo },
    './videoGachaCanvasFrame': {
      snapshotTrimmedGachaCanvas: () => ({crop: {width: 40,height: 50},
        canvas: { width: 40, height: 50, toDataURL: () => {
          calls.encode++
          return 'data:image/png;base64,CANVAS'
        } } }),
    },
  }
  const { TransitionRenderer } = load('../src/renderer/src/features/videoStudio/transitionRenderer.ts', deps)
  const session = new TransitionRenderer(provider)
  const state = { element: { id: 'element', kind: 'character', characterId: 'actor',
    poseSlot: 1, faceAppearance: character.customization.faceAppearance, activeFaceMode: 'talk' },
    imageDataUrl: 'data:image/png;base64,AUTHORED' }
  const span = { elementId:'element', startFrame:0, boundaryFrame:15, from:state, to:state }
  return { session, character, span, calls }
}

test('DOM preview uses Canvas Gacha rendering, encodes a single final PNG and preserves output geometry', async () => {
  const { session, character, span, calls } = rig()
  const result = await session.renderPreview(span, 7, character)
  assert.equal(result.imageDataUrl, 'data:image/png;base64,CANVAS')
  assert.equal(result.element.width, 25)
  assert.equal(calls.canvas, 1)
  assert.equal(calls.encode, 1)
  assert.equal(calls.png, 0)
  session.dispose()
})

test('preview retains legacy PNG fallback only when Canvas raster fails', async () => {
  const { session, character, span, calls } = rig({ failCanvas: true })
  const result = await session.renderPreview(span, 7, character)
  assert.equal(result.imageDataUrl, 'data:image/png;base64,LEGACY')
  assert.equal(calls.canvas, 1)
  assert.equal(calls.png, 1)
  session.dispose()
})

test('aborted Canvas work never invokes the legacy raster fallback', async () => {
  const { session, character, span, calls } = rig()
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(session.renderPreview(span, 7, character, controller.signal),
    error => error.name === 'AbortError')
  assert.equal(calls.canvas, 0)
  assert.equal(calls.png, 0)
  session.dispose()
})
