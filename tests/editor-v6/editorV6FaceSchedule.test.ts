import { describe, expect, it } from 'vitest'
import type { EditorV6Timeline } from '../../src/shared/editorV6'
import { hasEditorV6CharacterSpeechOverlap, isEditorV6CharacterSpeakingAtFrame } from '../../src/shared/editorV6FaceSchedule'

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
})
