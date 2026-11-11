import type { EditorV6ProjectSummary } from '../../../../shared/editorV6'

export type EditorV6ProjectCatalogLoadResult = {
  projects: EditorV6ProjectSummary[]
  folder: string
  clearLegacyCatalog: boolean
}

export type EditorV6ProjectCatalogLoadDependencies = {
  loadCatalog: () => Promise<EditorV6ProjectCatalogLoadResult>
  clearLegacyCatalog: () => void
  setProjects: (projects: EditorV6ProjectSummary[]) => void
  setFolder: (folder: string) => void
  setLoading: (loading: boolean) => void
  setError: (message: string | null) => void
}

/** Publishes a catalog bootstrap only while its owning effect is still current. */
export function startEditorV6ProjectCatalogLoad(
  dependencies: EditorV6ProjectCatalogLoadDependencies
): () => void {
  let cancelled = false
  void dependencies.loadCatalog().then(({ projects, folder, clearLegacyCatalog }) => {
    if (cancelled) return
    dependencies.setProjects(projects)
    dependencies.setFolder(folder)
    if (clearLegacyCatalog) dependencies.clearLegacyCatalog()
  }).catch((reason: unknown) => {
    if (!cancelled) dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os projetos do Editor V6.')
  }).finally(() => {
    if (!cancelled) dependencies.setLoading(false)
  })
  return () => { cancelled = true }
}
