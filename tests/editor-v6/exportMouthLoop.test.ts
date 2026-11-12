import { describe, expect, it } from 'vitest'
import type { EditorV6Document, EditorV6Timeline } from '../../src/shared/editorV6'
import type { EditorV6ExportMouthLoops } from '../../src/shared/editorV6Export'
import type { EditorV6MotionFrame } from '../../src/shared/editorV6Motion'
import { editorV6FaceModeAtFrame } from '../../src/shared/editorV6FaceSchedule'
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
    states: [{ elementId: 'actor', characterId: 'character', blockIds: ['character-block'], assetId: 'mouth-atlas', sourceAssetId: 'mouthless-source', baseAssetIds: { talk: 'talk-base', 'talk-blink': 'talk-blink-base' }, facePatchSourceCrop: { left: 3, top: 4, width: 80, height: 90 }, frames, ...overrides }]
  }
}

function scene(elementOverrides: Record<string, unknown> = {}): Scene {
  return { elements: [{ id: 'actor', kind: 'character', characterId: 'character', text: 'Ayla', assetId: 'talk-base', ...elementOverrides }] } as unknown as Scene
}

describe('createEditorV6ExportMouthLoopResolver', () => {
  it('maps mouthless base assets to their source for hair-rig lookup', () => {
    const resolver = createEditorV6ExportMouthLoopResolver(project(), mouthLoops())

    expect(resolver.hairSourceAssetId({ assetId: 'talk-base' })).toBe('mouthless-source')
    expect(resolver.hairSourceAssetId({ assetId: 'talk-blink-base' })).toBe('mouthless-source')
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

  it('leaves non-speaking characters untouched and rejects missing transition face data', () => {
    const resolver = createEditorV6ExportMouthLoopResolver(project(), mouthLoops())
    const unchanged = scene()
    expect(resolver.applyMouthLoop(unchanged, 300).elements[0]).toBe(unchanged.elements[0])

    const transitionResolver = createEditorV6ExportMouthLoopResolver(project(), mouthLoops())
    expect(() => transitionResolver.applyMouthLoop(scene({ motionSprite: {} }), 15)).toThrow(/camada facial preparada/)
  })
})
