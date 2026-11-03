import test from 'node:test'
import assert from 'node:assert/strict'
import { createHairMotionState, hairMotionOffset, stepHairMotion } from '../src/renderer/src/features/fabricator/hair-animation/hairMotionPhysics.ts'

const settings = { wind: 60, gust: 0, stiffness: 45, damping: 55, responsiveness: 70, anchor: 20, speed: 100, enabled: true }
const simulate = (state, seconds, head = 0, config = settings) => { for (let i = 0; i < seconds * 120; i++) stepHairMotion(state, config, 1 / 120, head, 0) }

test('wind moves hair progressively while keeping the root attached', () => {
  const state = createHairMotionState()
  simulate(state, 4)
  assert.equal(state.offsets[0], 0)
  assert.equal(hairMotionOffset(state, .1, 20), 0)
  assert.equal(hairMotionOffset(state, .2, 20), 0)
  assert.ok(hairMotionOffset(state, 1, 20) > hairMotionOffset(state, .5, 20))
})

test('head movement produces inertia and damping settles without wind', () => {
  const state = createHairMotionState()
  const still = { ...settings, wind: 0, gust: 0 }
  stepHairMotion(state, still, 1 / 120, .3, 0)
  simulate(state, 0.3, .3, still)
  const displaced = Math.abs(state.offsets.at(-1))
  assert.ok(displaced > .001)
  simulate(state, 8, .3, still)
  assert.ok(Math.abs(state.offsets.at(-1)) < displaced / 10)
})

test('simulation remains finite and bounded after extreme time or head changes', () => {
  const state = createHairMotionState()
  for (let i = 0; i < 500; i++) stepHairMotion(state, { ...settings, damping: 0, stiffness: 100, gust: 100 }, 3, i % 2 ? 100 : -100, i)
  for (const value of [...state.offsets, ...state.velocities]) assert.ok(Number.isFinite(value) && Math.abs(value) <= 3)
})

test('disabling a layer clears residual motion', () => {
  const state = createHairMotionState()
  simulate(state, 2)
  stepHairMotion(state, { ...settings, enabled: false }, 1 / 120, .2, 0)
  assert.ok([...state.offsets, ...state.velocities].every((value) => value === 0))
  assert.equal(state.previousHead, .2)
})

test('speed control changes the progression of the simulation', () => {
  const slow = createHairMotionState(), fast = createHairMotionState()
  simulate(slow, 1, 0, { ...settings, speed: 50 })
  simulate(fast, 1, 0, { ...settings, speed: 200 })
  assert.ok(fast.offsets.at(-1) > slow.offsets.at(-1))
})
