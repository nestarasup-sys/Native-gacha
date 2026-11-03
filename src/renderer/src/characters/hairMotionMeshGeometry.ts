import { hairMotionOffset, type HairMotionSettings, type HairMotionState } from '../../../shared/hairMotionEngine'

export const HAIR_MOTION_MESH_COLUMNS = 24
export const HAIR_MOTION_MESH_ROWS = 32
export const HAIR_MOTION_MESH_WIDTH = 1.8
export const HAIR_MOTION_MESH_HEIGHT = 1.3

/** Vertex data shared by the Fabricator preview and the export-only renderer. */
export function createHairMotionMeshPositions(
  state: HairMotionState,
  settings: HairMotionSettings,
  intensity: number,
  phase: number,
  columns = HAIR_MOTION_MESH_COLUMNS,
  rows = HAIR_MOTION_MESH_ROWS
): Float32Array {
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
