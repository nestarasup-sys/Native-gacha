'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function load(relativePath, dependencies = {}, globals = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8')
  const compiled = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', 'document', 'Image', 'HTMLCanvasElement', compiled)(
    (name) => {
      if (!Object.hasOwn(dependencies, name)) throw new Error('Unexpected runtime dependency: ' + name)
      return dependencies[name]
    },
    mod, mod.exports, globals.document, globals.Image, globals.HTMLCanvasElement
  )
  return mod.exports
}
function fakeDocument() {
  const created = []
  const doc = {
    createElement(name) {
      assert.equal(name, 'canvas')
      const calls = []
      const canvas = {
        width: 1, height: 1, calls,
        getContext() {
          return {
            canvas,
            drawImage: (...args) => calls.push(args),
            getImageData: () => ({ data: canvas.pixels ?? new Uint8ClampedArray(canvas.width * canvas.height * 4) }),
          }
        },
        toDataURL: () => { throw new Error('PNG serialization forbidden on Canvas route') },
      }
      created.push(canvas)
      return canvas
    },
  }
  return { doc, created }
}

test('Canvas transparent trim matches the old alpha >8 half-open pixel bounds without encoding PNG', () => {
  const { doc, created } = fakeDocument()
  const { snapshotTrimmedGachaCanvas } = load('../src/renderer/src/features/videoStudio/videoGachaCanvasFrame.ts', {}, { document: doc })
  const src = doc.createElement('canvas')
  src.width = 5; src.height = 4
  src.pixels = new Uint8ClampedArray(5 * 4 * 4)
  src.pixels[(1 * 5 + 2) * 4 + 3] = 9
  src.pixels[(2 * 5 + 3) * 4 + 3] = 255
  src.pixels[(0 * 5 + 0) * 4 + 3] = 8 // threshold excludes
  const result = snapshotTrimmedGachaCanvas(src)
  assert.deepEqual(result.crop, { width: 2, height: 2 })
  assert.equal(result.width, 5)
  assert.equal(result.height, 4)
  assert.notEqual(result.canvas, src, 'prepared source is mutable and cannot be returned by reference')
  assert.equal(result.canvas.width, 2)
  assert.equal(result.canvas.height, 2)
  assert.deepEqual(result.canvas.calls[0], [src, 2, 1, 2, 2, 0, 0, 2, 2])
  assert.equal(created.length, 2)
})

test('Full image, empty alpha and failed readback all keep original frame dimensions', () => {
  const { doc } = fakeDocument()
  const { snapshotTrimmedGachaCanvas } = load('../src/renderer/src/features/videoStudio/videoGachaCanvasFrame.ts', {}, { document: doc })
  const src = doc.createElement('canvas')
  src.width = 2; src.height = 2
  src.pixels = new Uint8ClampedArray([0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255])
  let result = snapshotTrimmedGachaCanvas(src)
  assert.equal(result.crop, null)
  assert.deepEqual(result.canvas.calls[0], [src, 0, 0, 2, 2, 0, 0, 2, 2])
  src.pixels.fill(0)
  result = snapshotTrimmedGachaCanvas(src)
  assert.equal(result.crop, null)
  assert.equal(result.canvas.width, 2)
  src.getContext = () => ({ getImageData: () => { throw new Error('tainted') } })
  result = snapshotTrimmedGachaCanvas(src)
  assert.equal(result.crop, null)
  assert.equal(result.canvas.height, 2)
})

test('TransitionRenderer direct Canvas uses original Gacha face renderer and snapshot per expression without PNG', async () => {
  const { doc } = fakeDocument()
  const helper = load('../src/renderer/src/features/videoStudio/videoGachaCanvasFrame.ts', {}, { document: doc })
  const { VideoStudioBoundedMemo } = load('../src/shared/videoStudioNext/boundedMemo.ts')
  const events = { prepared: 0, canvasRenders: 0, pngRenders: 0, modes: [], pupils: [] }
  const sourceCanvas = doc.createElement('canvas')
  sourceCanvas.width = 4; sourceCanvas.height = 4
  sourceCanvas.pixels = new Uint8ClampedArray(4 * 4 * 4).fill(255)
  const interp = {
    smoothProgress: () => .5,
    transitionProgress: () => .5,
    mixAppearance: (a) => a,
    mixEffects: (a) => a,
    mixPoseArtwork: () => { throw new Error('No pose interpolation for face-only state') },
    mixStageElement: (a) => a,
    mixStudioTransforms: (a) => a,
  }
  const { TransitionRenderer } = load('../src/renderer/src/features/videoStudio/transitionRenderer.ts', {
    './characterGeometry': { faceRenderGeometry: (_element, size, crop) =>
      ({ width: (crop?.width ?? size.width) / 4, height: (crop?.height ?? size.height) / 4 }),
      trimTransparentImage: async () => { throw new Error('PNG trim forbidden') },
    },
    '../../../../shared/videoCharacterInterpolation': interp,
    '../../characters/characterRenderer': {
      prepareSavedCharacterRenderer: async () => {
        events.prepared++
        return {
          width: 4, height: 4,
          renderToCanvas: async (_face, pt, _effects, mode) => {
            events.canvasRenders++
            events.modes.push(mode)
            events.pupils.push(pt)
            return { canvas: sourceCanvas, width: 4, height: 4 }
          },
          render: async () => { events.pngRenders++; throw new Error('PNG route forbidden') },
        }
      },
      loadStandardExpressionEffects: async () => ({}),
    },
    '../../../../shared/videoStudioNext/boundedMemo': { VideoStudioBoundedMemo },
    './videoGachaCanvasFrame': helper,
  }, { document: doc })
  const provider = {
    loadFabricatorSlot: async () => ({ width: 4, height: 4 }),
    loadFabricatorPose: async () => ({ width: 4, height: 4, parts: [] }),
  }
  const renderer = new TransitionRenderer(provider)
  const character = { id: 'test', name: 'Gacha', customization: { modelSlot: 1, poseSlot: 1, faceAppearance: { modelSlot: 1, expressionIndex: 0 } } }
  const pt = {
    'expression-component:pupil-left': { x: -7, y: 5 },
    'expression-component:pupil-right': { x: 9, y: -2 },
  }
  const state = { element: { id: 'actor', kind: 'character', poseSlot: 1, characterId: 'test',
    x: 0, y: 0, width: 10, height: 20, rotation: 0,
    faceAppearance: character.customization.faceAppearance, faceTransforms: pt, activeFaceMode: 'talk' },
    imageDataUrl: 'data:image/png;base64,ORIGINAL' }
  for (let i = 0; i < 6; i++) {
    state.element.activeFaceMode = i % 3 === 0 ? 'blink' : 'talk'
    const result = await renderer.renderCanvas({ elementId: 'actor', startFrame: 0, boundaryFrame: 2,
      from: state, to: state }, i + 1, character)
    assert.ok(result.canvasImage)
    assert.equal(result.imageDataUrl, state.imageDataUrl)
    assert.notEqual(result.canvasImage, sourceCanvas)
    if (i === 0) var oldCanvas = result.canvasImage
    else assert.notEqual(result.canvasImage, oldCanvas)
  }
  assert.equal(events.prepared, 1)
  assert.equal(events.canvasRenders, 6)
  assert.equal(events.pngRenders, 0)
  assert.equal(events.pupils[0]['expression-component:pupil-left'].x, -7)
  assert.equal(events.pupils[0]['expression-component:pupil-right'].x, 9)
  assert.deepEqual(events.modes, ['blink','talk','talk','blink','talk','talk'])
  renderer.dispose()
})
