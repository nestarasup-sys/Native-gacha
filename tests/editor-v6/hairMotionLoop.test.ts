import { describe, expect, it } from 'vitest'
import {
  applyHairMotionLoopHeadImpulse, buildHairMotionLoop, createHairMotionState,
  hairMotionLoopOffsets, prewarmHairMotionState, advanceHairMotionToFrame,
  hairMotionPosteriorOnlyPreset, FIRST_HAIR_MOTION_PRESET,
  hairMotionLatestPoseEnd, hairMotionPoseReactionEndFrames, sampleHairMotionPoseReaction, HAIR_MOTION_POSE_REACTION_FRAMES,
  type HairMotionSettings
} from '../../src/shared/hairMotionEngine'
import { planEditorV6Export } from '../../src/shared/editorV6Export'

const settings: HairMotionSettings = {
  wind: -50, gust: 28, speed: 100, stiffness: 42,
  damping: 52, responsiveness: 55, anchor: 14, enabled: true
}
describe('V6 experimental numerical hair loop', () => {

  it('triggers only after changing pose, not after expression-only transitions', () => {
    const events = hairMotionPoseReactionEndFrames([
      { elementId: 'actor', endFrame: 29, fromElement: { poseSlot: 1 }, toElement: { poseSlot: 2 } },
      { elementId: 'actor', endFrame: 61, fromElement: { poseSlot: 2 }, toElement: { poseSlot: 2 } },
      { elementId: 'actor', endFrame: 90, fromElement: { poseSlot: 2 }, toElement: { poseSlot: 3 } },
      { elementId: 'other', endFrame: 18, fromElement: { poseSlot: 1 }, toElement: { poseSlot: 2 } }
    ])
    expect(events.get('actor')).toEqual([29, 90])
    expect(events.get('other')).toEqual([18])
    expect(hairMotionLatestPoseEnd(events.get('actor')!, 28)).toBeNull()
    expect(hairMotionLatestPoseEnd(events.get('actor')!, 61)).toBe(29)
    expect(hairMotionLatestPoseEnd(events.get('actor')!, 92)).toBe(90)
  })
  it('swings once after the pose and then rests in the exact original position', () => {
    const offsets = new Float32Array(9)
    const tip: number[] = []
    const end = 29
    for (let frame = 0; frame < 200; frame++) {
      const moving = sampleHairMotionPoseReaction(offsets, settings, frame, frame >= end ? end : null, 0.4)
      tip.push(offsets[8])
      if (frame <= end || frame >= end + HAIR_MOTION_POSE_REACTION_FRAMES) {
        expect(moving).toBe(false)
        expect([...offsets]).toEqual(Array(9).fill(0))
      }
    }
    expect(tip.some(x => x > 0)).toBe(true)
    expect(tip.some(x => x < 0)).toBe(true)
    expect(tip[0]).toBe(0)
    expect(tip[150]).toBe(0)
  })
  it('is independent of Turbo chunk boundaries and cannot combine with continuous loop', () => {
    const events = [29, 149]
    const a = new Float32Array(9), b = new Float32Array(9)
    for (const frame of [0, 29, 30, 40, 45, 58, 59, 60, 120, 149, 151, 165, 180, 299]) {
      const end = hairMotionLatestPoseEnd(events, frame)
      sampleHairMotionPoseReaction(a, settings, frame, end, 1)
      sampleHairMotionPoseReaction(b, settings, frame, end, 1)
      expect([...a]).toEqual([...b])
      if (frame === 120 || frame === 299) expect([...a]).toEqual(Array(9).fill(0))
    }
    const options = { startFrame: 0, endFrame: 300, width: 1920, height: 1080, turbo: true, encoder: 'auto' as const, hairAnimationPresetSlot: 2 }
    expect(planEditorV6Export({ ...options, hairPoseReactionOnly: true, hairPosteriorOnly: true }, 300)).toHaveLength(2)
    expect(() => planEditorV6Export({ ...options, hairAnimationLoopFrames: 120, hairPoseReactionOnly: true, hairPosteriorOnly: true }, 300)).toThrow(/não pode usar loop/)
    expect(() => planEditorV6Export({ ...options, hairPoseReactionOnly: 'yes' as unknown as boolean }, 300)).toThrow(/reação/)
  })


  it('validates all three independent hair controls and rejects contradictory combinations', () => {
    const base = { startFrame: 0, endFrame: 300, width: 1920, height: 1080, turbo: true, encoder: 'auto' as const, hairAnimationPresetSlot: 2 }
    for (const controls of [
      {}, { hairPosteriorOnly: true }, { hairAnimationLoopFrames: 90 as const },
      { hairAnimationLoopFrames: 120 as const, hairPosteriorOnly: true },
      { hairPosteriorOnly: true, hairPoseReactionOnly: true }
    ]) expect(() => planEditorV6Export({ ...base, ...controls }, 300)).not.toThrow()
    expect(() => planEditorV6Export({ ...base, hairPoseReactionOnly: true }, 300)).toThrow(/seleção exclusiva/)
    expect(() => planEditorV6Export({ ...base, hairPosteriorOnly: true, hairAnimationPresetSlot: undefined }, 300)).toThrow(/preset ativo/)
    expect(() => planEditorV6Export({ ...base, hairPosteriorOnly: 'true' as unknown as boolean }, 300)).toThrow(/posterior inválida/)
  })

  it('creates an export-only preset with rear hair enabled and front layers disabled', () => {
    const preset = structuredClone(FIRST_HAIR_MOTION_PRESET)
    const result = hairMotionPosteriorOnlyPreset(preset)
    expect(result.enabled).toEqual({ back: false, front: true, fringe: false })
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
