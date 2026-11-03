import { describe, expect, it } from 'vitest'
import { createEditorV6FrameAssetRegistry } from '../../src/renderer/src/features/editorV6/exportFrameAssets'

type Asset = { id: string; dataUrl: string }

describe('Editor V6 export asset lifetime', () => {
  it('keeps frame-dependent mouth and hair images out of persistent worker assets', () => {
    const original: Asset = { id: 'character-base', dataUrl: 'data:image/png;base64,original' }
    const durableAtlas: Asset = { id: 'face-transition', dataUrl: 'data:image/png;base64,atlas' }
    const persistent = new Map([[original.id, original], [durableAtlas.id, durableAtlas]])
    let previous: ReturnType<typeof createEditorV6FrameAssetRegistry<Asset>> | undefined

    for (let frame = 0; frame < 1_000; frame++) {
      const mouth: Asset = { id: `mouth-${frame}`, dataUrl: `data:image/png;base64,face-${frame}` }
      const hair: Asset = { id: 'hair-animated', dataUrl: `data:image/png;base64,hair-${frame}` }
      const registry = createEditorV6FrameAssetRegistry(persistent, [original, mouth])
      registry.current.set(hair.id, hair)
      expect(registry.resolve(original.id)).toBe(original)
      expect(registry.resolve(durableAtlas.id)).toBe(durableAtlas)
      expect(registry.resolve(mouth.id)).toBe(mouth)
      expect(registry.resolve(hair.id)).toBe(hair)
      expect(registry.current.size).toBe(3)
      if (previous) {
        expect(registry.resolve(`mouth-${frame - 1}`)).toBeUndefined()
        expect(registry.resolve(hair.id)).not.toBe(previous.resolve(hair.id))
      }
      previous = registry
    }

    expect([...persistent.keys()]).toEqual(['character-base', 'face-transition'])
    expect(persistent.size).toBe(2)
  })

  it('prefers the current-frame replacement when an asset ID is reused', () => {
    const base: Asset = { id: 'actor', dataUrl: 'old' }
    const replacement: Asset = { id: 'actor', dataUrl: 'new' }
    const persistent = new Map([[base.id, base]])
    const { current, resolve } = createEditorV6FrameAssetRegistry(persistent, [replacement])
    expect(resolve('actor')).toBe(replacement)
    current.delete('actor')
    expect(resolve('actor')).toBe(base)
    expect(persistent.get('actor')).toBe(base)
  })
})
