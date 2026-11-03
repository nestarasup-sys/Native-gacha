import type { HairSide } from '../hairWorkspaceModel'
import type { HairMotionSettings } from './hairMotionPhysics'

export type HairMotionPreset = { physics: Omit<HairMotionSettings, 'enabled'>; enabled: Record<HairSide, boolean>; intensity: Record<HairSide, number> }
export const HAIR_MOTION_PRESET_KEY = 'gacha-nymi:hair-animation-presets:v1'
export const FIRST_HAIR_MOTION_PRESET: HairMotionPreset = {
  physics: { wind: -50, gust: 28, speed: 100, stiffness: 42, damping: 52, responsiveness: 55, anchor: 14 },
  enabled: { back: true, front: true, fringe: true }, intensity: { back: 100, front: 75, fringe: 40 }
}

const limits = { wind: [-100, 100], gust: [0, 100], speed: [25, 250], stiffness: [0, 100], damping: [0, 100], responsiveness: [0, 100], anchor: [0, 85] } as const
const sides: HairSide[] = ['back', 'front', 'fringe']
function record(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)) }

export function normalizeHairMotionPreset(value: unknown): HairMotionPreset | null {
  if (!record(value) || !record(value.physics) || !record(value.enabled) || !record(value.intensity)) return null
  const physics = {} as HairMotionPreset['physics']
  for (const key of Object.keys(limits) as Array<keyof typeof limits>) {
    const n = value.physics[key], [min, max] = limits[key]
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) return null
    physics[key] = n
  }
  const enabled = {} as HairMotionPreset['enabled'], intensity = {} as HairMotionPreset['intensity']
  for (const side of sides) {
    const flag = value.enabled[side], amount = value.intensity[side]
    if (typeof flag !== 'boolean' || typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 150) return null
    enabled[side] = flag; intensity[side] = amount
  }
  return { physics, enabled, intensity }
}

export function parseHairMotionPresets(text: string | null): Array<HairMotionPreset | null> {
  if (text === null) return [structuredClone(FIRST_HAIR_MOTION_PRESET), null, null, null, null]
  const value: unknown = JSON.parse(text)
  if (!Array.isArray(value) || value.length !== 5) throw new Error('Os presets de cabelo salvos estão em formato inválido.')
  return value.map((item) => {
    if (item === null) return null
    const preset = normalizeHairMotionPreset(item)
    if (!preset) throw new Error('Um preset de cabelo salvo está inválido.')
    return preset
  })
}
