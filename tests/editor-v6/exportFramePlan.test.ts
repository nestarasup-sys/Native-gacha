import { describe, expect, it } from 'vitest'
import type { EditorV6SceneElement } from '../../src/shared/editorV6'
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
  it('activates hair and includes the frame in both visual keys only on foreground captures', () => {
    const frameScene = scene([actor()])
    const backgroundPlan = resolveEditorV6ExportFramePlan({ ...common, scene: frameScene, frame: 10, requestedLayer: 'background', hairAnimation: { poseReactionOnly: false } })
    const foregroundPlan = resolveEditorV6ExportFramePlan({ ...common, scene: frameScene, frame: 10, requestedLayer: 'foreground', hairAnimation: { poseReactionOnly: false } })

    expect(backgroundPlan).toMatchObject({ activeLayer: 'background', activeHair: false, hairNeedsFrame: false })
    expect(foregroundPlan).toMatchObject({ activeLayer: 'foreground', activeHair: true, hairNeedsFrame: true })
    expect(foregroundPlan.key).not.toBe(resolveEditorV6ExportFramePlan({ ...common, scene: frameScene, frame: 11, requestedLayer: 'foreground', hairAnimation: { poseReactionOnly: false } }).key)
    expect(foregroundPlan.layerKeys.foreground).not.toBe(backgroundPlan.layerKeys.foreground)
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

  it('does not include the media video in scene cache keys', () => {
    const withMedia = { ...scene([actor()]), mediaVideo: { blockId: 'video-1', mediaId: 'media-1', url: 'local://video', layout: { x: 0, y: 0, width: 100, height: 100, rotation: 0 }, startFrame: 0, sourceInFrame: 0, durationFrames: 60, hasAudio: false, audioEnabled: true, gain: 1 } }
    const withoutMedia = scene([actor()])
    const videoPlan = resolveEditorV6ExportFramePlan({ ...common, scene: withMedia, frame: 20 })
    const stillPlan = resolveEditorV6ExportFramePlan({ ...common, scene: withoutMedia, frame: 20 })

    expect(videoPlan.key).toBe(stillPlan.key)
    expect(videoPlan.layerKeys).toEqual(stillPlan.layerKeys)
  })
})
