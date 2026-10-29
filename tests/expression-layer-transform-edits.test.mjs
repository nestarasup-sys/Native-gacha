import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  expressionLayerUsesMirroredX,
  updateExpressionLayerTransform,
  updateExpressionPtPupils
} from '../src/renderer/src/features/fabricator/expressionLayerTransformEdits.ts'

const transform = (overrides = {}) => ({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, ...overrides })
const transforms = (overrides = {}) => ({
  eyeLeft: transform(), eyeRight: transform(), pupilLeft: transform(), pupilRight: transform(),
  browLeft: transform(), browRight: transform(), nose: transform(), mouth: transform(),
  ...overrides
})

test('movimento vinculado respeita o espelhamento e preserva a geometria independente', () => {
  const current = transforms({
    eyeLeft: transform({ x: 100, y: 70, scaleX: 1, scaleY: 2, rotation: 10 }),
    eyeRight: transform({ x: 200, y: 80, scaleX: 1.5, scaleY: 1.5, rotation: -10, flipX: true })
  })
  const result = updateExpressionLayerTransform(current, 'eyeLeft', {
    x: 112, y: 73, scaleX: 2, scaleY: 4, rotation: 25, flipX: true
  }, {
    linked: true, pairedLayer: 'eyeRight', sourceMirroredX: false, pairedMirroredX: true
  })

  assert.deepEqual(result.eyeLeft, transform({ x: 112, y: 73, scaleX: 2, scaleY: 4, rotation: 25, flipX: true }))
  assert.deepEqual(result.eyeRight, transform({ x: 188, y: 83, scaleX: 3, scaleY: 3, rotation: -25, flipX: false }))
  assert.deepEqual(current.eyeLeft, transform({ x: 100, y: 70, scaleX: 1, scaleY: 2, rotation: 10 }))
  assert.deepEqual(result.nose, current.nose)
})

test('edição sem vínculo altera apenas a camada selecionada', () => {
  const current = transforms({ pupilLeft: transform({ x: 25, y: 12 }) })
  const result = updateExpressionLayerTransform(current, 'pupilLeft', { y: 20 }, {
    linked: false, pairedLayer: 'pupilRight', sourceMirroredX: false, pairedMirroredX: true
  })

  assert.deepEqual(result.pupilLeft, transform({ x: 25, y: 20 }))
  assert.deepEqual(result.pupilRight, current.pupilRight)
  assert.deepEqual(current.pupilLeft, transform({ x: 25, y: 12 }))
})

test('escalas vinculadas preservam proporção e mantêm limites, rotação e flip', () => {
  const current = transforms({
    browLeft: transform({ scaleX: 1, scaleY: 1, rotation: 170 }),
    browRight: transform({ scaleX: .8, scaleY: .9, rotation: -170, flipX: false })
  })
  const result = updateExpressionLayerTransform(current, 'browLeft', {
    scaleX: 8, scaleY: .001, rotation: 220, flipX: true
  }, {
    linked: true, pairedLayer: 'browRight', sourceMirroredX: false, pairedMirroredX: true
  })

  assert.equal(result.browRight.scaleX, 4)
  assert.equal(result.browRight.scaleY, .02)
  assert.equal(result.browRight.rotation, -180)
  assert.equal(result.browRight.flipX, true)
})

test('lado direito só espelha quando o asset usa a orientação herdada', () => {
  const selections = {
    eyes: { left: 'eye-left', right: 'eye-right' },
    pupils: { left: 'pupil-left', right: 'pupil-right' },
    eyebrows: { left: 'brow-left', right: 'brow-right' },
    nose: null, mouth: null
  }
  const assets = {
    'eye-right': { rightSidePositioned: undefined },
    'pupil-right': { rightSidePositioned: true },
    'brow-right': { rightSidePositioned: false }
  }

  assert.equal(expressionLayerUsesMirroredX('eyeRight', selections, assets), true)
  assert.equal(expressionLayerUsesMirroredX('pupilRight', selections, assets), false)
  assert.equal(expressionLayerUsesMirroredX('browRight', selections, assets), true)
  assert.equal(expressionLayerUsesMirroredX('eyeLeft', selections, assets), false)
  assert.equal(expressionLayerUsesMirroredX('nose', selections, assets), false)
  assert.equal(expressionLayerUsesMirroredX('pupilRight', { ...selections, pupils: { ...selections.pupils, right: null } }, assets), true)
})

test('ajuste PT vinculado usa coordenadas visíveis e não altera a expressão normal', () => {
  const visible = transforms({
    pupilLeft: transform({ x: 30, y: 40, rotation: 5 }),
    pupilRight: transform({ x: 70, y: 45, rotation: -5 })
  })
  const result = updateExpressionPtPupils({}, 'left', { x: 38, y: 43, rotation: 10 }, {
    linked: true, visibleTransforms: visible, mirroredX: { left: false, right: true }
  })

  assert.deepEqual(result, {
    left: { x: 38, y: 43, rotation: 10 },
    right: { x: 62, y: 48, rotation: -10 }
  })
  assert.deepEqual(visible.pupilLeft, transform({ x: 30, y: 40, rotation: 5 }))
  assert.deepEqual(visible.pupilRight, transform({ x: 70, y: 45, rotation: -5 }))
})

test('ajuste PT independente mantém o override oposto e calcula pela expressão atual', () => {
  const visible = transforms({ pupilLeft: transform({ x: 12, y: 15, rotation: 4 }) })
  const current = { right: { x: 80, y: 30, rotation: -9 } }
  const result = updateExpressionPtPupils(current, 'left', { x: 20 }, {
    linked: false, visibleTransforms: visible, mirroredX: { left: false, right: true }
  })

  assert.deepEqual(result, { left: { x: 20, y: 15, rotation: 4 }, right: current.right })
})

test('workspace delega as atualizações espelhadas ao modelo puro', async () => {
  const source = await readFile('src/renderer/src/features/fabricator/ExpressionPresetWorkspace.tsx', 'utf8')

  assert.match(source, /updateExpressionLayerTransform\(/)
  assert.match(source, /updateExpressionPtPupils\(/)
  assert.match(source, /expressionLayerUsesMirroredX\(/)
  assert.doesNotMatch(source, /pairedAfter\.(?:x|y|scaleX|scaleY|rotation)\s*[+*=]/)
})
