import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCharacterImagePromiseCache } from '../../src/renderer/src/characters/characterImagePromiseCache'
import { createCharacterImageTint } from '../../src/renderer/src/characters/characterImageTint'

afterEach(() => vi.unstubAllGlobals())

describe('recolored image retention', () => {
  it('accounts for worker canvas dimensions without naturalWidth or src', async () => {
    const cache = createCharacterImagePromiseCache({ maxEntries: 10, maxBytes: 1000 })
    const canvas = { width: 20, height: 20 } as HTMLImageElement
    const result = Promise.resolve(canvas)
    cache.set('canvas', result)
    await result
    expect(cache.get('canvas')).toBeUndefined()
    expect(canvas.width).toBe(20)
  })

  it('accounts for generated PNG strings in addition to the original cache key', async () => {
    const cache = createCharacterImagePromiseCache({ maxEntries: 10, maxBytes: 500 })
    const result = Promise.resolve({ naturalWidth: 1, naturalHeight: 1, src: 'x'.repeat(300) } as HTMLImageElement)
    cache.set('tone:original', result)
    await result
    expect(cache.get('tone:original')).toBeUndefined()
  })

  it('bounds the skin cache and keeps recent tones reusable', async () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) })
    const loader = vi.fn(async () => ({ naturalWidth: 10, naturalHeight: 10 } as HTMLImageElement))
    const tint = createCharacterImageTint(loader)
    const first = tint.loadSkinTintedImage('source', '#000000')
    await first
    for (let index = 1; index <= 80; index++) await tint.loadSkinTintedImage('source', `#${index.toString(16).padStart(6, '0')}`)
    const calls = loader.mock.calls.length
    await tint.loadSkinTintedImage('source', '#000050')
    expect(loader).toHaveBeenCalledTimes(calls)
    expect(tint.loadSkinTintedImage('source', '#000000')).not.toBe(first)
    expect(loader).toHaveBeenCalledTimes(calls + 1)
  })

  it('does not retain oversized results in any recoloring cache', async () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) })
    const loader = vi.fn(async () => ({ naturalWidth: 5000, naturalHeight: 5000 } as HTMLImageElement))
    const tint = createCharacterImageTint(loader)
    const requests = [
      () => tint.loadSkinTintedImage('source', '#ffffff'),
      () => tint.loadHairTintedImage('source', { base: '#ffffff' }),
      () => tint.loadModelBodyTintedImage('source', '#ffffff')
    ]
    for (const request of requests) {
      const first = request()
      await first
      expect(request()).not.toBe(first)
    }
    expect(loader).toHaveBeenCalledTimes(6)
  })
})
