import test from 'node:test'
import assert from 'node:assert/strict'
import { FIRST_HAIR_MOTION_PRESET } from '../src/shared/hairMotionEngine.ts'
import { editorV6HairMotionHeadAnchorX, editorV6HairMotionTransitionEnvelope, interpolateEditorV6HairMotionRig, parseEditorV6HairMotionBundle } from '../src/shared/editorV6HairMotion.ts'
import { planEditorV6Export } from '../src/shared/editorV6Export.ts'

const validBundle = () => ({
  presetSlot: 2,
  preset: structuredClone(FIRST_HAIR_MOTION_PRESET),
  surfaces: [{ id: 'body', dataUrl: 'data:image/png;base64,AA==' }, { id: 'face', dataUrl: 'data:image/png;base64,AA==' }],
  textures: [{ id: 'hair', dataUrl: 'data:image/png;base64,AA==' }],
  rigs: [{
    elementId: 'element-1', assetId: 'asset-1', characterId: 'character-1',
    baseSurfaceId: 'body', faceSurfaceId: 'face', overlaySurfaceId: null,
    artworkWidth: 100, artworkHeight: 200, outputWidth: 100, outputHeight: 200,
    shapeScaleX: 1, shapeScaleY: 1,
    sourceCrop: { left: 0, top: 0, width: 80, height: 180 },
    sourceHead: { width: 40, height: 40 },
    targetHead: { x: 30, y: 5, width: 40, height: 40, rotation: 0 },
    layers: [{ id: 'fringe-1', textureId: 'hair', side: 'fringe', width: 20, height: 30, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipX: false, phase: 1.2 }]
  }]
})

test('validates export-only hair layers and their cross-references', () => {
  const parsed = parseEditorV6HairMotionBundle(validBundle())
  assert.equal(parsed.presetSlot, 2)
  assert.deepEqual(parsed.preset, FIRST_HAIR_MOTION_PRESET)
  assert.equal(parsed.rigs[0].layers[0].textureId, 'hair')
  const invalid = validBundle()
  invalid.rigs[0].layers[0].textureId = 'missing'
  assert.throws(() => parseEditorV6HairMotionBundle(invalid), /imagem de cabelo preparada/i)
  const hiddenHair = validBundle()
  hiddenHair.rigs[0].layers = []
  assert.throws(() => parseEditorV6HairMotionBundle(hiddenHair), /camada visível de cabelo/i)
})

test('export rejects a stale or out-of-range experimental preset slot', () => {
  const options = { startFrame: 0, endFrame: 30, width: 1920, height: 1080, turbo: true, encoder: 'auto', hairAnimationPresetSlot: 3 }
  assert.equal(planEditorV6Export(options, 60).length, 2)
  assert.throws(() => planEditorV6Export({ ...options, hairAnimationPresetSlot: 6 }, 60), /preset de animação de cabelo/i)
})

test('o cabelo reduz o balanço antes e depois do atlas de pose sem salto de intensidade', () => {
  const window = [{ startFrame: 22.5, endFrame: 30 }]
  const before = [18, 19, 20, 21, 22].map(frame => editorV6HairMotionTransitionEnvelope(frame, window))
  const after = [30, 31, 32, 33, 34].map(frame => editorV6HairMotionTransitionEnvelope(frame, window))
  assert.deepEqual(before.slice(0, -1).every((value, index) => value > before[index + 1]), true)
  assert.equal(before.at(-1), 0.04296875)
  assert.deepEqual([23, 26, 29].map(frame => editorV6HairMotionTransitionEnvelope(frame, window)), [0, 0, 0])
  assert.deepEqual(after, [0, 0.15625, 0.5, 0.84375, 1])
  assert.throws(() => editorV6HairMotionTransitionEnvelope(1, [{ startFrame: 5, endFrame: 5 }]), /intervalo de transição/i)
})

test('a inércia do cabelo usa a cabeça no espaço do palco, incluindo escala, giro e espelhamento', () => {
  const rig = validBundle().rigs[0]
  const element = { x: -25, y: 0, width: 40, height: 60, rotation: 0, flipX: false, characterScale: 100, characterWidthScale: 100, characterHeightScale: 100 }
  assert.equal(editorV6HairMotionHeadAnchorX(element, rig), .3)
  const offCenter = { ...rig, targetHead: { ...rig.targetHead, x: 50 } }
  assert.equal(editorV6HairMotionHeadAnchorX(element, offCenter), .4)
  assert.equal(editorV6HairMotionHeadAnchorX({ ...element, flipX: true }, offCenter), .1)
  assert.ok(Math.abs(editorV6HairMotionHeadAnchorX({ ...element, rotation: 90 }, { ...offCenter, targetHead: { ...offCenter.targetHead, y: 50 } }) - .2875) < 1e-9)
  assert.equal(editorV6HairMotionHeadAnchorX({ ...element, characterWidthScale: 150 }, offCenter), .475)
})

test('a âncora usa o centro de um recorte transparente deslocado, não o centro do canvas original', () => {
  const rig = validBundle().rigs[0]
  const element = { x: -25, y: 0, width: 40, height: 60, rotation: 0, flipX: false }
  const offCenterHead = { ...rig, targetHead: { ...rig.targetHead, x: 50 } }
  const fullCanvas = { ...offCenterHead, sourceCrop: { left: 0, top: 0, width: 100, height: 200 } }
  const cropped = { ...offCenterHead, sourceCrop: { left: 10, top: 20, width: 80, height: 180 } }
  assert.equal(editorV6HairMotionHeadAnchorX(element, fullCanvas), .33)
  assert.equal(editorV6HairMotionHeadAnchorX(element, cropped), .35)
})

test('a âncora interpolada usa a geometria local da cabeça entre duas poses', () => {
  const from = validBundle().rigs[0]
  const to = { ...from, targetHead: { ...from.targetHead, x: 50, rotation: 350 }, sourceCrop: { ...from.sourceCrop, left: 10 } }
  const halfway = interpolateEditorV6HairMotionRig(from, to, .5)
  assert.equal(halfway.targetHead.x, 40)
  assert.equal(halfway.targetHead.rotation, -5)
  assert.equal(halfway.sourceCrop.left, 5)
  const element = { x: -25, y: 0, width: 40, height: 60, rotation: 0, flipX: false }
  assert.equal(editorV6HairMotionHeadAnchorX(element, halfway), .325)
  assert.throws(() => interpolateEditorV6HairMotionRig(from, to, 1.1), /progresso da geometria/i)
})
