import type { EditorV6TimelineBlock as Block, EditorV6TimelineTrack as Track } from '../../../../shared/editorV6'

export type EditorV6TimelineContextMenuState = {
  x: number
  y: number
  track: Track
  block: Block
}

export function getEditorV6TimelineContextMenuPosition(x: number, y: number, viewportWidth: number, viewportHeight: number) {
  return {
    x: Math.min(x, viewportWidth - 195),
    y: Math.max(8, Math.min(y, viewportHeight - 225))
  }
}

export function getEditorV6TimelineContextMenuActions(menu: EditorV6TimelineContextMenuState, frame: number) {
  const locked = menu.track.locked
  return {
    duplicateDisabled: locked,
    removeDisabled: locked,
    splitDisabled: locked || frame <= menu.block.startFrame || frame >= menu.block.startFrame + menu.block.durationFrames
  }
}
