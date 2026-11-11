import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EditorV6Document } from '../../src/shared/editorV6'
import { createEditorV6HistoryCommands } from '../../src/renderer/src/features/editorV6/editorV6HistoryCommands'
import { useEditorV6Store } from '../../src/renderer/src/features/editorV6/editorV6Store'

const project = (x: number): EditorV6Document => ({
  id: 'history-project', backgroundColor: '#fff', backgroundAssetId: null,
  backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0,
  assets: [], elements: [{ id: 'element', kind: 'image', text: '', x, y: 0, width: 10, height: 10, rotation: 0, zIndex: 0 }],
  timeline: { fps: 30, durationFrames: 300, tracks: [] }
} as EditorV6Document)

function harness(activeProject: EditorV6Document | null = project(20)) {
  const events: unknown[] = []
  const patchDocument = vi.fn((transform: (value: EditorV6Document) => EditorV6Document, editSelection?: boolean) => {
    events.push(['patch', transform(activeProject ?? project(0)).elements[0].x, editSelection])
  })
  return {
    events,
    patchDocument,
    commands: createEditorV6HistoryCommands({
      project: activeProject,
      patchDocument,
      setCanUndo: (value) => events.push(['can-undo', value]),
      setCanRedo: (value) => events.push(['can-redo', value]),
      bumpHistoryVersion: () => events.push(['version'])
    })
  }
}

afterEach(() => { useEditorV6Store.getState().clear('history-project') })

describe('histórico de edição do Editor V6', () => {
  it('aplica undo e redo pelo caminho de patch sem editar snapshots da timeline', () => {
    useEditorV6Store.getState().record('history-project', project(10))
    const context = harness()

    context.commands.undo()
    context.commands.redo()

    expect(context.events).toEqual([
      ['patch', 10, false], ['can-undo', false], ['can-redo', true], ['version'],
      ['patch', 20, false], ['can-undo', true], ['can-redo', false], ['version']
    ])
  })

  it('não publica mudanças quando o projeto não está ativo nem há histórico', () => {
    const noProject = harness(null)
    noProject.commands.undo()
    noProject.commands.redo()
    expect(noProject.events).toEqual([])

    const noHistory = harness()
    noHistory.commands.undo()
    noHistory.commands.redo()
    expect(noHistory.events).toEqual([])
  })
})
