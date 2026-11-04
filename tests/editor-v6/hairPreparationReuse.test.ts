import { describe, expect, it, vi } from 'vitest'
import { createEditorV6HairPreparationReuse } from '../../src/renderer/src/features/editorV6/motion/hairPreparationReuse'

describe('R23: only-current-export style and tinted texture reuse', () => {
  it('coalesces in-flight style reads across poses/character targets', async () => {
    const batch = createEditorV6HairPreparationReuse()
    const loader = vi.fn(async () => ({ id: 'posterior' }))
    const [a, b, c] = await Promise.all([
      batch.loadStyle(2, 'posterior', loader),
      batch.loadStyle(2, 'posterior', loader),
      batch.loadStyle(3, 'posterior', loader)
    ])
    expect(a).toBe(b)
    expect(c).not.toBe(a)
    expect(loader).toHaveBeenCalledTimes(2)
    expect(batch.stats()).toMatchObject({ styleLoads: 2, styleReuses: 1 })
  })
  it('reuses one colorized PNG only for exactly the same source/part/palette', async () => {
    const batch = createEditorV6HairPreparationReuse()
    const make = vi.fn(async () => 'data:image/png;base64,AA==')
    for (const colors of [{ light: '#123456' }, { light: '#123456' }, { light: '#654321' }]) {
      await batch.prepareTexture(2, 'style', 'front', 'rearHair', colors, make)
    }
    await batch.prepareTexture(2, 'style', 'back', 'backHair', { light: '#123456' }, make)
    expect(make).toHaveBeenCalledTimes(3)
    expect(batch.stats()).toMatchObject({ textureBuilds: 3, textureReuses: 1 })
    batch.clear()
    await batch.prepareTexture(2, 'style', 'front', 'rearHair', { light: '#123456' }, make)
    expect(make).toHaveBeenCalledTimes(4)
  })
  it('evicts failed promises and never reuses another export batch', async () => {
    const batch = createEditorV6HairPreparationReuse(2)
    const failing = vi.fn(async () => { throw Error('style changed') })
    await expect(batch.loadStyle(1, 'style', failing)).rejects.toThrow('style changed')
    await expect(batch.loadStyle(1, 'style', failing)).rejects.toThrow('style changed')
    expect(failing).toHaveBeenCalledTimes(2)
    const other = createEditorV6HairPreparationReuse()
    const loader = vi.fn(async () => ({ style: 'current' }))
    await batch.loadStyle(1, 'fresh', loader)
    await other.loadStyle(1, 'fresh', loader)
    expect(loader).toHaveBeenCalledTimes(2)
  })
  it('bounds retained entries with high-cardinality scenes', async () => {
    const batch = createEditorV6HairPreparationReuse(2)
    let calls = 0
    for (const key of ['one', 'two', 'three', 'one']) {
      await batch.loadStyle(1, key, async () => { calls++; return key })
    }
    expect(calls).toBe(4)
    expect(() => createEditorV6HairPreparationReuse(0)).toThrow()
  })
})
