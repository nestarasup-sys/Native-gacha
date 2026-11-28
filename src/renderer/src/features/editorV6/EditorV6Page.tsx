import './editorV6Palette.css'
import { useEditorV6Store } from './editorV6Store'
import { createEditorV6Timeline, videoCharacterTrackColor } from '../../../../shared/editorV6'
import type { EditorV6Document } from '../../../../shared/editorV6'
import { EditorV6Timeline } from './EditorV6Timeline'
import { EditorV6ExportPanel } from './EditorV6ExportPanel'
import { useMotionPreparation } from './motion/useMotionPreparation'
import { EditorV6ProjectBrowser } from './EditorV6ProjectBrowser'
import { EditorV6ToolRail, type EditorV6ToolRailProps } from './EditorV6ToolRail'
import { EditorV6Inspector } from './EditorV6Inspector'
import { EditorV6StageSurface } from './EditorV6StageSurface'
import { EditorV6PlaybackAudio } from './EditorV6PlaybackAudio'
import { getEditorV6PlaybackFrame } from './editorV6PlaybackClock'
import { EditorV6PresetPanel } from './EditorV6PresetPanel'
import { SceneCastManagerModal } from './SceneCastManagerModal'
import { EditorV6PropertyPanel } from './EditorV6PropertyPanel'
import { replicateEditorV6IntroPortrait, updateEditorV6IntroPortrait, updateEditorV6IntroText } from '../../../../shared/editorV6Intro'
import { useEditorV6Playback } from './useEditorV6Playback'
import { duplicateEditorV6ProjectDocument } from './editorV6ProjectDuplication'
import { useEditorV6ProjectCreation } from './useEditorV6ProjectCreation'
import { createEditorV6ProjectDeletionCommand } from './editorV6ProjectDeletion'
import { createEditorV6PrintCommands } from './editorV6PrintCommands'
import { createEditorV6ProjectExitCommand } from './editorV6ProjectExit'
import { createEditorV6DocumentCommands } from './editorV6DocumentCommands'
import { addEditorV6ImageAsset, addEditorV6TimelineMedia } from './editorV6MediaChanges'
import { importEditorV6ImageToProject, importEditorV6MediaToTimeline } from './editorV6MediaImport'
import { prepareEditorV6CastSnapshots } from './editorV6CastSnapshots'
import { createEditorV6CastCommands } from './editorV6CastCommands'
import { projectSceneCharacters } from '../../characters/sceneCharacterProjection'
import { createEditorV6MediaCommands } from './editorV6MediaCommands'
import { createEditorV6TextElementCommand } from './editorV6TextElementCommand'
import { createEditorV6DeleteSelectedCommand } from './editorV6DeleteSelectedCommand'
import { editorV6ClipAtFrame } from '../../../../shared/editorV6TimelineCore'
import { editorV6HasDuplicateAssetIds, repairEditorV6DuplicateAssets } from '../../../../shared/editorV6TimelineEdits'
import { editEditorV6BackgroundAtFrame } from '../../../../shared/editorV6TimelineSceneEdits'
import { useEditorV6InspectorState } from './useEditorV6InspectorState'
import { useEditorV6FaceCatalog } from './useEditorV6FaceCatalog'
import { useEditorV6PoseCatalog } from './useEditorV6PoseCatalog'
import { useEditorV6CharacterAppearance } from './useEditorV6CharacterAppearance'
import { useEditorV6IntroFace } from './useEditorV6IntroFace'
import type { EditorV6Element } from '../../../../shared/editorV6'
import { createSceneFaceActions } from '../../characters/sceneFaceActions'
import { useFaceExpressionCatalog } from '../../characters/useFaceExpressionCatalog'
import { createDefaultSceneFaceTransform } from '../../characters/sceneFaceSelection'
import { useEditorV6StageInteraction, type EditorV6StageDrag } from './useEditorV6StageInteraction'
import { createEditorV6SceneViewModel } from './editorV6SceneViewModel'
import { bakeEditorV6FaceModeAssets, EDITOR_V6_FACE_RENDER_VERSION } from './faceModeAssets'
import { lazy, Profiler, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { editorV6ExpressionCollection } from './expressionTransforms'
import { NumericRangeField } from '../../ui/components/NumericRangeField'
import { SceneCastPickerModal } from '../../ui/components/SceneCastPickerModal'
import { createSceneTextElement, sceneCatalogColor } from '../../ui/sceneEditorDefaults'
import { recordUiCommit } from '../../ui/performanceDiagnostics'
import { useEditorV6DocumentPersistence } from './useEditorV6DocumentPersistence'
import { useEditorV6CharacterSources } from './useEditorV6CharacterSources'
import { resolveEditorV6CharacterSourceRefresh } from './editorV6CharacterSourceModel'
import { useEditorV6CharacterSnapshotRefresh } from './useEditorV6CharacterSnapshotRefresh'
import { useEditorV6ProjectLibrary } from './useEditorV6ProjectLibrary'
import { useEditorV6ProjectionAutosave } from './useEditorV6ProjectionAutosave'
import { fitEditorV6CharacterToStage } from '../../../../shared/editorV6CharacterGeometry'
import { editorV6CharacterStageReference } from './editorV6CharacterStageReference'
import {
  editorV6ProjectSummary,
  type EditorV6FaceTransform,
  type EditorV6FaceTransforms,
  type EditorV6LibraryMediaItem,
  type EditorV6ProjectSummary
} from '../../../../shared/editorV6'
import { createEditorV6AddObjectCommand } from './editorV6AddObjectCommand'
import { useEditorV6KeyboardShortcuts } from './editorV6KeyboardShortcuts'
import { resetEditorV6ProjectSession } from './editorV6ProjectSession'
import { openEditorV6Project } from './editorV6ProjectNavigation'
import { completeEditorV6ProjectImport } from './editorV6ProjectImportCompletion'
import { createEditorV6StageSelectionCommands } from './editorV6StageSelection'
import { shouldLoadEditorV6FaceCatalog, shouldLoadEditorV6PresetCatalog } from './editorV6FaceCatalogModel'
import { EditorV6FaceInspectorPanel } from './EditorV6FaceInspectorPanel'
import type { VideoBackgroundLibraryItem } from '../../../../shared/studio'
type EditorV6Card = EditorV6ProjectSummary
type Tool = 'background' | 'objects' | null
const defaultStudioEyeTransform: EditorV6FaceTransform = createDefaultSceneFaceTransform()

const EditorV6VideoPickerModal = lazy(async () => ({
  default: (await import('./EditorV6VideoPickerModal')).EditorV6VideoPickerModal
}))
const EditorV6AudioLibraryPicker = lazy(async () => ({
  default: (await import('./EditorV6AudioLibraryPicker')).EditorV6AudioLibraryPicker
}))

/** Layout do Editor V6. */
export function EditorV6Page() {
  const editorV6Projects = useEditorV6Store((state) => state.projects)
  const setEditorV6Projects = useEditorV6Store((state) => state.setProjects)
  const activeEditorV6Stored = useEditorV6Store((state) => state.activeProject)
  const setActiveEditorV6Project = useEditorV6Store((state) => state.setActiveProject)
  const updateActiveEditorV6Project = useEditorV6Store((state) => state.updateActiveProject)
  const upsertEditorV6Summary = useEditorV6Store((state) => state.upsertSummary)
  const removeEditorV6Summary = useEditorV6Store((state) => state.removeSummary)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [castPickerOpen, setCastPickerOpen] = useState(false)
  const [castManagerOpen, setCastManagerOpen] = useState(false)
  const [castSelection, setCastSelection] = useState<string[]>([])
  const [savingCast, setSavingCast] = useState(false)
  const {
    inspectorTab,
    setInspectorTab,
    inspectorCustomView,
    setInspectorCustomView,
    characterInspectorViewRef,
    editorV6PresetCategory,
    setEditorV6PresetCategory,
    editorV6ExpressionCollections,
    setEditorV6ExpressionCollections,
    editorV6ExpressionPresets,
    setEditorV6ExpressionPresets,
    editorV6ExpressionCollectionMenuOpen,
    setEditorV6ExpressionCollectionMenuOpen,
    editorV6ExpressionLoading,
    setEditorV6ExpressionLoading,
    editorV6ExpressionBusy,
    setEditorV6ExpressionBusy,
    inspectorOpen,
    setInspectorOpen,
    editorV6FaceCategory,
    setEditorV6FaceCategory,
    editorV6FaceBusy,
    setEditorV6FaceBusy
  } = useEditorV6InspectorState()
  const [studioFolder, setEditorV6Folder] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeEditorV6Id, setActiveEditorV6IdState] = useState<string | null>(null)
  const activeEditorV6IdRef = useRef<string | null>(null)
  const setActiveEditorV6Id = useCallback((id: string | null) => {
    activeEditorV6IdRef.current = id
    setActiveEditorV6IdState(id)
  }, [])
  const [exportInProgress, setExportInProgress] = useState(false)
  const exportInProgressRef = useRef(false)
  const onExportActivity = useCallback((active: boolean) => {
    exportInProgressRef.current = active
    setExportInProgress(active)
  }, [])
  const { availableCharacters, availableCharactersReady, availableCharacterById, activePoseSourceSnapshot } =
    useEditorV6CharacterSources(activeEditorV6Id, setError, exportInProgress, exportInProgressRef)
  const [activeTool, setActiveTool] = useState<Tool>(null)
  const [sharedBackgrounds, setSharedBackgrounds] = useState<VideoBackgroundLibraryItem[]>([])
  const [sharedObjects, setSharedObjects] = useState<EditorV6LibraryMediaItem[]>([])
  const refreshBackgroundLibrary = async () => {
    const items = await window.desktop.videoBackgrounds.listVideoBackgroundLibrary()
    setSharedBackgrounds(items)
  }
  const refreshObjectLibrary = async () => setSharedObjects(await window.desktop.editorV6MediaLibrary.list('object'))
  useEffect(() => {
    if (activeTool === 'background')
      void refreshBackgroundLibrary().catch((reason) =>
        setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os fundos compartilhados.')
      )
    if (activeTool === 'objects')
      void refreshObjectLibrary().catch((reason) =>
        setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a biblioteca de objetos.')
      )
  }, [activeTool, activeEditorV6Id])
  const [fullView, setFullView] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [videoPickerOpen, setVideoPickerOpen] = useState(false)
  const [audioPickerOpen, setAudioPickerOpen] = useState(false)
  const [reactImportOpen, setReactImportOpen] = useState(false)
  const [saved, setSaved] = useState(true)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [selectedTimelineBlockId, setSelectedTimelineBlockId] = useState<string | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const sceneRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<EditorV6StageDrag | null>(null)
  const editorV6FaceTransformsRef = useRef<Record<string, EditorV6FaceTransforms>>({})
  const nextStudioNumber = useRef(1)
  const editorV6SaveTimerRef = useRef<number | null>(null)
  const selectedEditorV6 = editorV6Projects.find((studio) => studio.id === selectedId) ?? null
  const activeEditorV6 = activeEditorV6Stored?.id === activeEditorV6Id ? activeEditorV6Stored : null
  const timelineDurationFrames = activeEditorV6?.timeline.durationFrames ?? 300
  const hasDuplicateAssets = useMemo(
    () => editorV6HasDuplicateAssetIds(activeEditorV6?.assets ?? []),
    [activeEditorV6?.assets]
  )
  const { playheadFrame, isPlaying, publishPlayheadFrame, pausePlayback, resetPlayback, startPlayback } =
    useEditorV6Playback(activeEditorV6Id, timelineDurationFrames)
  const sceneCharacterProjection = useMemo(
    () => projectSceneCharacters(activeEditorV6?.elements ?? []),
    [activeEditorV6?.elements]
  )
  const {
    trackOperation: trackEditorV6Operation,
    writeDocument: writeEditorV6Document,
    writeInOrder: writeEditorV6DocumentInOrder,
    saveActiveProject: saveActiveEditorV6Project,
    flushDocumentWrites: flushEditorV6DocumentWrites,
    flushWrites: flushEditorV6Writes,
    markUnsaved: markEditorV6Unsaved
  } = useEditorV6DocumentPersistence({
    activeProject: activeEditorV6,
    activeProjectIdRef: activeEditorV6IdRef,
    saved,
    saveTimerRef: editorV6SaveTimerRef,
    setSaved,
    setError,
    updateActiveProject: updateActiveEditorV6Project
  })
  useEditorV6ProjectLibrary({
    activeProjectId: activeEditorV6Id,
    setProjects: setEditorV6Projects,
    setFolder: setEditorV6Folder,
    setLoading,
    setError,
    setSaved,
    setActiveProjectId: setActiveEditorV6Id,
    setActiveProject: setActiveEditorV6Project,
    pausePlayback,
    publishPlayheadFrame,
    writeDocument: writeEditorV6Document,
    createTimeline: createEditorV6Timeline
  })
  const { faceAssetRefreshRequired } = useMemo(
    () =>
      resolveEditorV6CharacterSourceRefresh({
        project: activeEditorV6,
        characterById: availableCharacterById,
        poseSourceSnapshot: activePoseSourceSnapshot,
        faceRendererVersion: EDITOR_V6_FACE_RENDER_VERSION
      }),
    [activeEditorV6, availableCharacterById, activePoseSourceSnapshot]
  )
  const characterSnapshotsRefreshing = useEditorV6CharacterSnapshotRefresh({
    project: activeEditorV6,
    availableCharacters,
    availableCharactersReady,
    poseSourceSnapshot: activePoseSourceSnapshot,
    exportInProgress,
    exportInProgressRef,
    updateProject: updateActiveEditorV6Project,
    markUnsaved: markEditorV6Unsaved,
    pausePlayback,
    reportError: setError
  })
  const characterSourceRefreshRequired =
    !availableCharactersReady || faceAssetRefreshRequired || characterSnapshotsRefreshing
  useMotionPreparation(
    activeEditorV6,
    availableCharacters,
    saved &&
      !isPlaying &&
      !exportInProgress &&
      !characterSourceRefreshRequired &&
      activePoseSourceSnapshot?.projectId === activeEditorV6Id
  )
  const {
    previewBackground,
    inspectorSelection: editorV6Selection,
    selectedEditorV6Character,
    selectedEditorV6CharacterModelSlot,
    selectedEditorV6PoseSlot,
    selectedEditorV6FaceAppearance: sourceFaceAppearance,
    selectedEditorV6FaceMode
  } = useMemo(
    () =>
      createEditorV6SceneViewModel({
        project: activeEditorV6,
        availableCharacters,
        playheadFrame,
        selectedTimelineBlockId,
        selectedElementId
      }),
    [activeEditorV6, availableCharacters, playheadFrame, selectedTimelineBlockId, selectedElementId]
  )
  useEffect(() => {
    if (!activeEditorV6 || !hasDuplicateAssets) return
    updateActiveEditorV6Project((project) =>
      project.id === activeEditorV6.id ? repairEditorV6DuplicateAssets(project, selectedTimelineBlockId) : project
    )
    markEditorV6Unsaved()
  }, [activeEditorV6, hasDuplicateAssets, selectedTimelineBlockId, markEditorV6Unsaved])
  const {
    selectedTimelineIntroClip,
    selectedTimelineVideoClip,
    selectedTimelineCardClip,
    selectedTimelineCardOwner,
    selectedTimelineVideo,
    selectedElement: sourceElement,
    selectedCharacterElement,
    selectedBackgroundAsset
  } = editorV6Selection
  const selectedElement = useEditorV6IntroFace(sourceElement, selectedEditorV6Character, Boolean(selectedTimelineIntroClip))
  const selectedEditorV6FaceAppearance = selectedElement?.faceAppearance ?? sourceFaceAppearance
  const selectedEditorV6ExpressionCollectionId = editorV6ExpressionCollection(
    selectedElement,
    editorV6ExpressionPresets
  )
  const editorV6PresetCatalogEnabled = shouldLoadEditorV6PresetCatalog(inspectorOpen, inspectorTab, inspectorCustomView)
  const {
    poseSlots: editorV6PoseSlots,
    poseThumbnails: editorV6PoseThumbnails,
    poseDimensions: editorV6PoseDimensions
  } = useEditorV6PoseCatalog(selectedEditorV6CharacterModelSlot, setError, editorV6PresetCatalogEnabled)
  const reportFaceCatalogError = useCallback((reason: unknown) => {
    setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o catálogo de rosto.')
  }, [])
  const {
    items: editorV6FaceItems,
    details: editorV6FaceDetails,
    loading: editorV6FaceLoading,
    loadingRequiredDetails: editorV6FaceDetailsLoading,
    loadItem: loadEditorV6FaceCatalogItem,
    openMouthId: selectedEditorV6OpenMouthId,
    selectedItemId: selectedEditorV6FaceCatalogItemId,
    sheetKind: selectedEditorV6FaceSheetKind
  } = useEditorV6FaceCatalog(
    selectedEditorV6CharacterModelSlot,
    editorV6FaceCategory,
    selectedEditorV6FaceMode,
    selectedEditorV6FaceAppearance,
    reportFaceCatalogError,
    shouldLoadEditorV6FaceCatalog(inspectorOpen, inspectorTab)
  )
  const selectedEditorV6OpenMouth =
    selectedEditorV6OpenMouthId && selectedEditorV6CharacterModelSlot !== null
      ? editorV6FaceDetails[`${selectedEditorV6CharacterModelSlot}:${selectedEditorV6OpenMouthId}`]
      : undefined
  const selectedEditorV6TalkAvailable = Boolean(
    selectedEditorV6OpenMouth?.pieces.some(
      (piece) => piece.sheet === 'mouth-open' && piece.index === selectedEditorV6FaceAppearance?.expressionIndex
    )
  )
  const stageCharacters = sceneCharacterProjection.characters

  const allStageCharactersLocked =
    stageCharacters.length > 0 && stageCharacters.every((element) => element.positionLocked === true)
  const rememberCharacterInspectorView = (
    tab: 'editor' | 'custom',
    customView: 'face' | 'presets' = inspectorCustomView
  ) => {
    if (selectedElement?.kind === 'character') characterInspectorViewRef.current = { tab, customView }
  }
  const restoreCharacterInspectorView = () => {
    setInspectorTab(characterInspectorViewRef.current.tab)
    setInspectorCustomView(characterInspectorViewRef.current.customView)
  }

  useEffect(() => {
    if (selectedElement?.kind === 'character')
      editorV6FaceTransformsRef.current[selectedElement.id] = selectedElement.faceTransforms ?? {}
  }, [activeEditorV6Id, selectedElement?.id, selectedElement?.faceTransforms])

  useEffect(() => {
    setEditorV6ExpressionCollectionMenuOpen(false)
  }, [activeEditorV6Id, selectedElement?.id, selectedEditorV6CharacterModelSlot])

  useFaceExpressionCatalog({
    modelSlot: selectedEditorV6CharacterModelSlot,
    enabled: editorV6PresetCatalogEnabled,
    setCollections: setEditorV6ExpressionCollections,
    setPresets: setEditorV6ExpressionPresets,
    setLoading: setEditorV6ExpressionLoading,
    setError,
    errorFallback: 'Não foi possível carregar os presets de expressão.'
  })

  useEffect(() => {
    resetEditorV6ProjectSession(activeEditorV6Id, {
      clearHistory: (projectId) => useEditorV6Store.getState().clear(projectId),
      resetPlayback,
      clearTimelineSelection: () => setSelectedTimelineBlockId(null),
      clearHistoryAvailability: () => {
        setCanUndo(false)
        setCanRedo(false)
      },
      bumpHistoryVersion: () => setHistoryVersion((value) => value + 1),
      clearElementSelection: () => setSelectedElementId(null)
    })
  }, [activeEditorV6Id, resetPlayback])

  const {
    creatingProject,
    createStudio,
    duplicateStudio: duplicateEditorV6Project
  } = useEditorV6ProjectCreation({
    projects: () => editorV6Projects,
    nextNumber: nextStudioNumber,
    activeProject: () => activeEditorV6,
    createTimeline: createEditorV6Timeline,
    colorForNumber: sceneCatalogColor,
    projectSummary: editorV6ProjectSummary,
    duplicateDocument: duplicateEditorV6ProjectDocument,
    createId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
    loadProject: (projectId) => window.desktop.editorV6.loadEditorV6Project(projectId),
    cloneExportAudio: (sourceId, duplicateId, audio) =>
      window.desktop.editorV6.cloneEditorV6ExportAudio(sourceId, duplicateId, audio),
    cloneMedia: (sourceId, duplicateId, media) =>
      window.desktop.editorV6.cloneEditorV6Media(sourceId, duplicateId, media),
    writeDocument: writeEditorV6Document,
    upsertSummary: upsertEditorV6Summary,
    selectProject: setSelectedId,
    setSaved,
    setError,
    trackOperation: trackEditorV6Operation
  })
  const duplicateStudio = (sourceSummary: EditorV6Card | null = selectedEditorV6) =>
    duplicateEditorV6Project(sourceSummary)

  useEditorV6ProjectionAutosave({
    project: activeEditorV6,
    signature: sceneCharacterProjection.autosaveSignature,
    dragRef,
    saveTimerRef: editorV6SaveTimerRef,
    markUnsaved: markEditorV6Unsaved,
    saveProject: saveActiveEditorV6Project
  })

  const {
    patchDocument,
    patchEditorV6FacePreview,
    recordHistory,
    changeScene,
    changeAppearance,
    patchAppearance,
    loadLatestEditorV6Project,
    persistImportedEditorV6Document,
    undo,
    redo,
    removeStageCharacter,
    updateElement,
    updateCharacterNameColor,
    updateBalloonScale,
    updateBalloonOffsetY,
    resetBalloonPosition,
    updateVideoBlock,
    applyVideoWidthToAll,
    updateBackground
  } = createEditorV6DocumentCommands({
    activeProject: activeEditorV6,
    activeProjectId: activeEditorV6Id,
    activeProjectIdRef: activeEditorV6IdRef,
    selectedElementId,
    selectedTimelineBlockId,
    setSelectedElementId,
    updateActiveProject: updateActiveEditorV6Project,
    now: () => new Date().toISOString(),
    setActiveProject: setActiveEditorV6Project,
    markUnsaved: markEditorV6Unsaved,
    writeDocumentInOrder: writeEditorV6DocumentInOrder,
    upsertSummary: upsertEditorV6Summary,
    setSaved,
    setError,
    setCanUndo,
    setCanRedo,
    bumpHistoryVersion: () => setHistoryVersion((value) => value + 1),
    getFrame: getEditorV6PlaybackFrame
  })
  const updateInspectorCharacter = (id: string, values: Partial<EditorV6Element>, record = true) => {
    if (selectedTimelineIntroClip?.block.id !== id) return updateElement(id, values, record)
    const edit = record ? changeAppearance : patchAppearance
    const restoredFace = sourceElement !== selectedElement ? {
      faceAppearance: selectedElement?.faceAppearance, expressionBase: selectedElement?.expressionBase, faceTransforms: selectedElement?.faceTransforms,
      activeExpressionGaze: selectedElement?.activeExpressionGaze, activeExpressionEffects: selectedElement?.activeExpressionEffects,
      activeExpressionCollectionId: selectedElement?.activeExpressionCollectionId
    } : {}
    edit(project => ({ ...project, elements: project.elements.map(element => element.id === id ? { ...element, ...restoredFace, ...values } : element) }))
  }
  const {
    facePreview: editorV6FacePreview,
    applyFaceAppearance: applyStudioFaceAppearance,
    applyPose: applyStudioPose,
    applyIntroPoseToAll,
    updateFaceTransform: updateEditorV6FaceTransform,
    finishFaceTransform: finishEditorV6FaceTransform
  } = useEditorV6CharacterAppearance({
    activeProject: activeEditorV6,
    activeProjectId: activeEditorV6Id,
    transformsRef: editorV6FaceTransformsRef,
    patchProject: patchEditorV6FacePreview,
    setError,
    selectedElement,
    selectedCharacter: selectedEditorV6Character,
    selectedFaceAppearance: selectedEditorV6FaceAppearance,
    faceBusy: editorV6FaceBusy,
    setFaceBusy: setEditorV6FaceBusy,
    poseSourceSnapshot: activePoseSourceSnapshot,
    changeScene: changeAppearance,
    patchDocument: patchAppearance,
    selectedTimelineBlockId,
    defaultTransform: defaultStudioEyeTransform,
    updateElement: updateInspectorCharacter,
    intro: selectedTimelineIntroClip ? { characters: availableCharacters, commit: changeScene } : undefined,
    getFrame: getEditorV6PlaybackFrame
  })
  const {
    importImage,
    importTimelineMedia,
    linkVideoLibraryItem,
    linkAudioLibraryItem,
    selectBackground,
    linkSharedBackground,
    linkSharedObject
  } = createEditorV6MediaCommands({
    activeProject: activeEditorV6,
    trackOperation: trackEditorV6Operation,
    bridge: window.desktop.editorV6,
    backgroundLibrary: window.desktop.videoBackgrounds,
    mediaLibrary: window.desktop.editorV6MediaLibrary,
    refreshBackgroundLibrary,
    refreshObjectLibrary,
    importImageToProject: importEditorV6ImageToProject,
    importMediaToTimeline: importEditorV6MediaToTimeline,
    addImageAsset: addEditorV6ImageAsset,
    addTimelineMedia: addEditorV6TimelineMedia,
    findClipAtFrame: editorV6ClipAtFrame,
    editBackgroundAtFrame: editEditorV6BackgroundAtFrame,
    pausePlayback,
    publishPlayheadFrame,
    getFrame: getEditorV6PlaybackFrame,
    loadLatestProject: loadLatestEditorV6Project,
    persistImportedDocument: persistImportedEditorV6Document,
    setError,
    setVideoPickerOpen,
    setAudioPickerOpen,
    setSelectedElementId,
    setSelectedTimelineBlockId,
    setActiveTool,
    setInspectorOpen,
    setInspectorTab,
    changeScene,
    createId: () => crypto.randomUUID()
  })

  const addTextElement = createEditorV6TextElementCommand({
    activeProject: activeEditorV6,
    selectedCharacterElement,
    pausePlayback,
    getFrame: getEditorV6PlaybackFrame,
    createTextElement: createSceneTextElement,
    createBlockId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
    changeScene,
    setError,
    setSelectedElementId,
    setSelectedTimelineBlockId,
    setInspectorOpen,
    setInspectorTab
  })

  const stageSelection = createEditorV6StageSelectionCommands({
    project: activeEditorV6,
    stageCharacters,
    allPositionsLocked: allStageCharactersLocked,
    currentFrame: getEditorV6PlaybackFrame,
    seek: publishPlayheadFrame,
    pausePlayback,
    changeScene,
    now: () => new Date().toISOString(),
    setCastSelection,
    setCastPickerOpen,
    setSelectedElementId,
    setSelectedTimelineBlockId,
    setActiveTool,
    setInspectorOpen,
    setInspectorTab,
    restoreCharacterInspectorView
  })

  const { saveCastSelection } = createEditorV6CastCommands({
    activeProject: activeEditorV6,
    availableCharacters,
    selectedCharacterIds: castSelection,
    saving: savingCast,
    sourceSnapshot: activePoseSourceSnapshot,
    getStageSize: () => ({ width: 1920, height: 1080 }),
    prepareSnapshots: async (input) => {
      const { prepareSavedCharacterRenderer } = await import('../../characters/editorV6CharacterRenderer')
      return prepareEditorV6CastSnapshots(input, {
        prepareRenderer: prepareSavedCharacterRenderer,
        bakeAssets: bakeEditorV6FaceModeAssets,
        getStageReference: editorV6CharacterStageReference,
        fitToStage: fitEditorV6CharacterToStage,
        createId: () => crypto.randomUUID()
      })
    },
    changeScene,
    setSaving: setSavingCast,
    setPickerOpen: setCastPickerOpen,
    setActiveTool,
    restoreInspectorView: restoreCharacterInspectorView,
    setInspectorOpen,
    setSelectedElementId,
    setError
  })

  const {
    applyBaseExpression: applyEditorV6BaseExpression,
    applyExpressionPreset: applyEditorV6ExpressionPreset,
    applyFaceMode: applyEditorV6FaceMode,
    chooseFaceSheet: chooseEditorV6FaceSheet,
    updateFaceVariant: updateEditorV6FaceVariant
  } = createSceneFaceActions({
    character: selectedEditorV6Character,
    element: selectedElement,
    appearance: selectedEditorV6FaceAppearance,
    faceMode: selectedEditorV6FaceMode,
    modelSlot: selectedEditorV6CharacterModelSlot,
    openMouthCatalogId: selectedEditorV6OpenMouthId,
    expressionCollectionId: selectedEditorV6ExpressionCollectionId,
    expressionBusy: editorV6ExpressionBusy,
    faceBusy: editorV6FaceBusy,
    setExpressionBusy: setEditorV6ExpressionBusy,
    setError,
    loadCatalogItem: loadEditorV6FaceCatalogItem,
    applyAppearance: applyStudioFaceAppearance
  })

  const { cancelSceneDrag, interaction: sceneInteraction } = useEditorV6StageInteraction(
    {
      project: activeEditorV6,
      sceneRef,
      faceBusy: editorV6FaceBusy,
      expressionBusy: editorV6ExpressionBusy,
      faceRenderRunningRef: editorV6FacePreview.renderRunningRef,
      setSelectedElementId,
      setActiveTool,
      setInspectorOpen,
      setInspectorTab,
      setSelectedTimelineBlockId,
      restoreCharacterInspectorView,
      pausePlayback,
      publishPlayheadFrame,
      updateActiveProject: updateActiveEditorV6Project,
      markUnsaved: markEditorV6Unsaved,
      recordHistory
    },
    dragRef
  )

  const deleteSelected = createEditorV6DeleteSelectedCommand({
    activeProject: activeEditorV6,
    selectedElementId,
    selectedTimelineVideoBlockId: selectedTimelineVideoClip?.block.id ?? null,
    selectedTimelineCardBlockId: selectedTimelineCardClip?.block.id ?? null,
    selectedTimelineIntroBlockId: selectedTimelineIntroClip?.block.id,
    getFrame: getEditorV6PlaybackFrame,
    editBackgroundAtFrame: editEditorV6BackgroundAtFrame,
    now: () => new Date().toISOString(),
    changeScene,
    removeStageCharacter,
    setSelectedElementId,
    setSelectedTimelineBlockId
  })

  const deleteProject = createEditorV6ProjectDeletionCommand({
    activeProjectId: activeEditorV6Id,
    activeProjectIdRef: activeEditorV6IdRef,
    flushDocumentWrites: flushEditorV6DocumentWrites,
    deleteProject: (projectId) => window.desktop.editorV6.deleteEditorV6Project(projectId),
    removeSummary: removeEditorV6Summary,
    setSelectedProject: setSelectedId,
    pausePlayback,
    setActiveProjectId: setActiveEditorV6Id,
    setSaved,
    setError,
    trackOperation: trackEditorV6Operation
  })
  const { exportPrint, openPrints } = createEditorV6PrintCommands({
    trackOperation: trackEditorV6Operation,
    flushDocumentWrites: flushEditorV6DocumentWrites,
    getFrame: getEditorV6PlaybackFrame,
    captureFrame: async (project, frame, width, height, mimeType) => {
      const { captureEditorV6Frame } = await import('./sceneCapture')
      return captureEditorV6Frame(project, frame, width, height, mimeType)
    },
    savePrint: (projectId, dataUrl) => window.desktop.editorV6.saveEditorV6Print(projectId, dataUrl),
    openPrints: (projectId) => window.desktop.editorV6.openEditorV6Prints(projectId),
    setError,
    setNotice
  })
  const deleteStudio = async (target: EditorV6Card | null = selectedEditorV6) => {
    if (!target || !window.confirm(`Excluir ${target.title}?`)) return
    await deleteProject(target)
  }

  const leaveStudio = createEditorV6ProjectExitCommand({
    flushWrites: flushEditorV6Writes,
    pausePlayback,
    clearActiveProject: () => setActiveEditorV6Id(null),
    clearActiveTool: () => setActiveTool(null),
    clearSelection: () => setSelectedElementId(null),
    exitFullView: () => setFullView(false),
    setError
  })

  useEditorV6KeyboardShortcuts({
    castPickerOpen: castPickerOpen || castManagerOpen,
    savingCast,
    fullView,
    project: activeEditorV6,
    historyVersion,
    dragActive: () => dragRef.current !== null,
    cancelDrag: cancelSceneDrag,
    closeCastPicker: () => {
      setCastPickerOpen(false)
      setCastManagerOpen(false)
    },
    exitFullView: () => setFullView(false),
    undo,
    redo
  })

  const control = (
    label: string,
    value: number,
    onChange: (value: number, record?: boolean) => void,
    min: number,
    max: number,
    suffix = '%',
    onFinish?: () => void,
    disabled = false,
    precision = 1
  ) => (
    <NumericRangeField
      key={label}
      label={label}
      value={value}
      onChange={onChange}
      onStart={() => recordHistory()}
      onFinish={onFinish}
      disabled={disabled}
      min={min}
      max={max}
      suffix={suffix}
      precision={precision}
    />
  )

  const addObjectAsset = createEditorV6AddObjectCommand({
    activeProject: activeEditorV6,
    getFrame: getEditorV6PlaybackFrame,
    createId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
    changeScene,
    setError,
    setSelectedElementId,
    setSelectedTimelineBlockId,
    setInspectorOpen,
    setInspectorTab
  })

  const propertyPanel = (): ReactNode => (
    <EditorV6PropertyPanel
      project={activeEditorV6}
      activeTool={activeTool}
      background={previewBackground}
      selectedElementId={selectedElementId}
      selectedElement={selectedElement}
      characterNameColor={
        selectedElement?.kind === 'character' && selectedElement.characterId
          ? (activeEditorV6?.characterNameColors?.[selectedElement.characterId] ??
            videoCharacterTrackColor(selectedElement.characterId))
          : null
      }
      balloonScalePercent={activeEditorV6?.balloonScalePercent ?? 100}
      balloonOffsetY={activeEditorV6?.balloonOffsetY ?? 0}
      selectedBackgroundAsset={selectedBackgroundAsset}
      sharedBackgrounds={sharedBackgrounds}
      sharedObjects={sharedObjects}
      selectedVideoBlock={selectedTimelineVideoClip?.block ?? null}
      selectedVideoCardClip={selectedTimelineCardClip}
      videoCardOwnerStartFrame={selectedTimelineCardOwner?.block.startFrame}
      selectedIntroClip={selectedTimelineIntroClip}
      selectedVideo={selectedTimelineVideo ?? null}
      control={control}
      onBackgroundChange={updateBackground}
      onImportImage={importImage}
      onSelectBackground={selectBackground}
      onLinkSharedBackground={linkSharedBackground}
      onLinkSharedObject={linkSharedObject}
      onAddObject={addObjectAsset}
      onUpdateElement={updateElement}
      onUpdateCharacterNameColor={updateCharacterNameColor}
      onUpdateBalloonScale={updateBalloonScale}
      onUpdateBalloonOffsetY={updateBalloonOffsetY}
      onResetBalloonPosition={resetBalloonPosition}
      onUpdateVideoBlock={updateVideoBlock}
      onUpdateVideoCard={(id, values, record = true) => {
        const update = (document: EditorV6Document) => ({
          ...document,
          timeline: { ...document.timeline, tracks: document.timeline.tracks.map(track =>
            track.kind !== 'card' || track.locked ? track : { ...track, blocks: track.blocks.map(block =>
              block.id === id ? { ...block, ...values } : block) }) },
          updatedAt: new Date().toISOString()
        })
        if (record) changeScene(update)
        else patchDocument(update)
      }}
      onApplyVideoWidthToAll={applyVideoWidthToAll}
      onUpdateIntroText={(id, field, value) => changeScene(project => updateEditorV6IntroText(project, id, field, value))}
      onReplicateIntroPortrait={(id, property) => changeScene(project => replicateEditorV6IntroPortrait(project, id, property))}
      onUpdateIntroPortrait={(id, values, record = true) => {
        if (record) recordHistory()
        patchDocument(project => updateEditorV6IntroPortrait(project, id, values), false)
      }}
      onRecordHistory={() => recordHistory()}
      onDeleteSelected={deleteSelected}
    />
  )

  const customPanel = (): ReactNode => {
    if (
      !selectedEditorV6Character ||
      selectedElement?.kind !== 'character' ||
      selectedEditorV6CharacterModelSlot === null
    ) {
      return (
        <div className="studio-custom-empty">
          <strong>Personalizar personagem</strong>
          <span>Selecione um personagem na prévia ou no elenco para escolher as peças do rosto.</span>
        </div>
      )
    }
    return (
      <EditorV6FaceInspectorPanel
        modelSlot={selectedEditorV6CharacterModelSlot}
        category={editorV6FaceCategory}
        sheetKind={selectedEditorV6FaceSheetKind}
        selectedItemId={selectedEditorV6FaceCatalogItemId}
        items={editorV6FaceItems}
        details={editorV6FaceDetails}
        appearance={selectedEditorV6FaceAppearance}
        faceMode={selectedEditorV6FaceMode}
        faceBusy={editorV6FaceBusy}
        expressionBusy={editorV6ExpressionBusy}
        catalogLoading={editorV6FaceLoading}
        detailsLoading={editorV6FaceDetailsLoading}
        talkAvailable={selectedEditorV6TalkAvailable}
        element={selectedElement}
        onCategoryChange={setEditorV6FaceCategory}
        onFaceModeChange={(mode) => {
          void applyEditorV6FaceMode(mode)
        }}
        onSheetSelect={(summary) => {
          void chooseEditorV6FaceSheet(summary)
        }}
        onAppearanceChange={updateEditorV6FaceVariant}
        onUpdateTransform={updateEditorV6FaceTransform}
        onFinishTransform={finishEditorV6FaceTransform}
        onRecordHistory={() => recordHistory()}
      />
    )
  }

  const toggleTimelinePlayback = () => {
    if (dragRef.current) return
    if (isPlaying) {
      pausePlayback()
      return
    }
    startPlayback()
  }

  type ToolRailCallbacks = Pick<
    EditorV6ToolRailProps,
    | 'onBack'
    | 'onSave'
    | 'onUndo'
    | 'onRedo'
    | 'onSelectTool'
    | 'onAddText'
    | 'onImportTimelineMedia'
    | 'onOpenCastManager'
    | 'onExport'
    | 'onPrint'
    | 'onOpenPrints'
    | 'onEnterFullView'
  >
  const toolRailActionsRef = useRef<ToolRailCallbacks | null>(null)
  toolRailActionsRef.current = {
    onBack: () => {
      void leaveStudio()
    },
    onSave: () => {
      void flushEditorV6Writes().catch(() => undefined)
    },
    onUndo: undo,
    onRedo: redo,
    onSelectTool: (tool) => {
      setActiveTool(tool)
      setInspectorOpen(true)
      setInspectorTab('editor')
    },
    onAddText: addTextElement,
    onImportTimelineMedia: (kind) => {
      void importTimelineMedia(kind)
    },
    onOpenCastManager: () => setCastManagerOpen(true),
    onExport: () => {
      pausePlayback()
      setExportOpen(true)
    },
    onPrint: () => {
      if (activeEditorV6) void exportPrint(activeEditorV6)
    },
    onOpenPrints: () => {
      if (activeEditorV6) void openPrints(activeEditorV6.id)
    },
    onEnterFullView: () => setFullView(true)
  }
  const railBack = useCallback(() => toolRailActionsRef.current?.onBack(), [])
  const railSave = useCallback(() => toolRailActionsRef.current?.onSave(), [])
  const railUndo = useCallback(() => toolRailActionsRef.current?.onUndo(), [])
  const railRedo = useCallback(() => toolRailActionsRef.current?.onRedo(), [])
  const railSelectTool = useCallback(
    (tool: Parameters<ToolRailCallbacks['onSelectTool']>[0]) => toolRailActionsRef.current?.onSelectTool(tool),
    []
  )
  const railAddText = useCallback(
    (kind: Parameters<ToolRailCallbacks['onAddText']>[0]) => toolRailActionsRef.current?.onAddText(kind),
    []
  )
  const railImportMedia = useCallback(
    (kind: Parameters<ToolRailCallbacks['onImportTimelineMedia']>[0]) =>
      toolRailActionsRef.current?.onImportTimelineMedia(kind),
    []
  )
  const railOpenCastManager = useCallback(() => toolRailActionsRef.current?.onOpenCastManager(), [])
  const railExport = useCallback(() => toolRailActionsRef.current?.onExport(), [])
  const railPrint = useCallback(() => toolRailActionsRef.current?.onPrint(), [])
  const railOpenPrints = useCallback(() => toolRailActionsRef.current?.onOpenPrints(), [])
  const railEnterFullView = useCallback(() => toolRailActionsRef.current?.onEnterFullView(), [])

  if (activeEditorV6) {
    return (
      <Profiler id="/editor-v6/page" onRender={recordUiCommit}>
        <main
          className={`studio-editor v6-colored-workspace${fullView ? ' full-view' : ''}`}
          aria-label={`Editor do ${activeEditorV6.title}`}
        >
          <Profiler id="/editor-v6/child/playback-audio" onRender={recordUiCommit}>
            <EditorV6PlaybackAudio project={activeEditorV6} playing={isPlaying} />
          </Profiler>
          <Profiler id="/editor-v6/child/tool-rail" onRender={recordUiCommit}>
            <EditorV6ToolRail
              visible={!fullView}
              activeTool={activeTool}
              canUndo={canUndo}
              canRedo={canRedo}
              saved={saved}
              faceAssetRefreshRequired={faceAssetRefreshRequired}
              characterSourceRefreshRequired={characterSourceRefreshRequired}
              selectedCharacterLabel={selectedCharacterElement ? selectedCharacterElement.text : null}
              error={error}
              notice={notice}
              onBack={railBack}
              onSave={railSave}
              onUndo={railUndo}
              onRedo={railRedo}
              onSelectTool={railSelectTool}
              onAddText={railAddText}
              onImportTimelineMedia={railImportMedia}
              onOpenCastManager={railOpenCastManager}
              onExport={railExport}
              onPrint={railPrint}
              onOpenPrints={railOpenPrints}
              onEnterFullView={railEnterFullView}
            />
          </Profiler>
          <Profiler id="/editor-v6/scene" onRender={recordUiCommit}>
            <EditorV6StageSurface
              project={activeEditorV6}
              previewMotionCharacters={availableCharacters}
              previewMotionEnabled={!exportInProgress && !characterSourceRefreshRequired}
              sceneRef={sceneRef}
              backgroundColor={previewBackground.backgroundColor}
              selectedId={selectedElementId ?? selectedTimelineBlockId}
              interaction={sceneInteraction}
              playing={isPlaying}
              fullView={fullView}
              onCanvasPointerDown={() => {
                setSelectedElementId(null)
                setSelectedTimelineBlockId(null)
              }}
              onExitFullView={() => setFullView(false)}
            />
          </Profiler>
          {!fullView && (
            <aside className="studio-editor-inspector-column" aria-label="Inspector do Editor V6">
              {inspectorOpen && (
                <Profiler id="/editor-v6/child/inspector" onRender={recordUiCommit}>
                  <EditorV6Inspector
                    side="right"
                    tab={inspectorTab}
                    customView={inspectorCustomView}
                    readOnly={selectedTimelineIntroClip?.track.locked}
                    editorPanel={inspectorTab === 'editor' ? propertyPanel() : null}
                    facePanel={inspectorTab === 'custom' && inspectorCustomView === 'face' ? customPanel() : null}
                    presetsPanel={
                      inspectorTab === 'custom' && inspectorCustomView === 'presets' ? (
                        <EditorV6PresetPanel
                          characterAvailable={Boolean(selectedEditorV6Character)}
                          element={selectedElement}
                          category={editorV6PresetCategory}
                          onCategoryChange={setEditorV6PresetCategory}
                          poseSlots={editorV6PoseSlots}
                          poseThumbnails={editorV6PoseThumbnails}
                          poseDimensions={editorV6PoseDimensions}
                          selectedPoseSlot={selectedEditorV6PoseSlot}
                          faceBusy={editorV6FaceBusy}
                          onPoseSelect={applyStudioPose}
                          onApplyPoseToIntro={selectedTimelineIntroClip ? applyIntroPoseToAll : undefined}
                          expressionLoading={editorV6ExpressionLoading}
                          expressionBusy={editorV6ExpressionBusy}
                          faceAppearanceAvailable={Boolean(selectedEditorV6FaceAppearance)}
                          talkAvailable={selectedEditorV6TalkAvailable}
                          faceMode={selectedEditorV6FaceMode}
                          onFaceModeSelect={(mode) => {
                            void applyEditorV6FaceMode(mode)
                          }}
                          collections={editorV6ExpressionCollections}
                          selectedCollectionId={selectedEditorV6ExpressionCollectionId}
                          collectionMenuOpen={editorV6ExpressionCollectionMenuOpen}
                          onToggleCollectionMenu={() => setEditorV6ExpressionCollectionMenuOpen((open) => !open)}
                          onCollectionSelect={(id) => {
                            if (selectedElement?.kind === 'character')
                              updateInspectorCharacter(selectedElement.id, { activeExpressionCollectionId: id })
                            setEditorV6ExpressionCollectionMenuOpen(false)
                          }}
                          presets={editorV6ExpressionPresets}
                          onApplyBaseExpression={() => {
                            void applyEditorV6BaseExpression()
                          }}
                          onApplyExpressionPreset={(preset, gaze) => {
                            void applyEditorV6ExpressionPreset(preset, gaze)
                          }}
                        />
                      ) : null
                    }
                    onSelectEditor={() => {
                      setInspectorTab('editor')
                      rememberCharacterInspectorView('editor')
                    }}
                    onSelectCustom={() => {
                      setInspectorTab('custom')
                      setInspectorCustomView('face')
                      rememberCharacterInspectorView('custom', 'face')
                    }}
                    onSelectPresets={() => {
                      setEditorV6PresetCategory('expression')
                      setInspectorTab('custom')
                      setInspectorCustomView('presets')
                      rememberCharacterInspectorView('custom', 'presets')
                    }}
                    onClose={() => setInspectorOpen(false)}
                  />
                </Profiler>
              )}
            </aside>
          )}
          {!fullView && castManagerOpen && (
            <Profiler id="/editor-v6/child/cast-manager" onRender={recordUiCommit}>
              <SceneCastManagerModal
                elements={stageCharacters}
                characters={availableCharacters}
                selectedElementId={selectedElementId}
                allPositionsLocked={allStageCharactersLocked}
                onAddCharacter={() => {
                  setCastManagerOpen(false)
                  stageSelection.openCastPicker()
                }}
                onTogglePositionsLocked={stageSelection.toggleCharacterPositionLock}
                onSelectCharacter={(element) => {
                  stageSelection.selectStageCharacter(element)
                  setCastManagerOpen(false)
                }}
                onRemoveCharacter={removeStageCharacter}
                onClose={() => setCastManagerOpen(false)}
              />
            </Profiler>
          )}
          {!fullView && (
            <Profiler id="/editor-v6/timeline" onRender={recordUiCommit}>
              <EditorV6Timeline
                key={activeEditorV6.id}
                document={activeEditorV6}
                playing={isPlaying}
                selectedId={selectedTimelineBlockId}
                onSeek={(frame) => {
                  if (dragRef.current) cancelSceneDrag()
                  pausePlayback()
                  publishPlayheadFrame(frame)
                }}
                onPlay={toggleTimelinePlayback}
                onChange={changeScene}
                onSelect={stageSelection.selectTimelineBlock}
              />
            </Profiler>
          )}
          <Profiler id="/editor-v6/child/export-panel" onRender={recordUiCommit}>
            <EditorV6ExportPanel
              key={`export-${activeEditorV6.id}`}
              project={activeEditorV6}
              open={exportOpen}
              characterSourceRefreshRequired={characterSourceRefreshRequired}
              onClose={() => setExportOpen(false)}
              onExitEditor={() => {
                setExportOpen(false)
                void leaveStudio()
              }}
              onChange={(update) => patchDocument(update, false)}
              onActivity={onExportActivity}
              trackOperation={trackEditorV6Operation}
            />
          </Profiler>
          {videoPickerOpen && (
            <Suspense fallback={<span role="status">Abrindo biblioteca…</span>}>
              <EditorV6VideoPickerModal onClose={() => setVideoPickerOpen(false)} onSelect={linkVideoLibraryItem} />
            </Suspense>
          )}
          {audioPickerOpen && (
            <Suspense fallback={<span role="status">Abrindo biblioteca…</span>}>
              <EditorV6AudioLibraryPicker onClose={() => setAudioPickerOpen(false)} onSelect={linkAudioLibraryItem} />
            </Suspense>
          )}
          {castPickerOpen && (
            <SceneCastPickerModal
              title="Personagens do Editor V6"
              characters={availableCharacters}
              selection={castSelection}
              saving={savingCast}
              onToggle={(characterId, selected) =>
                setCastSelection((current) =>
                  selected ? current.filter((id) => id !== characterId) : [...current, characterId]
                )
              }
              onClose={() => setCastPickerOpen(false)}
              onSave={() => void saveCastSelection()}
            />
          )}
        </main>
      </Profiler>
    )
  }

  return (
    <EditorV6ProjectBrowser
      folder={studioFolder}
      loading={loading}
      creatingProject={creatingProject}
      projects={editorV6Projects}
      selectedProjectId={selectedId}
      error={error}
      importOpen={reactImportOpen}
      onCreateProject={createStudio}
      onOpenFolder={() => window.desktop.editorV6.openEditorV6Folder()}
      onOpenImport={() => setReactImportOpen(true)}
      onCloseImport={() => setReactImportOpen(false)}
      onSaveImportedProject={writeEditorV6Document}
      onImportCompleted={(project) =>
        completeEditorV6ProjectImport(project, {
          projectSummary: editorV6ProjectSummary,
          upsertSummary: upsertEditorV6Summary,
          selectProject: setSelectedId,
          activateProject: setActiveEditorV6Id,
          setSaved,
          closeImport: () => setReactImportOpen(false),
          setError
        })
      }
      onOpenProject={(projectId) =>
        openEditorV6Project(projectId, { selectProject: setSelectedId, activateProject: setActiveEditorV6Id })
      }
      onDuplicateProject={(project) => {
        void duplicateStudio(project)
      }}
      onDeleteProject={(project) => {
        void deleteStudio(project)
      }}
    />
  )
}
