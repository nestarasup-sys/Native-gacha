import { describe, expect, it, vi } from 'vitest'
import { createGachaPairedResource } from '../../src/renderer/src/characters/pairedCharacterPreparation'

describe('R30: shared immutable wardrobe source between two prepared variants', () => {
  it('starts one paint for simultaneous normal and hairless renderers', async () => {
    const cache = createGachaPairedResource<{ canvas: string }>()
    const paint = vi.fn(async () => ({ canvas: 'wardrobe-unchanged' }))
    const [normal, hairless] = await Promise.all([cache.load(paint), cache.load(paint)])
    expect(normal).toBe(hairless)
    expect(paint).toHaveBeenCalledTimes(1)
    cache.clear()
    const newPose = await cache.load(paint)
    expect(newPose).not.toBe(normal)
    expect(paint).toHaveBeenCalledTimes(2)
  })
  it('does not keep failed preparation or leak between export sessions', async () => {
    const cache = createGachaPairedResource<number>()
    const fail = vi.fn(async () => { throw Error('missing wardrobe') })
    await expect(cache.load(fail)).rejects.toThrow('missing wardrobe')
    await expect(cache.load(fail)).rejects.toThrow('missing wardrobe')
    expect(fail).toHaveBeenCalledTimes(2)
    const otherExport = createGachaPairedResource<number>()
    const count = vi.fn(async () => 42)
    expect(await cache.load(count)).toBe(42)
    expect(await otherExport.load(count)).toBe(42)
    expect(count).toHaveBeenCalledTimes(2)
  })
})
