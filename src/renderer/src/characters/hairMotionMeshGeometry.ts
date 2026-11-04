import { hairMotionOffset, type HairMotionSettings, type HairMotionState } from '../../../shared/hairMotionEngine'

export const HAIR_MOTION_MESH_COLUMNS = 24
export const HAIR_MOTION_MESH_ROWS = 32
export const HAIR_MOTION_MESH_WIDTH = 1.8
export const HAIR_MOTION_MESH_HEIGHT = 1.3

/** Fill an existing mesh position buffer without allocating one per render.
 * Vertical spring offsets are constant across a row of vertices, so compute
 * them once per row, rather than once for each of its 25 columns.
 */
export function fillHairMotionMeshPositions(
  positions: Float32Array,
  state: HairMotionState,
  settings: HairMotionSettings,
  intensity: number,
  phase: number,
  columns = HAIR_MOTION_MESH_COLUMNS,
  rows = HAIR_MOTION_MESH_ROWS
): Float32Array {
  if (!Number.isSafeInteger(columns) || columns < 1 || !Number.isSafeInteger(rows) || rows < 1
    || positions.length !== (columns + 1) * (rows + 1) * 2) throw Error('Dimensões inválidas da malha de cabelo.')
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows
    const offset = settings.enabled
      ? Math.max(-.35, Math.min(.35, hairMotionOffset(state, v, settings.anchor) * intensity / 100))
      : 0
    const y = 1 - ((v + .15 - Math.min(.06, Math.abs(offset) * .08)) / HAIR_MOTION_MESH_HEIGHT) * 2
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns, at = (row * (columns + 1) + column) * 2
      const flutter = settings.enabled
        ? Math.sin(v * 5 + u * 3 + state.time * 3 + phase) * settings.gust / 100 * .015 * Math.abs(offset) * 4
        : 0
      positions[at] = ((u + .4 + offset + flutter) / HAIR_MOTION_MESH_WIDTH) * 2 - 1
      positions[at + 1] = y
    }
  }
  return positions
}

/** Vertex data shared by the Fabricator preview and export-only renderer. */
export function createHairMotionMeshPositions(
  state: HairMotionState,
  settings: HairMotionSettings,
  intensity: number,
  phase: number,
  columns = HAIR_MOTION_MESH_COLUMNS,
  rows = HAIR_MOTION_MESH_ROWS
): Float32Array {
  return fillHairMotionMeshPositions(
    new Float32Array((columns + 1) * (rows + 1) * 2),
    state, settings, intensity, phase, columns, rows
  )
}
