import type { HairMotionPreset, HairMotionSide } from './hairMotionEngine'

/** Shared editor / Fabricator authoring parameters: identical names, bounds and sides. */
export const HAIR_MOTION_PHYSICS_CONTROLS = [
  { key: 'wind', label: 'Vento', min: -100, max: 100 },
  { key: 'gust', label: 'Rajadas', min: 0, max: 100 },
  { key: 'speed', label: 'Velocidade', min: 25, max: 250 },
  { key: 'stiffness', label: 'Rigidez', min: 0, max: 100 },
  { key: 'damping', label: 'Amortecimento', min: 0, max: 100 },
  { key: 'responsiveness', label: 'Reação à cabeça', min: 0, max: 100 },
  { key: 'anchor', label: 'Raiz fixa', min: 0, max: 85 }
] as const satisfies ReadonlyArray<{ key: keyof HairMotionPreset['physics']; label: string; min: number; max: number }>

export const HAIR_MOTION_LAYER_CONTROLS = [
  { id: 'back', label: 'Traseiro' },
  { id: 'front', label: 'Posterior' },
  { id: 'fringe', label: 'Franja' }
] as const satisfies ReadonlyArray<{ id: HairMotionSide; label: string }>
