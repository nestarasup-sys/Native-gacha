'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(file, deps = {}, globals = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, file), 'utf8')
  const code = ts.transpile(source, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', 'Image', 'HTMLCanvasElement', code)(
    name => {
      if (!Object.hasOwn(deps, name)) throw new Error('Unexpected dependency ' + name)
      return deps[name]
    }, mod, mod.exports, globals.Image, globals.HTMLCanvasElement
  )
  return mod.exports
}

test('FrameRenderer routes blink/talk states to Canvas but keeps legacy PNG mode available', async () => {
  const { VideoStudioBoundedMemo } = load('../src/shared/videoStudioNext/boundedMemo.ts')
  const { VideoStudioRasterAdmission } = load('../src/shared/videoStudioNext/rasterAdmission.ts')
  const counts = { canvas: 0, png: 0 }
  class FakeTransitionRenderer {
    async renderCanvas(transition) {
      counts.canvas++
      return { ...transition.from, canvasImage: { width: 4, height: 4 } }
    }
    async render(transition) {
      counts.png++
      return { ...transition.from, imageDataUrl: 'data:image/png;base64,LEGACY' }
    }
    clearPrepared() {}
    dispose() {}
  }
  const { VideoCharacterFrameRenderer } = load('../src/renderer/src/features/videoStudio/videoCharacterFrameRenderer.ts', {
    '../../../../shared/studio': { resolveStudioTalkMouthId: () => 'mouth-id' },
    '../../../../shared/videoExportCharacters': { characterFromVideoExportSnapshot: () => ({
      id: 'model', customization: { modelSlot: 1, poseSlot: 1, faceAppearance: { modelSlot: 1 } },
    }) },
    '../../../../shared/videoCharacterRenderAssets': { createVideoCharacterRenderSnapshotProvider: () => ({
      listFaceCatalog: async () => [],
    }) },
    './transitionRenderer': { TransitionRenderer: FakeTransitionRenderer },
    '../../../../shared/videoStudioNext/boundedMemo': { VideoStudioBoundedMemo },
    '../../../../shared/videoStudioNext/rasterAdmission': { VideoStudioRasterAdmission },
  })
  const renderer = new VideoCharacterFrameRenderer({}, {})
  const state = { element: { kind: 'character', id: 'actor', characterId: 'model',
    activeFaceMode: 'idle', faceAppearance: { modelSlot: 1 } }, imageDataUrl: 'data:image/png;base64,BASE' }
  const scene = { frame: 13, characters: [{
    elementId: 'actor', hidden: false, authoredState: state, automaticBlink: true,
  }] }
  const canvas = await renderer.renderFrame(scene, true)
  assert.equal(canvas.get('actor').canvasImage.width, 4)
  assert.equal(counts.canvas, 1)
  assert.equal(counts.png, 0)
  const cached = await renderer.renderFrame(scene, true)
  assert.equal(cached.get('actor'), canvas.get('actor'), 'Canvas snapshot is stable for reused scene key')
  assert.equal(counts.canvas, 1)
  const legacy = await renderer.renderFrame(scene)
  assert.equal(legacy.get('actor').imageDataUrl, 'data:image/png;base64,LEGACY')
  assert.equal(counts.png, 1)
  renderer.dispose()
})

test('Canvas compositor draws a facial CanvasImageSource rather than decoding its authored PNG', async () => {
  const { VideoStudioBoundedMemo } = load('../src/shared/videoStudioNext/boundedMemo.ts')
  const drawCalls = []
  const context = {
    canvas: {},
    save() {}, restore() {}, setTransform() {}, fillRect() {},
    translate() {}, rotate() {}, scale() {}, globalCompositeOperation: '', globalAlpha: 1,
    drawImage: (source, ...rest) => drawCalls.push({ source, rest }),
    fillStyle: '#000',
  }
  const compositor = load('../src/renderer/src/features/videoStudio/videoCanvasCompositor.ts', {
    '../../../../shared/studio': { videoCharacterTrackColor: () => '#000' },
    '../../../../shared/videoStageGeometry': {
      VIDEO_STAGE_WIDTH: 1920, VIDEO_STAGE_HEIGHT: 1080,
      videoCharacterElementSize: element => ({ width: element.width, height: element.height }),
      videoStageRect: (_x, _y, width, height) => ({
        centerX: 960, centerY: 540, width: width * 19.2, height: height * 10.8,
      }),
      videoClipStageRect: () => ({}),
    },
    './videoVisualPluginRegistry': { matchingVideoVisualPlugin: () => undefined },
    '../../../../shared/videoStudioNext/boundedMemo': { VideoStudioBoundedMemo },
  }, { Image: class Image {
    constructor() { throw new Error('A face PNG must not be decoded in the direct Canvas route') }
  } })
  const stage = { width: 1920, height: 1080, getContext: () => context }
  const faceCanvas = { width: 80, height: 120 }
  const element = {
    id: 'actor', kind: 'character', x: 0, y: 0, width: 20, height: 30, rotation: 0, flipX: true,
  }
  const original = { ...element, imageDataUrl: 'data:image/png;base64,WRONG' }
  const frame = {
    frame: 0, background: { color: '#000000' },
    layers: [{ type: 'element', kind: 'character', element, zOrder: 3, documentOrder: 0 }],
  }
  await compositor.renderVideoSceneFrameToCanvas(frame, stage, {
    characterStates: new Map([['actor', { element: original, imageDataUrl: 'data:image/png;base64,WRONG',
      canvasImage: faceCanvas }]]),
  })
  assert.equal(drawCalls.length, 1)
  assert.equal(drawCalls[0].source, faceCanvas)
  assert.equal(drawCalls[0].rest.length, 4, 'drawTransformed follows the old character geometry')
})
