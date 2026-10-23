'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function loadTs(file, dependencies = {}) {
  const src = fs.readFileSync(path.resolve(__dirname, file), 'utf8')
  const js = ts.transpile(src, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', js)((name) => {
    if (!Object.hasOwn(dependencies, name)) throw new Error('Unexpected test dependency: ' + name)
    return dependencies[name]
  }, mod, mod.exports)
  return mod.exports
}
const budgetModule = loadTs('../src/shared/videoStudioNext/resourceBudget.ts')
const memoModule = loadTs('../src/shared/videoStudioNext/boundedMemo.ts')
const { VideoStudioResourceBudget } = budgetModule

function rig({ budget, width = 128, height = 128 } = {}) {
  const events = { prepared: [], rendered: [], mixedArtwork: 0, loadPose: 0 }
  const appearance = { modelSlot: 1, setId: 'face-a', expressionIndex: 0 }
  const character = {
    id: 'character-1', name: 'synthetic',
    customization: { modelSlot: 1, poseSlot: 1, faceAppearance: appearance, partOverrides: {} },
  }
  const provider = {
    loadFabricatorSlot: async () => ({ slot: 1, width, height }),
    loadFabricatorPose: async (slot, pose) => {
      events.loadPose++
      return { width, height, parts: [{ id: 'body-' + pose }], pose }
    },
    listFaceCatalog: async () => [],
  }
  const actualRenderer = {
    prepareSavedCharacterRenderer: async (copy, { artwork }) => {
      events.prepared.push({ characterId: copy.id, pose: artwork.pose, face: copy.customization.faceAppearance?.setId })
      return {
        width, height,
        render: async (face, transforms, effects, mode) => {
          const pose = artwork.pose
          events.rendered.push({ pose, face, transforms, mode })
          return { width, height, dataUrl: 'data:image/png;base64,PNG-' + pose + '-' + mode + '-' + JSON.stringify(transforms) }
        },
      }
    },
    loadStandardExpressionEffects: async () => ({}),
  }
  const interpolation = {
    mixAppearance: (from) => from,
    mixEffects: (a) => a,
    mixPoseArtwork: (from, to, t) => {
      events.mixedArtwork++
      return { width, height, parts: [], pose: String(from.pose) + ':' + String(to.pose) + ':' + t }
    },
    mixStageElement: (a) => a,
    mixStudioTransforms: (a) => a,
    smoothProgress: (x) => x,
    transitionProgress: () => 0.5,
  }
  const deps = {
    './characterGeometry': {
      faceRenderGeometry: () => ({}),
      trimTransparentImage: async () => null,
    },
    '../../../../shared/videoCharacterInterpolation': interpolation,
    '../../characters/characterRenderer': actualRenderer,
    '../../../../shared/videoStudioNext/boundedMemo': memoModule,
    './videoGachaCanvasFrame': { snapshotTrimmedGachaCanvas: () => { throw new Error('Canvas path forbidden in legacy PNG tests') } },
  }
  // The source imports directly from shared, not from its own Next directory.
  deps['../../../../shared/videoStudioNext/boundedMemo'] = memoModule
  const { TransitionRenderer } = loadTs('../src/renderer/src/features/videoStudio/transitionRenderer.ts', deps)
  const renderer = new TransitionRenderer(provider, budget)
  const state = (pose = 1, face = appearance, transforms = {}) => ({
    element: { id: 'actor', kind: 'character', characterId: character.id,
      poseSlot: pose, faceAppearance: face, faceTransforms: transforms, activeFaceMode: 'talk' },
    imageDataUrl: 'data:image/png;base64,AUTHORED',
  })
  const transition = (from, to = from) =>
    ({ elementId: 'actor', startFrame: 0, boundaryFrame: 2, from, to })
  return { renderer, state, transition, events, character, appearance }
}

