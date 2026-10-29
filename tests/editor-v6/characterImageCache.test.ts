import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCharacterImageCache } from '../../src/renderer/src/characters/characterImageCache'

class FakeImage {
  static instances: FakeImage[] = []
  naturalWidth = 10
  naturalHeight = 10
  src = ''
  onload?: () => void
  onerror?: () => void
  constructor() { FakeImage.instances.push(this) }
}
beforeEach(() => { FakeImage.instances = []; vi.stubGlobal('Image', FakeImage) })
afterEach(() => vi.unstubAllGlobals())

describe('character image cache ownership and budgets', () => {
  it('shares pending requests and keeps recently accessed entries', async () => {
    const load = createCharacterImageCache({ maxEntries: 2 })
    const first = load('a')
    expect(load('a')).toBe(first)
    load('b')
    load('a')
    load('c')
    expect(load('a')).toBe(first)
    load('b')
    expect(FakeImage.instances).toHaveLength(4)
    FakeImage.instances[0].onload!()
    expect(await first).toBe(FakeImage.instances[0])
  })

  it('evicts by decoded size without changing an image held by a caller', async () => {
    const load = createCharacterImageCache({ maxBytes: 500 })
    const first = load('a')
    FakeImage.instances[0].onload!()
    const held = await first
    const second = load('b')
    FakeImage.instances[1].onload!()
    await second
    expect(load('b')).toBe(second)
    expect(load('a')).not.toBe(first)
    expect(held.src).toBe('a')
    expect(held.naturalWidth).toBe(10)
  })

  it('does not retain an oversized image after delivering it', async () => {
    const load = createCharacterImageCache({ maxBytes: 100 })
    const first = load('large')
    FakeImage.instances[0].onload!()
    await first
    expect(load('large')).not.toBe(first)
  })

  it('does not let an evicted request failure remove its replacement', async () => {
    const load = createCharacterImageCache({ maxEntries: 1 })
    const old = load('a')
    const rejected = expect(old).rejects.toThrow('Não foi possível')
    load('b')
    const replacement = load('a')
    FakeImage.instances[0].onerror!()
    await rejected
    expect(load('a')).toBe(replacement)
  })
})
