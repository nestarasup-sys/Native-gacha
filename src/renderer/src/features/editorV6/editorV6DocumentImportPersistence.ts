import { editorV6ProjectSummary, type EditorV6Document, type EditorV6ProjectSummary } from '../../../../shared/editorV6'

type Dependencies = {
  activeProjectIdRef: { current: string | null }
  getActiveProject: () => EditorV6Document | null
  loadProject: (projectId: string) => Promise<EditorV6Document | null>
  recordHistory: (project: EditorV6Document) => void
  setActiveProject: (project: EditorV6Document) => void
  markUnsaved: () => void
  writeDocumentInOrder: (project: EditorV6Document) => Promise<unknown>
  upsertSummary: (summary: EditorV6ProjectSummary) => void
  setSaved: (saved: boolean) => void
  setError: (message: string | null) => void
}

/** Coordinates current-project reads and ordered persistence of imported scene edits. */
export function createEditorV6DocumentImportPersistence(dependencies: Dependencies) {
  const loadLatestProject = async (projectId: string) => {
    const current = dependencies.getActiveProject()
    return current?.id === projectId ? current : dependencies.loadProject(projectId)
  }

  const persistImportedDocument = async (source: EditorV6Document, next: EditorV6Document) => {
    const isActive = dependencies.activeProjectIdRef.current === source.id
      && dependencies.getActiveProject()?.id === source.id
    if (isActive) {
      dependencies.recordHistory(source)
      dependencies.setActiveProject(next)
      dependencies.markUnsaved()
    }

    await dependencies.writeDocumentInOrder(next)
    const current = dependencies.getActiveProject()
    dependencies.upsertSummary(editorV6ProjectSummary(current?.id === next.id ? current : next))
    const isStillCurrent = isActive
      && dependencies.activeProjectIdRef.current === next.id
      && current?.id === next.id
      && current.updatedAt === next.updatedAt
    if (isStillCurrent) {
      dependencies.setSaved(true)
      dependencies.setError(null)
    }
    return isStillCurrent
  }

  return { loadLatestProject, persistImportedDocument }
}
