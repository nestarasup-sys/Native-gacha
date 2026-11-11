import { describe, expect, it } from 'vitest'
import { createEditorV6Timeline, type EditorV6Document } from '../../src/shared/editorV6'
import { createEditorV6ExportWorkerHairRuntime } from '../../src/renderer/src/features/editorV6/exportWorkerHairRuntime'

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

describe('createEditorV6ExportWorkerHairRuntime', () => {
  it('mantém uma única resolução bruta por quadro e aplica os serviços de cabelo sem tocar cenas inativas', () => {
    const runtime = createEditorV6ExportWorkerHairRuntime(project(), undefined, resources())
    const frameTen = runtime.resolveRawSceneAtFrame(10)
    const frameTenAgain = runtime.resolveRawSceneAtFrame(10)
    const frameEleven = runtime.resolveRawSceneAtFrame(11)

    expect(frameTenAgain).toBe(frameTen)
    expect(frameTen.frame).toBe(10)
    expect(frameEleven).not.toBe(frameTen)
    expect(frameEleven.frame).toBe(11)
    expect(runtime.applyMouthLoop(frameTen, 10)).toBe(frameTen)
    expect(runtime.hasAnimatedHair({ kind: 'object' } as (typeof frameTen.elements)[number], 10)).toBe(false)

    const composition = runtime.composeHairScene({
      composedScene: frameTen, originalElements: new Map(), frame: 10, activeHair: false,
      riggedElementIds: new Set(), assetsById: new Map(), renderAssetsById: new Map(),
      hairSurfaceDataById: runtime.hairSurfaceDataById, timings: {}, metrics: {}
    })
    expect(composition).toEqual({ renderScene: frameTen, rasterCanvases: new Map() })
  })
})
