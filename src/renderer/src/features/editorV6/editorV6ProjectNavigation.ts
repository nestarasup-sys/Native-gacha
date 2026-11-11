type EditorV6ProjectNavigationDependencies = {
  selectProject: (projectId: string) => void
  activateProject: (projectId: string) => void
}

/** Keeps the browser selection and active editor project in sync when opening. */
export function openEditorV6Project(
  projectId: string,
  dependencies: EditorV6ProjectNavigationDependencies
): void {
  dependencies.selectProject(projectId)
  dependencies.activateProject(projectId)
}
