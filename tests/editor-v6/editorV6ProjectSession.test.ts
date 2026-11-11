import { describe, expect, it } from 'vitest'
import { resetEditorV6ProjectSession } from '../../src/renderer/src/features/editorV6/editorV6ProjectSession'

function harness() {
  const events: unknown[] = []
  return {
    events,
    dependencies: {
      clearHistory: (id: string) => events.push(['clear-history', id]),
      resetPlayback: () => events.push('reset-playback'),
      clearTimelineSelection: () => events.push('clear-timeline-selection'),
      clearHistoryAvailability: () => events.push('clear-history-availability'),
      bumpHistoryVersion: () => events.push('bump-history-version'),
      clearElementSelection: () => events.push('clear-element-selection')
    }
  }
}

describe('sessão ativa do Editor V6', () => {
  it('limpa o histórico e seleções ao ativar um projeto, mantendo a ordem atual', () => {
    const { dependencies, events } = harness()
    resetEditorV6ProjectSession('project-1', dependencies)
    expect(events).toEqual([
      ['clear-history', 'project-1'], 'reset-playback', 'clear-timeline-selection',
      'clear-history-availability', 'bump-history-version', 'clear-element-selection'
    ])
  })

  it('não limpa a sessão quando não existe projeto ativo', () => {
    const { dependencies, events } = harness()
    resetEditorV6ProjectSession(null, dependencies)
    expect(events).toEqual([])
  })
})
