import test from 'node:test'
import assert from 'node:assert/strict'
import { createExpressionPreviewInteraction } from '../src/renderer/src/features/fabricator/expressionPreviewInteraction.ts'

const transform = () => ({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 })
const faceTransforms = () => ({
  eyeLeft: transform(), eyeRight: transform(), pupilLeft: transform(), pupilRight: transform(),
  browLeft: transform(), browRight: transform(), nose: transform(), mouth: transform()
})
const faceEffects = () => ({
  shadow: { enabled: false, color: '#000000', opacity: .4, softness: .5, size: .4, offsetY: 0 },
  blush: { enabled: true, color: '#ff7799', opacity: .5, softness: .7, size: .5, offsetX: .1, offsetY: .2, aspectRatio: .52, style: 'cheeks' },
  mouthBlush: { enabled: false, color: '#ff7799', opacity: .4, softness: .7, size: .1, width: .1, height: .052, rotation: 0, offsetY: 0, aspectRatio: .52 }
})

function createHarness({ gaze = 'right', selectedLayer = 'pupilLeft', transforms = faceTransforms(), effects = faceEffects() } = {}) {
  const state = { transforms, pupils: {}, effects }
  const calls = { captured: [], released: [], prevented: 0, stopped: 0 }
  const layerDragRef = { current: null }
  const effectDragRef = { current: null }
  const previewCanvasRef = { current: { getBoundingClientRect: () => ({ width: 200, height: 100 }) } }
  const interaction = createExpressionPreviewInteraction({
    layerDragRef, effectDragRef, previewCanvasRef, selectedLayer,
    head: { width: 100, height: 50 }, previewGaze: gaze,
    visibleTransforms: transforms, effects,
    setTransforms: (update) => { state.transforms = typeof update === 'function' ? update(state.transforms) : update },
    setPtPupils: (update) => { state.pupils = typeof update === 'function' ? update(state.pupils) : update },
    setEffects: (update) => { state.effects = typeof update === 'function' ? update(state.effects) : update }
  })
  return { calls, state, layerDragRef, effectDragRef, interaction }
}

function pointer(pointerId, clientX, clientY, calls) {
  return {
    pointerId, clientX, clientY, pointerType: 'mouse', button: 0,
    preventDefault: () => { calls.prevented += 1 },
    stopPropagation: () => { calls.stopped += 1 },
    currentTarget: {
      setPointerCapture: (id) => calls.captured.push(id),
      hasPointerCapture: (id) => calls.captured.includes(id),
      releasePointerCapture: (id) => calls.released.push(id)
    }
  }
}

test('arrastar camada converte pixels pela escala da cabeça e solta a captura', () => {
  const fixture = createHarness()
  fixture.interaction.beginLayerDrag(pointer(2, 100, 50, fixture.calls), [
    { layer: 'pupilLeft', mirroredX: false, rotation: 0 }
  ])
  fixture.interaction.moveLayerDrag(pointer(2, 110, 70, fixture.calls))

  assert.equal(fixture.state.transforms.pupilLeft.x, 5)
  assert.equal(fixture.state.transforms.pupilLeft.y, 10)
  fixture.interaction.endLayerDrag(pointer(2, 110, 70, fixture.calls))
  assert.equal(fixture.layerDragRef.current, null)
  assert.deepEqual(fixture.calls.released, [2])
})

test('olhar PT só aceita pupilas e grava coordenadas independentes da expressão base', () => {
  const fixture = createHarness({ gaze: 'left' })
  const event = pointer(5, 20, 30, fixture.calls)
  fixture.interaction.beginLayerDrag(event, [
    { layer: 'pupilLeft', mirroredX: false, rotation: 0 },
    { layer: 'pupilRight', mirroredX: true, rotation: 0 }
  ])
  fixture.interaction.moveLayerDrag(pointer(5, 24, 34, fixture.calls))

  assert.deepEqual(fixture.state.pupils, { left: { x: 2, y: 2, rotation: 0 }, right: { x: -2, y: 2, rotation: 0 } })
  assert.deepEqual(fixture.state.transforms, faceTransforms())

  const rejected = pointer(6, 0, 0, fixture.calls)
  fixture.interaction.beginLayerDrag(rejected, [{ layer: 'eyeLeft', mirroredX: false, rotation: 0 }])
  assert.equal(fixture.layerDragRef.current.pointerId, 5)
  assert.deepEqual(fixture.calls.captured, [5])
})

test('arrastar blush limita coordenadas e as setas movem em passos maiores com Shift', () => {
  const fixture = createHarness()
  fixture.interaction.beginBlushDrag(pointer(9, 10, 20, fixture.calls))
  fixture.interaction.moveBlushDrag(pointer(9, 190, 90, fixture.calls))
  assert.equal(fixture.state.effects.blush.offsetX, .5)
  assert.equal(fixture.state.effects.blush.offsetY, .5)
  fixture.interaction.endBlushDrag(pointer(9, 190, 90, fixture.calls))
  assert.deepEqual(fixture.calls.released, [9])

  const updated = createHarness({ effects: fixture.state.effects })
  const keyboard = { key: 'ArrowLeft', shiftKey: true, preventDefault: () => { updated.calls.prevented += 1 } }
  updated.interaction.nudgeBlush(keyboard)
  assert.equal(updated.state.effects.blush.offsetX, .45)
  assert.equal(updated.calls.prevented, 1)
})
