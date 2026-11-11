import { describe, expect, it, vi } from 'vitest'
import { createEditorV6Timeline, type EditorV6Document } from '../../src/shared/editorV6'
import { createEditorV6ExportWorkerHairRuntime } from '../../src/renderer/src/features/editorV6/exportWorkerHairRuntime'
import { createEditorV6ExportFrameRenderer } from '../../src/renderer/src/features/editorV6/exportFrameRenderer'

function project(): EditorV6Document {
  return {
    schemaVersion: 1,
    id: 'project',
    title: 'Projeto sintético',
    color: '#fff',
    createdAt: '2026-11-11T00:00:00.000Z',
    updatedAt: '2026-11-11T00:00:00.000Z',
    backgroundColor: '#fff',
    backgroundAssetId: null,
    backgroundX: 0,
    backgroundY: 0,
    backgroundWidth: 100,
    backgroundHeight: 100,
    backgroundRotation: 0,
    assets: [],
    elements: [],
    timeline: createEditorV6Timeline()
  }
}

function resources(): Parameters<typeof createEditorV6ExportWorkerHairRuntime>[2] {
  return {
    hairSurfaces: new Map(), hairSurfaceDataById: new Map(), hairTextures: new Map(),
    hairMotionStates: new Map(), hairMotionLoops: new Map(), hairMotionInstancePhases: new Map(),
    hairWarpCanvases: new Map(), staticHairWarpCanvases: new Map(), hairFrameCanvases: new Map(),
    motionHairFrameSurfaces: new Map(), animatedElementIds: [], hairMeshRenderer: { dispose() {} },
    warpHairTexture: () => { throw Error('Não deve renderizar cabelo neste teste') }, dispose() {}
  } as unknown as Parameters<typeof createEditorV6ExportWorkerHairRuntime>[2]
}

describe('createEditorV6ExportFrameRenderer', () => {
  it('mantém a ordem de preparação, commit, decode e paint e reutiliza o quadro idêntico', async () => {
    const doc = project()
    const hairRuntime = createEditorV6ExportWorkerHairRuntime(doc, undefined, resources())
    const operations: string[] = []
    const commitSurface = vi.fn((surface: { scene: { frame: number }; outputWidth: number; outputHeight: number; renderLayer: string }) => {
      operations.push(`commit:${surface.scene.frame}:${surface.outputWidth}x${surface.outputHeight}:${surface.renderLayer}`)
    })
    const renderFrame = createEditorV6ExportFrameRenderer({
      project: doc, width: 1280, height: 720, layeredVideo: false, hairAnimation: undefined,
      projectAssetIndex: new Map(), assetsById: new Map(), hairRuntime,
      prepareAssets: vi.fn(async () => { operations.push('prepare-assets') }),
      commitSurface,
      onImageLoad: () => {},
      waitForSvgImages: vi.fn(async () => { operations.push('wait-images') }),
      setPaintToken: vi.fn(() => { operations.push('set-paint') }),
      waitForPaintFrame: vi.fn(async () => { operations.push('wait-paint') }),
      now: (() => { let tick = 0; return () => ++tick })()
    })

    const first = await renderFrame(10, undefined, 42)
    expect(first.reused).toBe(false)
    expect(commitSurface).toHaveBeenCalledWith(expect.objectContaining({
      scene: expect.objectContaining({ frame: 10 }), outputWidth: 1280, outputHeight: 720, renderLayer: 'all'
    }))
    expect(operations).toEqual(['prepare-assets', 'commit:10:1280x720:all', 'wait-images', 'set-paint', 'wait-paint'])

    operations.length = 0
    const reused = await renderFrame(10, undefined, 43)
    expect(reused).toMatchObject({ reused: true })
    expect(operations).toEqual([])
    expect(commitSurface).toHaveBeenCalledOnce()
  })
})
