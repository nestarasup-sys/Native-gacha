import { describe, expect, it } from 'vitest'
import {
  applyHairMotionLoopHeadImpulse, buildHairMotionLoop, createHairMotionState,
  hairMotionLoopOffsets, prewarmHairMotionState, advanceHairMotionToFrame,
  hairMotionPosteriorOnlyPreset, FIRST_HAIR_MOTION_PRESET,
  type HairMotionSettings
} from '../../src/shared/hairMotionEngine'
import { planEditorV6Export } from '../../src/shared/editorV6Export'

const settings: HairMotionSettings = {
  wind: -50, gust: 28, speed: 100, stiffness: 42,
  damping: 52, responsiveness: 55, anchor: 14, enabled: true
}
describe('V6 experimental numerical hair loop', () => {
  it('creates an export-only preset with rear hair enabled and front layers disabled', () => {
    const preset = structuredClone(FIRST_HAIR_MOTION_PRESET)
    const result = hairMotionPosteriorOnlyPreset(preset)
    expect(result.enabled).toEqual({ back: true, front: false, fringe: false })
    expect(result.physics).toEqual(preset.physics)
    expect(result.intensity).toEqual(preset.intensity)
    expect(preset.enabled).toEqual({ back: true, front: true, fringe: true })
  })
  it('requires preset and 90 or 120 frames without changing legacy options', () => {
    const base = { startFrame: 0, endFrame: 300, width: 1920, height: 1080, turbo: true, encoder: 'auto' as const }
    expect(planEditorV6Export(base, 300)).toHaveLength(2)
    expect(planEditorV6Export({ ...base, hairAnimationPresetSlot: 2, hairAnimationLoopFrames: 120 }, 300)).toHaveLength(2)
    expect(() => planEditorV6Export({ ...base, hairAnimationLoopFrames: 120 }, 300)).toThrow(/preset ativo/)
    expect(() => planEditorV6Export({ ...base, hairAnimationPresetSlot: 2, hairAnimationLoopFrames: 60 as 120 }, 300)).toThrow(/3 ou 4/)
    expect(() => buildHairMotionLoop(settings, 0, 60)).toThrow()
  })
  it.each([90, 120])('produces a deterministic %i-frame positional loop', frames => {
    const loop = buildHairMotionLoop(settings, 0.7, frames)
    const same = buildHairMotionLoop(settings, 0.7, frames)
    expect(loop.offsets).toHaveLength(frames)
    expect(Array.from(loop.offsets.at(-1)!)).toEqual(Array.from(loop.offsets[0]))
    expect(Array.from(hairMotionLoopOffsets(loop, 300))).toEqual(Array.from(loop.offsets[300 % frames]))
    expect(loop.offsets.every((v, f) => v.length === 9 && v.every((x, i) => Number.isFinite(x) && Math.abs(x) <= 0.45 && x === same.offsets[f][i]))).toBe(true)
    expect(new Set(loop.offsets.map(offset => offset[8].toFixed(7))).size).toBeGreaterThan(10)
  })
  it('keeps head reaction separate from the immutable loop samples', () => {
    const source = hairMotionLoopOffsets(buildHairMotionLoop(settings, 0.9, 120), 31)
    const before = Array.from(source)
    const frame = new Float32Array(source)
    applyHairMotionLoopHeadImpulse(frame, 0.3, settings)
    expect(Array.from(source)).toEqual(before)
    expect(frame[0]).toBe(source[0])
    expect(frame[8]).not.toBe(source[8])
    expect(frame.every(value => Number.isFinite(value) && Math.abs(value) <= 0.45)).toBe(true)
  })
  it('does not modify an existing continuous physics state', () => {
    const state = createHairMotionState()
    prewarmHairMotionState(state, settings, 0, 0.4)
    advanceHairMotionToFrame(state, settings, 120, () => 0, 0.4)
    const previous = Array.from(state.offsets)
    buildHairMotionLoop(settings, 0.4, 120)
    expect(Array.from(state.offsets)).toEqual(previous)
    expect(state.frame).toBe(120)
  })
})
