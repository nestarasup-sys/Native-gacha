import test from 'node:test'
import assert from 'node:assert/strict'
import { FIRST_HAIR_MOTION_PRESET } from '../src/shared/hairMotionEngine.ts'
import { editorV6HairMotionHeadAnchor, editorV6HairMotionHeadAnchorX, editorV6HairMotionHeadPathDelta, editorV6HairMotionInstancePhase, editorV6HairMotionLayerHeadPosition, editorV6HairMotionLocalHeadDelta, interpolateEditorV6HairMotionRig, parseEditorV6HairMotionBundle } from '../src/shared/editorV6HairMotion.ts'
import { planEditorV6Export } from '../src/shared/editorV6Export.ts'
import { expandEditorV6HairCrop } from '../src/renderer/src/features/editorV6/editorV6HairMotionGeometry.ts'

test('recomposição preserva largura, altura e centro do recorte com escala e espelhamento', () => {
  const crop = { left: 25, top: 40, width: 160, height: 500 }
  const full = { width: 400, height: 600 }
  for (const rotation of [0, 37]) for (const flipX of [false, true]) {
    const element = { x: 8, y: -7, width: 18, height: 82, rotation, flipX, characterScale: 190, characterWidthScale: 120, characterHeightScale: 85 }
    const expanded = expandEditorV6HairCrop(element, full, crop)
    assert.ok(Math.abs(expanded.width * crop.width / full.width - element.width) < 1e-9)
    assert.ok(Math.abs(expanded.height * crop.height / full.height - element.height) < 1e-9)
    const dx = (crop.left + crop.width / 2 - full.width / 2) * expanded.width / full.width * 1.9 * 1.2 * 19.2 * (flipX ? -1 : 1)
    const dy = (crop.top + crop.height / 2 - full.height / 2) * expanded.height / full.height * 1.9 * .85 * 10.8
    const radians = rotation * Math.PI / 180
    assert.ok(Math.abs(expanded.x + (dx * Math.cos(radians) - dy * Math.sin(radians)) / 19.2 - element.x) < 1e-9)
    assert.ok(Math.abs(expanded.y + (dx * Math.sin(radians) + dy * Math.cos(radians)) / 10.8 - element.y) < 1e-9)
  }
})

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

