import { editorV6ElementSize } from '../../../../shared/editorV6SceneModel'
import { useEditorV6Store } from './editorV6Store'
import { createEditorV6Timeline, videoCharacterTrackColor } from '../../../../shared/editorV6'
import { EditorV6Timeline } from './EditorV6Timeline'
import { EditorV6ExportPanel } from './EditorV6ExportPanel'
import { useMotionPreparation } from './motion/useMotionPreparation'
import { EditorV6VideoPickerModal } from './EditorV6VideoPickerModal'
import { EditorV6AudioLibraryPicker } from './EditorV6AudioLibraryPicker'
import { EditorV6ReactImportDialog } from './EditorV6ReactImportDialog'
import { EditorV6PlaybackAudio } from './EditorV6PlaybackAudio'
import { EditorV6PlaybackScene } from './EditorV6PlaybackScene'
import { getEditorV6PlaybackFrame } from './editorV6PlaybackClock'
import { SceneCastPanel } from '../../ui/components/SceneCastPanel'
import { EditorV6PresetPanel } from './EditorV6PresetPanel'
import { EditorV6PropertyPanel } from './EditorV6PropertyPanel'
import { useEditorV6Playback } from './useEditorV6Playback'
import { duplicateEditorV6ProjectDocument } from './editorV6ProjectDuplication'
import { createEditorV6ProjectCreationCommands } from './editorV6ProjectCreation'
import { createEditorV6ProjectDeletionCommand } from './editorV6ProjectDeletion'
import { createEditorV6PrintCommands } from './editorV6PrintCommands'
import { createEditorV6DocumentCommands } from './editorV6DocumentCommands'
import { addEditorV6ImageAsset, addEditorV6TimelineMedia } from './editorV6MediaChanges'
import { importEditorV6ImageToProject, importEditorV6MediaToTimeline } from './editorV6MediaImport'
import { prepareEditorV6CastSnapshots } from './editorV6CastSnapshots'
import { createEditorV6CastCommands } from './editorV6CastCommands'
import { projectSceneCharacters } from '../../characters/sceneCharacterProjection'
import { createEditorV6MediaCommands } from './editorV6MediaCommands'
import { createEditorV6TextElementCommand } from './editorV6TextElementCommand'
import { createEditorV6DeleteSelectedCommand } from './editorV6DeleteSelectedCommand'
import { addEditorV6ElementAtFrame, editorV6ClipAtFrame } from '../../../../shared/editorV6TimelineCore'
import { repairEditorV6DuplicateAssets } from '../../../../shared/editorV6TimelineEdits'
import { editEditorV6BackgroundAtFrame, resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6TimelineScene'
import { useEditorV6InspectorState } from './useEditorV6InspectorState'
import { useEditorV6FaceCatalog } from './useEditorV6FaceCatalog'
import { useEditorV6PoseCatalog } from './useEditorV6PoseCatalog'
import { useEditorV6FacePreview } from './useEditorV6FacePreview'
import { createSceneFaceActions } from '../../characters/sceneFaceActions'
import { useFaceExpressionCatalog } from '../../characters/useFaceExpressionCatalog'
import { SceneFaceCatalogPanel } from '../../characters/SceneFaceCatalogPanel'
import { createDefaultSceneFaceTransform, resolveSceneFaceTransform } from '../../characters/sceneFaceSelection'
import { useEditorV6StageInteraction, type EditorV6StageDrag } from './useEditorV6StageInteraction'
import { resolveEditorV6InspectorSelection } from './editorV6Selection'
import { faceRenderGeometry } from '../../characters/characterGeometry'
import { bakeFaceModeAssets, EDITOR_V6_FACE_RENDER_VERSION, editorV6FaceModeForElement, trimTransparentCanvas } from './faceModeAssets'
import { prepareEditorV6PoseChange } from './editorV6PosePreparation'
import { prepareEditorV6FaceAppearance } from './editorV6FaceAppearancePreparation'
import { createEditorV6FaceTransformCommands } from './editorV6FaceTransformCommands'
import { createEditorV6CharacterAppearanceCommands } from './editorV6CharacterAppearanceCommands'
import { Profiler, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { editorV6ExpressionCollection } from './expressionTransforms'
import { Icon } from '../../ui/components/Icon'
import { NumericRangeField } from '../../ui/components/NumericRangeField'
import { SceneCastPickerModal } from '../../ui/components/SceneCastPickerModal'
import { createSceneTextElement, sceneCatalogColor, sceneEditorTools } from '../../ui/sceneEditorDefaults'
import { recordUiCommit } from '../../ui/performanceDiagnostics'
import { useEditorV6DocumentPersistence } from './useEditorV6DocumentPersistence'
import { useEditorV6CharacterSources } from './useEditorV6CharacterSources'
import { resolveEditorV6CharacterSourceRefresh } from './editorV6CharacterSourceModel'
import { useEditorV6CharacterSnapshotRefresh } from './useEditorV6CharacterSnapshotRefresh'
import { useEditorV6ProjectLibrary } from './useEditorV6ProjectLibrary'
import { fitEditorV6CharacterToStage } from '../../../../shared/editorV6CharacterGeometry'
import { editorV6CharacterStageReference } from './editorV6CharacterStageReference'
import { editorV6ProjectSummary, type EditorV6Asset, type EditorV6Element, type EditorV6FaceTransform, type EditorV6FaceTransforms, type EditorV6LibraryMediaItem, type EditorV6ProjectSummary } from '../../../../shared/editorV6'
import type { VideoBackgroundLibraryItem } from '../../../../shared/studio'
type EditorV6Card = EditorV6ProjectSummary
type Tool = 'background' | 'objects' | null
const defaultStudioEyeTransform: EditorV6FaceTransform = createDefaultSceneFaceTransform()

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
  const [creatingProject, setCreatingProject] = useState(false)
  const creatingProjectRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [castPickerOpen, setCastPickerOpen] = useState(false)
  const [castSelection, setCastSelection] = useState<string[]>([])
  const [savingCast, setSavingCast] = useState(false)
  const {
    inspectorTab, setInspectorTab, inspectorCustomView, setInspectorCustomView,
    characterInspectorViewRef, editorV6PresetCategory, setEditorV6PresetCategory, editorV6ExpressionCollections,
    setEditorV6ExpressionCollections, editorV6ExpressionPresets, setEditorV6ExpressionPresets, editorV6ExpressionCollectionMenuOpen, setEditorV6ExpressionCollectionMenuOpen, editorV6ExpressionLoading,
    setEditorV6ExpressionLoading, editorV6ExpressionBusy, setEditorV6ExpressionBusy,
    inspectorOpen, setInspectorOpen, editorV6FaceCategory,
    setEditorV6FaceCategory, editorV6FaceBusy, setEditorV6FaceBusy
  } = useEditorV6InspectorState()
  const [studioFolder, setEditorV6Folder] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeEditorV6Id, setActiveEditorV6IdState] = useState<string | null>(null)
  const activeEditorV6IdRef = useRef<string | null>(null)
  const setActiveEditorV6Id = useCallback((id: string | null) => {
    activeEditorV6IdRef.current = id
    setActiveEditorV6IdState(id)
  }, [])
  const {
    availableCharacters, availableCharactersReady, availableCharacterById, activePoseSourceSnapshot
  } = useEditorV6CharacterSources(activeEditorV6Id, setError)
  const [activeTool, setActiveTool] = useState<Tool>(null)
  const [sharedBackgrounds, setSharedBackgrounds] = useState<VideoBackgroundLibraryItem[]>([])
  const [sharedObjects, setSharedObjects] = useState<EditorV6LibraryMediaItem[]>([])
  const refreshBackgroundLibrary = async () => {
    const items = await window.desktop.videoBackgrounds.listVideoBackgroundLibrary()
    setSharedBackgrounds(items)
  }
  const refreshObjectLibrary = async () => setSharedObjects(await window.desktop.editorV6MediaLibrary.list('object'))
  useEffect(() => {
    if (activeTool === 'background') void refreshBackgroundLibrary().catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os fundos compartilhados.'))
    if (activeTool === 'objects') void refreshObjectLibrary().catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a biblioteca de objetos.'))
  }, [activeTool, activeEditorV6Id])
  const [fullView, setFullView] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [videoPickerOpen, setVideoPickerOpen] = useState(false)
  const [audioPickerOpen, setAudioPickerOpen] = useState(false)
  const [reactImportOpen, setReactImportOpen] = useState(false)
  const [saved, setSaved] = useState(true)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [motionExportBusy, setMotionExportBusy] = useState(false)
  const [selectedTimelineBlockId, setSelectedTimelineBlockId] = useState<string | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const sceneRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<EditorV6StageDrag | null>(null)
  const editorV6FaceTransformsRef = useRef<Record<string, EditorV6FaceTransforms>>({})
  const expressionSaveSignatureRef = useRef<{ studioId: string; value: string } | null>(null)
  const nextStudioNumber = useRef(1)
  const editorV6SaveTimerRef = useRef<number | null>(null)
  const selectedEditorV6 = editorV6Projects.find((studio) => studio.id === selectedId) ?? null
  const activeEditorV6 = activeEditorV6Stored?.id === activeEditorV6Id ? activeEditorV6Stored : null
  const timelineDurationFrames = activeEditorV6?.timeline.durationFrames ?? 300
  const { playheadFrame, isPlaying, publishPlayheadFrame, pausePlayback, resetPlayback, startPlayback } = useEditorV6Playback(activeEditorV6Id, timelineDurationFrames)
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
  const { faceAssetRefreshRequired } = useMemo(() => resolveEditorV6CharacterSourceRefresh({
    project: activeEditorV6,
    characterById: availableCharacterById,
    poseSourceSnapshot: activePoseSourceSnapshot,
    faceRendererVersion: EDITOR_V6_FACE_RENDER_VERSION
  }), [activeEditorV6, availableCharacterById, activePoseSourceSnapshot])
  const characterSourceRefreshRequired = !availableCharactersReady || faceAssetRefreshRequired
  useMotionPreparation(activeEditorV6, availableCharacters,
    saved && !isPlaying && !motionExportBusy && !characterSourceRefreshRequired
    && activePoseSourceSnapshot?.projectId === activeEditorV6Id)
  const previewScene = useMemo(() => activeEditorV6 ? resolveEditorV6SceneAtFrame(activeEditorV6, playheadFrame, { includeMotion: false }) : null, [activeEditorV6, playheadFrame])
  const previewBackground = previewScene?.background ?? { backgroundColor: '#d7b5cd', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 }
  const visibleTimelineElements = previewScene?.elements ?? []
  useEffect(() => {
    if (!activeEditorV6 || new Set(activeEditorV6.assets.map((asset) => asset.id)).size === activeEditorV6.assets.length) return
    updateActiveEditorV6Project((project) => project.id === activeEditorV6.id ? repairEditorV6DuplicateAssets(project, selectedTimelineBlockId) : project)
    markEditorV6Unsaved()
  }, [activeEditorV6, selectedTimelineBlockId, markEditorV6Unsaved])
  const editorV6Selection = useMemo(() => resolveEditorV6InspectorSelection({
    project: activeEditorV6,
    visibleElements: visibleTimelineElements,
    backgroundAssetId: previewBackground.backgroundAssetId,
    selectedTimelineBlockId,
    selectedElementId,
    playheadFrame
  }), [activeEditorV6, visibleTimelineElements, previewBackground.backgroundAssetId, selectedTimelineBlockId, selectedElementId, playheadFrame])
  const { selectedTimelineVideoClip, selectedTimelineVideo, selectedElement, selectedCharacterElement, selectedBackgroundAsset } = editorV6Selection
  const selectedEditorV6Character = selectedElement?.kind === 'character' ? availableCharacters.find((character) => character.id === selectedElement.characterId) ?? null : null
  const selectedEditorV6ExpressionCollectionId = editorV6ExpressionCollection(selectedElement, editorV6ExpressionPresets)
  const selectedEditorV6CharacterModelSlot = selectedEditorV6Character ? selectedEditorV6Character.customization.modelSlot ?? 1 : null
  const { poseSlots: editorV6PoseSlots, poseThumbnails: editorV6PoseThumbnails, poseDimensions: editorV6PoseDimensions } = useEditorV6PoseCatalog(selectedEditorV6CharacterModelSlot, setError)
  const selectedEditorV6PoseSlot = selectedElement?.kind === 'character' ? selectedElement.poseSlot === undefined ? selectedEditorV6Character?.customization.poseSlot ?? null : selectedElement.poseSlot : null
  const selectedEditorV6FaceAppearance = selectedElement?.kind === 'character'
    ? selectedElement.faceAppearance ?? selectedEditorV6Character?.customization.faceAppearance
    : undefined
  const selectedEditorV6FaceMode = selectedElement?.kind === 'character' ? editorV6FaceModeForElement(selectedElement, selectedEditorV6FaceAppearance) : 'idle'
  const reportFaceCatalogError = useCallback((reason: unknown) => {
    setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o catálogo de rosto.')
  }, [])
  const {
    items: editorV6FaceItems, details: editorV6FaceDetails, loading: editorV6FaceLoading,
    loadingRequiredDetails: editorV6FaceDetailsLoading, loadItem: loadEditorV6FaceCatalogItem,
    openMouthId: selectedEditorV6OpenMouthId, selectedItemId: selectedEditorV6FaceCatalogItemId,
    sheetKind: selectedEditorV6FaceSheetKind
  } = useEditorV6FaceCatalog(selectedEditorV6CharacterModelSlot, editorV6FaceCategory, selectedEditorV6FaceMode, selectedEditorV6FaceAppearance, reportFaceCatalogError)
  const selectedEditorV6OpenMouth = selectedEditorV6OpenMouthId && selectedEditorV6CharacterModelSlot !== null
    ? editorV6FaceDetails[`${selectedEditorV6CharacterModelSlot}:${selectedEditorV6OpenMouthId}`]
    : undefined
  const selectedEditorV6TalkAvailable = Boolean(selectedEditorV6OpenMouth?.pieces.some((piece) => piece.sheet === 'mouth-open' && piece.index === selectedEditorV6FaceAppearance?.expressionIndex))
  const stageCharacters = sceneCharacterProjection.characters

  const allStageCharactersLocked = stageCharacters.length > 0 && stageCharacters.every((element) => element.positionLocked === true)
  const toggleStageCharacterPositionLock = () => {
    if (!activeEditorV6 || !stageCharacters.length) return
    const nextLocked = !allStageCharactersLocked
    changeScene((studio) => ({
      ...studio,
      elements: studio.elements.map((element) => element.kind === 'character' ? { ...element, positionLocked: nextLocked } : element),
      updatedAt: new Date().toISOString()
    }))
  }
  const rememberCharacterInspectorView = (tab: 'editor' | 'custom', customView: 'face' | 'presets' = inspectorCustomView) => {
    if (selectedElement?.kind === 'character') characterInspectorViewRef.current = { tab, customView }
  }
  const restoreCharacterInspectorView = () => {
    setInspectorTab(characterInspectorViewRef.current.tab)
    setInspectorCustomView(characterInspectorViewRef.current.customView)
  }

  useEffect(() => {
    if (selectedElement?.kind === 'character') editorV6FaceTransformsRef.current[selectedElement.id] = selectedElement.faceTransforms ?? {}
  }, [activeEditorV6Id, selectedElementId, selectedElement?.faceTransforms])

  useEffect(() => { setEditorV6ExpressionCollectionMenuOpen(false) }, [activeEditorV6Id, selectedElementId, selectedEditorV6CharacterModelSlot])

  useFaceExpressionCatalog({
    modelSlot: selectedEditorV6CharacterModelSlot,
    setCollections: setEditorV6ExpressionCollections,
    setPresets: setEditorV6ExpressionPresets,
    setLoading: setEditorV6ExpressionLoading,
    setError,
    errorFallback: 'Não foi possível carregar os presets de expressão.'
  })

  useEffect(() => {
    if (!activeEditorV6Id) return
    useEditorV6Store.getState().clear(activeEditorV6Id)
    resetPlayback()
    setSelectedTimelineBlockId(null)
    setCanUndo(false)
    setCanRedo(false)
    setHistoryVersion((value) => value + 1)
    setSelectedElementId(null)
  }, [activeEditorV6Id, resetPlayback])

  useEditorV6CharacterSnapshotRefresh({
    project: activeEditorV6,
    availableCharacters,
    poseSourceSnapshot: activePoseSourceSnapshot,
    sceneRef,
    updateProject: updateActiveEditorV6Project,
    markUnsaved: markEditorV6Unsaved,
    pausePlayback,
    reportError: setError
  })

  const projectCreation = createEditorV6ProjectCreationCommands({
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
    cloneExportAudio: (sourceId, duplicateId, audio) => window.desktop.editorV6.cloneEditorV6ExportAudio(sourceId, duplicateId, audio),
    cloneMedia: (sourceId, duplicateId, media) => window.desktop.editorV6.cloneEditorV6Media(sourceId, duplicateId, media),
    writeDocument: writeEditorV6Document,
    upsertSummary: upsertEditorV6Summary,
    selectProject: setSelectedId,
    setSaved,
    setError,
    trackOperation: trackEditorV6Operation
  })
  const createStudio = async () => {
    if (creatingProjectRef.current) return
    creatingProjectRef.current = true
    setCreatingProject(true)
    try {
      await projectCreation.createStudio()
    } finally {
      creatingProjectRef.current = false
      setCreatingProject(false)
    }
  }
  const duplicateStudio = (sourceSummary: EditorV6Card | null = selectedEditorV6) => projectCreation.duplicateStudio(sourceSummary)

  useEffect(() => {
    if (!activeEditorV6) {
      expressionSaveSignatureRef.current = null
      return
    }
    if (dragRef.current) return
    const signature = sceneCharacterProjection.autosaveSignature
    const previous = expressionSaveSignatureRef.current
    expressionSaveSignatureRef.current = { studioId: activeEditorV6.id, value: signature }
    // Loading a persisted project establishes the autosave baseline; opening it
    // must not mark it dirty and immediately rewrite an otherwise untouched file.
    if (previous?.studioId !== activeEditorV6.id) return
    markEditorV6Unsaved()
    if (previous.value !== signature) {
      void saveActiveEditorV6Project(activeEditorV6)
      return
    }
    if (editorV6SaveTimerRef.current !== null) window.clearTimeout(editorV6SaveTimerRef.current)
    const timer = window.setTimeout(() => {
      if (editorV6SaveTimerRef.current === timer) editorV6SaveTimerRef.current = null
      void saveActiveEditorV6Project(activeEditorV6)
    }, 650)
    editorV6SaveTimerRef.current = timer
    return () => {
      window.clearTimeout(timer)
      if (editorV6SaveTimerRef.current === timer) editorV6SaveTimerRef.current = null
    }
  }, [activeEditorV6, markEditorV6Unsaved, saveActiveEditorV6Project, sceneCharacterProjection.autosaveSignature])

  const {
    patchDocument,
    patchEditorV6FacePreview,
    recordHistory,
    changeScene,
    loadLatestEditorV6Project,
    persistImportedEditorV6Document,
    undo,
    redo,
    removeStageCharacter,
    updateElement,
    updateCharacterNameColor,
    updateBalloonScale,
    updateBalloonOffsetY,
    updateVideoBlock,
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
  const editorV6FacePreview = useEditorV6FacePreview({
    activeProject: activeEditorV6,
    activeProjectId: activeEditorV6Id,
    sceneRef,
    transformsRef: editorV6FaceTransformsRef,
    patchProject: patchEditorV6FacePreview,
    setError
  })
  const { importImage, importTimelineMedia, linkVideoLibraryItem, linkAudioLibraryItem, selectBackground, linkSharedBackground, linkSharedObject } = createEditorV6MediaCommands({
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

  const openCastPicker = () => {
    setCastSelection(stageCharacters.map((element) => element.characterId).filter((id): id is string => Boolean(id)))
    setCastPickerOpen(true)
  }

  const { saveCastSelection } = createEditorV6CastCommands({
    activeProject: activeEditorV6,
    availableCharacters,
    selectedCharacterIds: castSelection,
    saving: savingCast,
    sourceSnapshot: activePoseSourceSnapshot,
    getStageSize: () => ({ width: sceneRef.current?.clientWidth ?? 1000, height: sceneRef.current?.clientHeight ?? 562 }),
    prepareSnapshots: async (input) => {
      const { prepareSavedCharacterRenderer } = await import('../../characters/editorV6CharacterRenderer')
      return prepareEditorV6CastSnapshots(input, {
        prepareRenderer: prepareSavedCharacterRenderer,
        bakeAssets: bakeFaceModeAssets,
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

  const { applyFaceAppearance: applyStudioFaceAppearance, applyPose: applyStudioPose } = createEditorV6CharacterAppearanceCommands({
    activeProject: activeEditorV6,
    selectedElement,
    selectedCharacter: selectedEditorV6Character,
    faceBusy: editorV6FaceBusy,
    setFaceBusy: setEditorV6FaceBusy,
    facePreview: editorV6FacePreview,
    sceneRef,
    poseSourceSnapshot: activePoseSourceSnapshot,
    prepareFaceAppearance: (input, renderer) => prepareEditorV6FaceAppearance(input, renderer, {
      faceModeForElement: editorV6FaceModeForElement,
      trimCanvas: trimTransparentCanvas,
      bakeAssets: bakeFaceModeAssets
    }),
    preparePoseChange: async (input) => {
      const { prepareSavedCharacterRenderer } = await import('../../characters/editorV6CharacterRenderer')
      return prepareEditorV6PoseChange(input, {
        prepareRenderer: prepareSavedCharacterRenderer,
        bakeAssets: bakeFaceModeAssets,
        trimCanvas: trimTransparentCanvas,
        faceModeForElement: editorV6FaceModeForElement,
        getStageSize: () => ({ width: sceneRef.current?.clientWidth ?? 1000, height: sceneRef.current?.clientHeight ?? 562 }),
        faceRenderGeometry
      })
    },
    changeScene,
    patchDocument,
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

  const { update: updateEditorV6FaceTransform, finish: finishEditorV6FaceTransform } = createEditorV6FaceTransformCommands({
    activeProject: activeEditorV6,
    activeProjectId: activeEditorV6Id,
    selectedElement,
    selectedCharacter: selectedEditorV6Character,
    selectedFaceAppearance: selectedEditorV6FaceAppearance,
    selectedTimelineBlockId,
    transformsRef: editorV6FaceTransformsRef,
    defaultTransform: defaultStudioEyeTransform,
    updateElement,
    getFrame: getEditorV6PlaybackFrame,
    schedulePreview: editorV6FacePreview.schedulePreview,
    flushPreview: editorV6FacePreview.flushPreview
  })

  const { cancelSceneDrag, interaction: sceneInteraction } = useEditorV6StageInteraction({
    project: activeEditorV6, sceneRef,
    faceBusy: editorV6FaceBusy, expressionBusy: editorV6ExpressionBusy,
    faceRenderRunningRef: editorV6FacePreview.renderRunningRef,
    setSelectedElementId, setActiveTool, setInspectorOpen, setInspectorTab, setSelectedTimelineBlockId,
    restoreCharacterInspectorView, pausePlayback, publishPlayheadFrame,
    updateActiveProject: updateActiveEditorV6Project, markUnsaved: markEditorV6Unsaved, recordHistory
  }, dragRef)

  const deleteSelected = createEditorV6DeleteSelectedCommand({
    activeProject: activeEditorV6,
    selectedElementId,
    selectedTimelineVideoBlockId: selectedTimelineVideoClip?.block.id ?? null,
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

  const leaveStudio = async () => {
    try { await flushEditorV6Writes() } catch (reason) {
      setError(reason instanceof Error ? `Não foi possível sair do projeto porque o salvamento falhou: ${reason.message}` : 'Não foi possível sair do projeto porque o salvamento falhou.')
      return
    }
    pausePlayback()
    setActiveEditorV6Id(null)
    setActiveTool(null)
    setSelectedElementId(null)
    setFullView(false)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (dragRef.current && (event.key === 'Escape' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z'))) { event.preventDefault(); cancelSceneDrag(); return }
      if (event.key === 'Escape' && castPickerOpen && !savingCast) setCastPickerOpen(false)
      else if (event.key === 'Escape' && fullView) setFullView(false)
      if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable=true],[role=dialog]')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [castPickerOpen, savingCast, fullView, activeEditorV6, historyVersion])

  const control = (label: string, value: number, onChange: (value: number, record?: boolean) => void, min: number, max: number, suffix = '%', onFinish?: () => void, disabled = false) => (
    <NumericRangeField key={label} label={label} value={value} onChange={onChange} onStart={() => recordHistory()} onFinish={onFinish} disabled={disabled} min={min} max={max} suffix={suffix} />
  )

  const addObjectAsset = (asset: EditorV6Asset) => {
    if (!activeEditorV6) return
    if (activeEditorV6.timeline.tracks.some((track) => track.kind === 'object' && track.locked)) {
      setError('Desbloqueie a faixa Objetos para adicionar uma imagem.')
      return
    }
    const element: EditorV6Element = { id: crypto.randomUUID(), kind: 'image', assetId: asset.id, text: '', x: 0, y: 0, width: 25, height: 25, rotation: 0, zIndex: Math.max(0, ...activeEditorV6.elements.map((item) => item.zIndex)) + 1 }
    const blockId = crypto.randomUUID()
    const frame = getEditorV6PlaybackFrame()
    changeScene((studio) => ({ ...addEditorV6ElementAtFrame(studio, element, frame, blockId), updatedAt: new Date().toISOString() }))
    setSelectedElementId(element.id)
    setSelectedTimelineBlockId(blockId)
    setInspectorOpen(true)
    setInspectorTab('editor')
  }

  const propertyPanel = (): ReactNode => <EditorV6PropertyPanel
    project={activeEditorV6}
    activeTool={activeTool}
    background={previewBackground}
    selectedElementId={selectedElementId}
    selectedElement={selectedElement}
    characterNameColor={selectedElement?.kind === 'character' && selectedElement.characterId
      ? activeEditorV6?.characterNameColors?.[selectedElement.characterId] ?? videoCharacterTrackColor(selectedElement.characterId)
      : null}
    balloonScalePercent={activeEditorV6?.balloonScalePercent ?? 100}
    balloonOffsetY={activeEditorV6?.balloonOffsetY ?? 0}
    selectedBackgroundAsset={selectedBackgroundAsset}
    sharedBackgrounds={sharedBackgrounds}
    sharedObjects={sharedObjects}
    selectedVideoBlock={selectedTimelineVideoClip?.block ?? null}
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
    onUpdateVideoBlock={updateVideoBlock}
    onRecordHistory={() => recordHistory()}
    onDeleteSelected={deleteSelected}
  />

  const customPanel = (): ReactNode => {
    if (!selectedEditorV6Character || selectedElement?.kind !== 'character' || selectedEditorV6CharacterModelSlot === null) {
      return <div className="studio-custom-empty"><strong>Personalizar personagem</strong><span>Selecione um personagem na prévia ou no elenco para escolher as peças do rosto.</span></div>
    }
    const sheetKind = selectedEditorV6FaceSheetKind
    const selectedItemId = selectedEditorV6FaceCatalogItemId
    const activeItem = selectedItemId ? editorV6FaceDetails[`${selectedEditorV6CharacterModelSlot}:${selectedItemId}`] : null
    const { transformKey: studioTransformKey, transform: selectedEditorV6FaceTransform } = resolveSceneFaceTransform(
      editorV6FaceCategory, sheetKind, selectedItemId, selectedEditorV6FaceAppearance, selectedElement.faceTransforms
    )
    const catalogItems = editorV6FaceItems.filter((item) => item.modelSlot === selectedEditorV6CharacterModelSlot && item.category === sheetKind)
    return <SceneFaceCatalogPanel
      category={editorV6FaceCategory} sheetKind={sheetKind} selectedItemId={selectedItemId}
      catalogItems={catalogItems} activeItem={activeItem} appearance={selectedEditorV6FaceAppearance}
      faceMode={selectedEditorV6FaceMode} faceBusy={editorV6FaceBusy} expressionBusy={editorV6ExpressionBusy}
      catalogLoading={editorV6FaceLoading} detailsLoading={editorV6FaceDetailsLoading}
      talkAvailable={selectedEditorV6TalkAvailable}
      emptyEyesMessage={selectedItemId ? 'A folha de olhos selecionada ainda não está disponível.' : 'Escolha uma folha de olhos para ver as três variantes.'}
      onCategoryChange={setEditorV6FaceCategory} onFaceModeChange={(mode) => { void applyEditorV6FaceMode(mode) }}
      onSheetSelect={(summary) => { void chooseEditorV6FaceSheet(summary) }} onAppearanceChange={updateEditorV6FaceVariant}
    >
      <div className="studio-controls-grid studio-custom-eye-controls">
        {control('X', selectedEditorV6FaceTransform.x, (value, record) => updateEditorV6FaceTransform(studioTransformKey, { x: value }, record, selectedEditorV6FaceTransform), -100, 100, '%', () => finishEditorV6FaceTransform(studioTransformKey), editorV6FaceBusy)}
        {control('Y', selectedEditorV6FaceTransform.y, (value, record) => updateEditorV6FaceTransform(studioTransformKey, { y: value }, record, selectedEditorV6FaceTransform), -100, 100, '%', () => finishEditorV6FaceTransform(studioTransformKey), editorV6FaceBusy)}
        {control('Largura', selectedEditorV6FaceTransform.width, (value, record) => updateEditorV6FaceTransform(studioTransformKey, { width: value }, record, selectedEditorV6FaceTransform), 1, 300, '%', () => finishEditorV6FaceTransform(studioTransformKey), editorV6FaceBusy)}
        {control('Altura', selectedEditorV6FaceTransform.height, (value, record) => updateEditorV6FaceTransform(studioTransformKey, { height: value }, record, selectedEditorV6FaceTransform), 1, 300, '%', () => finishEditorV6FaceTransform(studioTransformKey), editorV6FaceBusy)}
        {control('Rotação', selectedEditorV6FaceTransform.rotation, (value, record) => updateEditorV6FaceTransform(studioTransformKey, { rotation: value }, record, selectedEditorV6FaceTransform), -180, 180, '°', () => finishEditorV6FaceTransform(studioTransformKey), editorV6FaceBusy)}
      </div>
      {editorV6FaceBusy && <p className="studio-custom-hint" role="status">Atualizando personagem…</p>}
    </SceneFaceCatalogPanel>
  }

  const toggleTimelinePlayback = () => {
    if (dragRef.current) return
    if (isPlaying) { pausePlayback(); return }
    startPlayback()
  }

  if (activeEditorV6) {
    const inspectorWidth = sceneRef.current ? Math.min(38, 276 / sceneRef.current.clientWidth * 100) : 28
    const selectedBounds = selectedElement
      ? { left: 50 + selectedElement.x - editorV6ElementSize(selectedElement).width / 2, right: 50 + selectedElement.x + editorV6ElementSize(selectedElement).width / 2 }
      : selectedElementId === 'background'
        ? { left: 50 + previewBackground.backgroundX - previewBackground.backgroundWidth / 2, right: 50 + previewBackground.backgroundX + previewBackground.backgroundWidth / 2 }
        : null
    const inspectorSide = selectedBounds?.right !== undefined && selectedBounds.right > 100 - inspectorWidth
      ? 'left'
      : selectedBounds?.left !== undefined && selectedBounds.left < inspectorWidth ? 'right' : 'right'
    return (
      <main className={`studio-editor${fullView ? ' full-view' : ''}`} aria-label={`Editor do ${activeEditorV6.title}`}>
        <EditorV6PlaybackAudio project={activeEditorV6} playing={isPlaying} />
        {!fullView && <aside className="studio-editor-rail studio-editor-left" aria-label="Ferramentas do Editor V6">
          <div className="studio-editor-quick-actions">
            <button className="studio-round-action" onClick={() => void leaveStudio()} title="Salvar automaticamente e voltar" aria-label="Voltar para Editor V6" type="button"><span>←</span></button>
            <button className="studio-round-action" onClick={() => { void flushEditorV6Writes().catch(() => undefined) }} title="Salvar agora no computador" aria-label="Salvar Editor V6" type="button"><Icon name="save" /></button>
          </div>
          <div className="studio-editor-quick-actions studio-history-actions">
            <button className="studio-round-action" disabled={!canUndo} onClick={undo} title="Desfazer (Ctrl+Z)" aria-label="Desfazer" type="button"><Icon name="undo" /></button>
            <button className="studio-round-action" disabled={!canRedo} onClick={redo} title="Refazer (Ctrl+Y)" aria-label="Refazer" type="button"><Icon name="redo" /></button>
          </div>
          <nav className="studio-tool-list" aria-label="Ferramentas da cena">
            {sceneEditorTools.map((tool) => <button className={`studio-tool-button${activeTool === tool.id ? ' active' : ''}`} key={tool.id} onClick={() => { setActiveTool(tool.id); setInspectorOpen(true); setInspectorTab('editor') }} type="button"><Icon name={tool.icon} /><span>{tool.label}</span><i aria-hidden="true">✦</i></button>)}
            <button className="studio-tool-button" onClick={() => addTextElement('narrator')} type="button"><Icon name="message" /><span>Narrador</span><i aria-hidden="true">✦</i></button>
            <button className="studio-tool-button" onClick={() => addTextElement('speech')} disabled={!selectedCharacterElement} title={selectedCharacterElement ? `Adicionar fala a ${selectedCharacterElement.text}` : 'Selecione um personagem na cena'} aria-label="Adicionar fala ao personagem selecionado" type="button"><Icon name="message" /><span>Fala</span><i aria-hidden="true">✦</i></button>
            <button className="studio-tool-button" onClick={() => addTextElement('thought')} disabled={!selectedCharacterElement} title={selectedCharacterElement ? `Adicionar pensamento a ${selectedCharacterElement.text}` : 'Selecione um personagem na cena'} aria-label="Adicionar pensamento ao personagem selecionado" type="button"><Icon name="face" /><span>Pensamento</span><i aria-hidden="true">✦</i></button>
            <button className="studio-tool-button" onClick={() => void importTimelineMedia('video')} type="button"><b>▣</b><span>Selecionar vídeo</span></button>
            <button className="studio-tool-button" onClick={() => void importTimelineMedia('audio')} type="button"><b>♪</b><span>Selecionar áudio</span></button>
            <span className="studio-tool-separator" />
            <button className="studio-tool-button" onClick={() => { pausePlayback(); setExportOpen(true) }} disabled={characterSourceRefreshRequired} title={characterSourceRefreshRequired ? 'Sincronizando o Customizador com os snapshots do projeto' : undefined} type="button"><Icon name="download" /><span>{characterSourceRefreshRequired ? 'Atualizando personagem…' : 'Exportar MP4'}</span></button>
            <button className="studio-tool-button" onClick={() => void exportPrint(activeEditorV6)} type="button"><Icon name="download" /><span>Print</span><i aria-hidden="true">✦</i></button>
            <button className="studio-tool-button" onClick={() => void openPrints(activeEditorV6.id)} type="button"><Icon name="folder" /><span>Pasta</span><i aria-hidden="true">✦</i></button>
            <button className="studio-tool-button studio-view-button" onClick={() => setFullView(true)} type="button"><Icon name="expand" /><span>View</span></button>
          </nav>
          <small className={`studio-save-indicator${saved ? '' : ' unsaved'}`}><i />{saved ? 'Salvo automaticamente' : 'Salvando alterações…'}</small>
          {faceAssetRefreshRequired && <small className="studio-save-notice" role="status">Atualizando as aparências salvas para a prévia e a exportação usarem as fontes mais recentes.</small>}
          {error && <small className="studio-error-message" role="alert">{error}</small>}
          {notice && <small className="studio-save-notice" role="status">{notice}</small>}
        </aside>}
        <section className="studio-scene-area v6-scene-area" aria-label="Prévia da cena">
          <div className="studio-scene-canvas v6-scene-canvas" ref={sceneRef} style={{ backgroundColor: previewBackground.backgroundColor }} onPointerDown={() => { setSelectedElementId(null); setSelectedTimelineBlockId(null) }}>
            <Profiler id="/editor-v6/scene" onRender={recordUiCommit}><EditorV6PlaybackScene project={activeEditorV6} selectedId={selectedElementId ?? selectedTimelineBlockId} interaction={fullView ? undefined : sceneInteraction} playing={isPlaying} fullView={fullView} /></Profiler>
            {fullView && <button className="studio-exit-view" onClick={() => setFullView(false)} type="button">Sair da visualização <kbd>Esc</kbd></button>}
            {!fullView && <span className="studio-scene-title">{activeEditorV6.title}</span>}
            {!fullView && inspectorOpen && <aside className={`studio-inspector studio-inspector-${inspectorSide}`} aria-label="Inspector da cena" onPointerDown={(event) => event.stopPropagation()}>
              <header className="studio-inspector-tabs"><button className={inspectorTab === 'editor' ? 'active' : ''} onClick={() => { setInspectorTab('editor'); rememberCharacterInspectorView('editor') }} type="button">Editor</button><button className={inspectorTab === 'custom' && inspectorCustomView === 'face' ? 'active' : ''} onClick={() => { setInspectorTab('custom'); setInspectorCustomView('face'); rememberCharacterInspectorView('custom', 'face') }} type="button">Custom</button><button className="studio-inspector-close" onClick={() => setInspectorOpen(false)} aria-label="Fechar inspector" title="Fechar" type="button">×</button></header>
              <button className={`studio-inspector-presets${inspectorTab === 'custom' && inspectorCustomView === 'presets' ? ' active' : ''}`} onClick={() => { setEditorV6PresetCategory('expression'); setInspectorTab('custom'); setInspectorCustomView('presets'); rememberCharacterInspectorView('custom', 'presets') }} type="button"><Icon name="sparkles" />Presets</button>
              {inspectorTab === 'editor' ? <div className="studio-inspector-content">{propertyPanel()}</div> : <div className="studio-inspector-content">{inspectorCustomView === 'presets' ? <EditorV6PresetPanel
                characterAvailable={Boolean(selectedEditorV6Character)} element={selectedElement} category={editorV6PresetCategory}
                onCategoryChange={setEditorV6PresetCategory} poseSlots={editorV6PoseSlots} poseThumbnails={editorV6PoseThumbnails}
                poseDimensions={editorV6PoseDimensions} selectedPoseSlot={selectedEditorV6PoseSlot} faceBusy={editorV6FaceBusy}
                onPoseSelect={applyStudioPose} expressionLoading={editorV6ExpressionLoading} expressionBusy={editorV6ExpressionBusy}
                faceAppearanceAvailable={Boolean(selectedEditorV6FaceAppearance)} talkAvailable={selectedEditorV6TalkAvailable}
                faceMode={selectedEditorV6FaceMode} onFaceModeSelect={(mode) => { void applyEditorV6FaceMode(mode) }}
                collections={editorV6ExpressionCollections} selectedCollectionId={selectedEditorV6ExpressionCollectionId}
                collectionMenuOpen={editorV6ExpressionCollectionMenuOpen} onToggleCollectionMenu={() => setEditorV6ExpressionCollectionMenuOpen((open) => !open)}
                onCollectionSelect={(id) => { if (selectedElement?.kind === 'character') updateElement(selectedElement.id, { activeExpressionCollectionId: id }); setEditorV6ExpressionCollectionMenuOpen(false) }}
                presets={editorV6ExpressionPresets} onApplyBaseExpression={() => { void applyEditorV6BaseExpression() }}
                onApplyExpressionPreset={(preset, gaze) => { void applyEditorV6ExpressionPreset(preset, gaze) }}
              /> : customPanel()}</div>}
            </aside>}
          </div>
        </section>
        {!fullView && <aside className="studio-editor-rail studio-editor-right" aria-label="Elenco do Editor V6"><SceneCastPanel
          elements={stageCharacters} characters={availableCharacters} selectedElementId={selectedElementId}
          allPositionsLocked={allStageCharactersLocked} onAddCharacter={openCastPicker}
          onTogglePositionsLocked={toggleStageCharacterPositionLock}
          onSelectCharacter={(element) => { pausePlayback(); setSelectedElementId(element.id); setSelectedTimelineBlockId(editorV6ClipAtFrame(activeEditorV6.timeline, element.id, getEditorV6PlaybackFrame())?.block.id ?? null); setActiveTool(null); setInspectorOpen(true); restoreCharacterInspectorView() }}
          onRemoveCharacter={removeStageCharacter}
        /></aside>}
        {!fullView && <Profiler id="/editor-v6/timeline" onRender={recordUiCommit}><EditorV6Timeline key={activeEditorV6.id} document={activeEditorV6} playing={isPlaying} selectedId={selectedTimelineBlockId}
          onSeek={(frame) => { if (dragRef.current) cancelSceneDrag(); pausePlayback(); publishPlayheadFrame(frame) }} onPlay={toggleTimelinePlayback} onChange={changeScene}
          onSelect={(block) => { setSelectedTimelineBlockId(block.id); setSelectedElementId(block.background ? 'background' : block.elementId ?? null); setActiveTool(block.background ? 'background' : null); setInspectorOpen(true); if (block.state?.kind === 'character') restoreCharacterInspectorView(); else setInspectorTab('editor') }} /></Profiler> }
        <EditorV6ExportPanel key={`export-${activeEditorV6.id}`} project={activeEditorV6} open={exportOpen} characterSourceRefreshRequired={characterSourceRefreshRequired} onClose={() => setExportOpen(false)} onExitEditor={() => { setExportOpen(false); void leaveStudio() }} onChange={(update) => patchDocument(update, false)} onActivity={setMotionExportBusy} trackOperation={trackEditorV6Operation} />
        {videoPickerOpen && <EditorV6VideoPickerModal onClose={() => setVideoPickerOpen(false)} onSelect={linkVideoLibraryItem} />}
        {audioPickerOpen && <EditorV6AudioLibraryPicker onClose={() => setAudioPickerOpen(false)} onSelect={linkAudioLibraryItem} />}
        {castPickerOpen && <SceneCastPickerModal title="Personagens do Editor V6" characters={availableCharacters} selection={castSelection} saving={savingCast} onToggle={(characterId, selected) => setCastSelection((current) => selected ? current.filter((id) => id !== characterId) : [...current, characterId])} onClose={() => setCastPickerOpen(false)} onSave={() => void saveCastSelection()} />}
      </main>
    )
  }

  return (
    <main className="studio-page" aria-label="Editor V6">
      <header className="studio-page-header"><h1>EDITOR V6</h1>{studioFolder && <small>Dados locais: {studioFolder}</small>}</header>
      <div className="studio-toolbar" aria-label="Ações do Editor V6">
        <button className="studio-action studio-action-primary" onClick={() => void createStudio()} disabled={loading || creatingProject} type="button"><Icon name="plus" />{creatingProject ? 'Criando…' : 'Criar'}</button>
        <button className="studio-action" onClick={() => setReactImportOpen(true)} disabled={loading || !availableCharactersReady} type="button"><Icon name="download" />Importar JSON</button>
      </div>
      {reactImportOpen && <EditorV6ReactImportDialog characters={availableCharacters} onClose={() => setReactImportOpen(false)} onSave={writeEditorV6Document} onImported={(project) => { upsertEditorV6Summary(editorV6ProjectSummary(project)); setSelectedId(project.id); setActiveEditorV6Id(project.id); setSaved(true); setReactImportOpen(false); setError(null) }} />}
      {error && <p className="studio-error-message" role="alert">{error}</p>}
      {loading ? <section className="studio-empty-state"><strong>Carregando projetos…</strong></section> : editorV6Projects.length ? (
        <section className="studio-grid" aria-label="Projetos do Editor V6">
          {editorV6Projects.map((studio) => <article className={`studio-card${selectedId === studio.id ? ' selected' : ''}`} key={studio.id}>
            <header className="studio-card-heading"><button className="studio-card-open" onClick={() => { setSelectedId(studio.id); setActiveEditorV6Id(studio.id) }} aria-label={`Abrir ${studio.title}`} type="button">{studio.title}</button><div className="studio-card-actions"><button className="studio-card-action" onClick={() => void duplicateStudio(studio)} aria-label={`Duplicar ${studio.title}`} title={`Duplicar ${studio.title}`} type="button"><span className="studio-duplicate-icon" aria-hidden="true">▢</span></button><button className="studio-card-action danger" onClick={() => void deleteStudio(studio)} aria-label={`Excluir ${studio.title}`} title={`Excluir ${studio.title}`} type="button"><Icon name="trash" /></button></div></header>
            <button className="studio-cover" style={{ backgroundColor: studio.color, ...(studio.thumbnailDataUrl ? { backgroundImage: `url(${studio.thumbnailDataUrl})` } : {}) }} onClick={() => { setSelectedId(studio.id); setActiveEditorV6Id(studio.id) }} aria-label={`Abrir ${studio.title}`} type="button" />
          </article>)}
        </section>
      ) : <section className="studio-empty-state"><span><Icon name="camera" /></span><strong>Nenhum projeto criado</strong><small>Crie um projeto para começar.</small></section>}
    </main>
  )
}
