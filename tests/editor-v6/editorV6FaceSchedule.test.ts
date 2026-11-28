import { editorV6BlinkEventAtFrame } from '../../src/shared/editorV6FaceSchedule'
import { describe, expect, it } from 'vitest'
import { resolveEditorV6SceneAtFrame } from '../../src/shared/editorV6TimelineScene'
import type { EditorV6Document, EditorV6Timeline } from '../../src/shared/editorV6'
import { editorV6FaceModeAtFrame, hasEditorV6CharacterSpeechOverlap, isEditorV6CharacterSpeakingAtFrame } from '../../src/shared/editorV6FaceSchedule'

function timeline(): EditorV6Timeline {
  return { fps: 30, durationFrames: 300, tracks: [{
    id: 'speech', kind: 'speech', name: 'Fala', muted: false, locked: false,
    blocks: [[0, 100], [10, 10], [20, 15], [100, 10], [150, 5]].map(([startFrame, durationFrames], index) => ({
      id: String(index), label: 'Fala', characterId: 'alice', startFrame, durationFrames
    }))
  }] }
}

describe('speech interval index', () => {
  it('matches the union of overlapping, nested and adjacent balloons at every frame', () => {
    const source = timeline(), before = structuredClone(source)
    for (let frame = -1; frame <= 300; frame++) {
      const expected = source.tracks[0].blocks.some(block => frame >= block.startFrame && frame < block.startFrame + block.durationFrames)
      expect(isEditorV6CharacterSpeakingAtFrame(source, 'alice', frame), `frame ${frame}`).toBe(expected)
      expect(isEditorV6CharacterSpeakingAtFrame(source, 'bob', frame)).toBe(false)
    }
    expect(source).toEqual(before)
  })

  it('ignores hidden and muted tracks and rebuilds the index for a new timeline', () => {
    const source = timeline()
    expect(isEditorV6CharacterSpeakingAtFrame(source, 'alice', 50)).toBe(true)
    for (const patch of [{ hidden: true }, { muted: true }]) {
      const changed = { ...source, tracks: source.tracks.map(track => ({ ...track, ...patch })) }
      expect(isEditorV6CharacterSpeakingAtFrame(changed, 'alice', 50)).toBe(false)
    }
  })

  it('uses the merged interval index for range overlap, including nested and adjacent balloons', () => {
    const source = timeline()
    expect(hasEditorV6CharacterSpeechOverlap(source, 'alice', 90, 110)).toBe(true)
    expect(hasEditorV6CharacterSpeechOverlap(source, 'alice', 110, 150)).toBe(false)
    expect(hasEditorV6CharacterSpeechOverlap(source, 'alice', 115, 151)).toBe(true)
    expect(hasEditorV6CharacterSpeechOverlap(source, 'alice', 0, 0)).toBe(false)
    expect(hasEditorV6CharacterSpeechOverlap(source, 'bob', 0, 300)).toBe(false)
  })

  it('desativa o modo de fala sem desligar piscadas automáticas', () => {
    const source = timeline()
    const blinkFrame = Array.from({ length: 300 }, (_, frame) => frame).find(frame => Boolean(editorV6BlinkEventAtFrame('project', frame)))!
    const nonBlinkFrame = Array.from({ length: 300 }, (_, frame) => frame).find(frame => !Boolean(editorV6BlinkEventAtFrame('project', frame)))!

    expect(editorV6FaceModeAtFrame(source, 'alice', nonBlinkFrame)).toBe('talk')
    expect(editorV6FaceModeAtFrame(source, 'alice', nonBlinkFrame, { includeSpeechMouth: false })).toBeUndefined()
    expect(editorV6FaceModeAtFrame(source, 'alice', blinkFrame, { blinking: true })).toBe('talk-blink')
    expect(editorV6FaceModeAtFrame(source, 'alice', blinkFrame, { includeSpeechMouth: false, blinking: true })).toBe('blink')
  })
})


describe('piscada global', () => {
  it('sorteia um único personagem visível por evento, com reposição e busca determinística', () => {
    const actors = Array.from({ length: 5 }, (_, index) => ({
      id: 'actor-' + index, characterId: 'character-' + index, kind: 'character' as const,
      assetId: 'idle', faceModeAssetIds: { blink: 'closed' }, text: '', x: index, y: 0,
      width: 10, height: 10, rotation: 0, zIndex: index, visible: index !== 4
    }))
    const project = {
      id: 'global-blink-regression', elements: actors,
      timeline: { ...timeline(), tracks: [], durationFrames: 6000 }
    } as EditorV6Document
    const reloaded = structuredClone(project)
    const events: Array<{ frame: number; id: string }> = []
    for (let frame = 0; frame < project.timeline.durationFrames; frame++) {
      const event = editorV6BlinkEventAtFrame(project.id, frame)
      const scene = resolveEditorV6SceneAtFrame(project, frame)
      const closed = scene.elements.filter(item => item.assetId === 'closed')
      expect(closed.length).toBe(event ? 1 : 0)
      if (event?.start === frame) {
        const delta = frame - (events.at(-1)?.frame ?? 0)
        expect(delta).toBeGreaterThanOrEqual(75)
        expect(delta).toBeLessThanOrEqual(105)
        events.push({ frame, id: closed[0].id })
      }
    }
    expect(new Set(events.map(event => event.id))).toEqual(new Set(actors.slice(0, 4).map(actor => actor.id)))
    expect(events.some((event, index) => event.id === events[index - 1]?.id)).toBe(true)
    for (const { frame, id } of events.reverse()) {
      expect(resolveEditorV6SceneAtFrame(reloaded, frame + 2, { includeVideo: false }).blinkElementId).toBe(id)
      expect(resolveEditorV6SceneAtFrame(reloaded, frame - 1).blinkElementId).toBeUndefined()
    }
  })
})
