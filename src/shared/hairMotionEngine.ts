export type HairMotionSide = 'front' | 'back' | 'fringe'
export type HairMotionSettings = {
  wind: number
  gust: number
  stiffness: number
  damping: number
  responsiveness: number
  anchor: number
  speed: number
  enabled: boolean
}
export type HairMotionPreset = {
  physics: Omit<HairMotionSettings, 'enabled'>
  enabled: Record<HairMotionSide, boolean>
  intensity: Record<HairMotionSide, number>
}
export const HAIR_MOTION_PRESET_KEY = 'gacha-nymi:hair-animation-presets:v1'
export const FIRST_HAIR_MOTION_PRESET: HairMotionPreset = {
  physics: { wind: -50, gust: 28, speed: 100, stiffness: 42, damping: 52, responsiveness: 55, anchor: 14 },
  enabled: { back: true, front: true, fringe: true },
  intensity: { back: 100, front: 75, fringe: 40 }
}
export type HairMotionState = {
  offsets: Float32Array
  velocities: Float32Array
  previousHead: number
  time: number
  /** Absolute 30 FPS frame reached by deterministic playback; -1 means uninitialized. */
  frame: number
}

const presetLimits = { wind: [-100, 100], gust: [0, 100], speed: [25, 250], stiffness: [0, 100], damping: [0, 100], responsiveness: [0, 100], anchor: [0, 85] } as const
const motionSides: HairMotionSide[] = ['back', 'front', 'fringe']
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)) }

export function normalizeHairMotionPreset(value: unknown): HairMotionPreset | null {
  if (!isRecord(value) || !isRecord(value.physics) || !isRecord(value.enabled) || !isRecord(value.intensity)) return null
  const physics = {} as HairMotionPreset['physics']
  for (const key of Object.keys(presetLimits) as Array<keyof typeof presetLimits>) {
    const number = value.physics[key], [minimum, maximum] = presetLimits[key]
    if (typeof number !== 'number' || !Number.isFinite(number) || number < minimum || number > maximum) return null
    physics[key] = number
  }
  const enabled = {} as HairMotionPreset['enabled']
  const intensity = {} as HairMotionPreset['intensity']
  for (const side of motionSides) {
    const isEnabled = value.enabled[side], amount = value.intensity[side]
    if (typeof isEnabled !== 'boolean' || typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 150) return null
    enabled[side] = isEnabled
    intensity[side] = amount
  }
  return { physics, enabled, intensity }
}

export function parseHairMotionPresets(text: string | null): Array<HairMotionPreset | null> {
  if (text === null) return [structuredClone(FIRST_HAIR_MOTION_PRESET), null, null, null, null]
  let value: unknown
  try { value = JSON.parse(text) }
  catch { throw new Error('Os presets de cabelo salvos estão em formato inválido.') }
  if (!Array.isArray(value) || value.length !== 5) throw new Error('Os presets de cabelo salvos estão em formato inválido.')
  return value.map(item => {
    if (item === null) return null
    const preset = normalizeHairMotionPreset(item)
    if (!preset) throw new Error('Um preset de cabelo salvo está inválido.')
    return preset
  })
}

export const HAIR_MOTION_SIMULATION_HZ = 120
export const HAIR_MOTION_OUTPUT_FPS = 30
export const HAIR_MOTION_STEPS_PER_FRAME = HAIR_MOTION_SIMULATION_HZ / HAIR_MOTION_OUTPUT_FPS

export function createHairMotionState(segments = 8): HairMotionState {
  return { offsets: new Float32Array(segments + 1), velocities: new Float32Array(segments + 1), previousHead: 0, time: 0, frame: -1 }
}

export function resetHairMotionState(state: HairMotionState): void {
  state.offsets.fill(0)
  state.velocities.fill(0)
  state.previousHead = 0
  state.time = 0
  state.frame = -1
}

/** Stable fixed-step spring chain; the first point remains attached to the head. */
export function stepHairMotion(state: HairMotionState, settings: HairMotionSettings, dt: number, headX: number, phase: number): void {
  const step = Math.min(1 / 30, Math.max(0, dt * settings.speed / 100))
  if (!step) return
  if (!settings.enabled) {
    state.offsets.fill(0)
    state.velocities.fill(0)
    state.previousHead = headX
    return
  }
  const speed = Math.max(-4, Math.min(4, (headX - state.previousHead) / step))
  state.previousHead = headX
  state.time += step
  state.offsets[0] = 0
  state.velocities[0] = 0
  const stiffness = 12 + settings.stiffness * 0.72
  const damping = 2 + settings.damping * 0.16
  const breeze = settings.wind / 100 * 0.18
    + Math.sin(state.time * 2.1 + phase) * settings.gust / 100 * 0.08
    + Math.sin(state.time * 4.7 + phase * 2) * settings.gust / 100 * 0.025
  for (let index = 1; index < state.offsets.length; index += 1) {
    const weight = index / (state.offsets.length - 1)
    const target = state.offsets[index - 1] + breeze * weight * 0.17
    const acceleration = (target - state.offsets[index]) * stiffness - state.velocities[index] * damping
      - speed * settings.responsiveness / 100 * weight * 2
    state.velocities[index] = Math.max(-3, Math.min(3, state.velocities[index] + acceleration * step))
    state.offsets[index] = Math.max(-0.45, Math.min(0.45, state.offsets[index] + state.velocities[index] * step))
  }
}

/** Advance from frame zero, so seeking and Turbo chunk boundaries never change the result. */
export function advanceHairMotionToFrame(
  state: HairMotionState,
  settings: HairMotionSettings,
  targetFrame: number,
  headXAtFrame: (frame: number) => number,
  phase: number
): void {
  if (!Number.isSafeInteger(targetFrame) || targetFrame < 0) throw Error('Quadro da animação de cabelo inválido.')
  if (targetFrame < state.frame) resetHairMotionState(state)
  if (state.frame < 0) {
    state.previousHead = headXAtFrame(0)
    state.frame = 0
  }
  const dt = 1 / HAIR_MOTION_SIMULATION_HZ
  while (state.frame < targetFrame) {
    const fromFrame = state.frame
    const fromHead = headXAtFrame(fromFrame)
    const toHead = headXAtFrame(fromFrame + 1)
    for (let substep = 1; substep <= HAIR_MOTION_STEPS_PER_FRAME; substep += 1) {
      const progress = substep / HAIR_MOTION_STEPS_PER_FRAME
      stepHairMotion(state, settings, dt, fromHead + (toHead - fromHead) * progress, phase)
    }
    state.frame += 1
  }
}

export function hairMotionOffset(state: HairMotionState, vertical: number, anchor: number): number {
  const root = Math.max(0, Math.min(0.95, anchor / 100))
  const amount = Math.max(0, Math.min(1, (vertical - root) / (1 - root)))
  const position = amount * (state.offsets.length - 1)
  const index = Math.min(state.offsets.length - 2, Math.floor(position))
  const fraction = position - index
  return (state.offsets[index] * (1 - fraction) + state.offsets[index + 1] * fraction) * amount
}
