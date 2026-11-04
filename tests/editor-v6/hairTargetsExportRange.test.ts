import { describe, expect, it } from 'vitest'
import type { EditorV6Document, EditorV6Element } from '../../src/shared/editorV6'
import { collectEditorV6HairMotionTargets, selectEditorV6HairTargetStates } from '../../src/renderer/src/features/editorV6/editorV6HairMotionPreparation'

const makeState = (assetId: string, poseSlot: number): EditorV6Element => ({
  id: 'actor', kind: 'character', characterId: 'hero', assetId,
  poseSlot, text: 'hero', x: 0, y: 0, width: 20, height: 30, rotation: 0,
  zIndex: 1
} as EditorV6Element)
function project(): EditorV6Document {
  const states = [makeState('old', 1), makeState('middle', 2), makeState('later', 3)]
  return {
    id: 'range-targets', elements: [makeState('base', 0)],
    timeline: {
      durationFrames: 300,
      tracks: [{
        id: 'character-track', kind: 'character', characterId: 'hero',
        name: 'Hero', muted: false, locked: false, blocks: [
          { id: 'late', label: 'late', elementId: 'actor', startFrame: 200, durationFrames: 1, state: states[2] },
          { id: 'early', label: 'early', elementId: 'actor', startFrame: 0, durationFrames: 1, state: states[0] },
          { id: 'mid', label: 'mid', elementId: 'actor', startFrame: 100, durationFrames: 1, state: states[1] }
        ]
      }, {
        id: 'object-track', kind: 'object', name: 'Props', muted: false, locked: false, blocks: [
          { id: 'far', label: 'far', elementId: 'decoration', startFrame: 250, durationFrames: 25, state: makeState('far-away', 4) },
          { id: 'near', label: 'near', elementId: 'decoration', startFrame: 120, durationFrames: 10, state: makeState('short', 5) }
        ]
      }]
    }
  } as unknown as EditorV6Document
}
describe('R26: bounded hair targets for first export', () => {
  it('preserves all original targets for the legacy unscoped caller', () => {
    const original = project()
    const before = JSON.stringify(original)
    expect(selectEditorV6HairTargetStates(original).map(x => x.assetId))
      .toEqual(['base', 'late', 'old', 'middle', 'far-away', 'short'])
    expect(JSON.stringify(original)).toBe(before)
  })
  it('drops far-outside portraits but keeps a character pose held past its stored duration', () => {
    const original = project()
    const result = selectEditorV6HairTargetStates(original, { startFrame: 150, endFrame: 180 })
    expect(result.map(x => x.assetId)).toEqual(['base', 'middle'])
    const targets = collectEditorV6HairMotionTargets(original, { startFrame: 150, endFrame: 180 })
    expect(targets.map(x => x.assetId)).toEqual(['base', 'middle'])
  })
  it('keeps the pose BEFORE a transition that ends during the export window', () => {
    const result = selectEditorV6HairTargetStates(project(), { startFrame: 197, endFrame: 205 })
    expect(result.map(x => x.assetId)).toEqual(['base', 'middle', 'later'])
  })
  it('uses half-open windows for short object clips and avoids unrelated future poses', () => {
    const a = selectEditorV6HairTargetStates(project(), { startFrame: 130, endFrame: 150 })
    expect(a.map(x => x.assetId)).toEqual(['base', 'middle'])
    const b = selectEditorV6HairTargetStates(project(), { startFrame: 120, endFrame: 130 })
    expect(b.map(x => x.assetId)).toEqual(['base', 'middle', 'short'])
    expect(selectEditorV6HairTargetStates(project(), { startFrame: 240, endFrame: 245 }).map(x => x.assetId))
      .toEqual(['base', 'later'])
  })
})
