import { describe, expect, it, vi } from 'vitest'
import { createEditorV6HairBakeBatch, editorV6HairBakeContentKey, selectEditorV6HairlessTransitionBakes } from '../../src/renderer/src/features/editorV6/motion/hairBakeBatch'

const key = (other: Partial<Parameters<typeof editorV6HairBakeContentKey>[0]> = {}) => editorV6HairBakeContentKey({
  planKey: 'pose-a-b', characterId: 'actor-1', characterRevision: 'saved-v1',
  source: { modelSlot: 1, hairAppearance: { parts: [1, 2] } },
  fromCrop: { left: 4, top: 6, width: 300, height: 500 },
  toCrop: { left: 8, top: 9, width: 300, height: 480 },
  fromDimensions: [512, 720], toDimensions: [512, 720],
  mouthScaleSamples: [1, 1.05], ...other
})

describe('Editor V6 first-export transition bake deduplication', () => {
  it('coalesces identical simultaneous and completed bakes only in the same batch', async () => {
    const batch = createEditorV6HairBakeBatch<{ rgba: string }>()
    let finish!: (value: { rgba: string }) => void
    const bake = vi.fn(() => new Promise<{ rgba: string }>(resolve => { finish = resolve }))
    const first = batch.run(key(), bake)
    const second = batch.run(key(), bake)
    expect(first).toBe(second)
    await Promise.resolve()
    expect(bake).toHaveBeenCalledTimes(1)
    finish({ rgba: 'identical' })
    expect(await second).toEqual({ rgba: 'identical' })
    expect(await batch.run(key(), bake)).toEqual({ rgba: 'identical' })
    expect(batch.metrics()).toEqual({ realBakes: 1, reusedBakes: 2 })
    batch.clear()
    await batch.run(key(), async () => ({ rgba: 'fresh' }))
    expect(batch.metrics().realBakes).toBe(2)
    const nextExport = createEditorV6HairBakeBatch()
    const other = vi.fn(async () => 'new export')
    expect(await nextExport.run(key(), other)).toBe('new export')
    expect(other).toHaveBeenCalledTimes(1)
  })

  it('never reuses when plan, character, prepared rigs or absolute mouth samples differ', async () => {
    const all = [
      key(), key({ planKey: 'different' }), key({ characterId: 'another' }),
      key({ characterRevision: 'saved-v2' }), key({ fromCrop: { left: 5, top: 6, width: 300, height: 500 } }),
      key({ toDimensions: [500, 720] }), key({ mouthScaleSamples: [1, 1.10] }),
      key({ source: { modelSlot: 2, hairAppearance: { parts: [1, 2] } } }),
      key({ mouthScaleSamples: undefined })
    ]
    expect(new Set(all).size).toBe(all.length)
    const batch = createEditorV6HairBakeBatch<number>()
    const bake = vi.fn(async () => 42)
    await Promise.all(all.map(item => batch.run(item, bake)))
    expect(bake).toHaveBeenCalledTimes(all.length)
  })

  it('does not turn a failed bake into a successful result', async () => {
    const batch = createEditorV6HairBakeBatch<number>()
    await expect(batch.run(key(), async () => { throw Error('original bake failed') })).rejects.toThrow('original bake failed')
    await expect(batch.run(key(), async () => 123)).rejects.toThrow('original bake failed')
    batch.clear()
    expect(await batch.run(key(), async () => 123)).toBe(123)
  })
})


describe('Round 22: hairless transition atlas selection', () => {
  const plans = [
    { id: 'before', startFrame: 0, endFrame: 20 },
    { id: 'first-pose', startFrame: 24, endFrame: 30 },
    { id: 'second-pose', startFrame: 56, endFrame: 60 },
    { id: 'after', startFrame: 90, endFrame: 100 }
  ]
  it('preserves the exact original selection for continuous and 3/4-second loops', () => {
    const options = { startFrame: 20, endFrame: 90 }
    expect(selectEditorV6HairlessTransitionBakes(plans, options).map(p => p.id))
      .toEqual(['first-pose', 'second-pose'])
    expect(selectEditorV6HairlessTransitionBakes(plans, { ...options, hairPoseReactionOnly: false }).map(p => p.id))
      .toEqual(['first-pose', 'second-pose'])
  })
  it('eliminates only the second hairless atlas in one-shot mode', () => {
    expect(selectEditorV6HairlessTransitionBakes(plans, { startFrame: 20, endFrame: 90, hairPoseReactionOnly: true })).toEqual([])
    // Does not alter the original plan list or any on-disk motion atlas.
    expect(plans.map(p => p.id)).toEqual(['before', 'first-pose', 'second-pose', 'after'])
  })
  it('matches strict half-open export bounds without baking adjacent transitions', () => {
    expect(selectEditorV6HairlessTransitionBakes(plans, { startFrame: 30, endFrame: 60 }).map(p => p.id))
      .toEqual(['second-pose'])
    expect(selectEditorV6HairlessTransitionBakes(plans, { startFrame: 60, endFrame: 90 })).toEqual([])
  })
  it('omits face-only atlases while preserving pose bakes inside the requested range', () => {
    const mixed = [
      { id: 'expression', startFrame: 24, endFrame: 30, changesHair: false },
      { id: 'pose', startFrame: 56, endFrame: 60, changesHair: true }
    ]
    expect(selectEditorV6HairlessTransitionBakes(mixed, { startFrame: 20, endFrame: 90 }, plan => plan.changesHair).map(plan => plan.id))
      .toEqual(['pose'])
  })
})
