import { describe, expect, it, vi } from 'vitest'
import type { EditorV6Asset } from '../../src/shared/editorV6'
import type { EditorV6FrameMetrics, EditorV6FrameTimings } from '../../src/shared/editorV6Export'
import type { EditorV6HairMotionRig, EditorV6HairMotionTransition } from '../../src/shared/editorV6HairMotion'
import type { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import { expandEditorV6HairCrop } from '../../src/renderer/src/features/editorV6/editorV6HairMotionGeometry'
import { createEditorV6ExportHairSceneComposer } from '../../src/renderer/src/features/editorV6/exportHairSceneComposition'
import type { createEditorV6ExportHairFrameComposer } from '../../src/renderer/src/features/editorV6/exportHairFrameComposer'
import type { createEditorV6ExportHairMotionPlanIndex } from '../../src/renderer/src/features/editorV6/exportHairMotionPlanIndex'
import type { createEditorV6ExportHairRigAtFrame } from '../../src/renderer/src/features/editorV6/exportHairRigAtFrame'

type Scene = ReturnType<typeof resolveEditorV6SceneAtFrame>
type SceneElement = Scene['elements'][number]
type MotionPlanIndex = ReturnType<typeof createEditorV6ExportHairMotionPlanIndex>
type HairRigAtFrame = ReturnType<typeof createEditorV6ExportHairRigAtFrame>['hairRigAtFrame']
type HairFrameComposer = ReturnType<typeof createEditorV6ExportHairFrameComposer>

const motionRig: EditorV6HairMotionRig = {
  elementId: 'actor', assetId: 'hair', characterId: 'character', poseSlot: null, baseSurfaceId: 'base', faceSurfaceId: 'face', overlaySurfaceId: 'overlay',
  artworkWidth: 100, artworkHeight: 80, outputWidth: 100, outputHeight: 80, shapeScaleX: 1, shapeScaleY: 1,
  sourceCrop: { left: 10, top: 20, width: 50, height: 40 }, sourceHead: { width: 10, height: 10 }, targetHead: { x: 10, y: 10, width: 20, height: 20, rotation: 0 },
  layers: [{ id: 'fringe:one', textureId: 'strand', side: 'front', width: 10, height: 10, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipX: false, phase: 0 }]
}

function element(overrides: Partial<SceneElement> = {}): SceneElement {
  return {
    id: 'actor', kind: 'character', characterId: 'character', text: 'Actor', assetId: 'hair', x: 20, y: 30, width: 40, height: 50,
    rotation: 0, flipX: false, zIndex: 1, mouthPatch: { assetId: 'mouth', sprite: { x: 0, y: 0, width: 1, height: 1, atlasWidth: 1, atlasHeight: 1 }, x: 0.2, y: 0.25, width: 0.1, height: 0.15 },
    ...overrides
  } as SceneElement
}

function scene(elements: SceneElement[]): Scene {
  return { frame: 12, background: { backgroundColor: '#000' }, elements } as Scene
}

function makeComposer(overrides: Partial<Parameters<typeof createEditorV6ExportHairSceneComposer>[0]> = {}) {
  const transitionLookup = vi.fn(() => undefined)
  const planIndex = {
    hairRigs: new Map([['actor:hair', motionRig]]), expressionOnlyPlansByElement: new Map(),
    hairTransitionIndex: { get: transitionLookup }
  } as unknown as MotionPlanIndex
  const hairRigAtFrame = vi.fn(() => ({ rig: motionRig, element: element() })) as unknown as HairRigAtFrame
  const canvas = { width: 100, height: 80 } as HTMLCanvasElement
  const composeHairFrame = vi.fn(() => canvas) as unknown as HairFrameComposer['composeHairFrame']
  const composeMotionHairFrame = vi.fn(() => canvas) as unknown as HairFrameComposer['composeMotionHairFrame']
  const options: Parameters<typeof createEditorV6ExportHairSceneComposer>[0] = {
    planIndex, hairRigAtFrame, hairSourceAssetId: value => value.assetId,
    composeHairFrame, composeMotionHairFrame, ...overrides
  }
  return { ...createEditorV6ExportHairSceneComposer(options), transitionLookup, hairRigAtFrame, composeHairFrame, composeMotionHairFrame, canvas }
}

describe('createEditorV6ExportHairSceneComposer', () => {
  it('leaves static frames untouched when the frame plan has no animated hair', () => {
    const factory = makeComposer()
    const current = scene([element()])
    const timings: EditorV6FrameTimings = {}
    const result = factory.compose({ composedScene: current, originalElements: new Map([['actor', current.elements[0]]]), frame: 12, activeHair: false, riggedElementIds: new Set(), assetsById: new Map(), renderAssetsById: new Map(), hairSurfaceDataById: new Map(), timings, metrics: {} })

    expect(result.renderScene).toBe(current)
    expect(result.rasterCanvases.size).toBe(0)
    expect(timings).toEqual({})
    expect(factory.composeHairFrame).not.toHaveBeenCalled()
  })

  it('rasterizes ordinary hair and remaps mouth geometry through the source crop', () => {
    const factory = makeComposer()
    const original = element()
    const current = scene([original])
    const timings: EditorV6FrameTimings = {}
    const metrics: EditorV6FrameMetrics = {}
    const result = factory.compose({ composedScene: current, originalElements: new Map([['actor', original]]), frame: 12, activeHair: true, riggedElementIds: new Set(['actor']), assetsById: new Map(), renderAssetsById: new Map(), hairSurfaceDataById: new Map(), timings, metrics })
    const rendered = result.renderScene.elements[0]

    expect(factory.hasAnimatedHair(original, 12)).toBe(true)
    expect(factory.composeHairFrame).toHaveBeenCalledWith(motionRig, original, 12, timings, metrics)
    expect(result.rasterCanvases.get('actor')).toBe(factory.canvas)
    expect(rendered.assetId).toBeUndefined()
    expect({ x: rendered.x, y: rendered.y, width: rendered.width, height: rendered.height }).toEqual(expandEditorV6HairCrop(original, { width: 100, height: 80 }, motionRig.sourceCrop))
    expect(rendered.mouthPatch).toMatchObject({ x: 0.2, y: 0.375, width: 0.05, height: 0.075 })
    expect(timings.hairCompositionMs).toBeGreaterThanOrEqual(0)
    expect(timings.hairCompositionOtherMs).toBeGreaterThanOrEqual(0)
  })

  it('uses the mouth atlas crop instead of the broader hair crop for speaking frames', () => {
    const factory = makeComposer({ facePatchSourceCrop: () => ({ left: 30, top: 5, width: 20, height: 10 }) })
    const original = element({ mouthPatch: { ...element().mouthPatch!, assetId: 'mouth-atlas' } })
    const current = scene([original])
    const result = factory.compose({ composedScene: current, originalElements: new Map([['actor', original]]), frame: 12, activeHair: true, riggedElementIds: new Set(['actor']), assetsById: new Map(), renderAssetsById: new Map(), hairSurfaceDataById: new Map(), timings: {}, metrics: {} })

    expect(result.renderScene.elements[0].mouthPatch).toMatchObject({ x: 0.34, y: 0.09375, width: 0.02, height: 0.01875 })
  })

  it('reuses a face atlas across transition frames and preserves expanded transition geometry', () => {
    const factory = makeComposer()
    const original = element({ assetId: 'transition-body', motionSprite: { sprite: { x: 0, y: 0, width: 10, height: 10, atlasWidth: 10, atlasHeight: 10 }, x: 0, y: 0, width: 1, height: 1, rotation: 0, flipX: false } })
    const current = scene([original])
    const frame = { offset: 1, sprite: { x: 0, y: 0, width: 10, height: 10, atlasWidth: 10, atlasHeight: 10 }, crop: { left: 10, top: 20, width: 50, height: 40 }, x: 0, y: 0, width: 1, height: 1, rotation: 15, flipX: true,
      facePatch: { sprite: { x: 0, y: 0, width: 4, height: 4, atlasWidth: 8, atlasHeight: 8 }, x: 0.2, y: 0.25, width: 0.1, height: 0.1 } }
    const transition = { elementId: 'actor', key: 'motion', startFrame: 0, endFrame: 12, behindFaceSurfaceId: 'behind', faceSurfaceId: 'face', eyesAboveRearHairSurfaceId: null, overlaySurfaceId: null, faceAtlasSurfaceId: 'face-atlas', frames: [frame] } satisfies EditorV6HairMotionTransition
    factory.transitionLookup.mockReturnValue({ transition: { elementId: 'actor', key: 'motion', startFrame: 0, endFrame: 12, from: motionRig, to: { ...motionRig, outputWidth: 120 }, samples: [{ offset: 1, progress: 0.5 }], atlas: transition }, atlasFrame: frame, poseSample: { offset: 1, progress: 0.5 } } as never)
    const assetsById = new Map<string, EditorV6Asset>()
    const renderAssetsById = new Map<string, EditorV6Asset>()
    const timings: EditorV6FrameTimings = {}
    expect(original.motionSprite).toBeTruthy()
    expect(factory.hasAnimatedHair(original, 12)).toBe(true)
    const input = { composedScene: current, originalElements: new Map([['actor', original]]), activeHair: true, riggedElementIds: new Set(['actor']), assetsById, renderAssetsById, timings, metrics: {} }
    const result = factory.compose({ ...input, frame: 12, hairSurfaceDataById: new Map([['face-atlas', 'data:face']]) })
    const rendered = result.renderScene.elements[0]

    expect(factory.composeMotionHairFrame).toHaveBeenCalledOnce()
    expect(assetsById.get('face-atlas')).toMatchObject({ category: 'character', name: 'Actor · rosto da transição', dataUrl: 'data:face', timelineSnapshot: true })
    expect(renderAssetsById.get('face-atlas')).toBe(assetsById.get('face-atlas'))
    expect(rendered.assetId).toBeUndefined()
    expect(rendered.motionSprite).toBeUndefined()
    expect(rendered.rotation).toBe(15)
    expect(rendered.flipX).toBe(true)
    expect(rendered.mouthPatch).toMatchObject({ assetId: 'face-atlas', y: 0.375, height: 0.05 })
    expect(rendered.mouthPatch?.x).toBeCloseTo(0.181818)
    expect(rendered.mouthPatch?.width).toBeCloseTo(0.045455)
    expect(factory.transitionLookup).toHaveBeenCalledWith('actor', 12)

    renderAssetsById.clear()
    factory.compose({ ...input, frame: 13, hairSurfaceDataById: new Map() })
    expect(renderAssetsById.get('face-atlas')).toBe(assetsById.get('face-atlas'))
    expect(factory.composeMotionHairFrame).toHaveBeenCalledTimes(2)
  })
})
