import { describe, expect, it } from 'vitest'
import { openEditorV6Project } from '../../src/renderer/src/features/editorV6/editorV6ProjectNavigation'

describe('abertura de projeto do Editor V6', () => {
  it('seleciona no catálogo antes de ativar e carregar o mesmo ID', () => {
    const events: unknown[] = []
    openEditorV6Project('project-7', {
      selectProject: (id) => events.push(['selected', id]),
      activateProject: (id) => events.push(['active', id])
    })
    expect(events).toEqual([['selected', 'project-7'], ['active', 'project-7']])
  })
})