test('bundle valida atlas de transição sem cabelo e preserva referências de face e recorte', () => {
  const bundle = validBundle()
  bundle.motionTransitions = [{
    elementId: 'element-1', key: 'motion-key', startFrame: 10, endFrame: 12,
    behindFaceSurfaceId: 'body', faceSurfaceId: 'face', overlaySurfaceId: null, faceAtlasSurfaceId: null,
    frames: [{
      offset: -1,
      sprite: { x: 0, y: 0, width: 20, height: 30, atlasWidth: 20, atlasHeight: 30 },
      crop: { left: 4, top: 6, width: 20, height: 30 },
      x: 1, y: 2, width: 20, height: 30, rotation: 4, flipX: true,
      facePatch: { sprite: { x: 0, y: 0, width: 4, height: 4, atlasWidth: 4, atlasHeight: 4 }, x: .2, y: .3, width: .1, height: .1 }
    }]
  }]
  const parsed = parseEditorV6HairMotionBundle(bundle)
  assert.equal(parsed.motionTransitions[0].frames[0].crop.left, 4)
  assert.equal(parsed.motionTransitions[0].frames[0].facePatch.sprite.width, 4)
  const missingSurface = structuredClone(bundle)
  missingSurface.motionTransitions[0].faceSurfaceId = 'missing'
  assert.throws(() => parseEditorV6HairMotionBundle(missingSurface), /camada de pose sem cabelo/i)
  const duplicateFrame = structuredClone(bundle)
  duplicateFrame.motionTransitions[0].frames.push(duplicateFrame.motionTransitions[0].frames[0])
  assert.throws(() => parseEditorV6HairMotionBundle(duplicateFrame), /quadros duplicados/i)
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

test('a fase individual é estável por instância e não depende da ordem da cena', () => {
  for (const count of [1, 2, 3, 4, 8, 32]) {
    const ids = Array.from({ length: count }, (_, index) => `elemento-sintetico-${index + 1}`)
    const inOrder = ids.map(editorV6HairMotionInstancePhase)
    const reversed = [...ids].reverse().map(editorV6HairMotionInstancePhase).reverse()
    assert.deepEqual(reversed, inOrder)
    assert.ok(inOrder.every(phase => Number.isFinite(phase) && phase >= 0 && phase < Math.PI * 2))
    assert.equal(new Set(inOrder).size, count, `fase repetida entre ${count} instâncias sintéticas`)
  }
  assert.equal(editorV6HairMotionInstancePhase('instancia-A'), editorV6HairMotionInstancePhase('instancia-A'))
  assert.notEqual(editorV6HairMotionInstancePhase('instancia-A'), editorV6HairMotionInstancePhase('instancia-B'))
})

test('o movimento do ator é convertido uma vez para o eixo local em giro e espelhamento', () => {
  assert.equal(editorV6HairMotionLocalHeadDelta(.1, 0, 0, false), .1)
  assert.equal(editorV6HairMotionLocalHeadDelta(.1, 0, 0, true), -.1)
  assert.ok(Math.abs(editorV6HairMotionLocalHeadDelta(0, .16, 90, false) - .09) < 1e-12)
  assert.ok(Math.abs(editorV6HairMotionLocalHeadDelta(0, .16, 90, true) + .09) < 1e-12)
  // A global flip toggling in place has zero actor-center displacement; the
  // exporter tracks authored head offsets separately to prevent a false kick.
  assert.equal(editorV6HairMotionLocalHeadDelta(0, 0, 37, true), 0)
  assert.equal(editorV6HairMotionLayerHeadPosition(.08, false), .08)
  assert.equal(editorV6HairMotionLayerHeadPosition(.08, true), -.08)
})

test('mudança de flipX em uma troca de pose não cria impulso falso na cabeça', () => {
  const base = { centerX: .3, centerY: .4, localX: -.06, rotation: 0, flipX: false }
  const mirrored = { ...base, flipX: true }
  assert.equal(editorV6HairMotionHeadPathDelta(base, mirrored), 0)
  const movedAndRotated = { ...mirrored, centerX: .32, centerY: .42, rotation: 90 }
  assert.ok(Math.abs(editorV6HairMotionHeadPathDelta(mirrored, movedAndRotated) + .01125) < 1e-12)
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
  const to = { ...from, targetHead: { ...from.targetHead, x: 50, rotation: 350 }, sourceCrop: { ...from.sourceCrop, left: 10 }, layers: [{ ...from.layers[0], x: 8, y: 6, width: 30, height: 42, scaleX: 1.5, rotation: 20, flipX: true }] }
  const halfway = interpolateEditorV6HairMotionRig(from, to, .5)
  assert.equal(halfway.targetHead.x, 40)
  assert.equal(halfway.targetHead.rotation, -5)
  assert.equal(halfway.sourceCrop.left, 5)
  assert.deepEqual({ x: halfway.layers[0].x, y: halfway.layers[0].y, width: halfway.layers[0].width, height: halfway.layers[0].height, scaleX: halfway.layers[0].scaleX, rotation: halfway.layers[0].rotation, flipX: halfway.layers[0].flipX }, { x: 4, y: 3, width: 25, height: 36, scaleX: 1.25, rotation: 10, flipX: true })
  const element = { x: -25, y: 0, width: 40, height: 60, rotation: 0, flipX: false }
  assert.equal(editorV6HairMotionHeadAnchorX(element, halfway), .325)
  assert.throws(() => interpolateEditorV6HairMotionRig(from, to, 1.1), /progresso da geometria/i)
})
