import { describe, expect, it } from 'vitest'
import type { EditorV6Document, EditorV6ProjectSummary } from '../../src/shared/editorV6'
import { completeEditorV6ProjectImport } from '../../src/renderer/src/features/editorV6/editorV6ProjectImportCompletion'

describe('conclusão da importação de projeto do Editor V6', () => {
  it('publica, seleciona, ativa e fecha somente após o documento ser entregue pelo fluxo salvo', () => {
    const events: unknown[] = []
    const project = { id: 'imported-7' } as EditorV6Document
    const summary = { id: project.id } as EditorV6ProjectSummary

    completeEditorV6ProjectImport(project, {
      projectSummary: (value) => { events.push(['summarize', value.id]); return summary },
      upsertSummary: (value) => events.push(['upsert', value.id]),
      selectProject: (id) => events.push(['selected', id]),
      activateProject: (id) => events.push(['active', id]),
      setSaved: (saved) => events.push(['saved', saved]),
      closeImport: () => events.push(['closed']),
      setError: (message) => events.push(['error', message])
    })

    expect(events).toEqual([
      ['summarize', 'imported-7'],
      ['upsert', 'imported-7'],
      ['selected', 'imported-7'],
      ['active', 'imported-7'],
      ['saved', true],
      ['closed'],
      ['error', null]
    ])
  })
})
