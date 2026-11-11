import { syncEditorV6TimelineElements, type EditorV6Document } from '../../../../shared/editorV6'
import { editorV6ClipAtFrame, normalizeEditorV6Timeline, timelineClips } from '../../../../shared/editorV6TimelineCore'
import { editEditorV6DocumentAtBlock, pruneEditorV6TimelineSnapshots, repairEditorV6FaceModeAssetReferences } from '../../../../shared/editorV6TimelineEdits'
import { useEditorV6Store } from './editorV6Store'

type Dependencies = {
  activeProject: EditorV6Document | null
  activeProjectId: string | null
  activeProjectIdRef: { current: string | null }
  selectedElementId: string | null
  selectedTimelineBlockId: string | null
  updateActiveProject: (update: (project: EditorV6Document) => EditorV6Document) => void
  getFrame: () => number
  markUnsaved: () => void
  setCanUndo: (canUndo: boolean) => void
  setCanRedo: (canRedo: boolean) => void
  bumpHistoryVersion: () => void
}

/** Applies scene edits to the current project or selected timeline snapshot. */
export function createEditorV6DocumentEditingCommands(dependencies: Dependencies) {
  const recordHistory = (project = dependencies.activeProject) => {
    if (!project) return
    const history = useEditorV6Store.getState().record(project.id, project)
    dependencies.setCanUndo(history.undo.length > 0)
    dependencies.setCanRedo(false)
    dependencies.bumpHistoryVersion()
  }

  const finishEdit = (project: EditorV6Document) => pruneEditorV6TimelineSnapshots(repairEditorV6FaceModeAssetReferences({
    ...project,
    timeline: normalizeEditorV6Timeline(project.timeline)
  }))

  const patchDocument = (transform: (project: EditorV6Document) => EditorV6Document, editSelection = true) => {
    const activeProjectId = dependencies.activeProjectId
    if (!activeProjectId) return
    dependencies.updateActiveProject((project) => {
      if (project.id !== activeProjectId) return project
      const currentFrame = dependencies.getFrame()
      const selected = timelineClips(project.timeline).find(({ block }) =>
        block.id === dependencies.selectedTimelineBlockId && block.elementId === dependencies.selectedElementId)
        ?? (dependencies.selectedElementId
          ? editorV6ClipAtFrame(project.timeline, dependencies.selectedElementId, currentFrame)
          : undefined)
      const next = editSelection
        ? editEditorV6DocumentAtBlock(project, selected?.block.id ?? null, transform)
        : transform(project)
      return finishEdit(next)
    })
    dependencies.markUnsaved()
  }

  const patchFacePreview = (
    projectId: string,
    blockId: string | null | undefined,
    transform: (project: EditorV6Document) => EditorV6Document
  ) => {
    if (dependencies.activeProjectIdRef.current !== projectId) return
    dependencies.updateActiveProject((project) => {
      if (project.id !== projectId) return project
      return finishEdit(editEditorV6DocumentAtBlock(project, blockId ?? null, transform))
    })
    dependencies.markUnsaved()
  }

  const changeScene = (transform: (project: EditorV6Document) => EditorV6Document) => {
    if (!dependencies.activeProject) return
    recordHistory()
    patchDocument((project) => {
      const next = transform(project)
      return { ...next, timeline: syncEditorV6TimelineElements(next.timeline, next.elements) }
    })
  }

  return { recordHistory, patchDocument, patchFacePreview, changeScene }
}
