import { describe, expect, it, vi } from 'vitest'
import type { CharacterRenderAssetProvider } from '../../src/shared/characterRenderAssets'
import type { CustomizerCharacter } from '../../src/shared/customizer'
import type { WardrobeSet } from '../../src/shared/fabricator'
import type { HairAppearanceLayerLoader } from '../../src/renderer/src/characters/characterLayerRenderer'
import { loadPreparedCharacterMaterials, type GachaReusableMaterialCache } from '../../src/renderer/src/characters/preparedCharacterMaterials'

const character = (hairAppearance: unknown, wardrobeSet = 'shirt') => ({
  id: 'actor-1', updatedAt: 'source-r22',
  customization: {
    hairAppearance,
    wardrobeGroups: [{ modelSlot: 2, setId: wardrobeSet }]
  }
} as unknown as CustomizerCharacter)

describe('R22 bounded wardrobe material reuse for normal and hairless poses', () => {
  const loader = vi.fn(async () => []) as unknown as HairAppearanceLayerLoader
  const provider = () => {
    const loadWardrobeSet = vi.fn(async (_slot: number, id: string) =>
      ({ id } as WardrobeSet))
    return { source: { loadWardrobeSet } as unknown as CharacterRenderAssetProvider, loadWardrobeSet }
  }

  it('fetches wardrobe once for concurrent normal/hairless renders in one export', async () => {
    const { source, loadWardrobeSet } = provider()
    const cache: GachaReusableMaterialCache = new Map()
    const original = character({ modelSlot: 2, parts: { rearHair: 'posterior' } })
    const hairless = character(undefined)
    const [normal, noHair] = await Promise.all([
      loadPreparedCharacterMaterials(original, 2, source, loader, cache),
      loadPreparedCharacterMaterials(hairless, 2, source, loader, cache)
    ])
    expect(loadWardrobeSet).toHaveBeenCalledTimes(1)
    expect(normal.wardrobeDetails).toBe(noHair.wardrobeDetails)
    expect(normal.wardrobeDetails['2:shirt']).toEqual({ id: 'shirt' })
    expect(cache.size).toBeLessThanOrEqual(6)
    cache.clear()
  })

  it('separates changed clothes and new exports instead of keeping cross-export cache', async () => {
    const { source, loadWardrobeSet } = provider()
    const normal = character({ modelSlot: 2, parts: { rearHair: 'posterior' } })
    const changed = character({ modelSlot: 2, parts: { rearHair: 'posterior' } }, 'jacket')
    await loadPreparedCharacterMaterials(normal, 2, source, loader, new Map())
    await loadPreparedCharacterMaterials(normal, 2, source, loader, new Map())
    const cache = new Map()
    await Promise.all([
      loadPreparedCharacterMaterials(normal, 2, source, loader, cache),
      loadPreparedCharacterMaterials(changed, 2, source, loader, cache)
    ])
    expect(loadWardrobeSet).toHaveBeenCalledTimes(4)
    expect(loadWardrobeSet.mock.calls.map((call) => call[1])).toEqual(['shirt', 'shirt', 'shirt', 'jacket'])
  })

  it('does not cache missing wardrobe data or silently change source assets', async () => {
    const loadWardrobeSet = vi.fn(async () => null)
    const source = { loadWardrobeSet } as unknown as CharacterRenderAssetProvider
    const cache: GachaReusableMaterialCache = new Map()
    const c = character(undefined)
    await expect(loadPreparedCharacterMaterials(c, 2, source, loader, cache)).rejects.toThrow('indisponível')
    expect(cache.size).toBe(0)
    await expect(loadPreparedCharacterMaterials(c, 2, source, loader, cache)).rejects.toThrow('indisponível')
    expect(loadWardrobeSet).toHaveBeenCalledTimes(2)
  })
})
