import { describe, expect, it, vi } from 'vitest'
import type { EditorV6SceneElement } from '../../src/shared/editorV6'
import { createEditorV6ExportFrameVisualKeyCache, editorV6LayerVisualKeys, editorV6VisualKey, editorV6VisualKeys, editorV6CompleteVisualKeys } from '../../src/shared/editorV6Export'
import type { EditorV6ResolvedScene } from '../../src/shared/editorV6TimelineScene'
import { resolveEditorV6ExportFramePlan } from '../../src/renderer/src/features/editorV6/exportFramePlan'

const background = {
  backgroundColor: '#101010', backgroundAssetId: null,
  backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0
}
const actor = (overrides: Partial<EditorV6SceneElement> = {}): EditorV6SceneElement => ({
  id: 'actor-1', kind: 'character', text: 'A', x: 50, y: 50, width: 20, height: 40, rotation: 0, zIndex: 1,
  ...overrides
})
const scene = (elements: EditorV6SceneElement[] = [], frame = 10): EditorV6ResolvedScene => ({ frame, background, elements })
const common = {
  layeredVideo: true,
  hairPoseReactionEnds: new Map<string, number[]>(),
  hasAnimatedHair: (element: EditorV6SceneElement) => element.id === 'actor-1'
}

describe('resolveEditorV6ExportFramePlan', () => {
  it('builds full-frame and layer reuse keys from the same visual projection', () => {
    const frameScene = {
      ...scene([actor({ mouthPatch: { assetId: 'mouth', x: 0.2, y: 0.3, width: 0.1, height: 0.1 } })]),
      frame: 42,
      hairAnimationFrame: 42,
      mediaVideo: { mediaId: 'video-1', startFrame: 12, sourceInFrame: 7, layout: { x: 1, y: 2, width: 80, height: 90, rotation: 5 } }
    } as Parameters<typeof editorV6VisualKeys>[0]

    expect(editorV6VisualKeys(frameScene)).toEqual({
      key: editorV6VisualKey(frameScene),
      layerKeys: editorV6LayerVisualKeys(frameScene)
    })
  })

  it('keeps the existing key representation when video has no active frame or no clip exists', () => {
    const noClip = scene([actor()], 42)
    const inactiveClip = {
      ...scene([actor({ mouthPatch: { assetId: 'mouth', x: 0.1, y: 0.2, width: 0.3, height: 0.4 } })]),
      frame: undefined,
      mediaVideo: { mediaId: 'video-1', startFrame: 12, sourceInFrame: 7, layout: { x: 1, y: 2, width: 80, height: 90, rotation: 5 } }
    } as unknown as Parameters<typeof editorV6VisualKeys>[0]

    for (const input of [noClip, inactiveClip]) {
      expect(editorV6VisualKeys(input)).toEqual({
        key: editorV6VisualKey(input),
        layerKeys: editorV6LayerVisualKeys(input)
      })
    }
  })

  it('preserves compact and complete keys when reusing serialized immutable scene elements', () => {
    const firstElement = actor({ activeExpressionEffects: [{ id: 'spark', intensity: 40 }] })
    const frameScene = scene([firstElement])
    const cache = createEditorV6ExportFrameVisualKeyCache()

    expect(editorV6VisualKeys(frameScene, cache)).toEqual(editorV6VisualKeys(frameScene))
    expect(editorV6CompleteVisualKeys(frameScene, cache)).toEqual(editorV6CompleteVisualKeys(frameScene))

    const changedFrameScene = scene([actor({ ...firstElement, text: 'Changed' })], 11)
    expect(editorV6VisualKeys(changedFrameScene, cache)).not.toEqual(editorV6VisualKeys(frameScene, cache))
    expect(editorV6CompleteVisualKeys(changedFrameScene, cache)).not.toEqual(editorV6CompleteVisualKeys(frameScene, cache))

    const changedBackgroundScene = { ...frameScene, background: { ...background, backgroundColor: '#202020' } }
    expect(editorV6VisualKeys(changedBackgroundScene, cache)).not.toEqual(editorV6VisualKeys(frameScene, cache))
    expect(editorV6CompleteVisualKeys(changedBackgroundScene, cache)).not.toEqual(editorV6CompleteVisualKeys(frameScene, cache))
  })

  it.each([
    ['balloon scale', actor({ kind: 'speech' }), actor({ kind: 'speech', balloonScalePercent: 125 })],
    ['balloon vertical offset', actor({ kind: 'thought' }), actor({ kind: 'thought', balloonOffsetY: -5 })],
    ['balloon translation', actor({ kind: 'thought', englishText: 'First' }), actor({ kind: 'thought', englishText: 'Second' })],
    ['balloon tail', actor({ kind: 'thought', speakerAnchorX: 7 }), actor({ kind: 'thought', speakerAnchorX: 12 })],
    ['linked speaker name', actor({ kind: 'speech' }), actor({ kind: 'speech', speakerName: 'Alice' })],
    ['linked speaker color', actor({ kind: 'speech' }), actor({ kind: 'speech', speakerColor: '#8C7BFF' })]
  ])('invalidates frame reuse when %s changes', (_field, before, after) => {
    const options = { ...common, requestedLayer: 'foreground' as const }
    const beforePlan = resolveEditorV6ExportFramePlan({ ...options, scene: scene([before]), frame: 10 })
    const afterPlan = resolveEditorV6ExportFramePlan({ ...options, scene: scene([after]), frame: 11 })

    expect(afterPlan.key).not.toBe(beforePlan.key)
    expect(afterPlan.layerKeys.foreground).not.toBe(beforePlan.layerKeys.foreground)
  })

  it('activates hair and includes the frame in both visual keys only on foreground captures', () => {
    const frameScene = scene([actor()])
    const backgroundPlan = resolveEditorV6ExportFramePlan({ ...common, scene: frameScene, frame: 10, requestedLayer: 'background', hairAnimation: { poseReactionOnly: false } })
    const foregroundPlan = resolveEditorV6ExportFramePlan({ ...common, scene: frameScene, frame: 10, requestedLayer: 'foreground', hairAnimation: { poseReactionOnly: false } })

    expect(backgroundPlan).toMatchObject({ activeLayer: 'background', activeHair: false, hairNeedsFrame: false })
    expect(foregroundPlan).toMatchObject({ activeLayer: 'foreground', activeHair: true, hairNeedsFrame: true })
    expect(foregroundPlan.key).not.toBe(resolveEditorV6ExportFramePlan({ ...common, scene: frameScene, frame: 11, requestedLayer: 'foreground', hairAnimation: { poseReactionOnly: false } }).key)
    expect(foregroundPlan.layerKeys.foreground).not.toBe(backgroundPlan.layerKeys.foreground)
    expect(foregroundPlan.riggedElementIds).toEqual(new Set(['actor-1']))
  })

  it('resolves rigged IDs in one pass and skips the scan when there is no hair bundle', () => {
    const frameScene = scene([actor(), actor({ id: 'actor-2' })])
    const hasAnimatedHair = vi.fn((element: EditorV6SceneElement) => element.id === 'actor-2')
    const plan = resolveEditorV6ExportFramePlan({
      ...common, layeredVideo: false, scene: frameScene, frame: 10,
      hairAnimation: { poseReactionOnly: false }, hasAnimatedHair
    })

    expect(plan.riggedElementIds).toEqual(new Set(['actor-2']))
    expect(hasAnimatedHair).toHaveBeenCalledTimes(frameScene.elements.length)

    const withoutHair = resolveEditorV6ExportFramePlan({ ...common, scene: frameScene, frame: 10, hairAnimation: undefined, hasAnimatedHair })
    expect(withoutHair.riggedElementIds).toEqual(new Set())
    expect(hasAnimatedHair).toHaveBeenCalledTimes(frameScene.elements.length)
  })

  it('adds frame motion only while a pose reaction is active and preserves complete scene identity at rest', () => {
    const resting = scene([actor({ text: 'A' })])
    const changedRestingScene = scene([actor({ text: 'B' })])
    const options = { ...common, requestedLayer: 'foreground' as const, hairAnimation: { poseReactionOnly: true }, hairPoseReactionEnds: new Map([['actor-1', [100]]]) }
    const atRest = resolveEditorV6ExportFramePlan({ ...options, scene: resting, frame: 130 })
    const changedAtRest = resolveEditorV6ExportFramePlan({ ...options, scene: changedRestingScene, frame: 130 })
    const reacting = resolveEditorV6ExportFramePlan({ ...options, scene: resting, frame: 101 })

    expect(atRest).toMatchObject({ activeHair: true, reacting: false, hairNeedsFrame: false })
    expect(atRest.key).not.toBe(changedAtRest.key)
    expect(atRest.layerKeys.foreground).not.toBe(changedAtRest.layerKeys.foreground)
    expect(reacting).toMatchObject({ activeHair: true, reacting: true, hairNeedsFrame: true })
    expect(reacting.key).not.toBe(atRest.key)
  })

  it('uses complete element state for pose-reaction cache keys', () => {
    const before = scene([actor({ characterCanvasWidth: 100 })])
    const after = scene([actor({ characterCanvasWidth: 140 })])
    const options = { ...common, requestedLayer: 'foreground' as const, hairAnimation: { poseReactionOnly: true }, hairPoseReactionEnds: new Map([['actor-1', [100]]]) }

    const beforeRest = resolveEditorV6ExportFramePlan({ ...options, scene: before, frame: 130 })
    const afterRest = resolveEditorV6ExportFramePlan({ ...options, scene: after, frame: 130 })

    expect(beforeRest.hairNeedsFrame).toBe(false)
    expect(afterRest.key).not.toBe(beforeRest.key)
    expect(afterRest.layerKeys.foreground).not.toBe(beforeRest.layerKeys.foreground)
  })

  it('does not include the media video in scene cache keys', () => {
    const withMedia = { ...scene([actor()]), mediaVideo: { blockId: 'video-1', mediaId: 'media-1', url: 'local://video', layout: { x: 0, y: 0, width: 100, height: 100, rotation: 0 }, startFrame: 0, sourceInFrame: 0, durationFrames: 60, hasAudio: false, audioEnabled: true, gain: 1 } }
    const withoutMedia = scene([actor()])
    const videoPlan = resolveEditorV6ExportFramePlan({ ...common, scene: withMedia, frame: 20 })
    const stillPlan = resolveEditorV6ExportFramePlan({ ...common, scene: withoutMedia, frame: 20 })

    expect(videoPlan.key).toBe(stillPlan.key)
    expect(videoPlan.layerKeys).toEqual(stillPlan.layerKeys)
  })
})
