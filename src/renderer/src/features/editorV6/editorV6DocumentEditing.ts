import { syncEditorV6TimelineElements, type EditorV6Document } from '../../../../shared/editorV6'
import { editorV6ClipAtFrame, findEditorV6TimelineClip, normalizeEditorV6Timeline } from '../../../../shared/editorV6TimelineCore'
import { editEditorV6DocumentAtBlock, pruneEditorV6TimelineSnapshots, repairEditorV6FaceModeAssetReferences } from '../../../../shared/editorV6TimelineEdits'
import { useEditorV6Store } from './editorV6Store'
import { editEditorV6IntroAppearance } from './editorV6IntroInspectorTarget'

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
      const explicit = findEditorV6TimelineClip(project.timeline, dependencies.selectedTimelineBlockId)
      const selected = (explicit?.block.elementId === dependencies.selectedElementId ? explicit : undefined)
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
      const clip = findEditorV6TimelineClip(project.timeline, blockId)
      return finishEdit(clip?.block.intro
        ? editEditorV6IntroAppearance(project, clip.block.id, transform)
        : editEditorV6DocumentAtBlock(project, blockId ?? null, transform))
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

  const patchAppearance = (transform: (project: EditorV6Document) => EditorV6Document) => {
    const block = dependencies.activeProject && findEditorV6TimelineClip(dependencies.activeProject.timeline, dependencies.selectedTimelineBlockId)?.block
    if (block?.intro) patchDocument(project => editEditorV6IntroAppearance(project, block.id, transform), false)
    else patchDocument(transform)
  }
  const changeAppearance = (transform: (project: EditorV6Document) => EditorV6Document) => {
    if (!dependencies.activeProject) return
    recordHistory()
    patchAppearance(transform)
  }

  // An Inspector layout edit leaves timeline structure and element selection alone.
  const changeVideoLayouts = (transform: (project: EditorV6Document) => EditorV6Document) => {
    const current = useEditorV6Store.getState().activeProject
    if (!current || current.id !== dependencies.activeProjectId) return
    const next = transform(current)
    if (next === current) return
    recordHistory(current)
    dependencies.updateActiveProject(project => project === current ? next : project)
    dependencies.markUnsaved()
  }

  return { recordHistory, patchDocument, patchFacePreview, changeScene, changeAppearance, patchAppearance, changeVideoLayouts }
}
