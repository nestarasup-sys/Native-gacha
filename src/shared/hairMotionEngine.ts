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

/** Create an export-only preset that animates the rear hair layer alone. */
export function hairMotionPosteriorOnlyPreset(preset: HairMotionPreset): HairMotionPreset {
  return { ...preset, enabled: { ...preset.enabled, back: false, front: true, fringe: false } }
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
/** Two simulated seconds give the spring chain a stable export-only starting pose. */
export const HAIR_MOTION_PREWARM_STEPS = HAIR_MOTION_SIMULATION_HZ * 2

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

/**
 * Start an export at an already-moving, deterministic point in the breeze.
 * This is deliberately opt-in: Fabricator preview continues starting from its
 * ordinary live state, while an MP4 renderer can pre-roll without moving the
 * scene timeline or the character's head path.
 */
export function prewarmHairMotionState(
  state: HairMotionState,
  settings: HairMotionSettings,
  headXAtFrameZero: number,
  phase: number
): void {
  if (!Number.isFinite(headXAtFrameZero) || !Number.isFinite(phase)) throw Error('Inicialização da animação de cabelo inválida.')
  resetHairMotionState(state)
  state.previousHead = headXAtFrameZero
  if (settings.enabled) {
    const dt = 1 / HAIR_MOTION_SIMULATION_HZ
    for (let step = 0; step < HAIR_MOTION_PREWARM_STEPS; step += 1) {
      stepHairMotion(state, settings, dt, headXAtFrameZero, phase)
    }
  }
  state.previousHead = headXAtFrameZero
  // The warm-up is internal simulation time. The first exported image remains
  // absolute timeline frame zero and subsequent frames follow it continuously.
  state.frame = 0
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


/** Export-only sampled breeze; 90/120 small Float32 vectors rather than PNGs.
 * Not a cache across exports. Fixed-step spring is simulated once per piece.
 * The seam guarantees matching position; the derivative can still differ.
 */
export type HairMotionLoop = Readonly<{ cycleFrames: number; offsets: ReadonlyArray<Float32Array> }>

export function buildHairMotionLoop(settings: HairMotionSettings, phase: number, cycleFrames: number, segments = 8): HairMotionLoop {
  if (![90, 120].includes(cycleFrames) || !Number.isFinite(phase) || !Number.isSafeInteger(segments) || segments < 1 || segments > 128) {
    throw Error('Configuração do ciclo de cabelo inválida.')
  }
  const state = createHairMotionState(segments)
  prewarmHairMotionState(state, settings, 0, phase)
  const samples: Float32Array[] = [new Float32Array(state.offsets)]
  const dt = 1 / HAIR_MOTION_SIMULATION_HZ
  for (let frame = 1; frame < cycleFrames; frame += 1) {
    for (let step = 0; step < HAIR_MOTION_STEPS_PER_FRAME; step += 1) stepHairMotion(state, settings, dt, 0, phase)
    samples.push(new Float32Array(state.offsets))
  }
  // Blend the final 12 samples back into sample zero, without a positional jump.
  const fadeFrames = 12
  for (let frame = cycleFrames - fadeFrames; frame < cycleFrames; frame += 1) {
    const t = (frame - (cycleFrames - fadeFrames)) / (fadeFrames - 1)
    const blend = t * t * (3 - 2 * t)
    for (let index = 0; index < samples[frame].length; index += 1) {
      samples[frame][index] = Math.fround(samples[frame][index] * (1 - blend) + samples[0][index] * blend)
    }
  }
  return { cycleFrames, offsets: samples }
}

/** Absolute timeline index avoids restarting the loop at a Turbo seam. */
export function hairMotionLoopOffsets(loop: HairMotionLoop, frame: number): Float32Array {
  if (!Number.isSafeInteger(frame) || frame < 0) throw Error('Quadro do ciclo de cabelo inválido.')
  return loop.offsets[frame % loop.cycleFrames]
}

/** Small authored-head impulse; rig motion still comes from the pose pipeline. */
export function applyHairMotionLoopHeadImpulse(offsets: Float32Array, headDelta: number, settings: HairMotionSettings): void {
  if (!Number.isFinite(headDelta)) throw Error('Movimento da cabeça inválido.')
  if (!settings.enabled || headDelta === 0) return
  const impulse = Math.max(-0.05, Math.min(0.05, -headDelta * settings.responsiveness / 100 * 0.08))
  for (let i = 1; i < offsets.length; i += 1) {
    offsets[i] = Math.fround(Math.max(-0.45, Math.min(0.45, offsets[i] + impulse * (i / (offsets.length - 1)))))
  }
}


/** One slight damped swing after an authored pose transition ends.
 * Recomputed by absolute frame: no continuous breeze, no repeated loop,
 * no spring history and no worker seam desynchronization.
 */
export const HAIR_MOTION_POSE_REACTION_FRAMES = 30

export function hairMotionPoseReactionEndFrames(
  transitions: readonly { elementId: string; endFrame: number; fromElement: { poseSlot?: number | null }; toElement: { poseSlot?: number | null } }[]
): Map<string, number[]> {
  const events = new Map<string, Set<number>>()
  for (const transition of transitions) {
    if (transition.fromElement.poseSlot === transition.toElement.poseSlot) continue
    if (!Number.isSafeInteger(transition.endFrame) || transition.endFrame < 0) throw Error('Fim de transição de pose inválido.')
    const frames = events.get(transition.elementId) ?? new Set<number>()
    frames.add(transition.endFrame)
    events.set(transition.elementId, frames)
  }
  return new Map([...events].map(([id, frames]) => [id, [...frames].sort((a, b) => a - b)]))
}

export function hairMotionLatestPoseEnd(events: readonly number[], frame: number): number | null {
  if (!Number.isSafeInteger(frame) || frame < 0) throw Error('Quadro da reação de cabelo inválido.')
  let low = 0, high = events.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (events[middle] <= frame) low = middle + 1
    else high = middle
  }
  return low ? events[low - 1] : null
}

/** Is a rearHair one-shot reaction currently moving at this absolute frame?
 * A reaction occupies exactly frames end+1 through end+29. */
export function hairMotionPoseReactionIsActive(events: readonly number[], frame: number): boolean {
  const end = hairMotionLatestPoseEnd(events, frame)
  return end !== null && frame > end && frame < end + HAIR_MOTION_POSE_REACTION_FRAMES
}

/** Two opposing half-swings, returning exactly to unwarped rest.
 * Smooth envelope makes both endpoints approach zero without sudden jumps.
 */
export function sampleHairMotionPoseReaction(
  offsets: Float32Array,
  settings: HairMotionSettings,
  frame: number,
  transitionEnd: number | null,
  phase: number
): boolean {
  offsets.fill(0)
  if (!settings.enabled || transitionEnd === null || !Number.isFinite(phase)) return false
  const elapsed = frame - transitionEnd
  if (!Number.isSafeInteger(elapsed) || elapsed <= 0 || elapsed >= HAIR_MOTION_POSE_REACTION_FRAMES) return false
  const t = elapsed / HAIR_MOTION_POSE_REACTION_FRAMES
  const envelope = Math.sin(Math.PI * t) ** 2
  const swing = Math.sin(2 * Math.PI * t) * envelope
  const strength = (0.045 + settings.responsiveness / 100 * 0.035) * (0.85 + Math.abs(Math.sin(phase)) * 0.15)
  const direction = settings.wind < 0 ? -1 : 1
  for (let index = 1; index < offsets.length; index += 1) {
    const weight = index / (offsets.length - 1)
    offsets[index] = Math.fround(direction * strength * swing * weight)
  }
  return true
}

/** The texture remains pixel-identical while a piece is disabled, at rest,
 * or has zero intensity. Its padded source can be shared within one worker. */
export function hairMotionNeedsWarp(state: HairMotionState, settings: HairMotionSettings, intensity: number): boolean {
  return settings.enabled && intensity > 0 && state.time !== 0
}

export function hairMotionOffset(state: HairMotionState, vertical: number, anchor: number): number {
  const root = Math.max(0, Math.min(0.95, anchor / 100))
  const amount = Math.max(0, Math.min(1, (vertical - root) / (1 - root)))
  const position = amount * (state.offsets.length - 1)
  const index = Math.min(state.offsets.length - 2, Math.floor(position))
  const fraction = position - index
  return (state.offsets[index] * (1 - fraction) + state.offsets[index + 1] * fraction) * amount
}
