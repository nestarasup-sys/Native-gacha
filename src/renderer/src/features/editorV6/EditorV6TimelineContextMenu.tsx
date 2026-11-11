import type { EditorV6TimelineBlock as Block } from '../../../../shared/editorV6'
import { getEditorV6TimelineContextMenuActions, type EditorV6TimelineContextMenuState } from './editorV6TimelineContextMenuModel'

type Props = {
  menu: EditorV6TimelineContextMenuState
  frame: number
  onSeekAndClose: (frame: number) => void
  onDuplicate: (id: string) => void
  onSplit: (id: string) => void
  onRemove: (id: string) => void
}

export function EditorV6TimelineContextMenu({ menu, frame, onSeekAndClose, onDuplicate, onSplit, onRemove }: Props) {
  const actions = getEditorV6TimelineContextMenuActions(menu, frame)
  const block: Block = menu.block

  return <div className="v6-timeline-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
    <button type="button" role="menuitem" onClick={() => onSeekAndClose(block.startFrame)}>Ir ao início</button>
    <button type="button" role="menuitem" onClick={() => onSeekAndClose(block.startFrame + block.durationFrames)}>Ir ao fim</button>
    <button type="button" role="menuitem" disabled={actions.duplicateDisabled} onClick={() => onDuplicate(block.id)}>Duplicar <kbd>Ctrl+D</kbd></button>
    <button type="button" role="menuitem" disabled={actions.splitDisabled} onClick={() => onSplit(block.id)}>Dividir no cursor <kbd>Ctrl+K</kbd></button>
    <button type="button" role="menuitem" disabled={actions.removeDisabled} onClick={() => onRemove(block.id)}>Excluir <kbd>Del</kbd></button>
  </div>
}
