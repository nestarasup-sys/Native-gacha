import { expect, it } from 'vitest'
import { createEditorV6Timeline, type EditorV6Document, type EditorV6Element } from '../../src/shared/editorV6'
import { exportEditorV6React } from '../../src/shared/editorV6ReactExport'
import { parseEditorV6ReactImport, secondsToFrame } from '../../src/shared/editorV6ReactImport'

it('exports cast, speech and pose changes as editable react JSON with exact frame times', () => {
  const characterId = crypto.randomUUID(), elementId = crypto.randomUUID()
  const actor: EditorV6Element = { id: elementId, characterId, kind: 'character', text: 'Alice', x: -20, y: 10, width: 20, height: 50, rotation: 0, zIndex: 1, characterScale: 121, poseSlot: 1 }
  const speech: EditorV6Element = { id: crypto.randomUUID(), kind: 'speech', characterId, text: 'Olá', x: -20, y: -10, width: 30, height: 17, rotation: 0, zIndex: 2 }
  const timeline = createEditorV6Timeline([actor, speech])
  const characterTrack = timeline.tracks.find(track => track.kind === 'character')!
  characterTrack.characterId = characterId
  characterTrack.blocks = [{ id: crypto.randomUUID(), label: 'Alice', startFrame: 0, durationFrames: 100, state: actor }, { id: crypto.randomUUID(), label: 'Alice', startFrame: 100, durationFrames: 100, state: { ...actor, poseSlot: 2 } }]
  const speechTrack = timeline.tracks.find(track => track.kind === 'speech')!
  speechTrack.blocks = [{ id: crypto.randomUUID(), label: 'Olá', elementId: speech.id, characterId, state: speech, startFrame: 31, durationFrames: 90 }]
  const now = new Date().toISOString()
  const project: EditorV6Document = { schemaVersion: 1, id: crypto.randomUUID(), title: 'Teste', color: '#ffffff', createdAt: now, updatedAt: now, backgroundColor: '#ffffff', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, elements: [actor, speech], assets: [], timeline }
  const result = exportEditorV6React(project)
  expect(parseEditorV6ReactImport(result.data)).toEqual(result.data)
  expect(result.data.cast[0].character).toBe(characterId)
  expect(result.data.lines[0].text).toBe('Olá')
  expect(secondsToFrame(result.data.lines[0].startSeconds)).toBe(31)
  expect(result.data.beats[0].poseSlot).toBe(2)
  expect(secondsToFrame(result.data.beats[0].startSeconds)).toBe(100)
  expect(JSON.stringify(result.data)).not.toContain('base64')
})
