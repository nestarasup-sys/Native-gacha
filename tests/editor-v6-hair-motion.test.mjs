import test from 'node:test'
import assert from 'node:assert/strict'
import { FIRST_HAIR_MOTION_PRESET } from '../src/shared/hairMotionEngine.ts'
import { parseEditorV6HairMotionBundle } from '../src/shared/editorV6HairMotion.ts'
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
