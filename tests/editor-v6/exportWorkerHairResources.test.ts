import { describe, expect, it, vi } from 'vitest'
import type { EditorV6HairMotionBundle } from '../../src/shared/editorV6HairMotion'
import { createEditorV6ExportWorkerHairResources } from '../../src/renderer/src/features/editorV6/exportWorkerHairResources'

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
  it('loads each image once and releases every worker-owned map and canvas on disposal', async () => {
    const renderer = fakeRenderer()
    const loadImage = vi.fn(async (source: string) => ({ src: source } as HTMLImageElement))
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
  })

  it('disposes the renderer if loading either atlas rejects', async () => {
    const renderer = fakeRenderer()
    const failure = Error('atlas decode failed')

    await expect(createEditorV6ExportWorkerHairResources(animation(), {
      loadImage: async source => {
        if (source === 'data:strand') throw failure
        return { src: source } as HTMLImageElement
      },
      createMeshRenderer: () => renderer
    })).rejects.toBe(failure)

    expect(renderer.dispose).toHaveBeenCalledOnce()
  })
})
