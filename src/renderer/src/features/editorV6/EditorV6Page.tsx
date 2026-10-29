import { editorV6ElementSize } from '../../../../shared/editorV6SceneModel'
import { useEditorV6Store } from './editorV6Store'
import { createEditorV6Timeline, editorV6DefaultVideoLayout, syncEditorV6TimelineElements } from '../../../../shared/editorV6'
import { EditorV6Timeline } from './EditorV6Timeline'
import { EditorV6ExportPanel } from './EditorV6ExportPanel'
import { useMotionPreparation } from './motion/useMotionPreparation'
import { EditorV6VideoPickerModal } from './EditorV6VideoPickerModal'
import { EditorV6PlaybackAudio } from './EditorV6PlaybackAudio'
import { EditorV6PlaybackScene } from './EditorV6PlaybackScene'
import { EditorV6CastPanel } from './EditorV6CastPanel'
import { EditorV6PresetPanel } from './EditorV6PresetPanel'
import { getEditorV6PlaybackFrame, setEditorV6PlaybackFrame } from './editorV6PlaybackClock'
import { duplicateEditorV6ProjectDocument } from './editorV6ProjectDuplication'
import { addEditorV6ImageAsset, addEditorV6TimelineMedia } from './editorV6MediaChanges'
import { addEditorV6ElementAtFrame, editEditorV6DocumentAtBlock, editorV6ClipAtFrame, normalizeEditorV6Timeline, editEditorV6BackgroundAtFrame, pruneEditorV6TimelineSnapshots, repairEditorV6DuplicateAssets, repairEditorV6FaceModeAssetReferences, resolveEditorV6SceneAtFrame, timelineClips } from '../../../../shared/editorV6Timeline'
import { useEditorV6InspectorState } from './useEditorV6InspectorState'
import { useEditorV6FaceCatalog } from './useEditorV6FaceCatalog'
import { useEditorV6PoseCatalog } from './useEditorV6PoseCatalog'
import { useEditorV6FacePreview } from './useEditorV6FacePreview'
import { createSceneFaceActions } from '../../characters/sceneFaceActions'
import { SceneFaceCatalogPanel } from '../../characters/SceneFaceCatalogPanel'
import { createDefaultSceneFaceTransform, resolveSceneFaceTransform } from '../../characters/sceneFaceSelection'
import { useEditorV6StageInteraction, type EditorV6StageDrag } from './useEditorV6StageInteraction'
import { resolveEditorV6InspectorSelection } from './editorV6Selection'
import { trimTransparentImage, fitElementToTrim, faceRenderGeometry, type TrimmedImage } from '../../characters/characterGeometry'
import { bakeFaceModeAssets, EDITOR_V6_FACE_RENDER_VERSION, editorV6FaceModeForElement, trimTransparentCanvas } from './faceModeAssets'
import { planEditorV6CharacterRefresh, renderEditorV6CharacterRefresh } from './characterSnapshotRefresh'
import { Profiler, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { editorV6ExpressionCollection } from './expressionTransforms'
import { Icon } from '../../ui/components/Icon'
import { mapConcurrentItems } from '../../ui/mapConcurrentItems'
import { NumericRangeField } from '../../ui/components/NumericRangeField'
import { SceneElementControls } from '../../ui/components/SceneElementControls'
import { SceneCastPickerModal } from '../../ui/components/SceneCastPickerModal'
import { createSceneTextElement, sceneCatalogColor, sceneEditorTools } from '../../ui/sceneEditorDefaults'
import { recordEditorV6PlaybackFrame, recordUiCommit } from '../../ui/performanceDiagnostics'
import { useEditorV6DocumentPersistence } from './useEditorV6DocumentPersistence'
import { editorV6PoseRevisionKey, useEditorV6CharacterSources } from './useEditorV6CharacterSources'
import { resolveEditorV6CharacterSourceRefresh } from './editorV6CharacterSourceModel'
import { useEditorV6ProjectLibrary } from './useEditorV6ProjectLibrary'
import { fitEditorV6CharacterToStage } from '../../../../shared/editorV6CharacterGeometry'
import { editorV6ProjectSummary, type EditorV6Asset, type EditorV6Document, type EditorV6Element, type EditorV6FaceTransform, type EditorV6FaceTransforms, type EditorV6ProjectSummary, type EditorV6TimelineBlock } from '../../../../shared/editorV6'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { CustomizerFaceAppearance } from '../../../../shared/customizer'
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
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [normalizedSourceVersion, setNormalizedSourceVersion] = useState(0)
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
    availableCharacters, availableCharacterById, activePoseSourceSnapshot
  } = useEditorV6CharacterSources(activeEditorV6Id, setError)
  const [activeTool, setActiveTool] = useState<Tool>(null)
  const [fullView, setFullView] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [videoPickerOpen, setVideoPickerOpen] = useState(false)
  const [saved, setSaved] = useState(true)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [playheadFrame, setPlayheadFrame] = useState(0)
  const publishPlayheadFrame = useCallback((frame: number, syncEditor = true) => {
    const nextFrame = Math.max(0, Math.floor(frame))
    setEditorV6PlaybackFrame(nextFrame)
    if (syncEditor) setPlayheadFrame((current) => current === nextFrame ? current : nextFrame)
  }, [])
  const [isPlaying, setIsPlaying] = useState(false)
  const [motionExportBusy, setMotionExportBusy] = useState(false)
  const pausePlayback = useCallback(() => {
    publishPlayheadFrame(getEditorV6PlaybackFrame())
    setIsPlaying(false)
  }, [publishPlayheadFrame])
  const [selectedTimelineBlockId, setSelectedTimelineBlockId] = useState<string | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const sceneRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<EditorV6StageDrag | null>(null)
  const editorV6FaceTransformsRef = useRef<Record<string, EditorV6FaceTransforms>>({})
  const expressionSaveSignatureRef = useRef<{ studioId: string; value: string } | null>(null)
  const normalizedStudioIdsRef = useRef(new Set<string>())
  const nextStudioNumber = useRef(1)
  const editorV6SaveTimerRef = useRef<number | null>(null)
  const selectedEditorV6 = editorV6Projects.find((studio) => studio.id === selectedId) ?? null
  const activeEditorV6 = activeEditorV6Stored?.id === activeEditorV6Id ? activeEditorV6Stored : null
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
  useMotionPreparation(activeEditorV6, availableCharacters,
    saved && !isPlaying && !motionExportBusy && !faceAssetRefreshRequired
    && activePoseSourceSnapshot?.projectId === activeEditorV6Id)
  const timelineDurationFrames = activeEditorV6?.timeline.durationFrames ?? 300
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
  const stageCharacters = activeEditorV6?.elements.filter((element) => element.kind === 'character') ?? []

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

  useEffect(() => { setEditorV6ExpressionCollectionMenuOpen(false) }, [activeEditorV6Id, selectedElementId])

  useEffect(() => {
    let cancelled = false
    setEditorV6ExpressionCollectionMenuOpen(false)
    if (selectedEditorV6CharacterModelSlot === null) {
      setEditorV6ExpressionCollections([])
      setEditorV6ExpressionPresets([])
      setEditorV6ExpressionLoading(false)
      return () => { cancelled = true }
    }
    const refreshExpressionLibrary = () => {
      setEditorV6ExpressionLoading(true)
      void Promise.all([
        window.desktop.fabricator.listFaceExpressionCollections(selectedEditorV6CharacterModelSlot),
        window.desktop.fabricator.listFaceExpressionPresets(selectedEditorV6CharacterModelSlot)
      ]).then(([collections, presets]) => {
        if (cancelled) return
        setEditorV6ExpressionCollections(collections)
        setEditorV6ExpressionPresets(presets)
      }).catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os presets de expressão.')
      }).finally(() => {
        if (!cancelled) setEditorV6ExpressionLoading(false)
      })
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshExpressionLibrary()
    }
    refreshExpressionLibrary()
    window.addEventListener('focus', refreshExpressionLibrary)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      cancelled = true
      window.removeEventListener('focus', refreshExpressionLibrary)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [selectedEditorV6CharacterModelSlot])

  useEffect(() => {
    if (!activeEditorV6Id) return
    useEditorV6Store.getState().clear(activeEditorV6Id)
    publishPlayheadFrame(0)
    setIsPlaying(false)
    setSelectedTimelineBlockId(null)
    setCanUndo(false)
    setCanRedo(false)
    setHistoryVersion((value) => value + 1)
    setSelectedElementId(null)
  }, [activeEditorV6Id, publishPlayheadFrame])

  useEffect(() => {
    if (!isPlaying) return
    const initialFrame = getEditorV6PlaybackFrame()
    const started = performance.now()
    let animation = 0
    const tick = (now: number) => {
      const frame = Math.min(timelineDurationFrames, initialFrame + Math.floor((now - started) * 30 / 1000))
      const publishStarted = performance.now()
      publishPlayheadFrame(frame, frame >= timelineDurationFrames)
      recordEditorV6PlaybackFrame(frame, now, performance.now() - publishStarted)
      if (frame >= timelineDurationFrames) setIsPlaying(false)
      else animation = requestAnimationFrame(tick)
    }
    animation = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animation)
  }, [isPlaying, timelineDurationFrames, activeEditorV6Id, publishPlayheadFrame])

  useEffect(() => {
    if (!activeEditorV6 || normalizedStudioIdsRef.current.has(activeEditorV6.id)) return
    let cancelled = false
    const studioId = activeEditorV6.id
    void (async () => {
      const characterAssets = activeEditorV6.assets.filter((asset) => asset.category === 'character' && activeEditorV6.elements.some((element) => element.kind === 'character' && element.assetId === asset.id))
      const crops = await mapConcurrentItems(characterAssets,
        async (asset) => ({ assetId: asset.id, crop: await trimTransparentImage(asset.dataUrl) }),
        () => cancelled
      )
      if (cancelled) return
      normalizedStudioIdsRef.current.add(studioId)
      setNormalizedSourceVersion((version) => version + 1)
      const byAsset = new Map(crops.filter((entry): entry is { assetId: string; crop: TrimmedImage } => entry.crop !== null).map((entry) => [entry.assetId, entry.crop]))
      if (!byAsset.size) return
      updateActiveEditorV6Project((studio) => studio.id !== studioId ? studio : {
        ...studio,
        assets: studio.assets.map((asset) => {
          const crop = byAsset.get(asset.id)
          return crop ? { ...asset, dataUrl: crop.dataUrl, mimeType: 'image/png' } : asset
        }),
        elements: studio.elements.map((element) => {
          const crop = element.kind === 'character' && element.assetId ? byAsset.get(element.assetId) : undefined
          return crop ? fitElementToTrim(element, crop) : element
        }),
        timeline: { ...studio.timeline, tracks: studio.timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => {
          const crop = block.state?.kind === 'character' && block.state.assetId ? byAsset.get(block.state.assetId) : undefined
          return crop && block.state ? { ...block, state: fitElementToTrim(block.state, crop) } : block
        }) })) },
        updatedAt: new Date().toISOString()
      })
      markEditorV6Unsaved()
    })()
    return () => { cancelled = true }
  }, [activeEditorV6, markEditorV6Unsaved])

  useEffect(() => {
    const project = activeEditorV6
    if (!project || !normalizedStudioIdsRef.current.has(project.id) || !availableCharacters.length || activePoseSourceSnapshot?.projectId !== project.id) return
    const plan = planEditorV6CharacterRefresh(project, availableCharacters, activePoseSourceSnapshot.revisions)
    if (plan.missingCharacterNames.length) setError(`Não foi possível atualizar ${plan.missingCharacterNames.join(', ')} porque o personagem não está disponível no Customizador.`)
    if (!plan.groups.length) return
    pausePlayback()
    let cancelled = false
    const projectId = project.id
    void (async () => {
      try {
        const result = await renderEditorV6CharacterRefresh(
          plan.groups,
          sceneRef.current?.clientWidth ?? 1000,
          sceneRef.current?.clientHeight ?? 562,
          () => cancelled
        )
        if (cancelled || !result) return
        updateActiveEditorV6Project((current) => {
          if (current.id !== projectId) return current
          const timeline = { ...current.timeline, tracks: current.timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => {
            const state = result.nextBlocks.get(block.id)
            return state ? { ...block, state, label: state.text.trim().slice(0, 120) || block.label } : block
          }) })) }
          const next = {
            ...current,
            elements: current.elements.map((element) => result.nextElements.get(element.id) ?? element),
            assets: [...current.assets.map((asset) => result.staleAssetIds.has(asset.id) ? { ...asset, timelineSnapshot: true } : asset), ...result.refreshedAssets],
            timeline,
            updatedAt: new Date().toISOString()
          }
          return pruneEditorV6TimelineSnapshots(next)
        })
        markEditorV6Unsaved()
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o personagem e as poses salvas no Editor V6.')
      }
    })()
    return () => { cancelled = true }
  }, [activeEditorV6, activePoseSourceSnapshot, availableCharacters, normalizedSourceVersion, pausePlayback, updateActiveEditorV6Project, markEditorV6Unsaved])

  const allocateNumber = () => {
    const highest = editorV6Projects.reduce((max, studio) => Math.max(max, Number(studio.title.match(/^Editor V6\s+(\d+)/i)?.[1] ?? 0)), 0)
    const number = Math.max(nextStudioNumber.current, highest + 1)
    nextStudioNumber.current = number + 1
    return number
  }

  const createStudio = async () => {
    const number = allocateNumber()
    const now = new Date().toISOString()
    const studio: EditorV6Document = {
      schemaVersion: 1, id: crypto.randomUUID(), title: `Editor V6 ${String(number).padStart(2, '0')}`,
      color: sceneCatalogColor(number), createdAt: now, updatedAt: now, backgroundColor: '#d7b5cd',
      backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100,
      backgroundRotation: 0, assets: [], elements: [], timeline: createEditorV6Timeline()
    }
    try {
      setError(null)
      await writeEditorV6Document(studio)
      upsertEditorV6Summary(editorV6ProjectSummary(studio))
      setSelectedId(studio.id)
      setSaved(true)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar o projeto do Editor V6.') }
  }

  const duplicateStudio = (sourceSummary: EditorV6Card | null = selectedEditorV6) => trackEditorV6Operation(async () => {
    if (!sourceSummary) return
    let source: EditorV6Document | null
    try {
      source = activeEditorV6?.id === sourceSummary.id
        ? activeEditorV6
        : await window.desktop.editorV6.loadEditorV6Project(sourceSummary.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o projeto que será duplicado.')
      return
    }
    if (!source) { setError('Não foi possível carregar o projeto que será duplicado.'); return }
    const number = allocateNumber()
    const now = new Date().toISOString()
    const duplicate = duplicateEditorV6ProjectDocument(source, {
      id: crypto.randomUUID(),
      title: `Editor V6 ${String(number).padStart(2, '0')}`,
      color: sceneCatalogColor(number),
      createdAt: now,
      updatedAt: now
    }, () => crypto.randomUUID())
    try {
      setError(null)
      if (source.exportAudio?.length) await window.desktop.editorV6.cloneEditorV6ExportAudio(source.id, duplicate.id, source.exportAudio)
      if (source.media?.length) await window.desktop.editorV6.cloneEditorV6Media(source.id, duplicate.id, source.media)
      await writeEditorV6Document(duplicate)
      upsertEditorV6Summary(editorV6ProjectSummary(duplicate))
      setSelectedId(duplicate.id)
      setSaved(true)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível duplicar o projeto do Editor V6.') }
  })

  useEffect(() => {
    if (!activeEditorV6 || dragRef.current) return
    markEditorV6Unsaved()
    const signature = JSON.stringify(activeEditorV6.elements.filter((element) => element.kind === 'character').map((element) => [element.id, element.activeExpressionCollectionId, element.activeExpressionPresetId]))
    const previous = expressionSaveSignatureRef.current
    expressionSaveSignatureRef.current = { studioId: activeEditorV6.id, value: signature }
    if (previous?.studioId === activeEditorV6.id && previous.value !== signature) {
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
  }, [activeEditorV6, markEditorV6Unsaved, saveActiveEditorV6Project])

  const patchStudio = (transform: (studio: EditorV6Document) => EditorV6Document, editSelection = true) => {
    if (!activeEditorV6Id) return
    updateActiveEditorV6Project((studio) => {
      if (studio.id !== activeEditorV6Id) return studio
      const currentFrame = getEditorV6PlaybackFrame()
      const selected = timelineClips(studio.timeline).find(({ block }) => block.id === selectedTimelineBlockId && block.elementId === selectedElementId)
        ?? (selectedElementId ? editorV6ClipAtFrame(studio.timeline, selectedElementId, currentFrame) : undefined)
      const next = editSelection ? editEditorV6DocumentAtBlock(studio, selected?.block.id ?? null, transform) : transform(studio)
      return pruneEditorV6TimelineSnapshots(repairEditorV6FaceModeAssetReferences({ ...next, timeline: normalizeEditorV6Timeline(next.timeline) }))
    })
    markEditorV6Unsaved()
  }

  const patchEditorV6FacePreview = (projectId: string, blockId: string | null | undefined, transform: (project: EditorV6Document) => EditorV6Document) => {
    if (activeEditorV6IdRef.current !== projectId) return
    updateActiveEditorV6Project((project) => {
      if (project.id !== projectId) return project
      const next = editEditorV6DocumentAtBlock(project, blockId ?? null, transform)
      return pruneEditorV6TimelineSnapshots(repairEditorV6FaceModeAssetReferences({ ...next, timeline: normalizeEditorV6Timeline(next.timeline) }))
    })
    markEditorV6Unsaved()
  }

  const editorV6FacePreview = useEditorV6FacePreview({
    activeProject: activeEditorV6,
    activeProjectId: activeEditorV6Id,
    sceneRef,
    transformsRef: editorV6FaceTransformsRef,
    patchProject: patchEditorV6FacePreview,
    setError
  })

  const recordHistory = (document = activeEditorV6) => {
    if (!document) return
    const history = useEditorV6Store.getState().record(document.id, document)
    setCanUndo(history.undo.length > 0)
    setCanRedo(false)
    setHistoryVersion(value => value + 1)
  }

  const loadLatestEditorV6Project = async (projectId: string) => {
    const current = useEditorV6Store.getState().activeProject
    return current?.id === projectId ? current : window.desktop.editorV6.loadEditorV6Project(projectId)
  }

  const persistImportedEditorV6Document = async (source: EditorV6Document, next: EditorV6Document) => {
    const isActive = activeEditorV6IdRef.current === source.id && useEditorV6Store.getState().activeProject?.id === source.id
    if (isActive) {
      recordHistory(source)
      setActiveEditorV6Project(next)
      markEditorV6Unsaved()
    }
    await writeEditorV6DocumentInOrder(next)
    const current = useEditorV6Store.getState().activeProject
    upsertEditorV6Summary(editorV6ProjectSummary(current?.id === next.id ? current : next))
    const isStillCurrent = isActive
      && activeEditorV6IdRef.current === next.id
      && current?.id === next.id
      && current.updatedAt === next.updatedAt
    if (isStillCurrent) {
      setSaved(true)
      setError(null)
    }
    return isStillCurrent
  }

  const changeScene = (transform: (studio: EditorV6Document) => EditorV6Document) => {
    if (!activeEditorV6) return
    recordHistory()
    patchStudio((studio) => {
      const next = transform(studio)
      return { ...next, timeline: syncEditorV6TimelineElements(next.timeline, next.elements) }
    })
  }

  const undo = () => {
    if (!activeEditorV6) return
    const document = useEditorV6Store.getState().undo(activeEditorV6.id, activeEditorV6)
    if (!document) return
    const history = useEditorV6Store.getState().histories[activeEditorV6.id]
    patchStudio(() => document, false)
    setCanUndo(Boolean(history?.undo.length))
    setCanRedo(true)
    setHistoryVersion(value => value + 1)
  }

  const redo = () => {
    if (!activeEditorV6) return
    const document = useEditorV6Store.getState().redo(activeEditorV6.id, activeEditorV6)
    if (!document) return
    const history = useEditorV6Store.getState().histories[activeEditorV6.id]
    patchStudio(() => document, false)
    setCanUndo(Boolean(history?.undo.length))
    setCanRedo(Boolean(history?.redo.length))
    setHistoryVersion(value => value + 1)
  }

  const importImage = (category: 'background' | 'object') => trackEditorV6Operation(async () => {
    if (!activeEditorV6) return
    pausePlayback()
    const targetTrackKind = category === 'object' ? 'object' : 'video'
    if (category !== 'background' && activeEditorV6.timeline.tracks.some((track) => track.kind === targetTrackKind && track.locked)) { setError(category === 'object' ? 'Desbloqueie a faixa Objetos para adicionar uma imagem.' : 'Desbloqueie a faixa Vídeo para adicionar uma imagem.'); return }
    const projectId = activeEditorV6.id
    try {
      const frameAtImport = getEditorV6PlaybackFrame()
      const asset = await window.desktop.editorV6.importEditorV6Image(category)
      if (!asset) return
      const currentProject = await loadLatestEditorV6Project(projectId)
      if (!currentProject) { setError('Não foi possível carregar o projeto para adicionar a imagem.'); return }
      if (category !== 'background' && currentProject.timeline.tracks.some((track) => track.kind === targetTrackKind && track.locked)) {
        setError(category === 'object' ? 'Desbloqueie a faixa Objetos para adicionar uma imagem.' : 'Desbloqueie a faixa Vídeo para adicionar uma imagem.')
        return
      }
      const nextProject = addEditorV6ImageAsset(currentProject, asset, category, frameAtImport, () => crypto.randomUUID())
      if (!await persistImportedEditorV6Document(currentProject, nextProject)) return
      if (category === 'background') {
        setSelectedElementId('background')
      } else {
        setSelectedElementId(nextProject.elements.at(-1)?.id ?? null)
        setSelectedTimelineBlockId(editorV6ClipAtFrame(nextProject.timeline, nextProject.elements.at(-1)!.id, frameAtImport)?.block.id ?? null)
      }
      setActiveTool(category === 'background' ? 'background' : 'objects')
      setInspectorOpen(true)
      setInspectorTab('editor')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível importar a imagem.') }
  })

  const importTimelineMedia = (kind: 'video' | 'audio') => trackEditorV6Operation(async () => {
    if (!activeEditorV6) return
    if (kind === 'video') { setVideoPickerOpen(true); return }
    const track = activeEditorV6.timeline.tracks.find((item) => item.kind === kind)
    if (track?.locked) { setError('Desbloqueie a faixa Áudio para importar mídia.'); return }
    pausePlayback()
    const projectId = activeEditorV6.id
    const frameAtImport = getEditorV6PlaybackFrame()
    try {
      const media = await window.desktop.editorV6.importEditorV6Media(projectId, kind)
      if (!media) return
      const currentProject = await loadLatestEditorV6Project(projectId)
      if (!currentProject) { setError('Não foi possível carregar o projeto para adicionar a mídia.'); return }
      const { document: nextProject, block, startFrame } = addEditorV6TimelineMedia(currentProject, media, frameAtImport, () => crypto.randomUUID())
      if (!await persistImportedEditorV6Document(currentProject, nextProject)) return
      publishPlayheadFrame(startFrame)
      setSelectedTimelineBlockId(block.id)
      setSelectedElementId(null)
      setActiveTool(null)
      setInspectorOpen(true)
      setInspectorTab('editor')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível importar o áudio.') }
  })

  const linkVideoLibraryItem = (item: import('../../../../shared/mediaLibrary').VideoLibraryItem) => trackEditorV6Operation(async () => {
    const activeProject = activeEditorV6
    if (!activeProject) return
    const projectId = activeProject.id
    const track = activeProject.timeline.tracks.find((entry) => entry.kind === 'video')
    if (track?.locked) throw new Error('Desbloqueie a faixa Vídeo antes de adicionar um vídeo.')
    pausePlayback()
    const frameAtImport = getEditorV6PlaybackFrame()
    const media = await window.desktop.editorV6.linkEditorV6LibraryVideo(projectId, item.id)
    const currentProject = await loadLatestEditorV6Project(projectId)
    if (!currentProject) throw new Error('Não foi possível carregar o projeto para adicionar o vídeo.')
    const { document: nextProject, block, startFrame } = addEditorV6TimelineMedia(currentProject, media, frameAtImport, () => crypto.randomUUID())
    if (!await persistImportedEditorV6Document(currentProject, nextProject)) return
    publishPlayheadFrame(startFrame)
    setSelectedTimelineBlockId(block.id)
    setSelectedElementId(null)
    setActiveTool(null)
    setInspectorOpen(true)
    setInspectorTab('editor')
    setVideoPickerOpen(false)
  })

  const selectBackground = (asset: EditorV6Asset) => {
    const frame = getEditorV6PlaybackFrame()
    changeScene((studio) => ({ ...editEditorV6BackgroundAtFrame(studio, frame, { backgroundAssetId: asset.id, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 }), updatedAt: new Date().toISOString() }))
    setSelectedTimelineBlockId(null)
    setSelectedElementId('background')
    setInspectorOpen(true)
    setInspectorTab('editor')
  }

  const addTextElement = (kind: 'narrator' | 'speech' | 'thought') => {
    if (!activeEditorV6) return
    const character = kind === 'narrator' ? null : selectedCharacterElement
    if (kind !== 'narrator' && !character?.characterId) {
      setError('Selecione um personagem na cena antes de adicionar fala ou pensamento.')
      return
    }
    pausePlayback()
    const frame = getEditorV6PlaybackFrame()
    if (activeEditorV6.timeline.tracks.some((track) => track.kind === (kind === 'narrator' ? 'video' : kind) && track.locked)) { setError('Desbloqueie a faixa para adicionar um bloco.'); return }
    const element = {
      ...createSceneTextElement(kind, Math.max(0, ...activeEditorV6.elements.map((item) => item.zIndex)) + 1),
      ...(character ? { characterId: character.characterId, x: character.x, y: character.y } : {})
    }
    const blockId = crypto.randomUUID()
    changeScene((studio) => ({ ...addEditorV6ElementAtFrame(studio, element, frame, blockId), updatedAt: new Date().toISOString() }))
    setSelectedElementId(element.id)
    setSelectedTimelineBlockId(blockId)
    setInspectorOpen(true)
    setInspectorTab('editor')
  }

  const openCastPicker = () => {
    setCastSelection(stageCharacters.map((element) => element.characterId).filter((id): id is string => Boolean(id)))
    setCastPickerOpen(true)
  }

  const saveCastSelection = async () => {
    if (!activeEditorV6 || savingCast) return
    setSavingCast(true)
    try {
      const selectedIds = new Set(castSelection)
      const retained = activeEditorV6.elements.filter((element) => element.kind !== 'character' || !element.characterId || selectedIds.has(element.characterId))
      const removedCharacterAssetIds = new Set(activeEditorV6.elements.filter((element) => element.kind === 'character' && element.characterId && !selectedIds.has(element.characterId)).map((element) => element.assetId).filter((id): id is string => Boolean(id)))
      const retainedCharacters = new Set(retained.filter((element) => element.kind === 'character').map((element) => element.characterId))
      const additions = availableCharacters.filter((character) => selectedIds.has(character.id) && !retainedCharacters.has(character.id))
      const { prepareSavedCharacterRenderer, renderSavedCharacter } = await import('../../characters/editorV6CharacterRenderer')
      const assets: EditorV6Asset[] = []
      const elements: EditorV6Element[] = []
      const stageWidth = sceneRef.current?.clientWidth ?? 1000
      const stageHeight = sceneRef.current?.clientHeight ?? 562
      let zIndex = Math.max(0, ...retained.map((item) => item.zIndex))
      for (const character of additions) {
        const renderer = await prepareSavedCharacterRenderer(character)
        try {
          const rendered = await renderer.renderToCanvas(undefined, undefined, undefined, 'idle')
          const baked = await bakeFaceModeAssets(character.name, renderer, character.customization.faceAppearance, undefined, undefined, 'idle', rendered)
          const imageWidth = baked.crop?.width ?? rendered.width
          const imageHeight = baked.crop?.height ?? rendered.height
          const referenceCharacter = character.customization.poseSlot === null ? character : { ...character, customization: { ...character.customization, poseSlot: null } }
          const referenceRendered = referenceCharacter === character ? rendered : await renderSavedCharacter(referenceCharacter, undefined, undefined, 'idle')
          const referenceCrop = 'dataUrl' in referenceRendered ? await trimTransparentImage(referenceRendered.dataUrl) : baked.crop
          const referenceWidth = referenceCrop?.width ?? referenceRendered.width
          const referenceHeight = referenceCrop?.height ?? referenceRendered.height
          const asset: EditorV6Asset = { id: crypto.randomUUID(), category: 'character', name: character.name, mimeType: 'image/png', dataUrl: baked.dataUrl }
          const { width, height, characterCanvasWidth } = fitEditorV6CharacterToStage(referenceRendered, { width: referenceWidth, height: referenceHeight }, rendered, { width: imageWidth, height: imageHeight }, stageWidth, stageHeight)
          assets.push(asset, ...baked.extraAssets)
          const poseSlot = character.customization.poseSlot
          const poseSourceRevision = typeof poseSlot === 'number' ? activePoseSourceSnapshot?.revisions[editorV6PoseRevisionKey(character.customization.modelSlot ?? 1, poseSlot)] ?? 'missing' : undefined
          elements.push({ id: crypto.randomUUID(), kind: 'character', assetId: asset.id, faceModeAssetIds: { ...baked.assetIds, idle: asset.id }, characterId: character.id, characterSourceUpdatedAt: character.updatedAt, ...(poseSourceRevision ? { poseSourceRevision } : {}), faceRendererVersion: EDITOR_V6_FACE_RENDER_VERSION, activeExpressionCollectionId: 'standard', activeExpressionPresetId: null, activeFaceMode: 'idle', characterScale: 100, characterWidthScale: 100, characterHeightScale: 100, ...(character.customization.faceAppearance ? { expressionBase: { appearance: structuredClone(character.customization.faceAppearance), transforms: {} } } : {}), characterCanvasWidth, text: character.name, x: 0, y: 0, width, height, rotation: 0, zIndex: ++zIndex })
        } finally { renderer.dispose() }
      }
      const nextElements = [...retained, ...elements]
      const retainedAssetIds = new Set(retained.map((element) => element.assetId).filter((id): id is string => Boolean(id)))
      changeScene((studio) => ({
        ...studio,
        elements: nextElements,
        assets: [...studio.assets.filter((asset) => !removedCharacterAssetIds.has(asset.id) || retainedAssetIds.has(asset.id)), ...assets],
        updatedAt: new Date().toISOString()
      }))
      setCastPickerOpen(false)
      setActiveTool(null)
      restoreCharacterInspectorView()
      setInspectorOpen(true)
      setSelectedElementId(elements.at(-1)?.id ?? null)
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o elenco do Editor V6.')
    } finally { setSavingCast(false) }
  }

  const applyStudioFaceAppearance = async (appearance: CustomizerFaceAppearance, faceTransforms: EditorV6FaceTransforms = selectedElement?.faceTransforms ?? {}, record = true, expressionState?: Pick<EditorV6Element, 'expressionBase' | 'activeExpressionGaze' | 'activeExpressionPresetId' | 'activeExpressionPresetUpdatedAt' | 'activeExpressionCollectionId' | 'activeExpressionEffects' | 'activeFaceMode'>) => {
    if (!activeEditorV6 || selectedElement?.kind !== 'character' || !selectedEditorV6Character || !selectedElement.assetId || editorV6FaceBusy) return
    setEditorV6FaceBusy(true)
    try {
      const characterCopy: CustomizerCharacter = {
        ...selectedEditorV6Character,
        customization: { ...selectedEditorV6Character.customization, poseSlot: selectedElement.poseSlot === undefined ? selectedEditorV6Character.customization.poseSlot : selectedElement.poseSlot, faceAppearance: appearance }
      }
      const activeEffects = expressionState && Object.hasOwn(expressionState, 'activeExpressionEffects') ? expressionState.activeExpressionEffects : selectedElement.activeExpressionEffects
      const faceMode = expressionState && Object.hasOwn(expressionState, 'activeFaceMode') ? expressionState.activeFaceMode : selectedElement.activeFaceMode
      const baseMode = faceMode ?? editorV6FaceModeForElement(selectedElement, appearance)
      const assetId = selectedElement.assetId
      const result = await editorV6FacePreview.withRenderer(characterCopy, selectedElement.poseSourceRevision, async (renderer) => {
        const rendered = await renderer.renderToCanvas(appearance, faceTransforms, activeEffects, baseMode)
        const baked = await bakeFaceModeAssets(selectedElement.text, renderer, appearance, faceTransforms, activeEffects, baseMode, rendered)
        return { rendered, baked }
      })
      if (!result) return
      const { rendered, baked } = result
      const faceModeAssetIds = { ...baked.assetIds, [baseMode]: assetId }
      const elementId = selectedElement.id
      const update = (studio: EditorV6Document): EditorV6Document => ({
        ...studio,
        elements: studio.elements.map((element) => element.id === elementId ? { ...element, ...expressionState, faceRendererVersion: EDITOR_V6_FACE_RENDER_VERSION, faceModeAssetIds, ...faceRenderGeometry(element, rendered, baked.crop, sceneRef.current?.clientWidth ?? 1000, sceneRef.current?.clientHeight ?? 562), faceAppearance: appearance, faceTransforms, characterSourceUpdatedAt: selectedEditorV6Character.updatedAt } : element),
        assets: [...studio.assets.map((asset) => asset.id === assetId ? { ...asset, dataUrl: baked.dataUrl, mimeType: 'image/png' as const } : asset), ...baked.extraAssets],
        updatedAt: new Date().toISOString()
      })
      if (record) changeScene(update)
      else patchStudio(update)
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível aplicar a peça facial neste projeto.')
    } finally { setEditorV6FaceBusy(false) }
  }

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

  const applyStudioPose = async (poseSlot: number | null) => {
    if (!activeEditorV6 || selectedElement?.kind !== 'character' || !selectedEditorV6Character || !selectedElement.assetId || editorV6FaceBusy) return
    setEditorV6FaceBusy(true)
    try {
      const { prepareSavedCharacterRenderer } = await import('../../characters/editorV6CharacterRenderer')
      let characterCanvasWidth = selectedElement.characterCanvasWidth
      if (!characterCanvasWidth) {
        const currentPoseCharacter: CustomizerCharacter = { ...selectedEditorV6Character, customization: { ...selectedEditorV6Character.customization, poseSlot: selectedElement.poseSlot === undefined ? selectedEditorV6Character.customization.poseSlot : selectedElement.poseSlot, faceAppearance: selectedElement.faceAppearance ?? selectedEditorV6Character.customization.faceAppearance } }
        const currentRenderer = await prepareSavedCharacterRenderer(currentPoseCharacter)
        const currentRendered = await currentRenderer.renderToCanvas(currentPoseCharacter.customization.faceAppearance, selectedElement.faceTransforms, selectedElement.activeExpressionEffects, selectedElement.activeFaceMode).finally(() => currentRenderer.dispose())
        const currentCrop = trimTransparentCanvas(currentRendered.canvas)
        characterCanvasWidth = selectedElement.width * currentRendered.width / (currentCrop?.width ?? currentRendered.width)
      }
      const characterCopy: CustomizerCharacter = { ...selectedEditorV6Character, customization: { ...selectedEditorV6Character.customization, poseSlot, faceAppearance: selectedElement.faceAppearance ?? selectedEditorV6Character.customization.faceAppearance } }
      const baseMode = editorV6FaceModeForElement(selectedElement, characterCopy.customization.faceAppearance)
      const poseRenderer = await prepareSavedCharacterRenderer(characterCopy)
      let rendered: { canvas: HTMLCanvasElement; width: number; height: number }
      let baked: Awaited<ReturnType<typeof bakeFaceModeAssets>>
      try {
        rendered = await poseRenderer.renderToCanvas(characterCopy.customization.faceAppearance, selectedElement.faceTransforms, selectedElement.activeExpressionEffects, baseMode)
        baked = await bakeFaceModeAssets(selectedElement.text, poseRenderer, characterCopy.customization.faceAppearance, selectedElement.faceTransforms, selectedElement.activeExpressionEffects, baseMode, rendered)
      } finally { poseRenderer.dispose() }
      const cropWidth = baked.crop?.width ?? rendered.width
      const cropHeight = baked.crop?.height ?? rendered.height
      const stageWidth = sceneRef.current?.clientWidth ?? 1000
      const stageHeight = sceneRef.current?.clientHeight ?? 562
      const fullCanvasHeight = characterCanvasWidth * stageWidth / stageHeight * rendered.height / rendered.width
      const width = characterCanvasWidth * cropWidth / rendered.width
      const height = fullCanvasHeight * cropHeight / rendered.height
      const elementId = selectedElement.id
      const assetId = selectedElement.assetId
      changeScene((studio) => ({
        ...studio,
        elements: studio.elements.map((element) => element.id === elementId ? { ...element, poseSlot, ...(typeof poseSlot === 'number' ? { poseSourceRevision: activePoseSourceSnapshot?.revisions[editorV6PoseRevisionKey(selectedEditorV6Character.customization.modelSlot ?? 1, poseSlot)] ?? 'missing' } : { poseSourceRevision: undefined }), faceModeAssetIds: { ...baked.assetIds, [baseMode]: assetId }, characterCanvasWidth, width, height, characterSourceUpdatedAt: selectedEditorV6Character.updatedAt } : element),
        assets: [...studio.assets.map((asset) => asset.id === assetId ? { ...asset, dataUrl: baked.dataUrl, mimeType: 'image/png' as const } : asset), ...baked.extraAssets],
        updatedAt: new Date().toISOString()
      }))
      setError(null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível aplicar a pose neste projeto.') }
    finally { setEditorV6FaceBusy(false) }
  }

  const updateEditorV6FaceTransform = (transformKey: string, patch: Partial<EditorV6FaceTransform>, record = false, baseTransform = defaultStudioEyeTransform) => {
    if (!selectedElement || selectedElement.kind !== 'character') return
    const saved = editorV6FaceTransformsRef.current[selectedElement.id] ?? selectedElement.faceTransforms ?? {}
    const transform = { ...(saved[transformKey] ?? baseTransform), ...patch }
    const next = { ...saved, [transformKey]: transform }
    editorV6FaceTransformsRef.current[selectedElement.id] = next
    updateElement(selectedElement.id, { faceTransforms: next }, record)
    if (activeEditorV6 && selectedEditorV6Character && selectedEditorV6FaceAppearance && selectedElement.assetId && activeEditorV6Id) {
      const character: CustomizerCharacter = { ...selectedEditorV6Character, customization: { ...selectedEditorV6Character.customization, poseSlot: selectedElement.poseSlot === undefined ? selectedEditorV6Character.customization.poseSlot : selectedElement.poseSlot, faceAppearance: selectedEditorV6FaceAppearance } }
      const selectedClip = timelineClips(activeEditorV6.timeline).find(({ block }) => block.id === selectedTimelineBlockId && block.elementId === selectedElement.id)
        ?? editorV6ClipAtFrame(activeEditorV6.timeline, selectedElement.id, getEditorV6PlaybackFrame())
      editorV6FacePreview.schedulePreview({ projectId: activeEditorV6Id, elementId: selectedElement.id, assetId: selectedElement.assetId, blockId: selectedClip?.block.id ?? null, poseSlot: selectedElement.poseSlot, poseSourceRevision: selectedElement.poseSourceRevision, character, transforms: next })
    }
  }

  const finishEditorV6FaceTransform = (transformKey: string) => {
    if (!selectedElement || selectedElement.kind !== 'character') return
    const faceTransforms = editorV6FaceTransformsRef.current[selectedElement.id] ?? selectedElement.faceTransforms ?? {}
    if (!faceTransforms[transformKey]) return
    editorV6FacePreview.flushPreview()
  }

  const removeStageCharacter = (element: EditorV6Element) => {
    changeScene((studio) => {
      const elements = studio.elements.filter((item) => item.id !== element.id)
      const stillUsed = new Set(elements.map((item) => item.assetId).filter(Boolean))
      return {
        ...studio, elements,
        assets: studio.assets.filter((asset) => asset.id !== element.assetId || stillUsed.has(asset.id)),
        updatedAt: new Date().toISOString()
      }
    })
    if (selectedElementId === element.id) setSelectedElementId(null)
  }

  const updateElement = (id: string, values: Partial<EditorV6Element>, record = true) => {
    const update = (studio: EditorV6Document) => ({ ...studio, elements: studio.elements.map((element) => element.id === id ? { ...element, ...values } : element), updatedAt: new Date().toISOString() })
    if (record) changeScene(update)
    else patchStudio(update)
  }

  const updateVideoBlock = (blockId: string, values: Partial<Pick<EditorV6TimelineBlock, 'mediaLayout' | 'audioEnabled' | 'gain' | 'mediaInFrame'>>, record = true) => {
    const update = (studio: EditorV6Document) => ({ ...studio, timeline: normalizeEditorV6Timeline({ ...studio.timeline, tracks: studio.timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => block.id === blockId ? { ...block, ...values } : block) })) }), updatedAt: new Date().toISOString() })
    if (record) changeScene(update)
    else patchStudio(update)
  }

  const updateBackground = (values: Partial<Pick<EditorV6Document, 'backgroundColor' | 'backgroundX' | 'backgroundY' | 'backgroundWidth' | 'backgroundHeight' | 'backgroundRotation'>>, record = true) => {
    const frame = getEditorV6PlaybackFrame()
    const update = (studio: EditorV6Document) => ({ ...editEditorV6BackgroundAtFrame(studio, frame, values), updatedAt: new Date().toISOString() })
    if (record) changeScene(update)
    else patchStudio(update)
  }

  const { cancelSceneDrag, interaction: sceneInteraction } = useEditorV6StageInteraction({
    project: activeEditorV6, sceneRef,
    faceBusy: editorV6FaceBusy, expressionBusy: editorV6ExpressionBusy,
    faceRenderRunningRef: editorV6FacePreview.renderRunningRef,
    setSelectedElementId, setActiveTool, setInspectorOpen, setInspectorTab, setSelectedTimelineBlockId,
    restoreCharacterInspectorView, pausePlayback, publishPlayheadFrame,
    updateActiveProject: updateActiveEditorV6Project, markUnsaved: markEditorV6Unsaved, recordHistory
  }, dragRef)

  const deleteSelected = () => {
    if (!activeEditorV6) return
    if (selectedElementId === 'background') {
      const frame = getEditorV6PlaybackFrame()
      changeScene((studio) => ({ ...editEditorV6BackgroundAtFrame(studio, frame, { backgroundAssetId: null }), updatedAt: new Date().toISOString() }))
      setSelectedElementId(null)
    } else if (selectedTimelineVideoClip) {
      const blockId = selectedTimelineVideoClip.block.id
      changeScene((studio) => ({ ...studio, timeline: { ...studio.timeline, tracks: studio.timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.filter((block) => block.id !== blockId) })) }, updatedAt: new Date().toISOString() }))
      setSelectedTimelineBlockId(null)
    } else if (selectedElementId) {
      const current = activeEditorV6.elements.find((element) => element.id === selectedElementId)
      if (current?.kind === 'character') removeStageCharacter(current)
      else changeScene((studio) => ({ ...studio, elements: studio.elements.filter((element) => element.id !== selectedElementId), updatedAt: new Date().toISOString() }))
      setSelectedElementId(null)
    }
  }

  const deleteStudio = async (target: EditorV6Card | null = selectedEditorV6) => {
    if (!target || !window.confirm(`Excluir ${target.title}?`)) return
    await trackEditorV6Operation(async () => {
      try {
        if (target.id === activeEditorV6IdRef.current) await flushEditorV6DocumentWrites()
        await window.desktop.editorV6.deleteEditorV6Project(target.id)
        removeEditorV6Summary(target.id)
        setSelectedId((current) => current === target.id ? null : current)
        if (activeEditorV6Id === target.id) { pausePlayback(); setActiveEditorV6Id(null) }
        setSaved(true)
        setError(null)
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o projeto do Editor V6.') }
    })
  }

  const leaveStudio = async () => {
    try { await flushEditorV6Writes() } catch { return }
    pausePlayback()
    setActiveEditorV6Id(null)
    setActiveTool(null)
    setSelectedElementId(null)
    setFullView(false)
  }

  const exportPrint = () => {
    if (!activeEditorV6) return
    const project = activeEditorV6
    return trackEditorV6Operation(async () => {
      try {
        await flushEditorV6DocumentWrites()
        const { captureEditorV6Frame } = await import('./sceneCapture')
        const image = await captureEditorV6Frame(project, getEditorV6PlaybackFrame(), 1920, 1080, 'image/png')
        const path = await window.desktop.editorV6.saveEditorV6Print(project.id, image)
        if (path) { setError(null); setNotice(`Print salvo em ${path}`) }
      } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível gerar o print.') }
    })
  }

  const openPrints = () => trackEditorV6Operation(async () => {
    if (!activeEditorV6) return
    try { await window.desktop.editorV6.openEditorV6Prints(activeEditorV6.id) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a pasta de prints.') }
  })

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

  const propertyPanel = (): ReactNode => {
    if (!activeEditorV6) return null
    if (activeTool === 'background') return <div className="studio-side-content">
      <h2>Fundos</h2><p>Escolha um fundo salvo ou adicione uma imagem.</p>
      <label className="studio-color-control">Cor sólida<input type="color" value={previewBackground.backgroundColor} onChange={(event) => updateBackground({ backgroundColor: event.target.value })} /></label>
      <button className="studio-side-primary" type="button" onClick={() => void importImage('background')}><Icon name="plus" />Adicionar imagem</button>
      <div className="studio-asset-grid">{activeEditorV6.assets.filter((asset) => asset.category === 'background').map((asset) => <button key={asset.id} className={`studio-asset-card${previewBackground.backgroundAssetId === asset.id ? ' active' : ''}`} type="button" onClick={() => selectBackground(asset)}><img src={asset.dataUrl} alt="" /><span>{asset.name}</span></button>)}</div>
      {selectedBackgroundAsset && selectedElementId === 'background' && <><div className="studio-controls-grid">{control('X', previewBackground.backgroundX, (value, record) => updateBackground({ backgroundX: value }, record), -100, 100)}{control('Y', previewBackground.backgroundY, (value, record) => updateBackground({ backgroundY: value }, record), -100, 100)}{control('Largura', previewBackground.backgroundWidth, (value, record) => updateBackground({ backgroundWidth: value }, record), 1, 300)}{control('Altura', previewBackground.backgroundHeight, (value, record) => updateBackground({ backgroundHeight: value }, record), 1, 300)}{control('Rotação', previewBackground.backgroundRotation, (value, record) => updateBackground({ backgroundRotation: value }, record), -180, 180, '°')}</div><button className="studio-side-danger" type="button" onClick={deleteSelected}><Icon name="trash" />Remover fundo da cena</button></>}
    </div>
    if (activeTool === 'objects') return <div className="studio-side-content">
      <h2>Objetos</h2><p>Imagens importadas ficam disponíveis neste Studio.</p>
      <button className="studio-side-primary" type="button" onClick={() => void importImage('object')}><Icon name="plus" />Importar imagem</button>
      <div className="studio-asset-grid">{activeEditorV6.assets.filter((asset) => asset.category === 'object').map((asset) => <button key={asset.id} className="studio-asset-card" type="button" onClick={() => {
        if (activeEditorV6.timeline.tracks.some((track) => track.kind === 'object' && track.locked)) { setError('Desbloqueie a faixa Objetos para adicionar uma imagem.'); return }
        const element: EditorV6Element = { id: crypto.randomUUID(), kind: 'image', assetId: asset.id, text: '', x: 0, y: 0, width: 25, height: 25, rotation: 0, zIndex: Math.max(0, ...activeEditorV6.elements.map((item) => item.zIndex)) + 1 }
        const blockId = crypto.randomUUID()
        const frame = getEditorV6PlaybackFrame()
        changeScene((studio) => ({ ...addEditorV6ElementAtFrame(studio, element, frame, blockId), updatedAt: new Date().toISOString() }))
        setSelectedElementId(element.id)
        setSelectedTimelineBlockId(blockId)
        setInspectorOpen(true)
        setInspectorTab('editor')
      }}><img src={asset.dataUrl} alt="" /><span>{asset.name}</span></button>)}</div>
      {selectedElementId && selectedElement && <SceneElementControls element={selectedElement} update={(values, record) => updateElement(selectedElement.id, values, record)} remove={deleteSelected} control={control} positionNote="A posição X e Y é compartilhada por todos os blocos deste personagem." />}
    </div>
    if (selectedTimelineVideoClip && selectedTimelineVideo && activeEditorV6) {
      const block = selectedTimelineVideoClip.block
      const layout = block.mediaLayout ?? editorV6DefaultVideoLayout(selectedTimelineVideo.width, selectedTimelineVideo.height)
      const setLayout = (values: Partial<typeof layout>, record: boolean) => updateVideoBlock(block.id, { mediaLayout: { ...layout, ...values } }, record)
      return <div className="studio-side-content">
        <h2>Vídeo selecionado</h2><p>{selectedTimelineVideo.name}</p>
        <div className="studio-controls-grid">
          {control('X', layout.x, (value, record) => setLayout({ x: value }, record ?? true), -200, 200)}
          {control('Y', layout.y, (value, record) => setLayout({ y: value }, record ?? true), -200, 200)}
          {control('Largura', layout.width, (value, record) => setLayout({ width: value }, record ?? true), 1, 200)}
          {control('Altura', layout.height, (value, record) => setLayout({ height: value }, record ?? true), 1, 200)}
          {control('Rotação', layout.rotation, (value, record) => setLayout({ rotation: value }, record ?? true), -180, 180, '°')}
          {control('Início da mídia', block.mediaInFrame ?? 0, (value, record) => updateVideoBlock(block.id, { mediaInFrame: Math.round(value) }, record), 0, Math.max(0, selectedTimelineVideo.sourceFrames - 1), ' quadros')}
          {selectedTimelineVideo.hasAudio && control('Volume', Math.min(1, block.gain ?? 1), (value, record) => updateVideoBlock(block.id, { gain: value }, record ?? true), 0, 1, '×')}
        </div>
        {selectedTimelineVideo.hasAudio && <label className="studio-color-control">Áudio do vídeo<input type="checkbox" checked={block.audioEnabled !== false} onChange={(event) => { recordHistory(); updateVideoBlock(block.id, { audioEnabled: event.target.checked }, false) }} /></label>}
        <small>Duração na timeline: {(block.durationFrames / 30).toFixed(2)} s · o quadro é renderizado centralizado proporcionalmente.</small>
        <button className="studio-side-danger" type="button" onClick={deleteSelected}><Icon name="trash" />Remover vídeo da timeline</button>
      </div>
    }
    if (selectedElement && activeEditorV6) return <div className="studio-side-content">
      <h2>{selectedElement.kind === 'character' ? selectedElement.text : selectedElement.kind === 'image' ? 'Objeto selecionado' : selectedElement.kind === 'narrator' ? 'Narrador' : selectedElement.kind === 'speech' ? 'Balão de fala' : 'Balão de pensamento'}</h2>
      {selectedElement.kind !== 'image' && selectedElement.kind !== 'character' && <label className="studio-text-control">Texto<textarea value={selectedElement.text} onChange={(event) => updateElement(selectedElement.id, { text: event.target.value })} rows={3} /></label>}
      <SceneElementControls element={selectedElement} update={(values, record) => updateElement(selectedElement.id, values, record)} remove={deleteSelected} control={control} positionNote="A posição X e Y é compartilhada por todos os blocos deste personagem." />
    </div>
    if (selectedElementId === 'background' && selectedBackgroundAsset) return <div className="studio-side-content">
      <h2>Imagem de fundo</h2><p>{selectedBackgroundAsset.name}</p>
      <div className="studio-controls-grid">{control('X', previewBackground.backgroundX, (value, record) => updateBackground({ backgroundX: value }, record), -100, 100)}{control('Y', previewBackground.backgroundY, (value, record) => updateBackground({ backgroundY: value }, record), -100, 100)}{control('Largura', previewBackground.backgroundWidth, (value, record) => updateBackground({ backgroundWidth: value }, record), 1, 300)}{control('Altura', previewBackground.backgroundHeight, (value, record) => updateBackground({ backgroundHeight: value }, record), 1, 300)}{control('Rotação', previewBackground.backgroundRotation, (value, record) => updateBackground({ backgroundRotation: value }, record), -180, 180, '°')}</div>
      <button className="studio-side-danger" type="button" onClick={deleteSelected}><Icon name="trash" />Remover fundo</button>
    </div>
    return <div className="studio-side-content"><h2>Cena</h2><p>Escolha uma ferramenta à esquerda ou selecione um elemento na cena.</p><small>{activeEditorV6.elements.length} elemento(s)</small></div>
  }

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
    if (getEditorV6PlaybackFrame() >= timelineDurationFrames) publishPlayheadFrame(0)
    setIsPlaying(true)
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
            <button className="studio-tool-button" onClick={() => void importTimelineMedia('audio')} type="button"><b>♪</b><span>Importar áudio</span></button>
            <span className="studio-tool-separator" />
            <button className="studio-tool-button" onClick={() => { pausePlayback(); setExportOpen(true) }} disabled={faceAssetRefreshRequired} title={faceAssetRefreshRequired ? 'Atualizando a pose salva deste personagem' : undefined} type="button"><Icon name="download" /><span>{faceAssetRefreshRequired ? 'Atualizando personagem…' : 'Exportar MP4'}</span></button>
            <button className="studio-tool-button" onClick={() => void exportPrint()} type="button"><Icon name="download" /><span>Print</span><i aria-hidden="true">✦</i></button>
            <button className="studio-tool-button" onClick={() => void openPrints()} type="button"><Icon name="folder" /><span>Pasta</span><i aria-hidden="true">✦</i></button>
            <button className="studio-tool-button studio-view-button" onClick={() => setFullView(true)} type="button"><Icon name="expand" /><span>View</span></button>
          </nav>
          <small className={`studio-save-indicator${saved ? '' : ' unsaved'}`}><i />{saved ? 'Salvo automaticamente' : 'Salvando alterações…'}</small>
          {faceAssetRefreshRequired && <small className="studio-save-notice" role="status">Atualizando a pose salva para a prévia e a exportação usarem a versão mais recente.</small>}
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
        {!fullView && <aside className="studio-editor-rail studio-editor-right" aria-label="Elenco do Editor V6"><EditorV6CastPanel
          elements={stageCharacters} characters={availableCharacters} selectedElementId={selectedElementId}
          allPositionsLocked={allStageCharactersLocked} onAddCharacter={openCastPicker}
          onTogglePositionsLocked={toggleStageCharacterPositionLock}
          onSelectCharacter={(element) => { pausePlayback(); setSelectedElementId(element.id); setSelectedTimelineBlockId(editorV6ClipAtFrame(activeEditorV6.timeline, element.id, getEditorV6PlaybackFrame())?.block.id ?? null); setActiveTool(null); setInspectorOpen(true); restoreCharacterInspectorView() }}
          onRemoveCharacter={removeStageCharacter}
        /></aside>}
        {!fullView && <Profiler id="/editor-v6/timeline" onRender={recordUiCommit}><EditorV6Timeline key={activeEditorV6.id} document={activeEditorV6} playing={isPlaying} selectedId={selectedTimelineBlockId}
          onSeek={(frame) => { if (dragRef.current) cancelSceneDrag(); pausePlayback(); publishPlayheadFrame(frame) }} onPlay={toggleTimelinePlayback} onChange={changeScene}
          onSelect={(block) => { setSelectedTimelineBlockId(block.id); setSelectedElementId(block.background ? 'background' : block.elementId ?? null); setActiveTool(block.background ? 'background' : null); setInspectorOpen(true); if (block.state?.kind === 'character') restoreCharacterInspectorView(); else setInspectorTab('editor') }} /></Profiler> }
        <EditorV6ExportPanel key={`export-${activeEditorV6.id}`} project={activeEditorV6} open={exportOpen} onClose={() => setExportOpen(false)} onChange={(update) => patchStudio(update, false)} onActivity={setMotionExportBusy} trackOperation={trackEditorV6Operation} />
        {videoPickerOpen && <EditorV6VideoPickerModal onClose={() => setVideoPickerOpen(false)} onSelect={linkVideoLibraryItem} />}
        {castPickerOpen && <SceneCastPickerModal title="Personagens do Editor V6" characters={availableCharacters} selection={castSelection} saving={savingCast} onToggle={(characterId, selected) => setCastSelection((current) => selected ? current.filter((id) => id !== characterId) : [...current, characterId])} onClose={() => setCastPickerOpen(false)} onSave={() => void saveCastSelection()} />}
      </main>
    )
  }

  return (
    <main className="studio-page" aria-label="Editor V6">
      <header className="studio-page-header"><h1>EDITOR V6</h1>{studioFolder && <small>Dados locais: {studioFolder}</small>}</header>
      <div className="studio-toolbar" aria-label="Ações do Editor V6">
        <button className="studio-action studio-action-primary" onClick={() => void createStudio()} disabled={loading} type="button"><Icon name="plus" />Criar</button>
      </div>
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
