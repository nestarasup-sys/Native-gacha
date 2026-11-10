type EditorV6ProjectExitDependencies = {
  flushWrites: () => Promise<void>
  pausePlayback: () => void
  clearActiveProject: () => void
  clearActiveTool: () => void
  clearSelection: () => void
  exitFullView: () => void
  setError: (message: string | null) => void
}

/** Flushes pending project work before leaving the editor and clearing its UI state. */
export function createEditorV6ProjectExitCommand(dependencies: EditorV6ProjectExitDependencies) {
  return async (): Promise<void> => {
    try {
      await dependencies.flushWrites()
    } catch (reason) {
      dependencies.setError(reason instanceof Error ? `Não foi possível sair do projeto porque o salvamento falhou: ${reason.message}` : 'Não foi possível sair do projeto porque o salvamento falhou.')
      return
    }

    dependencies.pausePlayback()
    dependencies.clearActiveProject()
    dependencies.clearActiveTool()
    dependencies.clearSelection()
    dependencies.exitFullView()
  }
}
