import test from 'node:test'
import assert from 'node:assert/strict'
import { FIRST_HAIR_MOTION_PRESET, normalizeHairMotionPreset, parseHairMotionPresets } from '../src/renderer/src/features/fabricator/hair-animation/hairMotionPresets.ts'

test('initial five slots contain the exact settings from the requested first preset', () => {
  const slots = parseHairMotionPresets(null)
  assert.equal(slots.length, 5)
  assert.deepEqual(slots[0].physics, { wind: -50, gust: 28, speed: 100, stiffness: 42, damping: 52, responsiveness: 55, anchor: 14 })
  assert.deepEqual(slots[0].enabled, { back: true, front: true, fringe: true })
  assert.deepEqual(slots[0].intensity, { back: 100, front: 75, fringe: 40 })
  assert.deepEqual(slots.slice(1), [null, null, null, null])
  slots[0].physics.wind = 0
  assert.equal(FIRST_HAIR_MOTION_PRESET.physics.wind, -50)
})

test('five saved slots round-trip and invalid data is rejected without replacing it', () => {
  const slots = parseHairMotionPresets(null)
  slots[4] = { ...structuredClone(slots[0]), intensity: { back: 90, front: 20, fringe: 5 } }
  assert.deepEqual(parseHairMotionPresets(JSON.stringify(slots)), slots)
  assert.equal(normalizeHairMotionPreset({ ...slots[0], physics: { ...slots[0].physics, wind: 500 } }), null)
  assert.throws(() => parseHairMotionPresets('{invalid'))
  assert.throws(() => parseHairMotionPresets(JSON.stringify([slots[0]])))
})
