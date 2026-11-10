import type { EditorV6ProjectSummary } from '../../../../shared/editorV6'

type TrackOperation = <T>(operation: () => Promise<T>) => Promise<T>

type EditorV6ProjectDeletionDependencies = {
  activeProjectId: string | null
  activeProjectIdRef: { current: string | null }
  flushDocumentWrites: () => Promise<unknown>
  deleteProject: (projectId: string) => Promise<unknown>
  removeSummary: (projectId: string) => void
  setSelectedProject: (update: (current: string | null) => string | null) => void
  pausePlayback: () => void
  setActiveProjectId: (projectId: string | null) => void
  setSaved: (saved: boolean) => void
  setError: (message: string | null) => void
  trackOperation: TrackOperation
}

/** Deletes a project only after its active document writes have been flushed. */
export function createEditorV6ProjectDeletionCommand(dependencies: EditorV6ProjectDeletionDependencies) {
  return async (target: EditorV6ProjectSummary | null): Promise<void> => {
    if (!target) return

    await dependencies.trackOperation(async () => {
      try {
        if (target.id === dependencies.activeProjectIdRef.current) await dependencies.flushDocumentWrites()
        await dependencies.deleteProject(target.id)
        dependencies.removeSummary(target.id)
        dependencies.setSelectedProject((current) => current === target.id ? null : current)
        if (dependencies.activeProjectId === target.id) {
          dependencies.pausePlayback()
          dependencies.setActiveProjectId(null)
        }
        dependencies.setSaved(true)
        dependencies.setError(null)
      } catch (reason) {
        dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o projeto do Editor V6.')
      }
    })
  }
}
