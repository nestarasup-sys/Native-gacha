import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEditorV6ExportFrameAssetImageLoader } from '../../src/renderer/src/features/editorV6/exportFrameAssetImageLoader'

afterEach(() => vi.unstubAllGlobals())

function installImageFactory(behavior: 'load' | 'decode' | 'success' = 'success') {
  const created: Array<{ src: string; decode: ReturnType<typeof vi.fn> }> = []
  class FakeImage {
    onload: GlobalEventHandlers['onload'] = null
    onerror: GlobalEventHandlers['onerror'] = null
    private source = ''
    decode = vi.fn(() => behavior === 'decode' ? Promise.reject(Error('decode failed')) : Promise.resolve())

    constructor() { created.push(this) }
    get src() { return this.source }
    set src(value: string) {
      this.source = value
      queueMicrotask(() => {
        if (behavior === 'load') (this.onerror as ((event: Event) => void) | null)?.(new Event('error'))
        else (this.onload as ((event: Event) => void) | null)?.(new Event('load'))
      })
    }
  }
  vi.stubGlobal('Image', FakeImage as unknown as typeof Image)
  return created
}

function asset(id: string) { return { id, name: `Asset ${id}`, dataUrl: `data:image/png;base64,${id}` } }

describe('createEditorV6ExportFrameAssetImageLoader', () => {
  it('reuses decoded promises for repeated assets', async () => {
    const created = installImageFactory()
    const cache = new Map<string, Promise<void>>()
    const loader = createEditorV6ExportFrameAssetImageLoader(cache)

    await loader.prepare([asset('one'), asset('two')])
    await loader.prepare([asset('one')])

    expect(created).toHaveLength(2)
    expect(created.map(image => image.src)).toEqual(['data:image/png;base64,one', 'data:image/png;base64,two'])
    expect(cache.size).toBe(2)
  })

  it('evicts the oldest cached image when adding a thirty-third asset', async () => {
    installImageFactory()
    const cache = new Map<string, Promise<void>>()
    const loader = createEditorV6ExportFrameAssetImageLoader(cache)

    await loader.prepare(Array.from({ length: 33 }, (_, index) => asset(`asset-${index}`)))

    expect(cache.size).toBe(32)
    expect(cache.has('asset-0')).toBe(false)
    expect(cache.has('asset-1')).toBe(true)
    expect(cache.has('asset-32')).toBe(true)
  })

  it('preserves distinct image-load and image-decode errors', async () => {
    installImageFactory('load')
    const loadLoader = createEditorV6ExportFrameAssetImageLoader(new Map())
    await expect(loadLoader.prepare([asset('load-failure')])).rejects.toThrow('Não foi possível preparar Asset load-failure.')

    installImageFactory('decode')
    const decodeLoader = createEditorV6ExportFrameAssetImageLoader(new Map())
    await expect(decodeLoader.prepare([asset('decode-failure')])).rejects.toThrow('Não foi possível decodificar Asset decode-failure.')
  })
})
