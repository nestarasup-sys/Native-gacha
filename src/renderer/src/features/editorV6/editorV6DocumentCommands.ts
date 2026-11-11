import { syncEditorV6TimelineElements, type EditorV6Document, type EditorV6Element, type EditorV6ProjectSummary, type EditorV6TimelineBlock } from '../../../../shared/editorV6'
import { editorV6ClipAtFrame, normalizeEditorV6Timeline, timelineClips } from '../../../../shared/editorV6TimelineCore'
import { editEditorV6DocumentAtBlock, pruneEditorV6TimelineSnapshots, repairEditorV6FaceModeAssetReferences } from '../../../../shared/editorV6TimelineEdits'
import { editEditorV6BackgroundAtFrame } from '../../../../shared/editorV6TimelineScene'
import { useEditorV6Store } from './editorV6Store'
import { createEditorV6HistoryCommands } from './editorV6HistoryCommands'
import { createEditorV6DocumentImportPersistence } from './editorV6DocumentImportPersistence'

type ActiveProjectIdRef = { current: string | null }
type ProjectUpdater = (update: (project: EditorV6Document) => EditorV6Document) => void

export type EditorV6DocumentCommandDependencies = {
  activeProject: EditorV6Document | null
  activeProjectId: string | null
  activeProjectIdRef: ActiveProjectIdRef
  selectedElementId: string | null
  selectedTimelineBlockId: string | null
  setSelectedElementId: (elementId: string | null) => void
  updateActiveProject: ProjectUpdater
  now: () => string
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

  const { undo, redo } = createEditorV6HistoryCommands({
    project: dependencies.activeProject,
    patchDocument,
    setCanUndo: dependencies.setCanUndo,
    setCanRedo: dependencies.setCanRedo,
    bumpHistoryVersion: dependencies.bumpHistoryVersion
  })

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

  const { loadLatestProject: loadLatestEditorV6Project, persistImportedDocument: persistImportedEditorV6Document } = createEditorV6DocumentImportPersistence({
    activeProjectIdRef: dependencies.activeProjectIdRef,
    getActiveProject: () => useEditorV6Store.getState().activeProject,
    loadProject: (projectId) => window.desktop.editorV6.loadEditorV6Project(projectId),
    recordHistory,
    setActiveProject: dependencies.setActiveProject,
    markUnsaved: dependencies.markUnsaved,
    writeDocumentInOrder: dependencies.writeDocumentInOrder,
    upsertSummary: dependencies.upsertSummary,
    setSaved: dependencies.setSaved,
    setError: dependencies.setError
  })

  const removeStageCharacter = (element: EditorV6Element) => {
    changeScene((document) => {
      const elements = document.elements.filter((item) => item.id !== element.id)
      const stillUsed = new Set(elements.map((item) => item.assetId).filter(Boolean))
      return {
        ...document,
        elements,
        assets: document.assets.filter((asset) => asset.id !== element.assetId || stillUsed.has(asset.id)),
        updatedAt: dependencies.now()
      }
    })
    if (dependencies.selectedElementId === element.id) dependencies.setSelectedElementId(null)
  }

  const updateElement = (id: string, values: Partial<EditorV6Element>, record = true) => {
    const update = (document: EditorV6Document) => ({
      ...document,
      elements: document.elements.map((element) => element.id === id ? { ...element, ...values } : element),
      updatedAt: dependencies.now()
    })
    if (record) changeScene(update)
    else patchDocument(update)
  }

  const updateCharacterNameColor = (characterId: string, color: string) => {
    patchDocument((document) => ({
      ...document,
      characterNameColors: { ...document.characterNameColors, [characterId]: color },
      updatedAt: dependencies.now()
    }), false)
  }

  const updateBalloonScale = (scalePercent: number) => {
    patchDocument((document) => ({ ...document, balloonScalePercent: scalePercent, updatedAt: dependencies.now() }), false)
  }

  const updateBalloonOffsetY = (offsetY: number) => {
    patchDocument((document) => ({ ...document, balloonOffsetY: offsetY, updatedAt: dependencies.now() }), false)
  }

  const updateVideoBlock = (
    blockId: string,
    values: Partial<Pick<EditorV6TimelineBlock, 'mediaLayout' | 'audioEnabled' | 'gain' | 'mediaInFrame'>>,
    record = true
  ) => {
    const update = (document: EditorV6Document) => ({
      ...document,
      timeline: normalizeEditorV6Timeline({
        ...document.timeline,
        tracks: document.timeline.tracks.map((track) => ({
          ...track,
          blocks: track.blocks.map((block) => block.id === blockId ? { ...block, ...values } : block)
        }))
      }),
      updatedAt: dependencies.now()
    })
    if (record) changeScene(update)
    else patchDocument(update)
  }

  const updateBackground = (
    values: Partial<Pick<EditorV6Document, 'backgroundColor' | 'backgroundX' | 'backgroundY' | 'backgroundWidth' | 'backgroundHeight' | 'backgroundRotation'>>,
    record = true
  ) => {
    const frame = dependencies.getFrame()
    const update = (document: EditorV6Document) => ({
      ...editEditorV6BackgroundAtFrame(document, frame, values),
      updatedAt: dependencies.now()
    })
    if (record) changeScene(update)
    else patchDocument(update)
  }

  return {
    patchDocument,
    patchEditorV6FacePreview,
    recordHistory,
    changeScene,
    loadLatestEditorV6Project,
    persistImportedEditorV6Document,
    removeStageCharacter,
    updateElement,
    updateCharacterNameColor,
    updateBalloonScale,
    updateBalloonOffsetY,
    updateVideoBlock,
    updateBackground,
    undo,
    redo
  }
}
