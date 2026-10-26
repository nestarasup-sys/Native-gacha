import { describe, expect, it } from 'vitest'
import { editorV6DocumentSchema } from '../../src/shared/editorV6Schema'
import { useEditorV6Store } from '../../src/renderer/src/features/editorV6/editorV6Store'
import type { EditorV6Document } from '../../src/shared/editorV6'

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
  elements: []
})

describe('base de arquitetura do Editor V6', () => {
  it('valida projetos e rejeita referências quebradas', () => {
    const valid = document()
    expect(editorV6DocumentSchema.safeParse(valid).success).toBe(true)
    expect(editorV6DocumentSchema.safeParse({ ...valid, backgroundAssetId: 'missing' }).success).toBe(false)
  })

  it('mantém desfazer e refazer isolados por projeto', () => {
    const store = useEditorV6Store.getState()
    store.clear(document().id)
    const initial = document()
    const element = { id: '7caa73f0-50f7-4fe8-99ee-e741ce719135', kind: 'speech' as const, text: 'oi', x: 0, y: 0, width: 20, height: 10, rotation: 0, zIndex: 1 }
    const edited = { ...initial, elements: [element] }
    store.record(initial.id, initial)
    expect(store.undo(initial.id, edited)?.elements).toEqual(initial.elements)
    expect(useEditorV6Store.getState().histories[initial.id]?.redo).toHaveLength(1)
    expect(store.redo(initial.id, initial)?.elements).toEqual(edited.elements)
    expect(useEditorV6Store.getState().histories['another-project']).toBeUndefined()
    store.clear(initial.id)
  })
})
