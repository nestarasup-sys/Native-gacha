import { useEffect, useRef } from 'react'
import type { EditorV6Document, EditorV6ProjectSummary } from '../../../../shared/editorV6'
import { loadLegacySceneCatalog } from '../../ui/legacySceneCatalog.ts'
import { loadEditorV6ProjectCatalog } from './editorV6ProjectCatalog.ts'

const STORAGE_KEY = 'gacha-nymi-editor-v6-catalog-v1'

type Dependencies = {
  activeProjectId: string | null
  setProjects: (projects: EditorV6ProjectSummary[]) => void
  setFolder: (folder: string) => void
  setLoading: (loading: boolean) => void
  setError: (message: string | null) => void
  setActiveProjectId: (id: string | null) => void
  setActiveProject: (project: EditorV6Document | null) => void
  pausePlayback: () => void
  publishPlayheadFrame: (frame: number) => void
  writeDocument: (document: EditorV6Document) => Promise<unknown>
  createTimeline: () => EditorV6Document['timeline']
}

/** Owns project-library bootstrap, legacy import, and stale-safe project loading. */
export function useEditorV6ProjectLibrary({
  activeProjectId,
  setProjects,
  setFolder,
  setLoading,
  setError,
  setActiveProjectId,
  setActiveProject,
  pausePlayback,
  publishPlayheadFrame,
  writeDocument,
  createTimeline
}: Dependencies) {
  const activeLoadGenerationRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    void loadEditorV6ProjectCatalog({
      listProjects: () => window.desktop.editorV6.listEditorV6Projects(),
      getFolder: () => window.desktop.editorV6.getEditorV6Folder(),
      legacyCatalog: () => loadLegacySceneCatalog(STORAGE_KEY),
      writeDocument,
      createTimeline
    }).then(({ projects, folder, clearLegacyCatalog }) => {
      if (cancelled) return
      setProjects(projects)
      setFolder(folder)
      if (clearLegacyCatalog) window.localStorage.removeItem(STORAGE_KEY)
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os projetos do Editor V6.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [createTimeline, setError, setFolder, setLoading, setProjects, writeDocument])

  useEffect(() => {
    const generation = ++activeLoadGenerationRef.current
    if (!activeProjectId) {
      pausePlayback()
      publishPlayheadFrame(0)
      setActiveProject(null)
      return
    }
    setActiveProject(null)
    void window.desktop.editorV6.loadEditorV6Project(activeProjectId).then((project) => {
      if (generation !== activeLoadGenerationRef.current) return
      if (!project) {
        setError('Esse projeto não foi encontrado na biblioteca local do Editor V6.')
        setActiveProjectId(null)
        return
      }
      setError(null)
      setActiveProject(project)
    }).catch((reason: unknown) => {
      if (generation !== activeLoadGenerationRef.current) return
      setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o projeto do Editor V6.')
      setActiveProjectId(null)
    })
    return () => { if (activeLoadGenerationRef.current === generation) activeLoadGenerationRef.current += 1 }
  }, [activeProjectId, pausePlayback, publishPlayheadFrame, setActiveProject, setActiveProjectId, setError])
}
