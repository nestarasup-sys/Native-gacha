import { useEffect } from 'react'

export type EditorV6KeyboardShortcutInput = {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  editableTarget: boolean
  dragActive: boolean
  castPickerOpen: boolean
  savingCast: boolean
  fullView: boolean
}

export type EditorV6KeyboardShortcutActions = {
  preventDefault: boolean
  cancelDrag: boolean
  closeCastPicker: boolean
  exitFullView: boolean
  undo: boolean
  redo: boolean
}

export function resolveEditorV6KeyboardShortcut(input: EditorV6KeyboardShortcutInput): EditorV6KeyboardShortcutActions {
  const key = input.key.toLowerCase()
  const command = input.ctrlKey || input.metaKey
  const escape = input.key === 'Escape'
  if (input.dragActive && (escape || (command && key === 'z'))) {
    return { preventDefault: true, cancelDrag: true, closeCastPicker: false, exitFullView: false, undo: false, redo: false }
  }

  const actions: EditorV6KeyboardShortcutActions = {
    preventDefault: false,
    cancelDrag: false,
    closeCastPicker: escape && input.castPickerOpen && !input.savingCast,
    exitFullView: escape && input.fullView,
    undo: false,
    redo: false
  }
  if (input.editableTarget) return actions
  if (command && key === 'z') {
    actions.preventDefault = true
    actions.undo = !input.shiftKey
    actions.redo = input.shiftKey
  } else if (command && key === 'y') {
    actions.preventDefault = true
    actions.redo = true
  }
  return actions
}

type Dependencies = {
  castPickerOpen: boolean
  savingCast: boolean
  fullView: boolean
  project: unknown
  historyVersion: number
  dragActive: () => boolean
  cancelDrag: () => void
  closeCastPicker: () => void
  exitFullView: () => void
  undo: () => void
  redo: () => void
}

export function useEditorV6KeyboardShortcuts(dependencies: Dependencies): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const editableTarget = event.target instanceof HTMLElement
        && Boolean(event.target.closest('input,textarea,select,[contenteditable=true],[role=dialog]'))
      const actions = resolveEditorV6KeyboardShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        editableTarget,
        dragActive: dependencies.dragActive(),
        castPickerOpen: dependencies.castPickerOpen,
        savingCast: dependencies.savingCast,
        fullView: dependencies.fullView
      })
      if (actions.preventDefault) event.preventDefault()
      if (actions.cancelDrag) dependencies.cancelDrag()
      if (actions.closeCastPicker) dependencies.closeCastPicker()
      if (actions.exitFullView) dependencies.exitFullView()
      if (actions.undo) dependencies.undo()
      if (actions.redo) dependencies.redo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dependencies.castPickerOpen, dependencies.savingCast, dependencies.fullView, dependencies.project, dependencies.historyVersion])
}
