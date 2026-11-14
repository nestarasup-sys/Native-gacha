import { describe, expect, it } from 'vitest'
import type { EditorV6Document, EditorV6Timeline } from '../../src/shared/editorV6'
import type { EditorV6ExportMouthLoops } from '../../src/shared/editorV6Export'
import type { EditorV6MotionFrame } from '../../src/shared/editorV6Motion'
import { editorV6FaceModeAtFrame, isEditorV6BlinkFrame } from '../../src/shared/editorV6FaceSchedule'
import type { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import { createEditorV6ExportMouthLoopResolver } from '../../src/renderer/src/features/editorV6/exportMouthLoop'

type Scene = ReturnType<typeof resolveEditorV6SceneAtFrame>

function project(): Pick<EditorV6Document, 'id' | 'timeline'> {
  const timeline = {
    fps: 30,
    durationFrames: 300,
    knownElementIds: ['actor'],
    tracks: [
      { id: 'character-track', kind: 'character', characterId: 'character', name: 'Personagem', muted: false, locked: false, blocks: [{ id: 'character-block', elementId: 'actor', label: 'Personagem', startFrame: 0, durationFrames: 300 }] },
      { id: 'speech-track', kind: 'speech', name: 'Fala', muted: false, locked: false, blocks: [{ id: 'speech-block', elementId: 'speech', characterId: 'character', label: 'Fala', startFrame: 0, durationFrames: 300 }] }
    ]
  } as unknown as EditorV6Timeline
  return { id: 'project', timeline }
}

function mouthLoops(overrides: Partial<EditorV6ExportMouthLoops['states'][number]> = {}): EditorV6ExportMouthLoops {
  const facePatch = { sprite: {} as EditorV6MotionFrame['sprite'], x: 0.1, y: 0.2, width: 0.3, height: 0.1 }
  const frames = [0, 1, 2].map(offset => ({ offset, sprite: {} as EditorV6MotionFrame['sprite'], x: 0, y: 0, width: 1, height: 1, rotation: 0, flipX: false, ...(offset === 2 ? { facePatch } : {}) }))
  return {
    startFrame: 0,
    cycleFrames: 30,
    states: [{ elementId: 'actor', characterId: 'character', blockIds: ['character-block'], assetId: 'mouth-atlas', sourceAssetId: 'mouthless-source', baseAssetIds: { talk: 'talk-base', 'talk-blink': 'talk-blink-base' }, baseSourceAssetIds: { talk: 'talk-source', 'talk-blink': 'talk-blink-source' }, facePatchSourceCrop: { left: 3, top: 4, width: 80, height: 90 }, frames, ...overrides }]
  }
}

function scene(elementOverrides: Record<string, unknown> = {}): Scene {
  return { elements: [{ id: 'actor', kind: 'character', characterId: 'character', text: 'Ayla', assetId: 'talk-base', ...elementOverrides }] } as unknown as Scene
}

describe('createEditorV6ExportMouthLoopResolver', () => {
  it('maps mouthless base assets to their source for hair-rig lookup', () => {
    const resolver = createEditorV6ExportMouthLoopResolver(project(), mouthLoops())

    expect(resolver.hairSourceAssetId({ assetId: 'talk-base' })).toBe('talk-source')
    expect(resolver.hairSourceAssetId({ assetId: 'talk-blink-base' })).toBe('talk-blink-source')
    expect(resolver.hairSourceAssetId({ assetId: 'unrelated' })).toBe('unrelated')
    expect(resolver.facePatchSourceCrop('mouth-atlas')).toEqual({ left: 3, top: 4, width: 80, height: 90 })
  })

  it('applies the selected speaking sample and matching mouthless base asset', () => {
    const doc = project()
    const resolver = createEditorV6ExportMouthLoopResolver(doc, mouthLoops())
    const result = resolver.applyMouthLoop(scene(), 15)
    const faceMode = editorV6FaceModeAtFrame(doc.id, doc.timeline, 'character', 15)

    expect(result.elements[0]).toMatchObject({
      assetId: faceMode === 'talk-blink' ? 'talk-blink-base' : 'talk-base',
      mouthPatch: { assetId: 'mouth-atlas', x: 0.1, y: 0.2, width: 0.3, height: 0.1 }
    })
  })

  it('keeps the baked pose/expression face static without requiring extra mouth patches', () => {
    const resolver = createEditorV6ExportMouthLoopResolver(project(), mouthLoops())
    const unchanged = scene()
    expect(resolver.applyMouthLoop(unchanged, 300).elements[0]).toBe(unchanged.elements[0])
    const moving = scene({ motionSprite: { x: 0, y: 0, width: 1, height: 1, atlasWidth: 1, atlasHeight: 1 } })
    expect(resolver.applyMouthLoop(moving, 15).elements[0]).toBe(moving.elements[0])
  })

  it('holds the 1x mouth with eyes open while the rear hair settles, then resumes the cycle', () => {
    const doc = project()
    const blink = Array.from({ length: 300 }, (_, frame) => frame).find(frame =>
      frame > 0 && isEditorV6BlinkFrame(doc.id, 'character', frame))!
    const atlas = mouthLoops()
    const referencePatch = atlas.states[0].frames[2].facePatch!
    atlas.states[0].frames = atlas.states[0].frames.map((item, index) => ({
      ...item, facePatch: { ...referencePatch, x: index / 10 + 0.1 }
    }))
    const resolver = createEditorV6ExportMouthLoopResolver(doc, atlas, new Map([['actor', [blink - 1]]]))
    const during = resolver.applyMouthLoop(scene({ assetId: 'talk-blink-source' }), blink).elements[0]
    expect(during.assetId).toBe('talk-base')
    expect(during.mouthPatch).toMatchObject({ assetId: 'mouth-atlas', x: 0.1 })
    const after = resolver.applyMouthLoop(scene(), blink + 30).elements[0]
    expect(after.mouthPatch).toBeDefined()
  })

  it('suspends idle blinking during the hair reaction, without mutating the timeline', () => {
    const doc = { ...project(), elements: [{ id: 'actor', kind: 'character', assetId: 'idle-base' }] } as unknown as EditorV6Document
    doc.timeline.tracks.find(track => track.kind === 'speech')!.blocks = []
    const blink = Array.from({ length: 300 }, (_, frame) => frame).find(frame =>
      frame > 0 && isEditorV6BlinkFrame(doc.id, 'character', frame))!
    const resolver = createEditorV6ExportMouthLoopResolver(doc, mouthLoops(), new Map([['actor', [blink - 1]]]))
    expect(resolver.applyMouthLoop(scene({ assetId: 'blink-source' }), blink).elements[0].assetId).toBe('idle-base')
    expect(resolver.applyMouthLoop(scene({ assetId: 'blink-source' }), blink + 30).elements[0].assetId).toBe('blink-source')
  })
})
