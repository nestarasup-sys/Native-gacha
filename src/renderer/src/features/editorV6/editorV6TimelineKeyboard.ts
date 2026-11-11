export type EditorV6TimelineKeyCommand =
  | { action: 'cancel'; preventDefault: false }
  | { action: 'split' | 'duplicate' | 'toggle-snap' | 'zoom-in' | 'zoom-out' | 'fit' | 'play'; preventDefault: true }
  | { action: 'seek'; frame: number; preventDefault: true }
  | { action: 'remove'; blockId: string; preventDefault: true }

export type EditorV6TimelineKeyInput = {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  editableTarget: boolean
  defaultPrevented: boolean
  selectedId: string | null
  frame: number
  durationFrames: number
}

/** Resolves timeline-local keys without dispatching UI actions or mutating state. */
export function resolveEditorV6TimelineKeyCommand(input: EditorV6TimelineKeyInput): EditorV6TimelineKeyCommand | null {
  if (input.editableTarget || input.defaultPrevented) return null
  const key = input.key.toLowerCase()
  if (key === 'escape') return { action: 'cancel', preventDefault: false }

  if (input.ctrlKey || input.metaKey) {
    if (key === 'k' && input.selectedId) return { action: 'split', preventDefault: true }
    if (key === 'd' && input.selectedId) return { action: 'duplicate', preventDefault: true }
    return null
  }

  if (key === 's') return { action: 'toggle-snap', preventDefault: true }
  if (key === '+' || key === '=') return { action: 'zoom-in', preventDefault: true }
  if (key === '-') return { action: 'zoom-out', preventDefault: true }
  if (key === 'z' && input.shiftKey) return { action: 'fit', preventDefault: true }
  if (key === 'arrowleft' || key === 'arrowright') {
    const step = key === 'arrowright' ? 1 : -1
    const amount = input.shiftKey ? 5 : 1
    return { action: 'seek', frame: Math.max(0, Math.min(input.durationFrames, input.frame + step * amount)), preventDefault: true }
  }
  if (key === 'home' || key === 'end') {
    return { action: 'seek', frame: key === 'home' ? 0 : input.durationFrames, preventDefault: true }
  }
  if (key === ' ') return { action: 'play', preventDefault: true }
  if ((key === 'delete' || key === 'backspace') && input.selectedId) {
    return { action: 'remove', blockId: input.selectedId, preventDefault: true }
  }
  return null
}
