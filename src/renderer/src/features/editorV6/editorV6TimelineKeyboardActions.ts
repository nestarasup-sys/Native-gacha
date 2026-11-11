import type { EditorV6TimelineKeyCommand } from './editorV6TimelineKeyboard'

export type EditorV6TimelineKeyboardActions = {
  selectedId: string | null
  cancelDrag: () => void
  closeMenu: () => void
  split: (id: string) => void
  duplicate: (id: string) => void
  toggleSnap: () => void
  zoomIn: () => void
  zoomOut: () => void
  fit: () => void
  seek: (frame: number) => void
  play: () => void
  remove: (id: string) => void
}

export function executeEditorV6TimelineKeyCommand(command: EditorV6TimelineKeyCommand, actions: EditorV6TimelineKeyboardActions) {
  switch (command.action) {
    case 'cancel': actions.cancelDrag(); actions.closeMenu(); break
    case 'split': if (actions.selectedId) actions.split(actions.selectedId); break
    case 'duplicate': if (actions.selectedId) actions.duplicate(actions.selectedId); break
    case 'toggle-snap': actions.toggleSnap(); break
    case 'zoom-in': actions.zoomIn(); break
    case 'zoom-out': actions.zoomOut(); break
    case 'fit': actions.fit(); break
    case 'seek': actions.seek(command.frame); break
    case 'play': actions.play(); break
    case 'remove': actions.remove(command.blockId); break
  }
}
