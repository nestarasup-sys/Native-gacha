import { describe, expect, it, vi } from 'vitest'
import type { CharacterRenderAssetProvider } from '../../src/shared/characterRenderAssets'
import { createPreparedFaceCatalogItemLoader, type PreparedFaceCatalogItemCache } from '../../src/renderer/src/characters/preparedFaceCatalogItems'

describe('createPreparedFaceCatalogItemLoader', () => {
  it('shares pending reads between paired renderers and retains the result locally', async () => {
    let resolveRead!: (value: null) => void
    const pendingRead = new Promise<null>(resolve => { resolveRead = resolve })
    const loadFaceCatalogItem = vi.fn(() => pendingRead)
    const sharedCache: PreparedFaceCatalogItemCache = new Map()
    const loadOriginal = createPreparedFaceCatalogItemLoader(2, { loadFaceCatalogItem } as unknown as CharacterRenderAssetProvider, sharedCache)
    const loadHairless = createPreparedFaceCatalogItemLoader(2, { loadFaceCatalogItem } as unknown as CharacterRenderAssetProvider, sharedCache)

    const originalRead = loadOriginal('eyes')
    const hairlessRead = loadHairless('eyes')
    expect(hairlessRead).toBe(originalRead)
    expect(loadFaceCatalogItem).toHaveBeenCalledOnce()

    resolveRead(null)
    await expect(originalRead).resolves.toBeNull()
    await expect(loadHairless('eyes')).resolves.toBeNull()
    expect(loadFaceCatalogItem).toHaveBeenCalledOnce()
  })

  it('isolates cache entries by model slot and retries a rejected read', async () => {
    const loadFaceCatalogItem = vi.fn(async (_modelSlot: number, _id: string) => null)
    loadFaceCatalogItem.mockRejectedValueOnce(new Error('temporary read failure')).mockResolvedValue(null)
    const sharedCache: PreparedFaceCatalogItemCache = new Map()
    const loadSlotOne = createPreparedFaceCatalogItemLoader(1, { loadFaceCatalogItem } as unknown as CharacterRenderAssetProvider, sharedCache)
    const loadSlotTwo = createPreparedFaceCatalogItemLoader(2, { loadFaceCatalogItem } as unknown as CharacterRenderAssetProvider, sharedCache)

    await expect(loadSlotOne('eyes')).rejects.toThrow('temporary read failure')
    await expect(loadSlotOne('eyes')).resolves.toBeNull()
    await expect(loadSlotTwo('eyes')).resolves.toBeNull()
    expect(loadFaceCatalogItem).toHaveBeenCalledTimes(3)
    expect(sharedCache.size).toBe(2)
  })
})
