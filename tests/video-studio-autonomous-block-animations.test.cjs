'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

function pureTs(relative) {
  const text = fs.readFileSync(path.resolve(__dirname, relative), 'utf8')
  const js = ts.transpile(text, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', js)((name) => {
    throw Error('An autonomous Video Studio transition must not require an external animator: ' + name)
  }, mod, mod.exports)
  return mod.exports
}

const { compileVideoCharacterTransitions, VIDEO_CHARACTER_TRANSITION_FRAMES } =
  pureTs('../src/shared/videoCharacterTransitions.ts')
const { mixPoseArtwork, mixFaceTransform, smoothProgress, transitionProgress } =
  pureTs('../src/shared/videoCharacterInterpolation.ts')

const pose = (slot, name) => ({
  id: 'actor', kind: 'character', characterId: 'character-in-scene',
  x: 0, y: 0, width: 100, height: 200, rotation: 0, zIndex: 1,
  poseSlot: slot,
  faceAppearance: {
    setId: 'face-a', expressionIndex: name === 'sorriso' ? 1 : 0,
    transforms: { mouth: {
      x: name === 'sorriso' ? 80 : 20, y: 40, scaleX: 1, scaleY: 1, rotation: name === 'sorriso' ? 20 : -10,
    } },
  },
  activeExpressionPresetId: name,
})
const image = element => ({ element, imageDataUrl: 'data:image/png;base64,SAVED_ENDPOINT' })
const key = (frame, element) => ({ id: 'k-' + frame, elementId: 'actor', frame, state: image(element) })
function timeline(keys, opts = {}) {
  const base = image(pose(1, 'neutro'))
  return {
    elements: [base.element],
    videoTimeline: {
      schemaVersion: 1, frameRate: 60, durationFrames: 600, playheadFrame: 0,
      characterBases: { actor: base },
      characterKeys: keys,
      characterGaps: opts.characterGaps ?? [],
    },
  }
}

test('Video Studio automatically animates pose A to B on consecutive character blocks, without Animator DEV assets', () => {
  const studio = timeline([key(100, pose(2, 'neutro'))])
  const result = compileVideoCharacterTransitions(studio)
  assert.equal(result.length, 1)
  assert.equal(result[0].elementId, 'actor')
  assert.equal(result[0].startFrame, 100 - VIDEO_CHARACTER_TRANSITION_FRAMES)
  assert.equal(result[0].boundaryFrame, 100)
  assert.equal(result[0].from.element.poseSlot, 1)
  assert.equal(result[0].to.element.poseSlot, 2)
  assert.ok(transitionProgress(result[0], 92) > 0 && transitionProgress(result[0], 92) < 1)
})

test('Video Studio automatically animates face preset A to B with the same pose', () => {
  const studio = timeline([key(100, pose(1, 'sorriso'))])
  const result = compileVideoCharacterTransitions(studio)
  assert.equal(result.length, 1)
  assert.equal(result[0].from.element.poseSlot, result[0].to.element.poseSlot)
  assert.equal(result[0].from.element.activeExpressionPresetId, 'neutro')
  assert.equal(result[0].to.element.activeExpressionPresetId, 'sorriso')
  const from = result[0].from.element.faceAppearance.transforms.mouth
  const to = result[0].to.element.faceAppearance.transforms.mouth
  const middle = mixFaceTransform(from, to, smoothProgress(.5))
  assert.equal(middle.x, 50)
  assert.equal(middle.rotation, 5)
  assert.notStrictEqual(middle, from)
  assert.notStrictEqual(middle, to)
})

test('A block changing pose AND face preset triggers one combined transition without importing saved animations', () => {
  const result = compileVideoCharacterTransitions(timeline([key(120, pose(3, 'sorriso'))]))
  assert.equal(result.length, 1)
  assert.equal(result[0].from.element.poseSlot, 1)
  assert.equal(result[0].to.element.poseSlot, 3)
  assert.equal(result[0].from.element.activeExpressionPresetId, 'neutro')
  assert.equal(result[0].to.element.activeExpressionPresetId, 'sorriso')
})

test('repeated blocks with identical acting state do not invoke a needless animation', () => {
  const result = compileVideoCharacterTransitions(timeline([key(90, pose(1, 'neutro'))]))
  assert.equal(result.length, 0)
})

test('gap between character blocks suppresses interpolation across absent character footage', () => {
  const result = compileVideoCharacterTransitions(timeline(
    [key(90, pose(2, 'neutro'))],
    { characterGaps: [{ elementId: 'actor', startFrame: 85, endFrame: 90 }] },
  ))
  assert.equal(result.length, 0)
})

test('pose interpolation works from in-scene pose geometry alone, without an authored Animator DEV animation', () => {
  const part = (x, rotation) => ({
    id: 'left-arm', x, y: 10, width: 20, height: 40, rotation,
    dataUrl: 'data:image/png;base64,ARM',
  })
  const a = { width: 120, height: 200, parts: [part(10, 350)] }
  const b = { width: 120, height: 200, parts: [part(60, 10)] }
  const atMiddle = mixPoseArtwork(a, b, .5)
  assert.equal(atMiddle.parts[0].x, 35)
  assert.equal(atMiddle.parts[0].rotation, 360)
  assert.deepEqual(a.parts, [part(10, 350)])
  assert.deepEqual(b.parts, [part(60, 10)])
})
