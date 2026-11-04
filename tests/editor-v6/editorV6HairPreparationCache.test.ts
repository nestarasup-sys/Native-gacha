import { describe, expect, it, vi } from 'vitest'
import { FIRST_HAIR_MOTION_PRESET, type HairMotionPreset } from '../../src/shared/hairMotionEngine'
import type { EditorV6Document } from '../../src/shared/editorV6'
import type { EditorV6ExportOptions } from '../../src/shared/editorV6Export'
import type { EditorV6HairMotionBundle } from '../../src/shared/editorV6HairMotion'
import { createEditorV6HairPreparationCache } from '../../src/renderer/src/features/editorV6/editorV6HairPreparationCache'

const options: EditorV6ExportOptions = { startFrame: 0, endFrame: 300, width: 1920, height: 1080, turbo: true, encoder: 'auto', mouthLoop: true, mouthLoopCycleFrames: 30 }
const project = (updatedAt = 'revision-1') => ({ id: 'project', updatedAt, timeline: { durationFrames: 300 }, assets: [], elements: [] }) as unknown as EditorV6Document
const bundle = (): EditorV6HairMotionBundle => ({ presetSlot: 2, preset: FIRST_HAIR_MOTION_PRESET, surfaces: [{ id: 's', dataUrl: 'data:image/png;base64,AQ==' }], textures: [], rigs: [], motionTransitions: [] })

describe('Editor V6 bounded export-hair re-use', () => {
  it('skips the entire second preparation only for the same source snapshot, preset and frame range', async () => {
    const cache = createEditorV6HairPreparationCache()
    const current = project(), preset = structuredClone(FIRST_HAIR_MOTION_PRESET)
    const build = vi.fn(async () => bundle())
    const first = await cache.prepare(current, 2, preset, options, build)
    expect(await cache.prepare(current, 2, structuredClone(preset), options, build)).toBe(first)
    expect(build).toHaveBeenCalledTimes(1)
    // Encoder and output resolution do not affect hair bundle geometry.
    expect(await cache.prepare(current, 2, preset, { ...options, encoder: 'cpu', width: 1280, height: 720, turbo: false }, build)).toBe(first)
    expect(build).toHaveBeenCalledTimes(1)
    await cache.prepare(current, 2, preset, { ...options, startFrame: 30 }, build)
    await cache.prepare(current, 2, preset, { ...options, mouthLoopCycleFrames: 60 }, build)
    await cache.prepare(current, 3, preset, options, build)
    await cache.prepare(current, 2, { ...preset, physics: { ...preset.physics, wind: 35 } }, options, build)
    expect(build).toHaveBeenCalledTimes(5)
  })

  it('invalidates on project identity, immutable edits, revision or explicit source updates', async () => {
    const cache = createEditorV6HairPreparationCache()
    const current = project()
    const build = vi.fn(async () => bundle())
    await cache.prepare(current, 2, FIRST_HAIR_MOTION_PRESET, options, build)
    await cache.prepare({ ...current, updatedAt: 'revision-1' }, 2, FIRST_HAIR_MOTION_PRESET, options, build)
    await cache.prepare(current, 2, FIRST_HAIR_MOTION_PRESET, options, build)
    current.updatedAt = 'revision-2'
    await cache.prepare(current, 2, FIRST_HAIR_MOTION_PRESET, options, build)
    cache.invalidate()
    await cache.prepare(current, 2, FIRST_HAIR_MOTION_PRESET, options, build)
    expect(build).toHaveBeenCalledTimes(5)
  })

  it('does not retain oversized bundles, failures or results invalidated while awaiting bake', async () => {
    const cache = createEditorV6HairPreparationCache(10)
    const current = project()
    const build = vi.fn(async () => bundle())
    await cache.prepare(current, 2, FIRST_HAIR_MOTION_PRESET, options, build)
    await cache.prepare(current, 2, FIRST_HAIR_MOTION_PRESET, options, build)
    expect(build).toHaveBeenCalledTimes(2)
    const cache2 = createEditorV6HairPreparationCache()
    let finish!: (value: EditorV6HairMotionBundle) => void
    const pending = cache2.prepare(current, 2, FIRST_HAIR_MOTION_PRESET, options, () => new Promise(resolve => { finish = resolve }))
    cache2.invalidate()
    finish(bundle())
    await pending
    const fresh = vi.fn(async () => bundle())
    await cache2.prepare(current, 2, FIRST_HAIR_MOTION_PRESET, options, fresh)
    await cache2.prepare(current, 2, FIRST_HAIR_MOTION_PRESET, options, fresh)
    expect(fresh).toHaveBeenCalledTimes(1)
    const cache3 = createEditorV6HairPreparationCache()
    await expect(cache3.prepare(current, 2, FIRST_HAIR_MOTION_PRESET, options, () => Promise.reject(Error('bake failed')))).rejects.toThrow('bake failed')
    expect(await cache3.prepare(current, 2, FIRST_HAIR_MOTION_PRESET, options, () => Promise.resolve(bundle()))).toBeDefined()
  })

  it('reuses the exact bundle object without changing RGBA, assets or physics state', async () => {
    const cache = createEditorV6HairPreparationCache()
    const current = project(), prepared = bundle()
    const first = await cache.prepare(current, 2, FIRST_HAIR_MOTION_PRESET, options, async () => prepared)
    const reused = await cache.prepare(current, 2, FIRST_HAIR_MOTION_PRESET, options, async () => { throw Error('unexpected bake') })
    expect(reused).toBe(first)
    expect(reused.surfaces[0].dataUrl).toBe(prepared.surfaces[0].dataUrl)
    expect(reused.preset).toBe(FIRST_HAIR_MOTION_PRESET)
  })
})
