import test from 'node:test'
import assert from 'node:assert/strict'
import { hairAnimationGeometry } from '../src/renderer/src/features/fabricator/hair-animation/hairAnimationGeometry.ts'

test('hair animation preview preserves the saved fit and horizontal reflection', () => {
  const head = { width: 200, height: 100 }
  const asset = { width: 80, height: 60 }
  const fit = { x: 110, y: 35, scaleX: 2, scaleY: 0.5, rotation: 12, flipX: true }
  const original = structuredClone(fit)
  assert.deepEqual(hairAnimationGeometry(head, asset, fit), {
    left: '55.00000000000001%', top: '35%', width: '80%', height: '30%',
    transform: 'translate(-50%, -50%) rotate(12deg) scaleX(-1)'
  })
  assert.deepEqual(fit, original)
})
