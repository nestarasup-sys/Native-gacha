import { describe, expect, it, vi } from 'vitest'
import type { CharacterRenderAssetProvider } from '../../src/shared/characterRenderAssets'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import { createEditorV6HairSourceBatch } from '../../src/renderer/src/features/editorV6/motion/hairSourceBatch'

function character(modelSlot: number, poseSlot: number | null, id = 'actor'): CustomizerCharacter {
  return { id, name: id, customization: { modelSlot, poseSlot } } as unknown as CustomizerCharacter
}
function provider() {
  const loadFabricatorSlot = vi.fn(async (slot: number) => ({ slot, parts: [], model: 'fresh' }))
  const loadFabricatorPose = vi.fn(async (model: number, pose: number) => ({ model, pose, parts: [] }))
  return { loadFabricatorSlot, loadFabricatorPose, api: { loadFabricatorSlot, loadFabricatorPose } as unknown as CharacterRenderAssetProvider }
}
describe('R25 first-export Fabricator model and pose source reuse', () => {
  it('shares concurrent source requests without sharing shaped character renderers', async () => {
    const { api, loadFabricatorSlot, loadFabricatorPose } = provider()
    const batch = createEditorV6HairSourceBatch(api)
    const [a, b, c] = await Promise.all([
      batch.sourceFor(character(2, 3, 'hero')),
      batch.sourceFor(character(2, 3, 'other')),
      batch.sourceFor(character(2, 4, 'hero'))
    ])
    expect(a.source).toBe(b.source)
    expect(a.artwork).toBe(b.artwork)
    expect(c.source).toBe(a.source)
    expect(c.artwork).not.toBe(a.artwork)
    expect(loadFabricatorSlot).toHaveBeenCalledTimes(1)
    expect(loadFabricatorPose).toHaveBeenCalledTimes(2)
    expect(batch.stats()).toMatchObject({ modelReads: 1, modelReuses: 2, poseReads: 2, poseReuses: 1 })
  })
  it('never requests a pose for base-model selection (null), and separates model slots', async () => {
    const { api, loadFabricatorSlot, loadFabricatorPose } = provider()
    const batch = createEditorV6HairSourceBatch(api)
    const [base, other] = await Promise.all([batch.sourceFor(character(1, null)), batch.sourceFor(character(2, null))])
    expect(base.artwork).toBe(base.source)
    expect(other.artwork).toBe(other.source)
    expect(base.source).not.toBe(other.source)
    expect(loadFabricatorPose).not.toHaveBeenCalled()
    expect(loadFabricatorSlot).toHaveBeenCalledTimes(2)
  })
  it('never persists across exports; a failed read is retried instead of retained', async () => {
    const { api, loadFabricatorSlot } = provider()
    loadFabricatorSlot.mockRejectedValueOnce(Error('temporarily unavailable'))
    const first = createEditorV6HairSourceBatch(api)
    await expect(first.sourceFor(character(2, null))).rejects.toThrow('temporarily unavailable')
    await expect(first.sourceFor(character(2, null))).resolves.toBeDefined()
    expect(loadFabricatorSlot).toHaveBeenCalledTimes(2)
    first.clear()
    const second = createEditorV6HairSourceBatch(api)
    await second.sourceFor(character(2, null))
    expect(loadFabricatorSlot).toHaveBeenCalledTimes(3)
  })
})
