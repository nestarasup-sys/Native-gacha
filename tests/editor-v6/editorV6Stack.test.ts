import { describe, expect, it } from 'vitest'
import { editorV6DocumentSchema } from '../../src/shared/editorV6Schema'
import { useEditorV6Store } from '../../src/renderer/src/features/editorV6/editorV6Store'
import { createEditorV6Timeline, type EditorV6Document } from '../../src/shared/editorV6'

const document = (): EditorV6Document => ({
  schemaVersion: 1,
  id: '4caa73f0-50f7-4fe8-99ee-e741ce719134',
  title: 'Cena de teste',
  color: '#d7b5cd',
  createdAt: '2026-10-25T12:00:00.000Z',
  updatedAt: '2026-10-25T12:00:00.000Z',
  backgroundColor: '#d7b5cd',
  backgroundAssetId: null,
  backgroundX: 0,
  backgroundY: 0,
  backgroundWidth: 100,
  backgroundHeight: 100,
  backgroundRotation: 0,
  assets: [],
  elements: [],
  timeline: createEditorV6Timeline()
})

describe('base de arquitetura do Editor V6', () => {
  it('valida projetos e rejeita referências quebradas', () => {
    const valid = document()
    expect(editorV6DocumentSchema.safeParse(valid).success).toBe(true)
    expect(editorV6DocumentSchema.safeParse({ ...valid, backgroundAssetId: 'missing' }).success).toBe(false)
    const track = valid.timeline.tracks[0]
    const brokenBlock = { id: crypto.randomUUID(), elementId: crypto.randomUUID(), label: 'Bloco órfão', startFrame: 0, durationFrames: 30 }
    const invalidTimeline = { ...valid, timeline: { ...valid.timeline, tracks: valid.timeline.tracks.map((item) => item.id === track.id ? { ...item, blocks: [brokenBlock] } : item) } }
    expect(editorV6DocumentSchema.safeParse(invalidTimeline).success).toBe(false)
  })

  it('mantém desfazer e refazer isolados por projeto', () => {
    const store = useEditorV6Store.getState()
    store.clear(document().id)
    const initial = document()
    const element = { id: '7caa73f0-50f7-4fe8-99ee-e741ce719135', kind: 'speech' as const, text: 'oi', x: 0, y: 0, width: 20, height: 10, rotation: 0, zIndex: 1 }
    const edited = {
      ...initial,
      elements: [element],
      timeline: { ...initial.timeline, tracks: initial.timeline.tracks.map((track) => track.kind === 'speech'
        ? { ...track, blocks: [{ id: crypto.randomUUID(), elementId: element.id, label: 'oi', startFrame: 30, durationFrames: 60 }] }
        : track) }
    }
    store.record(initial.id, initial)
    const undone = store.undo(initial.id, edited)
    expect(undone?.elements).toEqual(initial.elements)
    expect(undone?.timeline).toEqual(initial.timeline)
    expect(useEditorV6Store.getState().histories[initial.id]?.redo).toHaveLength(1)
    const redone = store.redo(initial.id, initial)
    expect(redone?.elements).toEqual(edited.elements)
    expect(redone?.timeline).toEqual(edited.timeline)
    expect(useEditorV6Store.getState().histories['another-project']).toBeUndefined()
    store.clear(initial.id)
  })
})
