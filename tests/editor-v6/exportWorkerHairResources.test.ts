import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EditorV6HairMotionBundle } from '../../src/shared/editorV6HairMotion'
import { createEditorV6ExportWorkerHairResources, loadHairImage } from '../../src/renderer/src/features/editorV6/exportWorkerHairResources'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function animation(): EditorV6HairMotionBundle {
  return {
    presetSlot: 1,
    preset: {} as EditorV6HairMotionBundle['preset'],
    preparationProfile: { totalMilliseconds: 0, stages: [], counts: { surfaces: 1, textures: 1, rigs: 2, motionTransitions: 0, encodedCharacters: 0 } },
    surfaces: [{ id: 'face-surface', dataUrl: 'data:face' }],
    textures: [{ id: 'strand-texture', dataUrl: 'data:strand' }],
    rigs: [
      { elementId: 'animated-actor', layers: [{}] },
      { elementId: 'static-actor', layers: [] }
    ] as EditorV6HairMotionBundle['rigs'],
    motionTransitions: []
  } as EditorV6HairMotionBundle
}

function fakeRenderer() {
  return { render: vi.fn(), getTimings: () => ({ positionMs: 0, uploadMs: 0, textureUploadMs: 0, drawMs: 0, contextCheckMs: 0, stateSetupMs: 0 }), dispose: vi.fn() }
}

describe('createEditorV6ExportWorkerHairResources', () => {
  it('decodes PNG data URLs as origin-clean bitmaps', async () => {
    const createBitmap = vi.fn(async (_blob: ImageBitmapSource) => ({ width: 1, height: 1, close: vi.fn() } as unknown as ImageBitmap))
    vi.stubGlobal('createImageBitmap', createBitmap)

    await loadHairImage('data:image/png;base64,aGVsbG8=')

    const [blob] = createBitmap.mock.calls[0]
    expect(blob).toBeInstanceOf(Blob)
    expect((blob as Blob).type).toBe('image/png')
  })

  it('rasterizes SVG data URLs into an origin-clean canvas bitmap', async () => {
    const canvas = {
      width: 0, height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() }))
    } as unknown as HTMLCanvasElement
    const image = { naturalWidth: 80, naturalHeight: 64, src: '', decode: vi.fn(async () => {}) }
    const createBitmap = vi.fn(async (_source: ImageBitmapSource) => ({ width: 80, height: 64, close: vi.fn() } as unknown as ImageBitmap))
    vi.stubGlobal('createImageBitmap', createBitmap)
    vi.stubGlobal('Image', vi.fn(function ImageMock() { return image }))
    vi.stubGlobal('document', { createElement: vi.fn(() => canvas) })
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:hair-test')
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    await loadHairImage(`data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`)

    expect(createObjectUrl.mock.calls[0][0]).toMatchObject({ type: 'image/svg+xml' })
    expect(image.decode).toHaveBeenCalledOnce()
    expect(canvas.getContext).toHaveBeenCalledWith('2d')
    expect(createBitmap).toHaveBeenCalledWith(canvas)
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:hair-test')
    expect([canvas.width, canvas.height]).toEqual([1, 1])
  })

  it('rejects unsupported data URL origins and formats', async () => {
    await expect(loadHairImage('data:image/jpeg;base64,aGVsbG8=')).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringContaining('origem ou formato não aceito') })
    })
  })

  it('loads each image once and releases every worker-owned map and canvas on disposal', async () => {
    const renderer = fakeRenderer()
    const loaded = new Map<string, ImageBitmap>()
    const loadImage = vi.fn(async (source: string) => {
      const image = { width: 32, height: 16, close: vi.fn() } as unknown as ImageBitmap
      loaded.set(source, image)
      return image
    })
    const resources = await createEditorV6ExportWorkerHairResources(animation(), {
      loadImage,
      createMeshRenderer: () => renderer
    })
    const warpCanvas = { width: 60, height: 30 } as HTMLCanvasElement
    const staticCanvas = { width: 40, height: 20 } as HTMLCanvasElement
    const frameCanvas = { width: 100, height: 50 } as HTMLCanvasElement
    const transitionCanvas = { width: 120, height: 60 } as HTMLCanvasElement
    resources.hairWarpCanvases.set('animated', warpCanvas)
    resources.staticHairWarpCanvases.set('static', staticCanvas)
    resources.hairFrameCanvases.set('actor', { canvas: frameCanvas, context: {} as CanvasRenderingContext2D })
    resources.motionHairFrameSurfaces.set('actor', { canvas: transitionCanvas, context: {} as CanvasRenderingContext2D })
    resources.hairMotionStates.set('actor', {} as never)

    expect(loadImage.mock.calls.map(([source]) => source).sort()).toEqual(['data:face', 'data:strand'])
    expect([...resources.hairSurfaces.keys()]).toEqual(['face-surface'])
    expect([...resources.hairTextures.keys()]).toEqual(['strand-texture'])
    expect(resources.hairSurfaceDataById.get('face-surface')).toBe('data:face')
    expect(resources.animatedElementIds).toEqual(['animated-actor'])
    expect([...resources.hairMotionInstancePhases.keys()]).toEqual(['animated-actor', 'static-actor'])

    resources.dispose()
    resources.dispose()

    expect(renderer.dispose).toHaveBeenCalledOnce()
    expect([warpCanvas, staticCanvas, frameCanvas, transitionCanvas].map(canvas => [canvas.width, canvas.height])).toEqual([[1, 1], [1, 1], [1, 1], [1, 1]])
    expect(resources.hairSurfaces.size).toBe(0)
    expect(resources.hairSurfaceDataById.size).toBe(0)
    expect(resources.hairTextures.size).toBe(0)
    expect(resources.hairMotionStates.size).toBe(0)
    expect(resources.hairMotionInstancePhases.size).toBe(0)
    expect([...loaded.values()].every(image => vi.mocked(image.close).mock.calls.length === 1)).toBe(true)
  })

  it('disposes the renderer if loading either atlas rejects', async () => {
    const renderer = fakeRenderer()
    const failure = Error('atlas decode failed')

    await expect(createEditorV6ExportWorkerHairResources(animation(), {
      loadImage: async source => {
        if (source === 'data:strand') throw failure
        return { width: 32, height: 16, close: vi.fn() } as unknown as ImageBitmap
      },
      createMeshRenderer: () => renderer
    })).rejects.toBe(failure)

    expect(renderer.dispose).toHaveBeenCalledOnce()
  })

  it('decodes at most four distinct sources at once and shares bitmaps across atlases', async () => {
    const bundle = animation()
    bundle.surfaces = Array.from({ length: 9 }, (_, index) => ({ id: `surface-${index}`, dataUrl: `data:${index}` }))
    bundle.textures = [{ id: 'shared', dataUrl: 'data:0' }]
    let active = 0
    let peak = 0
    const loadImage = vi.fn(async (_source: string) => {
      peak = Math.max(peak, ++active)
      await Promise.resolve()
      active--
      return { close: vi.fn() } as unknown as ImageBitmap
    })
    const resources = await createEditorV6ExportWorkerHairResources(bundle, { loadImage, createMeshRenderer: fakeRenderer })
    try {
      expect(peak).toBe(4)
      expect(loadImage).toHaveBeenCalledTimes(9)
      expect(resources.hairTextures.get('shared')).toBe(resources.hairSurfaces.get('surface-0'))
    } finally {
      resources.dispose()
    }
  })
})
