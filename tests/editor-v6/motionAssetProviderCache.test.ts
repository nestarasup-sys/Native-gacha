import { describe, expect, it, vi } from 'vitest'
import type { CharacterRenderAssetProvider } from '../../src/shared/characterRenderAssets'
import { cacheEditorV6MotionAssetProvider } from '../../src/renderer/src/features/editorV6/motion/motionAssetProviderCache'

function provider(loadFabricatorSlot: (...args: unknown[]) => Promise<unknown>) {
  return { loadFabricatorSlot } as unknown as CharacterRenderAssetProvider
}

describe('cacheEditorV6MotionAssetProvider', () => {
  it('shares a pending read by method and arguments', async () => {
    let resolve!: (value: string) => void
    const read = vi.fn(() => new Promise<string>(done => { resolve = done }))
    const cached = cacheEditorV6MotionAssetProvider(provider(read))

    const first = cached.loadFabricatorSlot(3)
    const concurrent = cached.loadFabricatorSlot(3)
    expect(read).toHaveBeenCalledTimes(1)
    resolve('model')
    await expect(first).resolves.toBe('model')
    await expect(concurrent).resolves.toBe('model')
  })

  it('evicts rejected promises so a failed read can be retried', async () => {
    const read = vi.fn().mockRejectedValueOnce(Error('temporary')).mockResolvedValueOnce('recovered')
    const cached = cacheEditorV6MotionAssetProvider(provider(read))

    await expect(cached.loadFabricatorSlot(1)).rejects.toThrow('temporary')
    await expect(cached.loadFabricatorSlot(1)).resolves.toBe('recovered')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('uses LRU order and respects the supplied entry capacity', async () => {
    const read = vi.fn(async (slot: number) => slot)
    const cached = cacheEditorV6MotionAssetProvider(provider(read), false, undefined, { maxEntries: 32 })

    for (let slot = 0; slot < 32; slot++) await cached.loadFabricatorSlot(slot)
    await cached.loadFabricatorSlot(0)
    await cached.loadFabricatorSlot(32)
    await cached.loadFabricatorSlot(0)

    expect(read).toHaveBeenCalledTimes(33)
    await cached.loadFabricatorSlot(1)
    expect(read).toHaveBeenCalledTimes(34)
  })

  it('does not retain an individual asset larger than the byte budget', async () => {
    const read = vi.fn(async () => 'x'.repeat(128))
    const cached = cacheEditorV6MotionAssetProvider(provider(read), false, undefined, { maxEntries: 4, maxBytes: 64 })

    await cached.loadFabricatorSlot(1)
    await cached.loadFabricatorSlot(1)

    expect(read).toHaveBeenCalledTimes(2)
  })

  it('passes through non-session methods in shared-only mode', async () => {
    const listFaceCatalog = vi.fn().mockResolvedValue(['cached'])
    const loadTransient = vi.fn().mockResolvedValue(['fresh'])
    const extendedProvider = { listFaceCatalog, loadTransient } as unknown as CharacterRenderAssetProvider
    const cached = cacheEditorV6MotionAssetProvider(extendedProvider, true) as unknown as {
      listFaceCatalog: () => Promise<string[]>
      loadTransient: () => Promise<string[]>
    }

    await cached.listFaceCatalog()
    await cached.listFaceCatalog()
    await cached.loadTransient()
    await cached.loadTransient()

    expect(listFaceCatalog).toHaveBeenCalledTimes(1)
    expect(loadTransient).toHaveBeenCalledTimes(2)
  })
})
