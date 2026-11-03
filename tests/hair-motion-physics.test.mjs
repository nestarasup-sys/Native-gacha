import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceHairMotionToFrame, createHairMotionState, hairMotionOffset, prewarmHairMotionState, stepHairMotion } from '../src/shared/hairMotionEngine.ts'
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

test('vento positivo e negativo movem a cadeia em direções opostas sem trocar o preset', () => {
  const negative = createHairMotionState(), positive = createHairMotionState()
  const noGust = { ...settings, gust: 0 }
  simulate(negative, 2, 0, { ...noGust, wind: -50 })
  simulate(positive, 2, 0, { ...noGust, wind: 50 })
  assert.ok(negative.offsets.at(-1) < 0)
  assert.ok(positive.offsets.at(-1) > 0)
  for (let index = 1; index < negative.offsets.length; index += 1) assert.ok(Math.abs(negative.offsets[index] + positive.offsets[index]) < 1e-6)
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

test('a inicialização pré-aquecida é determinística, mantém a raiz fixa e começa em movimento', () => {
  const preset = { ...settings, wind: -50, gust: 28 }
  const first = createHairMotionState(), repeat = createHairMotionState()
  prewarmHairMotionState(first, preset, .42, .7)
  prewarmHairMotionState(repeat, preset, .42, .7)
  assert.equal(first.frame, 0)
  assert.ok(first.time > 0)
  assert.equal(first.offsets[0], 0)
  assert.equal(first.velocities[0], 0)
  assert.deepEqual([...first.offsets], [...repeat.offsets])
  assert.deepEqual([...first.velocities], [...repeat.velocities])
  assert.ok([...first.offsets.slice(1)].some(value => Math.abs(value) > .001), 'o primeiro quadro deve começar com o cabelo fora do repouso')
  const start = [...first.offsets]
  advanceHairMotionToFrame(first, preset, 1, () => .42, .7)
  assert.ok(Math.abs(first.offsets.at(-1) - start.at(-1)) < .02, 'o primeiro quadro após a inicialização não pode saltar')
  assert.equal(first.offsets[0], 0)
})

test('o pré-aquecimento distingue fases por instância sem aleatoriedade por quadro', () => {
  const preset = { ...settings, wind: -50, gust: 28 }
  const phaseA = .35, phaseB = 2.8
  const firstA = createHairMotionState(), firstB = createHairMotionState()
  prewarmHairMotionState(firstA, preset, 0, phaseA)
  prewarmHairMotionState(firstB, preset, 0, phaseB)
  assert.ok(firstA.offsets.some((value, index) => index > 0 && Math.abs(value - firstB.offsets[index]) > .002))
  const replayA = createHairMotionState()
  prewarmHairMotionState(replayA, preset, 0, phaseA)
  advanceHairMotionToFrame(replayA, preset, 30, () => 0, phaseA)
  const chunkedA = createHairMotionState()
  prewarmHairMotionState(chunkedA, preset, 0, phaseA)
  for (const frame of [8, 16, 30]) advanceHairMotionToFrame(chunkedA, preset, frame, () => 0, phaseA)
  assert.deepEqual([...chunkedA.offsets], [...replayA.offsets])
  assert.deepEqual([...chunkedA.velocities], [...replayA.velocities])
  const gustOnlyA = createHairMotionState(), gustOnlyB = createHairMotionState()
  prewarmHairMotionState(gustOnlyA, { ...preset, wind: 0 }, 0, phaseA)
  prewarmHairMotionState(gustOnlyB, { ...preset, wind: 0 }, 0, phaseB)
  assert.ok(gustOnlyA.offsets.some((value, index) => index > 0 && Math.abs(value - gustOnlyB.offsets[index]) > .002), 'rajadas sem vento médio também devem começar em fases distintas')
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
