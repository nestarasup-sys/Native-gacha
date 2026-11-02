import type { WardrobeSet } from '../../../../../shared/fabricator'

const HISTORY_LIMIT = 30
const GRID_IMPORT_KINDS = new Set(['sleeve-grid-3x4', 'pants-grid-3x4'])

export function createWardrobeGridHistory() {
  const undoStack: WardrobeSet[] = []
  const redoStack: WardrobeSet[] = []

  return {
    record(snapshot: WardrobeSet) {
      if (!GRID_IMPORT_KINDS.has(snapshot.importKind ?? '')) return
      undoStack.push(snapshot)
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
      redoStack.length = 0
    },
    undo(current: WardrobeSet | null): WardrobeSet | null {
      const previous = undoStack.pop()
      if (!previous || !current) return null
      redoStack.push(current)
      return previous
    },
    redo(current: WardrobeSet | null): WardrobeSet | null {
      const next = redoStack.pop()
      if (!next || !current) return null
      undoStack.push(current)
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
      return next
    },
    clear() {
      undoStack.length = 0
      redoStack.length = 0
    },
    get canUndo() { return undoStack.length > 0 },
    get canRedo() { return redoStack.length > 0 }
  }
}
