import { describe, expect, it } from 'vitest'
import type { EditorV6TimelineKeyCommand } from '../../src/renderer/src/features/editorV6/editorV6TimelineKeyboard'
import { executeEditorV6TimelineKeyCommand } from '../../src/renderer/src/features/editorV6/editorV6TimelineKeyboardActions'

function harness(selectedId: string | null = 'block-1') {
  const events: unknown[][] = []
  const record = (name: string) => (...args: unknown[]) => events.push([name, ...args])
  return {
    events,
    actions: {
      selectedId,
      cancelDrag: record('cancel-drag'), closeMenu: record('close-menu'), split: record('split'), duplicate: record('duplicate'),
      toggleSnap: record('toggle-snap'), zoomIn: record('zoom-in'), zoomOut: record('zoom-out'), fit: record('fit'),
      seek: record('seek'), play: record('play'), remove: record('remove')
    }
  }
}

describe('execução de atalhos da timeline do Editor V6', () => {
  it('encaminha comandos de bloco e não executa divisão/duplicação sem seleção', () => {
    const selected = harness()
    executeEditorV6TimelineKeyCommand({ action: 'split', preventDefault: true }, selected.actions)
    executeEditorV6TimelineKeyCommand({ action: 'duplicate', preventDefault: true }, selected.actions)
    expect(selected.events).toEqual([['split', 'block-1'], ['duplicate', 'block-1']])

    const empty = harness(null)
    executeEditorV6TimelineKeyCommand({ action: 'split', preventDefault: true }, empty.actions)
    executeEditorV6TimelineKeyCommand({ action: 'duplicate', preventDefault: true }, empty.actions)
    expect(empty.events).toEqual([])
  })

  it('executa cancelamento, navegação e ações da barra pela ação resolvida', () => {
    const { actions, events } = harness()
    const commands: EditorV6TimelineKeyCommand[] = [
      { action: 'cancel', preventDefault: false }, { action: 'toggle-snap', preventDefault: true },
      { action: 'zoom-in', preventDefault: true }, { action: 'zoom-out', preventDefault: true },
      { action: 'fit', preventDefault: true }, { action: 'seek', frame: 42, preventDefault: true },
      { action: 'play', preventDefault: true }, { action: 'remove', blockId: 'block-2', preventDefault: true }
    ]
    for (const command of commands) executeEditorV6TimelineKeyCommand(command, actions)

    expect(events).toEqual([
      ['cancel-drag'], ['close-menu'], ['toggle-snap'], ['zoom-in'], ['zoom-out'], ['fit'],
      ['seek', 42], ['play'], ['remove', 'block-2']
    ])
  })
})
