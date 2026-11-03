import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceHairMotionToFrame, createHairMotionState, hairMotionOffset, stepHairMotion } from '../src/renderer/src/features/fabricator/hair-animation/hairMotionPhysics.ts'
import { createHairMotionMeshPositions, HAIR_MOTION_MESH_COLUMNS, HAIR_MOTION_MESH_HEIGHT, HAIR_MOTION_MESH_ROWS, HAIR_MOTION_MESH_WIDTH } from '../src/renderer/src/characters/hairMotionMeshGeometry.ts'

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

test('absolute-frame simulation is repeatable across Turbo chunk boundaries', () => {
  const headAt = (frame) => frame < 45 ? frame / 180 : .25 + Math.sin(frame / 37) * .1
  const run = (chunks) => {
    const state = createHairMotionState()
    for (const frame of chunks) advanceHairMotionToFrame(state, settings, frame, headAt, 1.2)
    return state
  }
  const continuous = run([899])
  const chunked = run([179, 358, 537, 718, 899])
  assert.equal(chunked.frame, 899)
  assert.deepEqual([...chunked.offsets], [...continuous.offsets])
  assert.deepEqual([...chunked.velocities], [...continuous.velocities])
  assert.equal(chunked.time, continuous.time)
})

test('seeking backwards replays from frame zero and matches a fresh simulation', () => {
  const headAt = (frame) => Math.sin(frame / 15) * .3
  const sought = createHairMotionState()
  advanceHairMotionToFrame(sought, settings, 500, headAt, .4)
  advanceHairMotionToFrame(sought, settings, 120, headAt, .4)
  const fresh = createHairMotionState()
  advanceHairMotionToFrame(fresh, settings, 120, headAt, .4)
  assert.deepEqual([...sought.offsets], [...fresh.offsets])
  assert.deepEqual([...sought.velocities], [...fresh.velocities])
  assert.equal(sought.time, fresh.time)
})

test('a malha mantém a raiz na posição original e usa as mesmas dimensões no preview e no export', () => {
  const state = createHairMotionState()
  simulate(state, 4)
  const positions = createHairMotionMeshPositions(state, settings, 100, 0)
  const staticPositions = createHairMotionMeshPositions(createHairMotionState(), { ...settings, enabled: false }, 100, 0)
  const imageWidth = 256, imageHeight = 320
  const outputWidth = Math.ceil(imageWidth * HAIR_MOTION_MESH_WIDTH)
  const outputHeight = Math.ceil(imageHeight * HAIR_MOTION_MESH_HEIGHT)
  const rootRowY = positions[1]
  assert.ok(Math.abs(rootRowY - (1 - (.15 / HAIR_MOTION_MESH_HEIGHT) * 2)) < 1e-6)
  for (let column = 0; column <= HAIR_MOTION_MESH_COLUMNS; column += 1) {
    const at = column * 2
    const outputX = (positions[at] + 1) * outputWidth / 2
    const sourceAlignedX = imageWidth * (column / HAIR_MOTION_MESH_COLUMNS + .4)
    assert.ok(Math.abs(outputX - sourceAlignedX) <= .5, `a raiz do cabelo deslocou ${Math.abs(outputX - sourceAlignedX)}px na coluna ${column}`)
  }
  const lastVertex = (HAIR_MOTION_MESH_ROWS * (HAIR_MOTION_MESH_COLUMNS + 1) + HAIR_MOTION_MESH_COLUMNS) * 2
  assert.ok(Math.abs(positions[lastVertex] - staticPositions[lastVertex]) > .001, 'os fios abaixo da raiz precisam continuar podendo balançar')
  for (let row = 0; row <= HAIR_MOTION_MESH_ROWS; row += 1) {
    for (let column = 0; column <= HAIR_MOTION_MESH_COLUMNS; column += 1) {
      const at = (row * (HAIR_MOTION_MESH_COLUMNS + 1) + column) * 2
      assert.ok(Number.isFinite(positions[at]) && Number.isFinite(positions[at + 1]))
    }
  }
  assert.equal(outputHeight, Math.ceil(imageHeight * 1.3))
})
