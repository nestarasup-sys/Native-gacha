import { editorV6ProjectSummary, syncEditorV6TimelineElements, type EditorV6Document, type EditorV6ProjectSummary } from '../../../../shared/editorV6'
import { editorV6ClipAtFrame, normalizeEditorV6Timeline, timelineClips } from '../../../../shared/editorV6TimelineCore'
import { editEditorV6DocumentAtBlock, pruneEditorV6TimelineSnapshots, repairEditorV6FaceModeAssetReferences } from '../../../../shared/editorV6TimelineEdits'
import { useEditorV6Store } from './editorV6Store'

type ActiveProjectIdRef = { current: string | null }
type ProjectUpdater = (update: (project: EditorV6Document) => EditorV6Document) => void

export type EditorV6DocumentCommandDependencies = {
  activeProject: EditorV6Document | null
  activeProjectId: string | null
  activeProjectIdRef: ActiveProjectIdRef
  selectedElementId: string | null
  selectedTimelineBlockId: string | null
  updateActiveProject: ProjectUpdater
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
  const recordHistory = (document = dependencies.activeProject) => {
    if (!document) return
    const history = useEditorV6Store.getState().record(document.id, document)
    dependencies.setCanUndo(history.undo.length > 0)
    dependencies.setCanRedo(false)
    dependencies.bumpHistoryVersion()
  }

  const patchDocument = (transform: (studio: EditorV6Document) => EditorV6Document, editSelection = true) => {
    const activeProjectId = dependencies.activeProjectId
    if (!activeProjectId) return
    dependencies.updateActiveProject((studio) => {
      if (studio.id !== activeProjectId) return studio
      const currentFrame = dependencies.getFrame()
      const selected = timelineClips(studio.timeline).find(({ block }) =>
        block.id === dependencies.selectedTimelineBlockId && block.elementId === dependencies.selectedElementId)
        ?? (dependencies.selectedElementId
          ? editorV6ClipAtFrame(studio.timeline, dependencies.selectedElementId, currentFrame)
          : undefined)
      const next = editSelection
        ? editEditorV6DocumentAtBlock(studio, selected?.block.id ?? null, transform)
        : transform(studio)
      return pruneEditorV6TimelineSnapshots(repairEditorV6FaceModeAssetReferences({
        ...next,
        timeline: normalizeEditorV6Timeline(next.timeline)
      }))
    })
    dependencies.markUnsaved()
  }

  const patchEditorV6FacePreview = (
    projectId: string,
    blockId: string | null | undefined,
    transform: (project: EditorV6Document) => EditorV6Document
  ) => {
    if (dependencies.activeProjectIdRef.current !== projectId) return
    dependencies.updateActiveProject((project) => {
      if (project.id !== projectId) return project
      const next = editEditorV6DocumentAtBlock(project, blockId ?? null, transform)
      return pruneEditorV6TimelineSnapshots(repairEditorV6FaceModeAssetReferences({
        ...next,
        timeline: normalizeEditorV6Timeline(next.timeline)
      }))
    })
    dependencies.markUnsaved()
  }

  const changeScene = (transform: (studio: EditorV6Document) => EditorV6Document) => {
    if (!dependencies.activeProject) return
    recordHistory()
    patchDocument((studio) => {
      const next = transform(studio)
      return { ...next, timeline: syncEditorV6TimelineElements(next.timeline, next.elements) }
    })
  }

  const loadLatestEditorV6Project = async (projectId: string) => {
    const current = useEditorV6Store.getState().activeProject
    return current?.id === projectId
      ? current
      : window.desktop.editorV6.loadEditorV6Project(projectId)
  }

  const persistImportedEditorV6Document = async (source: EditorV6Document, next: EditorV6Document) => {
    const isActive = dependencies.activeProjectIdRef.current === source.id
      && useEditorV6Store.getState().activeProject?.id === source.id
    if (isActive) {
      recordHistory(source)
      dependencies.setActiveProject(next)
      dependencies.markUnsaved()
    }

    await dependencies.writeDocumentInOrder(next)
    const current = useEditorV6Store.getState().activeProject
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

  const undo = () => {
    const project = dependencies.activeProject
    if (!project) return
    const document = useEditorV6Store.getState().undo(project.id, project)
    if (!document) return
    const history = useEditorV6Store.getState().histories[project.id]
    patchDocument(() => document, false)
    dependencies.setCanUndo(Boolean(history?.undo.length))
    dependencies.setCanRedo(true)
    dependencies.bumpHistoryVersion()
  }

  const redo = () => {
    const project = dependencies.activeProject
    if (!project) return
    const document = useEditorV6Store.getState().redo(project.id, project)
    if (!document) return
    const history = useEditorV6Store.getState().histories[project.id]
    patchDocument(() => document, false)
    dependencies.setCanUndo(Boolean(history?.undo.length))
    dependencies.setCanRedo(Boolean(history?.redo.length))
    dependencies.bumpHistoryVersion()
  }

  return {
    patchDocument,
    patchEditorV6FacePreview,
    recordHistory,
    changeScene,
    loadLatestEditorV6Project,
    persistImportedEditorV6Document,
    undo,
    redo
  }
}
