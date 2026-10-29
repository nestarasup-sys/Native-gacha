import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildAnimatorHeadOverlays, mapHeadOverlay } from '../src/renderer/src/features/fabricator/models/animatorHeadOverlays.ts'

const headPart = (id, x = 0, y = 0, width = 100, height = 100, rotation = 0) => ({
  id, name: 'Cabeça', x, y, width, height, rotation, dataUrl: ''
})
const project = (slot, part) => ({ slot, parts: [part] })

function build(overrides = {}) {
  const sourceHead = headPart('source-head')
  const targetHead = headPart('target-head', 100, 100, 200, 200)
  return buildAnimatorHeadOverlays({
    rigProject: project(1, sourceHead),
    displayProject: project(1, targetHead),
    selectedCharacter: { customization: { hairAppearance: { modelSlot: 1 } } },
    hairStyles: {}, faceItems: {}, faceSets: {},
    layerIndex: new Map([['target-head', 2]]),
    layerStride: 16,
    ...overrides
  })
}

test('AnimatorWorkspace delegates character head layers to an isolated builder', async () => {
  const workspace = await readFile('src/renderer/src/features/fabricator/AnimatorWorkspace.tsx', 'utf8')
  assert.match(workspace, /buildAnimatorHeadOverlays\(/)
  assert.doesNotMatch(workspace, /function mapHeadOverlay\(/)
  assert.doesNotMatch(workspace, /const headOverlays = useMemo\(\(\) => \{/)
})

test('head overlay mapping scales and rotates the character placement with the pose head', () => {
  const placement = mapHeadOverlay(
    headPart('source', 0, 0, 100, 100),
    headPart('target', 100, 100, 200, 200, 90),
    20, 30, 10, 20, 5, 1.5, .5, true
  )

  assert.ok(Math.abs(placement.x - 240) < 1e-10)
  assert.ok(Math.abs(placement.y - 140) < 1e-10)
  assert.equal(placement.width, 30)
  assert.equal(placement.height, 20)
  assert.equal(placement.rotation, 95)
  assert.equal(placement.flipX, true)
})

test('hair back/front layers resolve their selected assets and keep the front above the head', () => {
  const back = {
    id: 'back',
    back: { dataUrl: 'data:back', width: 40, height: 20 },
    front: null,
    transforms: { back: { x: 10, y: 20, rotation: 0, scaleX: .5, scaleY: .5 }, front: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 } }
  }
  const front = {
    id: 'front',
    back: null,
    front: { dataUrl: 'data:front', width: 20, height: 30 },
    transforms: { back: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }, front: { x: 50, y: 50, rotation: 4, scaleX: 1, scaleY: 1, flipX: true } }
  }
  const character = { customization: { hairAppearance: { modelSlot: 1, backStyleId: 'back', frontStyleId: 'front' } } }
  const overlays = build({
    selectedCharacter: character,
    hairStyles: { '1:back': back, '1:front': front }
  })

  assert.deepEqual(overlays.map(({ key, dataUrl, zIndex }) => ({ key, dataUrl, zIndex })), [
    { key: 'hair-back', dataUrl: 'data:back', zIndex: 0 },
    { key: 'hair-front', dataUrl: 'data:front', zIndex: 47 }
  ])
  assert.equal(overlays[0].x, 120)
  assert.equal(overlays[0].y, 140)
  assert.equal(overlays[0].width, 40)
  assert.equal(overlays[0].height, 20)
  assert.equal(overlays[1].flipX, true)
})

test('face catalog layers use the chosen expression and stay above the head', () => {
  const eyeCatalog = {
    pieces: [
      { sheet: 'eyes', index: 1, side: 'left', width: 10, height: 12, dataUrl: 'data:eye-left' },
      { sheet: 'eyes', index: 1, side: 'right', width: 14, height: 12, dataUrl: 'data:eye-right' }
    ],
    transforms: {
      'eye-left': { x: 25, y: 40, scaleX: 1, scaleY: 1, rotation: -5 },
      'eye-right': { x: 75, y: 40, scaleX: 1, scaleY: 1, rotation: 5 }
    }
  }
  const character = { customization: { faceAppearance: {
    modelSlot: 1, eyeCatalogId: 'eyes', eyeState: 1, eyebrows: false, noseIndex: 0,
    expressionIndex: 0, mouthOpen: false
  } } }
  const overlays = build({ selectedCharacter: character, faceItems: { '1:eyes': eyeCatalog } })

  assert.deepEqual(overlays.map(({ key, dataUrl, zIndex }) => ({ key, dataUrl, zIndex })), [
    { key: 'face-eye-left', dataUrl: 'data:eye-left', zIndex: 46 },
    { key: 'face-eye-right', dataUrl: 'data:eye-right', zIndex: 46 }
  ])
  assert.equal(overlays[0].x, 150)
  assert.equal(overlays[1].x, 250)
})

test('legacy face sheets remain a fallback when a selected catalog lacks a piece', () => {
  const legacy = {
    pieces: [{ sheet: 'eyes', index: 0, side: 'right', width: 8, height: 9, dataUrl: 'data:legacy-right-eye' }],
    transforms: { 'eye-right': { x: 80, y: 40, scaleX: 1, scaleY: 1, rotation: 0 } }
  }
  const character = { customization: {
    faceAppearance: { modelSlot: 1, setId: 'old-face', eyeCatalogId: 'new-eyes', eyeState: 0, eyebrows: false, noseIndex: 0, expressionIndex: 0, mouthOpen: false }
  } }
  const overlays = build({
    selectedCharacter: character,
    faceItems: { '1:new-eyes': { pieces: [], transforms: {} } },
    faceSets: { '1:old-face': legacy }
  })

  assert.equal(overlays.length, 1)
  assert.equal(overlays[0].key, 'face-eye-right')
  assert.equal(overlays[0].dataUrl, 'data:legacy-right-eye')
})

test('head layers are absent when either rig lacks a head or belongs to another model slot', () => {
  const noTargetHead = { slot: 1, parts: [{ id: 'torso', name: 'Tronco', x: 0, y: 0, width: 20, height: 40, rotation: 0, dataUrl: '' }] }
  assert.deepEqual(build({ displayProject: noTargetHead }), [])

  const wrongSlotCharacter = { customization: { hairAppearance: { modelSlot: 2 } } }
  assert.deepEqual(build({ selectedCharacter: wrongSlotCharacter }), [])
})
