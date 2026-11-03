export type HairMotionSettings = { wind: number; gust: number; stiffness: number; damping: number; responsiveness: number; anchor: number; speed: number; enabled: boolean }
export type HairMotionState = { offsets: Float32Array; velocities: Float32Array; previousHead: number; time: number }

export function createHairMotionState(segments = 8): HairMotionState {
  return { offsets: new Float32Array(segments + 1), velocities: new Float32Array(segments + 1), previousHead: 0, time: 0 }
}

/** Stable fixed-step spring chain; the first point remains attached to the head. */
export function stepHairMotion(state: HairMotionState, settings: HairMotionSettings, dt: number, headX: number, phase: number): void {
  const step = Math.min(1 / 30, Math.max(0, dt * settings.speed / 100))
  if (!step) return
  if (!settings.enabled) { state.offsets.fill(0); state.velocities.fill(0); state.previousHead = headX; return }
  const speed = Math.max(-4, Math.min(4, (headX - state.previousHead) / step))
  state.previousHead = headX
  state.time += step
  state.offsets[0] = 0; state.velocities[0] = 0
  const stiffness = 12 + settings.stiffness * 0.72
  const damping = 2 + settings.damping * 0.16
  const breeze = settings.wind / 100 * 0.18 + Math.sin(state.time * 2.1 + phase) * settings.gust / 100 * 0.08 + Math.sin(state.time * 4.7 + phase * 2) * settings.gust / 100 * 0.025
  for (let i = 1; i < state.offsets.length; i += 1) {
    const weight = i / (state.offsets.length - 1)
    const target = state.offsets[i - 1] + breeze * weight * 0.17
    const acceleration = (target - state.offsets[i]) * stiffness - state.velocities[i] * damping - speed * settings.responsiveness / 100 * weight * 2
    state.velocities[i] = Math.max(-3, Math.min(3, state.velocities[i] + acceleration * step))
    state.offsets[i] = Math.max(-0.45, Math.min(0.45, state.offsets[i] + state.velocities[i] * step))
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
