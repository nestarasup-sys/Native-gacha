import { describe, expect, it, vi } from 'vitest'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import type { EditorV6WorkerPayload } from '../../src/shared/editorV6Export'
import type { EditorV6ResolvedScene } from '../../src/shared/editorV6TimelineScene'
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

function activeHairRenderer(scene: EditorV6ResolvedScene) {
  const composedScenes: EditorV6ResolvedScene[] = []
  const hairRuntime = {
    hairPoseReactionEnds: new Map<string, readonly number[]>(),
    hairSurfaceDataById: new Map<string, string>(),
    resolveRawSceneAtFrame: () => scene,
    applyMouthLoop: (raw: EditorV6ResolvedScene) => raw,
    hasAnimatedHair: () => true,
    composeHairScene: ({ composedScene }: { composedScene: EditorV6ResolvedScene }) => {
      composedScenes.push(composedScene)
      return { renderScene: composedScene, rasterCanvases: new Map() }
    }
  } as unknown as Parameters<typeof createEditorV6ExportFrameRenderer>[0]['hairRuntime']
  const renderFrame = createEditorV6ExportFrameRenderer({
    project: { ...project(), elements: scene.elements as EditorV6Element[] },
    width: 1280,
    height: 720,
    layeredVideo: false,
    hairAnimation: { poseReactionOnly: false } as EditorV6WorkerPayload['hairAnimation'],
    projectAssetIndex: new Map(),
    assetsById: new Map(),
    hairRuntime,
    prepareAssets: vi.fn(async () => {}),
    commitSurface: vi.fn(),
    onImageLoad: () => {},
    waitForSvgImages: vi.fn(async () => {}),
    setPaintToken: vi.fn(),
    waitForPaintFrame: vi.fn(async () => {})
  })
  return { renderFrame, composedScenes }
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

  it('reaproveita o array da cena de cabelo quando não há mouth patch para remover', async () => {
    const actor: EditorV6Element = { id: 'actor', kind: 'character', characterId: 'alice', assetId: 'hair', text: 'Alice', x: 0, y: 0, width: 20, height: 30, rotation: 0, zIndex: 1 }
    const scene = { frame: 10, background: '#fff', elements: [actor] } as EditorV6ResolvedScene
    const { renderFrame, composedScenes } = activeHairRenderer(scene)

    await renderFrame(10, undefined, 42)

    expect(composedScenes[0].elements).toBe(scene.elements)
  })

  it('ainda remove mouth patches dos personagens com cabelo antes da composição facial', async () => {
    const actor: EditorV6Element = {
      id: 'actor', kind: 'character', characterId: 'alice', assetId: 'hair', text: 'Alice', x: 0, y: 0, width: 20, height: 30, rotation: 0, zIndex: 1,
      mouthPatch: { assetId: 'mouth', sprite: { x: 0, y: 0, width: 2, height: 2, atlasWidth: 2, atlasHeight: 2 }, x: 0, y: 0, width: 0.1, height: 0.1 }
    }
    const scene = { frame: 10, background: '#fff', elements: [actor] } as EditorV6ResolvedScene
    const { renderFrame, composedScenes } = activeHairRenderer(scene)

    await renderFrame(10, undefined, 42)

    expect(composedScenes[0].elements).not.toBe(scene.elements)
    expect(composedScenes[0].elements[0].mouthPatch).toBeUndefined()
    expect(scene.elements[0].mouthPatch).toBeDefined()
  })
})
