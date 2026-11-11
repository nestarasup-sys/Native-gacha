import type { EditorV6Document, EditorV6ProjectSummary } from '../../../../shared/editorV6'

type Dependencies = {
  projectSummary: (project: EditorV6Document) => EditorV6ProjectSummary
  upsertSummary: (summary: EditorV6ProjectSummary) => void
  selectProject: (projectId: string) => void
  activateProject: (projectId: string) => void
  setSaved: (saved: boolean) => void
  closeImport: () => void
  setError: (message: string | null) => void
}

/** Publishes a successfully persisted import and activates it in the editor. */
export function completeEditorV6ProjectImport(
  project: EditorV6Document,
  dependencies: Dependencies
): void {
  dependencies.upsertSummary(dependencies.projectSummary(project))
  dependencies.selectProject(project.id)
  dependencies.activateProject(project.id)
  dependencies.setSaved(true)
  dependencies.closeImport()
  dependencies.setError(null)
}
