import { describe, expect, it, vi } from 'vitest'
import type { EditorV6HairMotionRig } from '../../src/shared/editorV6HairMotion'
import type { editorV6MotionPlans } from '../../src/shared/editorV6Motion'
import type { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import type { createEditorV6ExportHairMotionPlanIndex } from '../../src/renderer/src/features/editorV6/exportHairMotionPlanIndex'
import { createEditorV6ExportHairRigAtFrame } from '../../src/renderer/src/features/editorV6/exportHairRigAtFrame'

type SceneElement = ReturnType<typeof resolveEditorV6SceneAtFrame>['elements'][number]
type MotionPlan = ReturnType<typeof editorV6MotionPlans>[number]
type MotionIndex = ReturnType<typeof createEditorV6ExportHairMotionPlanIndex>

function rig(assetId: string, outputWidth: number): EditorV6HairMotionRig {
  return {
    elementId: 'actor', assetId, characterId: 'character', poseSlot: null, baseSurfaceId: 'base', faceSurfaceId: 'face', overlaySurfaceId: null,
    artworkWidth: outputWidth, artworkHeight: 100, outputWidth, outputHeight: 100, shapeScaleX: 1, shapeScaleY: 1,
    sourceCrop: { left: 0, top: 0, width: outputWidth, height: 100 }, sourceHead: { width: 10, height: 10 },
    targetHead: { x: 0, y: 0, width: 10, height: 10, rotation: 0 },
    layers: [{ id: 'front', textureId: 'texture', side: 'front', width: 10, height: 10, x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, flipX: false, phase: 0 }]
  }
}

function element(overrides: Record<string, unknown> = {}): SceneElement {
  return { id: 'actor', kind: 'character', assetId: 'direct', x: 1, y: 2, width: 30, height: 40, rotation: 5, flipX: false, ...overrides } as unknown as SceneElement
}

function indexFixture(overrides: Partial<MotionIndex> = {}): MotionIndex {
  return {
    hairRigs: new Map(),
    hairPoseRigs: new Map(),
    expressionOnlyPlansByElement: new Map(),
    hairTransitionIndex: { get: vi.fn(() => undefined) },
    hairPoseReactionEnds: new Map(),
    hairRigForElement: () => undefined,
    transitionForFrame: () => undefined,
    ...overrides
  } as unknown as MotionIndex
}

describe('createEditorV6ExportHairRigAtFrame', () => {
  it('returns the rig matching the authored asset and leaves elements without a match unresolved', () => {
    const directRig = rig('direct', 120)
    const { hairRigAtFrame } = createEditorV6ExportHairRigAtFrame(indexFixture({ hairRigs: new Map([['actor:direct', directRig]]) } as Partial<MotionIndex>))
    const actor = element()

    expect(hairRigAtFrame(actor, 7)).toEqual({ rig: directRig, element: actor })
    expect(hairRigAtFrame(element({ assetId: 'missing' }), 7)).toBeUndefined()
  })

  it('prefers a prepared transition and combines its interpolated rig with atlas geometry', () => {
    const from = rig('from', 100)
    const to = rig('to', 200)
    const expressionPlan = { startFrame: 1, endFrame: 9, from: { ...element(), assetId: 'expression', poseSlot: 2 } } as unknown as MotionPlan
    const transition = { from, to, fromElement: element(), toElement: element({ assetId: 'to' }) }
    const atlasFrame = { crop: { left: 3, top: 4, width: 50, height: 60 }, x: 12, y: 13, width: 14, height: 15, rotation: 16, flipX: true }
    const planIndex = indexFixture({
      hairRigs: new Map([['actor:direct', rig('direct', 120)], ['actor:expression', rig('expression', 130)]]),
      expressionOnlyPlansByElement: new Map([['actor', [expressionPlan]]]),
      hairTransitionIndex: { get: vi.fn(() => ({ transition, poseSample: { progress: 1 }, atlasFrame })) }
    })
    const { hairRigAtFrame } = createEditorV6ExportHairRigAtFrame(planIndex)
    const result = hairRigAtFrame(element({ motionSprite: {} }), 5)

    expect(result?.rig.outputWidth).toBe(200)
    expect(result?.crop).toBe(atlasFrame.crop)
    expect(result?.element).toMatchObject({ x: 12, y: 13, width: 14, height: 15, rotation: 16, flipX: true })
    expect(planIndex.hairTransitionIndex.get).toHaveBeenCalledWith('actor', 5)
  })

  it('uses an in-flight face-only plan rig and falls back to the authored asset at its boundaries', () => {
    const expressionElement = element({ assetId: undefined, poseSlot: 2 })
    const expressionPlan = { startFrame: 1, endFrame: 9, from: expressionElement } as unknown as MotionPlan
    const poseRig = rig('pose', 180)
    const directRig = rig('direct', 120)
    const { hairRigAtFrame } = createEditorV6ExportHairRigAtFrame(indexFixture({
      hairRigs: new Map([['actor:direct', directRig]]),
      hairPoseRigs: new Map([['actor:2', poseRig]]),
      expressionOnlyPlansByElement: new Map([['actor', [expressionPlan]]])
    } as Partial<MotionIndex>))

    const inFlight = hairRigAtFrame(element({ motionSprite: {} }), 5)
    const atBoundary = hairRigAtFrame(element({ motionSprite: {} }), 1)

    expect(inFlight).toEqual({ rig: poseRig, element: expressionElement })
    expect(atBoundary).toEqual({ rig: directRig, element: expect.objectContaining({ assetId: 'direct' }) })
  })
})
