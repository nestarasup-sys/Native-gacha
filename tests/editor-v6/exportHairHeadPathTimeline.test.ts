import { describe, expect, it, vi } from 'vitest'
import type { EditorV6Element } from '../../src/shared/editorV6'
import type { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import type { EditorV6HairMotionRig } from '../../src/shared/editorV6HairMotion'
import { createEditorV6HairHeadPathTimeline } from '../../src/renderer/src/features/editorV6/exportHairHeadPathTimeline'

type Scene = ReturnType<typeof resolveEditorV6SceneAtFrame>
type SceneElement = Scene['elements'][number]

function sceneAt(x: number, includeCharacter = true): Scene {
  return {
    elements: includeCharacter
      ? [{ id: 'actor', kind: 'character', x, y: 0, width: 100, height: 100, rotation: 0, flipX: false } as SceneElement]
      : []
  } as Scene
}

function rigWithFlip(flipX: boolean): EditorV6HairMotionRig {
  return {
    elementId: 'actor',
    assetId: 'asset',
    characterId: 'character',
    poseSlot: null,
    baseSurfaceId: 'base',
    faceSurfaceId: 'face',
    overlaySurfaceId: null,
    artworkWidth: 100,
    artworkHeight: 100,
    outputWidth: 100,
    outputHeight: 100,
    shapeScaleX: 1,
    shapeScaleY: 1,
    sourceCrop: { left: 0, top: 0, width: 100, height: 100 },
    sourceHead: { width: 100, height: 100 },
    targetHead: { x: 0, y: 0, width: 100, height: 100, rotation: 0 },
    layers: [{ id: 'strand', flipX }]
  } as EditorV6HairMotionRig
}

describe('createEditorV6HairHeadPathTimeline', () => {
  it('accumulates head movement from resolved scenes and grows the frame cache once', () => {
    const resolveScene = vi.fn((frame: number) => sceneAt(frame * 10))
    const timeline = createEditorV6HairHeadPathTimeline({
      animatedElementIds: ['actor'],
      hasHairAnimation: true,
      resolveScene,
      getTransitionSample: () => undefined,
      hairRigAtFrame: () => undefined
    })

    expect(timeline.headXAtFrame('actor', 0)).toBe(0)
    expect(timeline.headXAtFrame('actor', 2)).toBeCloseTo(0.2)
    expect(timeline.headXAtFrame('actor', 1)).toBeCloseTo(0.1)
    expect(resolveScene).toHaveBeenCalledTimes(3)
  })

  it('keeps the last path while the actor is absent and resumes from its last physical point', () => {
    const frames = [sceneAt(0), sceneAt(10, false), sceneAt(20)]
    const timeline = createEditorV6HairHeadPathTimeline({
      animatedElementIds: ['actor'],
      hasHairAnimation: true,
      resolveScene: frame => frames[frame],
      getTransitionSample: () => undefined,
      hairRigAtFrame: () => undefined
    })

    expect(timeline.headXAtFrame('actor', 1)).toBe(0)
    expect(timeline.headXAtFrame('actor', 2)).toBeCloseTo(0.2)
  })

  it('uses physical transition geometry rather than the currently resolved raster element', () => {
    const fromElement = { id: 'actor', kind: 'character', x: 0, y: 0, width: 100, height: 100, rotation: 0, flipX: false } as EditorV6Element
    const toElement = { ...fromElement, x: 20 }
    const physicsRig = rigWithFlip(false)
    const timeline = createEditorV6HairHeadPathTimeline({
      animatedElementIds: ['actor'],
      hasHairAnimation: true,
      resolveScene: () => sceneAt(0),
      getTransitionSample: (_elementId, frame) => frame === 1
        ? { transition: { fromElement, toElement, physicsFrom: physicsRig, physicsTo: physicsRig }, poseSample: { progress: 1 } }
        : undefined,
      hairRigAtFrame: () => undefined
    })

    expect(timeline.headXAtFrame('actor', 1)).toBeCloseTo(0.2)
  })

  it('indexes per-layer flip changes and preserves fallback before the first indexed frame', () => {
    const timeline = createEditorV6HairHeadPathTimeline({
      animatedElementIds: ['actor'],
      hasHairAnimation: true,
      resolveScene: frame => sceneAt(0),
      getTransitionSample: () => undefined,
      hairRigAtFrame: (element, frame) => frame < 2
        ? undefined
        : { rig: rigWithFlip(frame < 4), element }
    })

    timeline.headXAtFrame('actor', 4)
    expect(timeline.pieceFlipXAtFrame('actor', 'strand', 1, true)).toBe(true)
    expect(timeline.pieceFlipXAtFrame('actor', 'strand', 2, false)).toBe(true)
    expect(timeline.pieceFlipXAtFrame('actor', 'strand', 3, false)).toBe(true)
    expect(timeline.pieceFlipXAtFrame('actor', 'strand', 4, true)).toBe(false)
    expect(timeline.pieceFlipXAtFrame('actor', 'unknown', 4, true)).toBe(true)
  })
})
