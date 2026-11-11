import type { EditorV6Document } from '../../../../shared/editorV6'

type GenerationRef = { current: number }

export type EditorV6ActiveProjectLoadDependencies = {
  loadProject: (projectId: string) => Promise<EditorV6Document | null>
  setError: (message: string | null) => void
  setSaved: (saved: boolean) => void
  setActiveProjectId: (id: string | null) => void
  setActiveProject: (project: EditorV6Document | null) => void
  pausePlayback: () => void
  publishPlayheadFrame: (frame: number) => void
}

/** Loads the selected project and ignores completion from any superseded request. */
export function startEditorV6ActiveProjectLoad(
  projectId: string | null,
  generationRef: GenerationRef,
  dependencies: EditorV6ActiveProjectLoadDependencies
): () => void {
  const generation = ++generationRef.current
  if (!projectId) {
    dependencies.pausePlayback()
    dependencies.publishPlayheadFrame(0)
    dependencies.setActiveProject(null)
    dependencies.setSaved(true)
    return () => {}
  }

  dependencies.setActiveProject(null)
  void dependencies.loadProject(projectId).then((project) => {
    if (generation !== generationRef.current) return
    if (!project) {
      dependencies.setError('Esse projeto não foi encontrado na biblioteca local do Editor V6.')
      dependencies.setActiveProjectId(null)
      return
    }
    dependencies.setError(null)
    dependencies.setActiveProject(project)
    // A loaded document establishes a clean baseline until it is edited.
    dependencies.setSaved(true)
  }).catch((reason: unknown) => {
    if (generation !== generationRef.current) return
    dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o projeto do Editor V6.')
    dependencies.setActiveProjectId(null)
  })

  return () => {
    if (generationRef.current === generation) generationRef.current += 1
  }
}
