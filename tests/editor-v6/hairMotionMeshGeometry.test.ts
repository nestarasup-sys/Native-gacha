import { describe, expect, it } from 'vitest'
import { createHairMotionState, FIRST_HAIR_MOTION_PRESET, hairMotionOffset, type HairMotionSettings, type HairMotionState } from '../../src/shared/hairMotionEngine'
import {
  createHairMotionMeshPositions, fillHairMotionMeshPositions,
  HAIR_MOTION_MESH_WIDTH, HAIR_MOTION_MESH_HEIGHT
} from '../../src/renderer/src/characters/hairMotionMeshGeometry'

/** Original per-vertex formula preserved here as a pixel-geometry golden.
 * Compare every Float32 entry, not only approximate geometry.
 */
function originalMesh(state: HairMotionState, settings: HairMotionSettings, intensity: number, phase: number, columns: number, rows: number): Float32Array {
  const positions = new Float32Array((columns + 1) * (rows + 1) * 2)
  for (let row = 0; row <= rows; row += 1) for (let column = 0; column <= columns; column += 1) {
    const u = column / columns, v = row / rows, at = (row * (columns + 1) + column) * 2
    const offset = settings.enabled
      ? Math.max(-.35, Math.min(.35, hairMotionOffset(state, v, settings.anchor) * intensity / 100))
      : 0
    const flutter = settings.enabled
      ? Math.sin(v * 5 + u * 3 + state.time * 3 + phase) * settings.gust / 100 * .015 * Math.abs(offset) * 4
      : 0
    positions[at] = ((u + .4 + offset + flutter) / HAIR_MOTION_MESH_WIDTH) * 2 - 1
    positions[at + 1] = 1 - ((v + .15 - Math.min(.06, Math.abs(offset) * .08)) / HAIR_MOTION_MESH_HEIGHT) * 2
  }
  return positions
}

describe('hair mesh: faster row computation without geometry changes', () => {
  const state = createHairMotionState()
  for (let i = 0; i < state.offsets.length; i++) {
    state.offsets[i] = Math.sin(i * 1.7) * .27
    state.velocities[i] = Math.cos(i * 1.2) * .12
  }
  state.time = 3.141592653589793

  it('matches all old Float32 vertices exactly for hair enabled/disabled and diverse meshes', () => {
    for (const enabled of [true, false]) for (const intensity of [0, 17, 75, 100, 150]) {
      for (const phase of [-4.1, 0, 1.2, 7.7]) for (const [columns, rows] of [[24, 32], [5, 7], [1, 1]]) {
        const settings: HairMotionSettings = { ...FIRST_HAIR_MOTION_PRESET.physics, enabled }
        const expected = originalMesh(state, settings, intensity, phase, columns, rows)
        const actual = createHairMotionMeshPositions(state, settings, intensity, phase, columns, rows)
        expect(actual).toEqual(expected)
        const reusable = new Float32Array(actual.length).fill(88)
        expect(fillHairMotionMeshPositions(reusable, state, settings, intensity, phase, columns, rows)).toBe(reusable)
        expect(reusable).toEqual(expected)
      }
    }
  })

  it('reuses a single destination for subsequent frames without leaving stale vertices', () => {
    const settings: HairMotionSettings = { ...FIRST_HAIR_MOTION_PRESET.physics, enabled: true }
    const reusable = new Float32Array((24 + 1) * (32 + 1) * 2)
    for (const frame of [0, 1, 2, 3, 4, 5, 30, 300]) {
      state.time = frame / 30
      const expected = originalMesh(state, settings, 100, frame * .13, 24, 32)
      expect(fillHairMotionMeshPositions(reusable, state, settings, 100, frame * .13)).toBe(reusable)
      expect(reusable).toEqual(expected)
    }
  })

  it('rejects mismatched backing arrays rather than writing a partial mesh', () => {
    const settings: HairMotionSettings = { ...FIRST_HAIR_MOTION_PRESET.physics, enabled: true }
    expect(() => fillHairMotionMeshPositions(new Float32Array(7), state, settings, 100, 0)).toThrow('Dimensões inválidas')
    expect(() => fillHairMotionMeshPositions(new Float32Array(4), state, settings, 100, 0, 0, 1)).toThrow('Dimensões inválidas')
  })
})
