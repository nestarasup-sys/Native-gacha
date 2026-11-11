import type { EditorV6Document } from '../../../../shared/editorV6'
import { useEditorV6Store } from './editorV6Store'

type Dependencies = {
  project: EditorV6Document | null
  patchDocument: (transform: (project: EditorV6Document) => EditorV6Document, editSelection?: boolean) => void
  setCanUndo: (canUndo: boolean) => void
  setCanRedo: (canRedo: boolean) => void
  bumpHistoryVersion: () => void
}

/** Applies stored scene history through the document patch path. */
export function createEditorV6HistoryCommands(dependencies: Dependencies) {
  const undo = () => {
    const project = dependencies.project
    if (!project) return
    const store = useEditorV6Store.getState()
    const document = store.undo(project.id, project)
    if (!document) return
    const history = useEditorV6Store.getState().histories[project.id]
    dependencies.patchDocument(() => document, false)
    dependencies.setCanUndo(Boolean(history?.undo.length))
    dependencies.setCanRedo(true)
    dependencies.bumpHistoryVersion()
  }

  const redo = () => {
    const project = dependencies.project
    if (!project) return
    const store = useEditorV6Store.getState()
    const document = store.redo(project.id, project)
    if (!document) return
    const history = useEditorV6Store.getState().histories[project.id]
    dependencies.patchDocument(() => document, false)
    dependencies.setCanUndo(Boolean(history?.undo.length))
    dependencies.setCanRedo(Boolean(history?.redo.length))
    dependencies.bumpHistoryVersion()
  }

  return { undo, redo }
}