test('same authored pose prepares body/wardrobe/hair once across six mouth/blink draws', async () => {
  const budget = new VideoStudioResourceBudget(16 * 1024 * 1024)
  const { renderer, state, transition, events, character } = rig({ budget })
  const pt = {
    'expression-component:pupil-left': { x: -4, y: 7, width: 10, height: 10, rotation: 3 },
    'expression-component:pupil-right': { x: 11, y: -2, width: 10, height: 10, rotation: -6 },
  }
  const authored = state(1, undefined, pt)
  const outputs = []
  for (let n = 0; n < 6; n++) {
    authored.element.activeFaceMode = n === 3 ? 'blink' : 'talk'
    outputs.push(await renderer.render(transition(authored), n + 1, character))
  }
  assert.equal(events.prepared.length, 1, 'static body/wardrobe/hairstyle must be prepared once')
  assert.equal(events.rendered.length, 6, 'dynamic faces must still be drawn each time')
  assert.equal(events.mixedArtwork, 0, 'no interpolation of identical body pose')
  assert.deepEqual(events.rendered[0].transforms['expression-component:pupil-left'], pt['expression-component:pupil-left'])
  assert.deepEqual(events.rendered[0].transforms['expression-component:pupil-right'], pt['expression-component:pupil-right'])
  assert.notEqual(events.rendered[0].transforms['expression-component:pupil-left'].x, events.rendered[0].transforms['expression-component:pupil-right'].x)
  assert.ok(outputs[3].imageDataUrl.includes('blink'))
  assert.ok(outputs[0].imageDataUrl.includes('talk'))
  assert.equal(renderer.preparedStats().entries, 1)
  assert.ok(budget.snapshot().byCategory.artwork > 0)
  renderer.dispose()
  assert.equal(budget.snapshot().usedBytes, 0)
})

test('different poses and face-set references never share prepared body/legacy-face bases', async () => {
  const { renderer, state, transition, events, character, appearance } = rig()
  await renderer.render(transition(state(1)), 1, character)
  await renderer.render(transition(state(2)), 1, character)
  await renderer.render(transition(state(1, { ...appearance, setId: 'face-b' })), 1, character)
  assert.equal(events.prepared.length, 3)
  assert.deepEqual(events.prepared.map(e => e.pose), [1, 2, 1])
  assert.equal(renderer.preparedStats().entries, 3)
  renderer.clearPrepared()
  assert.equal(renderer.preparedStats().entries, 0)
  await renderer.render(transition(state(1)), 1, character)
  assert.equal(events.prepared.length, 4)
  renderer.dispose()
})

test('same face set but different expression indices/pupil selections cannot share prepared legacy face', async () => {
  const { renderer, state, transition, events, character, appearance } = rig()
  const first = { ...appearance, expressionIndex: 0, eyeLeftCatalogId: 'left-0' }
  const second = { ...appearance, expressionIndex: 4, eyeLeftCatalogId: 'left-4' }
  await renderer.render(transition(state(1, first)), 1, character)
  await renderer.render(transition(state(1, second)), 1, character)
  assert.equal(events.prepared.length, 2, 'different legacy/categorical facial bases must not collide')
  assert.equal(renderer.preparedStats().entries, 2)
  renderer.dispose()
})

test('pose-to-pose transitions retain the original interpolated artwork path', async () => {
  const { renderer, state, transition, events, character } = rig()
  const from = state(1), to = state(2)
  const first = await renderer.render(transition(from, to), 1, character)
  const second = await renderer.render(transition(from, to), 1, character)
  assert.equal(events.mixedArtwork, 2)
  assert.equal(events.prepared.length, 2, 'dynamic pose mixes must not reuse a static rig')
  assert.ok(first.imageDataUrl.includes('1:2:0.5'))
  assert.equal(first.imageDataUrl, second.imageDataUrl)
  assert.equal(renderer.preparedStats().entries, 0)
  renderer.dispose()
})

test('shared bytes ledger bounds prepared rigs and releases on cache eviction/dispose', async () => {
  const budget = new VideoStudioResourceBudget(270000)
  const { renderer, state, transition, events, character } = rig({ budget })
  await renderer.render(transition(state(1)), 1, character)
  assert.equal(budget.snapshot().usedBytes, 128 * 128 * 4 * 4)
  await renderer.render(transition(state(2)), 1, character)
  assert.equal(renderer.preparedStats().entries, 1)
  assert.equal(budget.snapshot().usedBytes, 128 * 128 * 4 * 4)
  await renderer.render(transition(state(1)), 1, character)
  assert.equal(events.prepared.length, 3, 'evicted rig rebuilt when requested again')
  renderer.dispose()
  assert.equal(budget.snapshot().usedBytes, 0)
})
