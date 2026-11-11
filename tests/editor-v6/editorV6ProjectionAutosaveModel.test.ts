import { describe, expect, it } from 'vitest'
import { getEditorV6ProjectionAutosaveAction } from '../../src/renderer/src/features/editorV6/editorV6ProjectionAutosaveModel'

describe('getEditorV6ProjectionAutosaveAction', () => {
  it('resets the baseline when there is no active project', () => {
    expect(getEditorV6ProjectionAutosaveAction(null, 'a', { projectId: 'p1', value: 'a' }, false)).toBe('reset')
  })

  it('skips projection checks during a stage drag', () => {
    expect(getEditorV6ProjectionAutosaveAction('p1', 'b', { projectId: 'p1', value: 'a' }, true)).toBe('skip')
  })

  it('establishes a baseline instead of rewriting a newly opened project', () => {
    expect(getEditorV6ProjectionAutosaveAction('p2', 'a', { projectId: 'p1', value: 'a' }, false)).toBe('baseline')
    expect(getEditorV6ProjectionAutosaveAction('p1', 'a', null, false)).toBe('baseline')
  })

  it('saves changed character projections immediately', () => {
    expect(getEditorV6ProjectionAutosaveAction('p1', 'b', { projectId: 'p1', value: 'a' }, false)).toBe('save-now')
  })

  it('debounces unchanged signatures after project updates', () => {
    expect(getEditorV6ProjectionAutosaveAction('p1', 'a', { projectId: 'p1', value: 'a' }, false)).toBe('debounce')
  })
})
