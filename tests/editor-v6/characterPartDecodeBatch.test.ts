import { describe, expect, it } from 'vitest'
import { loadCharacterPartImages } from '../../src/renderer/src/characters/characterPartDecodeBatch'

describe('shared character part image preparation', () => {
  it('keeps stable painter ordering while decoding four sources concurrently', async () => {
    let active = 0, peak = 0
    const result = await loadCharacterPartImages(Array.from({ length: 21 }, (_, i) => i), async i => {
      active++
      peak = Math.max(active, peak)
      await Promise.resolve()
      if (i % 3 === 0) await Promise.resolve()
      active--
      return 'image-' + i
    })
    expect(peak).toBe(4)
    expect(active).toBe(0)
    expect(result).toEqual(Array.from({ length: 21 }, (_, i) => 'image-' + i))
  })
  it('preserves failed-image fallback without dropping later body layers', async () => {
    const result = await loadCharacterPartImages(['head', 'bad', 'arm', 'leg'], async id => {
      if (id === 'bad') throw Error('invalid texture')
      return id.toUpperCase()
    })
    expect(result).toEqual(['HEAD', null, 'ARM', 'LEG'])
  })
  it('does no work for an empty model and rejects unsafe concurrency', async () => {
    let reads = 0
    expect(await loadCharacterPartImages([], async () => { reads++; return 'x' })).toEqual([])
    expect(reads).toBe(0)
    for (const count of [-1, 0, 9, 1.1, Number.NaN]) {
      await expect(loadCharacterPartImages([1], async () => 1, count)).rejects.toThrow('Limite')
    }
  })
})
