import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEditorV6ExportFrameAssetImageLoader } from '../../src/renderer/src/features/editorV6/exportFrameAssetImageLoader'

afterEach(() => vi.unstubAllGlobals())

function installImageFactory(behavior: 'load' | 'decode' | 'success' = 'success') {
  const created: Array<{ src: string; crossOrigin: string | null; crossOriginAtSource: string | null; decode: ReturnType<typeof vi.fn> }> = []
  class FakeImage {
    onload: GlobalEventHandlers['onload'] = null
    onerror: GlobalEventHandlers['onerror'] = null
    private source = ''
    crossOrigin: string | null = null
    crossOriginAtSource: string | null = null
    decode = vi.fn(() => behavior === 'decode' ? Promise.reject(Error('decode failed')) : Promise.resolve())

    constructor() { created.push(this) }
    get src() { return this.source }
    set src(value: string) {
      this.source = value
      this.crossOriginAtSource = this.crossOrigin
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
  it('starts four image loads together and waits before starting the next batch', async () => {
    const created = installImageFactory()
    const loader = createEditorV6ExportFrameAssetImageLoader(new Map())
    const prepared = loader.prepare(Array.from({ length: 5 }, (_, index) => asset(String(index))))

    expect(created).toHaveLength(4)
    await prepared
    expect(created).toHaveLength(5)
  })
  it('reports only pending asset decode counts and MIME/byte metadata, without asset IDs', async () => {
    installImageFactory()
    const diagnostics: unknown[] = []
    const loader = createEditorV6ExportFrameAssetImageLoader(new Map(), status => diagnostics.push(status))

    await loader.prepare([asset('private-id')])

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ index: 0, state: 'loading', mime: 'image/png' }),
      expect.objectContaining({ index: 0, state: 'decoding', mime: 'image/png' }),
      expect.objectContaining({ index: 0, state: 'ready', mime: 'image/png' })
    ]))
    expect(JSON.stringify(diagnostics)).not.toContain('private-id')
  })
  it('loads scoped project media URLs with CORS enabled before assigning src', async () => {
    const created = installImageFactory()
    const loader = createEditorV6ExportFrameAssetImageLoader(new Map())

    await loader.prepare([{ id: 'asset-id', name: 'Asset', dataUrl: 'gacha-editor-media://project/asset' }])

    expect(created[0]).toMatchObject({ crossOrigin: 'anonymous', crossOriginAtSource: 'anonymous' })
  })
  it('reuses decoded promises for repeated assets', async () => {
    const created = installImageFactory()
    const cache = new Map<string, Promise<void>>()
    const diagnostic = vi.fn()
    const loader = createEditorV6ExportFrameAssetImageLoader(cache, diagnostic)

    await loader.prepare([asset('one'), asset('two')])
    diagnostic.mockClear()
    await loader.prepare([asset('one')])

    expect(created).toHaveLength(2)
    expect(created.map(image => image.src)).toEqual(['data:image/png;base64,one', 'data:image/png;base64,two'])
    expect(cache.size).toBe(2)
    expect(diagnostic).not.toHaveBeenCalled()
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

  it('keeps recently reused images when the bounded cache evicts an entry', async () => {
    installImageFactory()
    const cache = new Map<string, Promise<void>>()
    const loader = createEditorV6ExportFrameAssetImageLoader(cache)

    await loader.prepare(Array.from({ length: 32 }, (_, index) => asset(`asset-${index}`)))
    await loader.prepare([asset('asset-0')])
    await loader.prepare([asset('asset-32')])

    expect(cache.size).toBe(32)
    expect(cache.has('asset-0')).toBe(true)
    expect(cache.has('asset-1')).toBe(false)
    expect(cache.has('asset-32')).toBe(true)
  })

  it('preserves distinct image-load and image-decode errors', async () => {
    installImageFactory('load')
    const loadCache = new Map<string, Promise<void>>()
    const loadLoader = createEditorV6ExportFrameAssetImageLoader(loadCache)
    await expect(loadLoader.prepare([asset('load-failure')])).rejects.toThrow('Não foi possível preparar Asset load-failure.')
    expect(loadCache.has('load-failure')).toBe(false)

    installImageFactory('decode')
    const decodeCache = new Map<string, Promise<void>>()
    const decodeLoader = createEditorV6ExportFrameAssetImageLoader(decodeCache)
    await expect(decodeLoader.prepare([asset('decode-failure')])).rejects.toThrow('Não foi possível decodificar Asset decode-failure.')
    expect(decodeCache.has('decode-failure')).toBe(false)
  })
})
