export type EditorV6ProjectSessionResetDependencies = {
  clearHistory: (projectId: string) => void
  resetPlayback: () => void
  clearTimelineSelection: () => void
  clearHistoryAvailability: () => void
  bumpHistoryVersion: () => void
  clearElementSelection: () => void
}

/** Clears transient editor state when a project becomes the active session. */
export function resetEditorV6ProjectSession(
  projectId: string | null,
  dependencies: EditorV6ProjectSessionResetDependencies
): void {
  if (!projectId) return
  dependencies.clearHistory(projectId)
  dependencies.resetPlayback()
  dependencies.clearTimelineSelection()
  dependencies.clearHistoryAvailability()
  dependencies.bumpHistoryVersion()
  dependencies.clearElementSelection()
}
