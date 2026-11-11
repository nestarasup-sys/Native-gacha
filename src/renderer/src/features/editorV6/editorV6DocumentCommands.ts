import type { EditorV6Document, EditorV6ProjectSummary } from '../../../../shared/editorV6'
import { useEditorV6Store } from './editorV6Store'
import { createEditorV6HistoryCommands } from './editorV6HistoryCommands'
import { createEditorV6DocumentImportPersistence } from './editorV6DocumentImportPersistence'
import { createEditorV6SceneDocumentCommands } from './editorV6SceneDocumentCommands'
import { createEditorV6DocumentEditingCommands } from './editorV6DocumentEditing'

type ActiveProjectIdRef = { current: string | null }
type ProjectUpdater = (update: (project: EditorV6Document) => EditorV6Document) => void

export type EditorV6DocumentCommandDependencies = {
  activeProject: EditorV6Document | null
  activeProjectId: string | null
  activeProjectIdRef: ActiveProjectIdRef
  selectedElementId: string | null
  selectedTimelineBlockId: string | null
  setSelectedElementId: (elementId: string | null) => void
  updateActiveProject: ProjectUpdater
  now: () => string
  setActiveProject: (project: EditorV6Document | null) => void
  markUnsaved: () => void
  writeDocumentInOrder: (document: EditorV6Document) => Promise<unknown>
  upsertSummary: (summary: EditorV6ProjectSummary) => void
  setSaved: (saved: boolean) => void
  setError: (message: string | null) => void
  setCanUndo: (canUndo: boolean) => void
  setCanRedo: (canRedo: boolean) => void
  bumpHistoryVersion: () => void
  getFrame: () => number
}

/** Coordinates document edits, history, and import persistence for the Editor V6 page. */
export function createEditorV6DocumentCommands(dependencies: EditorV6DocumentCommandDependencies) {
  const editing = createEditorV6DocumentEditingCommands({
    activeProject: dependencies.activeProject,
    activeProjectId: dependencies.activeProjectId,
    activeProjectIdRef: dependencies.activeProjectIdRef,
    selectedElementId: dependencies.selectedElementId,
    selectedTimelineBlockId: dependencies.selectedTimelineBlockId,
    updateActiveProject: dependencies.updateActiveProject,
    getFrame: dependencies.getFrame,
    markUnsaved: dependencies.markUnsaved,
    setCanUndo: dependencies.setCanUndo,
    setCanRedo: dependencies.setCanRedo,
    bumpHistoryVersion: dependencies.bumpHistoryVersion
  })
  const { recordHistory, patchDocument, changeScene } = editing

  const { undo, redo } = createEditorV6HistoryCommands({
    project: dependencies.activeProject,
    patchDocument,
    setCanUndo: dependencies.setCanUndo,
    setCanRedo: dependencies.setCanRedo,
    bumpHistoryVersion: dependencies.bumpHistoryVersion
  })

  const { loadLatestProject: loadLatestEditorV6Project, persistImportedDocument: persistImportedEditorV6Document } = createEditorV6DocumentImportPersistence({
    activeProjectIdRef: dependencies.activeProjectIdRef,
    getActiveProject: () => useEditorV6Store.getState().activeProject,
    loadProject: (projectId) => window.desktop.editorV6.loadEditorV6Project(projectId),
    recordHistory,
    setActiveProject: dependencies.setActiveProject,
    markUnsaved: dependencies.markUnsaved,
    writeDocumentInOrder: dependencies.writeDocumentInOrder,
    upsertSummary: dependencies.upsertSummary,
    setSaved: dependencies.setSaved,
    setError: dependencies.setError
  })

  const sceneCommands = createEditorV6SceneDocumentCommands({
    selectedElementId: dependencies.selectedElementId,
    setSelectedElementId: dependencies.setSelectedElementId,
    now: dependencies.now,
    getFrame: dependencies.getFrame,
    patchDocument,
    changeScene
  })

  return {
    patchDocument,
    patchEditorV6FacePreview: editing.patchFacePreview,
    recordHistory,
    changeScene,
    loadLatestEditorV6Project,
    persistImportedEditorV6Document,
    ...sceneCommands,
    undo,
    redo
  }
}
