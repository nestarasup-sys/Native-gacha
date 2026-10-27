import { editorV6CharacterRenderKey, editorV6ElementSize } from '../../../../shared/editorV6SceneModel'
import { SerializedDocumentSaveQueue } from '../../../../shared/editorV6DocumentSave'
import { isPoseSnapshotForModel } from '../../../../shared/characterSourceContinuity'
import { useEditorV6Store } from './editorV6Store'
import { createEditorV6Timeline, EDITOR_V6_DEFAULT_VIDEO_LAYOUT, editorV6DefaultVideoLayout, syncEditorV6TimelineElements } from '../../../../shared/editorV6'
import { EditorV6Timeline } from './EditorV6Timeline'
import { EditorV6ExportPanel } from './EditorV6ExportPanel'
import { EditorV6VideoPickerModal } from './EditorV6VideoPickerModal'
import { EditorV6PlaybackAudio } from './EditorV6PlaybackAudio'
import { EditorV6PlaybackScene } from './EditorV6PlaybackScene'
import { getEditorV6PlaybackFrame, setEditorV6PlaybackFrame } from './editorV6PlaybackClock'
import { editorV6MotionPlans } from '../../../../shared/editorV6Motion'
import type { ScenePointerEvent, SceneSurfaceInteraction } from './SceneSurface'
import { addEditorV6ElementAtFrame, editEditorV6DocumentAtBlock, editorV6ClipAtFrame, normalizeEditorV6Timeline, prepareEditorV6PositionAtFrame, moveEditorV6ElementInPeriod, editEditorV6BackgroundAtFrame, pruneEditorV6TimelineSnapshots, repairEditorV6DuplicateAssets, repairEditorV6FaceModeAssetReferences, resolveEditorV6SceneAtFrame, timelineClips } from '../../../../shared/editorV6Timeline'
import { useEditorV6InspectorState } from './useEditorV6InspectorState'
import { trimTransparentImage, fitElementToTrim, faceRenderGeometry, type TrimmedImage } from '../../characters/characterGeometry'
import { Profiler, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildEditorV6ExpressionAppearance, buildEditorV6ExpressionTransforms, resolveEditorV6ExpressionBase, editorV6ExpressionCollection } from './expressionTransforms'
import { Icon } from '../../ui/components/Icon'
import { CharacterPortrait } from '../../ui/components/CharacterPortrait'
import { recordEditorV6PlaybackFrame, recordUiCommit } from '../../ui/performanceDiagnostics'
import { resolveEditorV6TalkMouthId } from '../../../../shared/editorV6'
import { fitEditorV6CharacterToStage } from '../../../../shared/editorV6CharacterGeometry'
import { editorV6ProjectSummary, type EditorV6Asset, type EditorV6Document, type EditorV6Element, type EditorV6FaceMode, type EditorV6FaceRenderMode, type EditorV6FaceTransform, type EditorV6FaceTransforms, type EditorV6ProjectSummary, type EditorV6TimelineBlock, type EditorV6VideoLayout } from '../../../../shared/editorV6'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { FaceCatalogItem, FaceCatalogItemSummary, FaceExpressionEffects, FaceExpressionPreset, FaceExpressionPresetSummary, FaceSheetKind, FabricatorPoseSummary } from '../../../../shared/fabricator'
type EditorV6Card = EditorV6ProjectSummary
type Tool = 'background' | 'objects' | null
type DragState = { id: string; target: 'element' | 'background' | 'video'; videoLayout?: EditorV6VideoLayout; pointerId: number; startX: number; startY: number; originalX: number; originalY: number; width: number; height: number; before: EditorV6Document; prepared: EditorV6Document; blockId: string; frame: number; moved: boolean }
const STORAGE_KEY = 'gacha-nymi-editor-v6-catalog-v1'
const EDITOR_V6_FACE_RENDER_VERSION = 8
const studioColor = (number: number) => `hsl(${(number * 137.508) % 360} 45% 78%)`
const editorV6PoseRevisionKey = (modelSlot: number, poseSlot: number) => `${modelSlot}:${poseSlot}`
const defaultStudioEyeTransform: EditorV6FaceTransform = { x: 0, y: 0, width: 100, height: 100, rotation: 0 }
function editorV6FaceModeForElement(element: EditorV6Element | null, appearance: CustomizerFaceAppearance | undefined): EditorV6FaceMode {
  if (element?.activeFaceMode) return element.activeFaceMode
  if (appearance?.eyeState === 2) return 'blink'
  if (appearance?.mouthOpen) return 'talk'
  return 'idle'
}
const studioTools = [
  { id: 'background', label: 'Fundo', icon: 'frame' },
  { id: 'objects', label: 'Objetos', icon: 'sparkles' }
] as const
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

function loadLegacyStudios(): Array<{ id: string; title: string; color: string }> {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved.filter((item): item is { id: string; title: string; color: string } => Boolean(item && typeof item === 'object'
      && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.color === 'string'))
  } catch { return [] }
}





function makeElement(kind: EditorV6Element['kind'], zIndex: number): EditorV6Element {
  return {
    id: crypto.randomUUID(), kind, text: kind === 'narrator' ? 'Texto do narrador' : 'Digite aqui',
    x: 0, y: 0, width: kind === 'narrator' ? 32 : 28, height: kind === 'narrator' ? 12 : 16,
    rotation: 0, zIndex
  }
}

async function makeStudioThumbnail(studio: EditorV6Document): Promise<string> {
  const { captureEditorV6Frame } = await import('./sceneCapture')
  return captureEditorV6Frame(studio, 0, 480, 270, 'image/jpeg')
}

const AUTO_FACE_MODES: EditorV6FaceRenderMode[] = ['idle', 'blink', 'talk', 'talk-blink']
type PreparedEditorV6FaceRenderer = Awaited<ReturnType<typeof import('../../characters/editorV6CharacterRenderer').prepareSavedCharacterRenderer>>

async function cropCharacterMode(dataUrl: string, crop: TrimmedImage | null): Promise<string> {
  if (!crop) return dataUrl
  const image = new Image()
  image.src = dataUrl
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = crop.width
  canvas.height = crop.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível preparar uma imagem facial para o Editor V6.')
  context.drawImage(image, crop.left, crop.top, crop.width, crop.height, 0, 0, crop.width, crop.height)
  return canvas.toDataURL('image/png')
}

async function bakeFaceModeAssets(
  name: string,
  renderer: PreparedEditorV6FaceRenderer,
  appearance: CustomizerFaceAppearance | undefined,
  transforms: EditorV6FaceTransforms | undefined,
  effects: FaceExpressionEffects | undefined,
  baseMode: EditorV6FaceRenderMode,
  baseRendered?: { dataUrl: string; width: number; height: number }
): Promise<{ dataUrl: string; crop: TrimmedImage | null; assetIds: Partial<Record<EditorV6FaceRenderMode, string>>; extraAssets: EditorV6Asset[] }> {
  const frames: Partial<Record<EditorV6FaceRenderMode, { dataUrl: string; width: number; height: number }>> = {}
  for (const mode of AUTO_FACE_MODES) {
    try { frames[mode] = mode === baseMode && baseRendered ? baseRendered : await renderer.render(appearance, transforms, effects, mode) }
    catch { /* This character may not have a compatible blink or open-mouth sheet. */ }
  }
  const base = frames[baseMode]
  if (!base) throw new Error(`Não foi possível renderizar a expressão ${baseMode} de ${name}.`)
  const crop = await trimTransparentImage(base.dataUrl)
  const assetIds: Partial<Record<EditorV6FaceRenderMode, string>> = {}
  const extraAssets: EditorV6Asset[] = []
  for (const mode of AUTO_FACE_MODES) {
    const frame = frames[mode]
    if (!frame) continue
    if (mode === baseMode) continue
    const id = crypto.randomUUID()
    assetIds[mode] = id
    extraAssets.push({ id, category: 'character', name: `${name} · ${mode}`, mimeType: 'image/png', dataUrl: await cropCharacterMode(frame.dataUrl, crop), timelineSnapshot: true })
  }
  return { dataUrl: await cropCharacterMode(base.dataUrl, crop), crop, assetIds, extraAssets }
}

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
  const [availableCharacters, setAvailableCharacters] = useState<CustomizerCharacter[]>([])
  const [poseSourceSnapshot, setPoseSourceSnapshot] = useState<{ projectId: string; revisions: Record<string, string> } | null>(null)
  const [normalizedSourceVersion, setNormalizedSourceVersion] = useState(0)
  const [castPickerOpen, setCastPickerOpen] = useState(false)
  const [castSelection, setCastSelection] = useState<string[]>([])
  const [savingCast, setSavingCast] = useState(false)
  const {
    inspectorTab, setInspectorTab, inspectorCustomView, setInspectorCustomView,
    characterInspectorViewRef, editorV6PresetCategory, setEditorV6PresetCategory, editorV6ExpressionCollections,
    setEditorV6ExpressionCollections, editorV6ExpressionPresets, setEditorV6ExpressionPresets, editorV6ExpressionCollectionMenuOpen, setEditorV6ExpressionCollectionMenuOpen, editorV6ExpressionLoading,
    setEditorV6ExpressionLoading, editorV6ExpressionBusy, setEditorV6ExpressionBusy, editorV6PoseSlots,
    setEditorV6PoseSlots, editorV6PoseThumbnails, setEditorV6PoseThumbnails, editorV6PoseDimensions,
    setEditorV6PoseDimensions, inspectorOpen, setInspectorOpen, editorV6FaceCategory,
    setEditorV6FaceCategory, editorV6FaceItems, setEditorV6FaceItems, editorV6FaceDetails,
    setEditorV6FaceDetails, editorV6FaceLoading, setEditorV6FaceLoading, editorV6FaceBusy,
    setEditorV6FaceBusy
  } = useEditorV6InspectorState()
  const [studioFolder, setEditorV6Folder] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeEditorV6Id, setActiveStudioId] = useState<string | null>(null)
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
  const pausePlayback = useCallback(() => {
    publishPlayheadFrame(getEditorV6PlaybackFrame())
    setIsPlaying(false)
  }, [publishPlayheadFrame])
  const [selectedTimelineBlockId, setSelectedTimelineBlockId] = useState<string | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const sceneRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const editorV6FaceTransformsRef = useRef<Record<string, EditorV6FaceTransforms>>({})
  const editorV6FaceRenderTimerRef = useRef<number | null>(null)
  const editorV6FaceRenderVersionRef = useRef(0)
  const editorV6FaceRenderPendingRef = useRef<{ studioId: string; elementId: string; assetId: string; character: CustomizerCharacter; transforms: EditorV6FaceTransforms } | null>(null)
  const editorV6FaceRenderRunningRef = useRef(false)
  const editorV6FaceRendererRef = useRef<{ key: string; renderer: PreparedEditorV6FaceRenderer } | null>(null)
  const saveGenerationRef = useRef(0)
  const activeLoadGenerationRef = useRef(0)
  const studioSaveQueue = useRef(new SerializedDocumentSaveQueue())
  const expressionSaveSignatureRef = useRef<{ studioId: string; value: string } | null>(null)
  const normalizedStudioIdsRef = useRef(new Set<string>())
  const nextStudioNumber = useRef(1)
  const selectedEditorV6 = editorV6Projects.find((studio) => studio.id === selectedId) ?? null
  const activeEditorV6 = activeEditorV6Stored?.id === activeEditorV6Id ? activeEditorV6Stored : null
  const availableCharacterById = new Map(availableCharacters.map((character) => [character.id, character]))
  const activePoseSourceSnapshot = poseSourceSnapshot?.projectId === activeEditorV6Id ? poseSourceSnapshot : null
  const activeCharacterStates = activeEditorV6 ? [
    ...activeEditorV6.elements,
    ...activeEditorV6.timeline.tracks.flatMap((track) => track.blocks.flatMap((block) => block.state ? [block.state] : []))
  ] : []
  const poseRefreshRequired = activeCharacterStates.some((state) => {
    if (state.kind !== 'character' || !state.characterId) return false
    const character = availableCharacterById.get(state.characterId)
    if (!character) return false
    const poseSlot = state.poseSlot === undefined ? character.customization.poseSlot : state.poseSlot
    if (typeof poseSlot !== 'number') return false
    if (!activePoseSourceSnapshot) return true
    return state.poseSourceRevision !== (activePoseSourceSnapshot.revisions[editorV6PoseRevisionKey(character.customization.modelSlot ?? 1, poseSlot)] ?? 'missing')
  })
  const faceAssetRefreshRequired = Boolean(activeEditorV6 && (poseRefreshRequired || activeCharacterStates.some((state) => {
    if (state.kind !== 'character') return false
    const character = availableCharacterById.get(state.characterId ?? '')
    return state.faceRendererVersion !== EDITOR_V6_FACE_RENDER_VERSION
      || Boolean(character && state.characterSourceUpdatedAt !== character.updatedAt)
  })))
  const timelineDurationFrames = activeEditorV6?.timeline.durationFrames ?? 300
  const previewScene = useMemo(() => activeEditorV6 ? resolveEditorV6SceneAtFrame(activeEditorV6, playheadFrame, { includeMotion: false }) : null, [activeEditorV6, playheadFrame])
  const previewBackground = previewScene?.background ?? { backgroundColor: '#d7b5cd', backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 }
  const visibleTimelineElements = previewScene?.elements ?? []
  const sceneInteractionRef = useRef<SceneSurfaceInteraction>({ start: () => {}, move: () => {}, end: () => {} })
  const sceneInteraction = useMemo<SceneSurfaceInteraction>(() => ({ start: (event, id) => sceneInteractionRef.current.start(event, id), move: (event) => sceneInteractionRef.current.move(event), end: (event) => sceneInteractionRef.current.end(event) }), [])
  useEffect(() => {
    if (!activeEditorV6 || new Set(activeEditorV6.assets.map((asset) => asset.id)).size === activeEditorV6.assets.length) return
    updateActiveEditorV6Project((project) => project.id === activeEditorV6.id ? repairEditorV6DuplicateAssets(project, selectedTimelineBlockId) : project)
    setSaved(false)
  }, [activeEditorV6, selectedTimelineBlockId])
  const selectedTimelineClip = activeEditorV6 ? timelineClips(activeEditorV6.timeline).find(({ block }) => block.id === selectedTimelineBlockId && block.elementId === selectedElementId)
    ?? (selectedElementId ? editorV6ClipAtFrame(activeEditorV6.timeline, selectedElementId, playheadFrame) : undefined) : undefined
  const selectedTimelineVideoClip = activeEditorV6 ? timelineClips(activeEditorV6.timeline).find(({ track, block }) => track.kind === 'video' && block.id === selectedTimelineBlockId && block.mediaId) : undefined
  const selectedTimelineVideo = selectedTimelineVideoClip?.block.mediaId ? activeEditorV6?.media?.find((media) => media.id === selectedTimelineVideoClip.block.mediaId) : undefined
  const selectedElement = selectedTimelineClip?.block.state ?? visibleTimelineElements.find((element) => element.id === selectedElementId)
    ?? activeEditorV6?.elements.find((element) => element.id === selectedElementId) ?? null
  const selectedCharacterElement = selectedElement?.kind === 'character'
    ? visibleTimelineElements.find((element) => element.kind === 'character' && element.characterId === selectedElement.characterId) ?? selectedElement
    : null
  const selectedEditorV6Character = selectedElement?.kind === 'character' ? availableCharacters.find((character) => character.id === selectedElement.characterId) ?? null : null
  const selectedEditorV6ExpressionCollectionId = editorV6ExpressionCollection(selectedElement, editorV6ExpressionPresets)
  const selectedEditorV6CharacterModelSlot = selectedEditorV6Character ? selectedEditorV6Character.customization.modelSlot ?? 1 : null
  const selectedEditorV6PoseSlot = selectedElement?.kind === 'character' ? selectedElement.poseSlot === undefined ? selectedEditorV6Character?.customization.poseSlot ?? null : selectedElement.poseSlot : null
  const selectedEditorV6FaceAppearance = selectedElement?.kind === 'character'
    ? selectedElement.faceAppearance ?? selectedEditorV6Character?.customization.faceAppearance
    : undefined
  const selectedEditorV6FaceMode = selectedElement?.kind === 'character' ? editorV6FaceModeForElement(selectedElement, selectedEditorV6FaceAppearance) : 'idle'
  const selectedEditorV6OpenMouthId = selectedEditorV6CharacterModelSlot === null
    ? undefined
    : resolveEditorV6TalkMouthId(selectedEditorV6FaceAppearance, editorV6FaceItems.filter((item) => item.modelSlot === selectedEditorV6CharacterModelSlot))
  const selectedEditorV6OpenMouth = selectedEditorV6OpenMouthId && selectedEditorV6CharacterModelSlot !== null
    ? editorV6FaceDetails[`${selectedEditorV6CharacterModelSlot}:${selectedEditorV6OpenMouthId}`]
    : undefined
  const selectedEditorV6TalkAvailable = Boolean(selectedEditorV6OpenMouth?.pieces.some((piece) => piece.sheet === 'mouth-open' && piece.index === selectedEditorV6FaceAppearance?.expressionIndex))
  const selectedBackgroundAsset = activeEditorV6?.assets.find((asset) => asset.id === previewBackground.backgroundAssetId) ?? null
  const stageCharacters = activeEditorV6?.elements.filter((element) => element.kind === 'character') ?? []

  useEffect(() => () => {
    editorV6FaceRendererRef.current?.renderer.dispose()
    editorV6FaceRendererRef.current = null
  }, [])

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
        window.desktop.listFaceExpressionCollections(selectedEditorV6CharacterModelSlot),
        window.desktop.listFaceExpressionPresets(selectedEditorV6CharacterModelSlot)
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
    let cancelled = false
    void (async () => {
      try {
        const existing = await window.desktop.listEditorV6Projects()
        const knownIds = new Set(existing.map((studio) => studio.id))
        const legacy = loadLegacyStudios()
        const now = new Date().toISOString()
        for (const old of legacy) {
          if (knownIds.has(old.id) || !isUuid(old.id)) continue
          await window.desktop.saveEditorV6Project({
            schemaVersion: 1, ...old, createdAt: now, updatedAt: now, backgroundColor: '#d7b5cd',
            backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100,
            backgroundRotation: 0, assets: [], elements: [], timeline: createEditorV6Timeline()
          })
        }
        const loaded = await window.desktop.listEditorV6Projects()
        const folder = await window.desktop.getEditorV6Folder()
        if (cancelled) return
        setEditorV6Projects(loaded)
        setEditorV6Folder(folder)
        if (legacy.length) window.localStorage.removeItem(STORAGE_KEY)
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os projetos do Editor V6.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const generation = ++activeLoadGenerationRef.current
    if (!activeEditorV6Id) {
      pausePlayback()
      publishPlayheadFrame(0)
      setActiveEditorV6Project(null)
      return
    }
    setActiveEditorV6Project(null)
    void window.desktop.loadEditorV6Project(activeEditorV6Id).then((project) => {
      if (generation !== activeLoadGenerationRef.current) return
      if (!project) {
        setError('Esse projeto não foi encontrado na biblioteca local do Editor V6.')
        setActiveStudioId(null)
        return
      }
      setError(null)
      setActiveEditorV6Project(project)
    }).catch((reason: unknown) => {
      if (generation !== activeLoadGenerationRef.current) return
      setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o projeto do Editor V6.')
      setActiveStudioId(null)
    })
    return () => { if (activeLoadGenerationRef.current === generation) activeLoadGenerationRef.current += 1 }
  }, [activeEditorV6Id, pausePlayback, publishPlayheadFrame, setActiveEditorV6Project])

  useEffect(() => {
    let cancelled = false
    const refreshCharacters = () => {
      void window.desktop.listCustomizerCharacters().then((characters) => {
        if (!cancelled) setAvailableCharacters(characters)
      }).catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o elenco de personagens.')
      })
    }
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') refreshCharacters() }
    refreshCharacters()
    window.addEventListener('focus', refreshCharacters)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => { cancelled = true; window.removeEventListener('focus', refreshCharacters); document.removeEventListener('visibilitychange', refreshWhenVisible) }
  }, [])

  useEffect(() => {
    const projectId = activeEditorV6Id
    if (!projectId) { setPoseSourceSnapshot(null); return }
    let cancelled = false
    const refreshPoseSourceSnapshot = async () => {
      const modelSlots = [...new Set(availableCharacters.map((character) => character.customization.modelSlot ?? 1))]
      try {
        const catalogs = await Promise.all(modelSlots.map(async (modelSlot) => ({ modelSlot, poses: await window.desktop.listFabricatorPoseSlots(modelSlot) })))
        if (cancelled) return
        const revisions: Record<string, string> = {}
        for (const { modelSlot, poses } of catalogs) poses.forEach((pose, index) => {
          const slot = pose?.slot ?? index + 1
          revisions[editorV6PoseRevisionKey(modelSlot, slot)] = pose?.updatedAt ?? 'missing'
        })
        setPoseSourceSnapshot({ projectId, revisions })
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível verificar as versões das poses salvas.')
      }
    }
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void refreshPoseSourceSnapshot() }
    void refreshPoseSourceSnapshot()
    window.addEventListener('focus', refreshWhenVisible)
    window.addEventListener('fabricator:assets-updated', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      cancelled = true
      window.removeEventListener('focus', refreshWhenVisible)
      window.removeEventListener('fabricator:assets-updated', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [activeEditorV6Id, availableCharacters])

  useEffect(() => {
    const modelSlot = selectedEditorV6CharacterModelSlot
    if (modelSlot === null) { setEditorV6FaceItems([]); return }
    let cancelled = false
    setEditorV6FaceLoading(true)
    void window.desktop.listFaceCatalog(modelSlot).then(async (summaries) => {
      if (cancelled) return
      setEditorV6FaceItems(summaries)
      const items = await Promise.all(summaries.map(async (summary) => ({ key: `${summary.modelSlot}:${summary.id}`, item: await window.desktop.loadFaceCatalogItem(summary.modelSlot, summary.id) })))
      if (cancelled) return
      setEditorV6FaceDetails((current) => {
        const next = { ...current }
        for (const { key, item } of items) if (item) next[key] = item
        return next
      })
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o catálogo de rosto.')
    }).finally(() => { if (!cancelled) setEditorV6FaceLoading(false) })
    return () => { cancelled = true }
  }, [selectedEditorV6CharacterModelSlot])

  useEffect(() => {
    if (!editorV6PoseSlots.length) { setEditorV6PoseThumbnails({}); setEditorV6PoseDimensions({}); return }
    let cancelled = false
    void (async () => {
      const { renderArtwork } = await import('../../characters/editorV6CharacterRenderer')
      const thumbnails = await Promise.all(editorV6PoseSlots.map(async (pose) => {
        try {
          const artwork = await window.desktop.loadFabricatorPose(pose.sourceModelSlot, pose.slot)
          if (!isPoseSnapshotForModel(artwork, pose.sourceModelSlot, pose.slot)) return null
          const thumbnail = await renderArtwork(artwork, 180)
          return thumbnail ? { slot: pose.slot, thumbnail, width: artwork.width, height: artwork.height } : null
        } catch { return null }
      }))
      if (!cancelled) {
        const ready = thumbnails.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        setEditorV6PoseThumbnails(Object.fromEntries(ready.map((entry) => [entry.slot, entry.thumbnail])))
        setEditorV6PoseDimensions(Object.fromEntries(ready.map((entry) => [entry.slot, { width: entry.width, height: entry.height }])))
      }
    })().catch(() => { if (!cancelled) { setEditorV6PoseThumbnails({}); setEditorV6PoseDimensions({}) } })
    return () => { cancelled = true }
  }, [editorV6PoseSlots])

  useEffect(() => {
    const modelSlot = selectedEditorV6CharacterModelSlot
    if (modelSlot === null) { setEditorV6PoseSlots([]); return }
    let cancelled = false
    void window.desktop.listFabricatorPoseSlots(modelSlot).then((poses) => {
      if (!cancelled) setEditorV6PoseSlots(poses.filter((pose): pose is NonNullable<typeof pose> => Boolean(pose)))
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as poses do modelo.')
    })
    return () => { cancelled = true }
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
      const crops = await Promise.all(characterAssets.map(async (asset) => ({ assetId: asset.id, crop: await trimTransparentImage(asset.dataUrl) })))
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
      setSaved(false)
    })()
    return () => { cancelled = true }
  }, [activeEditorV6])

  useEffect(() => {
    const project = activeEditorV6
    if (!project || !normalizedStudioIdsRef.current.has(project.id) || !availableCharacters.length || activePoseSourceSnapshot?.projectId !== project.id) return
    const characters = new Map(availableCharacters.map((character) => [character.id, character]))
    type RefreshTarget = { kind: 'element' | 'block'; id: string; state: EditorV6Element }
    type RefreshGroup = { character: CustomizerCharacter; state: EditorV6Element; targets: RefreshTarget[]; poseRevision?: string }
    const groups = new Map<string, RefreshGroup>()
    const missingCharacterNames = new Set<string>()
    const addTarget = (kind: RefreshTarget['kind'], id: string, state: EditorV6Element) => {
      if (state.kind !== 'character' || !state.characterId || !state.assetId) return
      const character = characters.get(state.characterId)
      if (!character) { if (state.faceRendererVersion !== EDITOR_V6_FACE_RENDER_VERSION) missingCharacterNames.add(state.text); return }
      const poseSlot = state.poseSlot === undefined ? character.customization.poseSlot : state.poseSlot
      const poseRevision = typeof poseSlot === 'number'
        ? activePoseSourceSnapshot.revisions[editorV6PoseRevisionKey(character.customization.modelSlot ?? 1, poseSlot)] ?? 'missing'
        : undefined
      const poseChanged = typeof poseSlot === 'number' && state.poseSourceRevision !== poseRevision
      if (!poseChanged && state.faceRendererVersion === EDITOR_V6_FACE_RENDER_VERSION && state.characterSourceUpdatedAt === character.updatedAt) return
      const signature = JSON.stringify([character.id, character.updatedAt, EDITOR_V6_FACE_RENDER_VERSION, poseRevision, poseSlot, state.faceAppearance, state.expressionBase, state.faceTransforms, state.activeFaceMode, state.activeExpressionPresetId, state.activeExpressionPresetUpdatedAt, state.activeExpressionGaze, state.activeExpressionEffects])
      const group = groups.get(signature) ?? { character, state, targets: [], ...(poseRevision ? { poseRevision } : {}) }
      group.targets.push({ kind, id, state })
      groups.set(signature, group)
    }
    for (const element of project.elements) addTarget('element', element.id, element)
    for (const track of project.timeline.tracks) for (const block of track.blocks) if (block.state && block.elementId) addTarget('block', block.id, block.state)
    if (missingCharacterNames.size) setError(`Não foi possível atualizar ${[...missingCharacterNames].join(', ')} porque o personagem não está disponível no Customizador.`)
    if (!groups.size) return
    pausePlayback()
    let cancelled = false
    const projectId = project.id
    void (async () => {
      try {
        const { prepareSavedCharacterRenderer } = await import('../../characters/editorV6CharacterRenderer')
        const nextElements = new Map<string, EditorV6Element>()
        const nextBlocks = new Map<string, EditorV6Element>()
        const refreshedAssets: EditorV6Asset[] = []
        const staleAssetIds = new Set<string>()
        const stageWidth = sceneRef.current?.clientWidth ?? 1000
        const stageHeight = sceneRef.current?.clientHeight ?? 562
        for (const { character, state, targets, poseRevision } of groups.values()) {
          if (cancelled) return
          for (const target of targets) {
            if (target.state.assetId) staleAssetIds.add(target.state.assetId)
            for (const id of Object.values(target.state.faceModeAssetIds ?? {})) if (id) staleAssetIds.add(id)
          }
          const sourceAppearance = character.customization.faceAppearance
          const appearanceFallback = sourceAppearance ?? state.faceAppearance ?? state.expressionBase?.appearance
          const previousBase = appearanceFallback ? resolveEditorV6ExpressionBase(state, appearanceFallback) : undefined
          const sceneTransforms = Object.fromEntries(Object.entries(state.faceTransforms ?? {}).filter(([key]) => !key.startsWith('expression-component:') && !key.startsWith('expression:')))
          const expressionBase = sourceAppearance ? { appearance: structuredClone(sourceAppearance), transforms: sceneTransforms } : previousBase
          const preset = state.activeExpressionPresetId
            ? await window.desktop.loadFaceExpressionPreset(character.customization.modelSlot ?? 1, state.activeExpressionPresetId)
            : null
          const appearance = preset && expressionBase?.appearance
            ? await buildEditorV6ExpressionAppearance(preset, expressionBase.appearance, (id) => window.desktop.loadFaceCatalogItem(preset.modelSlot, id))
            : state.faceAppearance ?? expressionBase?.appearance
          const faceTransforms = preset && appearance && expressionBase
            ? await buildEditorV6ExpressionTransforms(preset, appearance, expressionBase.transforms,
              (id) => window.desktop.loadFaceComponentAsset(preset.modelSlot, id),
              (id) => window.desktop.loadFaceCatalogItem(preset.modelSlot, id), state.activeExpressionGaze ?? 'right')
            : sourceAppearance ? expressionBase?.transforms ?? state.faceTransforms : state.faceTransforms ?? expressionBase?.transforms
          const effects = preset?.effects ?? state.activeExpressionEffects
          const faceMode = editorV6FaceModeForElement(state, appearance)
          const characterCopy: CustomizerCharacter = { ...character, customization: { ...character.customization, poseSlot: state.poseSlot === undefined ? character.customization.poseSlot : state.poseSlot, faceAppearance: appearance } }
          const renderer = await prepareSavedCharacterRenderer(characterCopy)
          let rendered: { dataUrl: string; width: number; height: number }
          let baked: Awaited<ReturnType<typeof bakeFaceModeAssets>>
          try {
            rendered = await renderer.render(appearance, faceTransforms, effects, faceMode)
            baked = await bakeFaceModeAssets(character.name, renderer, appearance, faceTransforms, effects, faceMode, rendered)
          } finally { renderer.dispose() }
          if (cancelled) return
          const assetId = crypto.randomUUID()
          const faceModeAssetIds = { ...baked.assetIds, [faceMode]: assetId }
          refreshedAssets.push({ id: assetId, category: 'character', name: character.name, mimeType: 'image/png', dataUrl: baked.dataUrl, timelineSnapshot: true }, ...baked.extraAssets)
          for (const target of targets) {
            const geometry = faceRenderGeometry(target.state, rendered, baked.crop, stageWidth, stageHeight)
            const next: EditorV6Element = {
              ...target.state, assetId, faceModeAssetIds, ...geometry,
              ...(appearance ? { faceAppearance: appearance } : {}),
              ...(expressionBase ? { expressionBase } : {}),
              ...(faceTransforms ? { faceTransforms } : {}),
              ...(effects ? { activeExpressionEffects: effects } : { activeExpressionEffects: undefined }),
              characterSourceUpdatedAt: character.updatedAt,
              faceRendererVersion: EDITOR_V6_FACE_RENDER_VERSION,
              ...(poseRevision ? { poseSourceRevision: poseRevision } : {}),
              ...(preset ? { activeExpressionPresetUpdatedAt: preset.updatedAt } : {})
            }
            if (target.kind === 'element') nextElements.set(target.id, next)
            else nextBlocks.set(target.id, next)
          }
        }
        if (cancelled) return
        updateActiveEditorV6Project((current) => {
          if (current.id !== projectId) return current
          const timeline = { ...current.timeline, tracks: current.timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => {
            const state = nextBlocks.get(block.id)
            return state ? { ...block, state, label: state.text.trim().slice(0, 120) || block.label } : block
          }) })) }
          const next = {
            ...current,
            elements: current.elements.map((element) => nextElements.get(element.id) ?? element),
            assets: [...current.assets.map((asset) => staleAssetIds.has(asset.id) ? { ...asset, timelineSnapshot: true } : asset), ...refreshedAssets],
            timeline,
            updatedAt: new Date().toISOString()
          }
          return pruneEditorV6TimelineSnapshots(next)
        })
        setSaved(false)
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar o personagem e as poses salvas no Editor V6.')
      }
    })()
    return () => { cancelled = true }
  }, [activeEditorV6, activePoseSourceSnapshot, availableCharacters, normalizedSourceVersion, pausePlayback, updateActiveEditorV6Project])

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
      color: studioColor(number), createdAt: now, updatedAt: now, backgroundColor: '#d7b5cd',
      backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100,
      backgroundRotation: 0, assets: [], elements: [], timeline: createEditorV6Timeline()
    }
    try {
      setError(null)
      await window.desktop.saveEditorV6Project(studio)
      upsertEditorV6Summary(editorV6ProjectSummary(studio))
      setSelectedId(studio.id)
      setSaved(true)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar o projeto do Editor V6.') }
  }

  const duplicateStudio = async (sourceSummary: EditorV6Card | null = selectedEditorV6) => {
    if (!sourceSummary) return
    let source: EditorV6Document | null
    try {
      source = activeEditorV6?.id === sourceSummary.id
        ? activeEditorV6
        : await window.desktop.loadEditorV6Project(sourceSummary.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o projeto que será duplicado.')
      return
    }
    if (!source) { setError('Não foi possível carregar o projeto que será duplicado.'); return }
    const number = allocateNumber()
    const now = new Date().toISOString()
    const duplicate: EditorV6Document = {
      ...source, id: crypto.randomUUID(), title: `Editor V6 ${String(number).padStart(2, '0')}`,
      color: studioColor(number), createdAt: now, updatedAt: now,
      assets: source.assets.map((asset) => ({ ...asset, id: crypto.randomUUID() })),
      elements: source.elements.map((element) => ({
        ...element, id: crypto.randomUUID(), assetId: element.assetId
          ? source.assets.find((asset) => asset.id === element.assetId)?.id
          : undefined
      }))
    }
    const oldToNew = new Map(source.assets.map((asset, index) => [asset.id, duplicate.assets[index]?.id ?? '']))
    duplicate.elements = source.elements.map((element, index) => ({
      ...duplicate.elements[index], assetId: element.assetId ? oldToNew.get(element.assetId) : undefined,
      faceModeAssetIds: element.faceModeAssetIds ? Object.fromEntries(Object.entries(element.faceModeAssetIds).map(([mode, id]) => [mode, id ? oldToNew.get(id) : undefined])) as EditorV6Element['faceModeAssetIds'] : undefined
    }))
    const oldToNewElements = new Map(source.elements.map((element, index) => [element.id, duplicate.elements[index].id]))
    const oldToNewBlocks = new Map(timelineClips(source.timeline).map(({ block }) => [block.id, crypto.randomUUID()]))
    duplicate.timeline = {
      ...source.timeline,
      knownElementIds: source.timeline.knownElementIds?.map((id) => oldToNewElements.get(id) ?? id),
      tracks: source.timeline.tracks.map((track) => ({
        ...track,
        id: crypto.randomUUID(),
        blocks: track.blocks.map((block) => ({
          ...block,
          id: oldToNewBlocks.get(block.id)!,
          elementId: block.elementId ? oldToNewElements.get(block.elementId) : undefined,
          parentBlockId: block.parentBlockId ? oldToNewBlocks.get(block.parentBlockId) : undefined,
          state: block.state ? { ...block.state, id: oldToNewElements.get(block.state.id) ?? block.state.id, assetId: block.state.assetId ? oldToNew.get(block.state.assetId) : undefined, faceModeAssetIds: block.state.faceModeAssetIds ? Object.fromEntries(Object.entries(block.state.faceModeAssetIds).map(([mode, id]) => [mode, id ? oldToNew.get(id) : undefined])) as EditorV6Element['faceModeAssetIds'] : undefined } : undefined,
          background: block.background ? { ...block.background, backgroundAssetId: block.background.backgroundAssetId ? oldToNew.get(block.background.backgroundAssetId) ?? null : null } : undefined,
          incomingMotion: block.incomingMotion ? { ...block.incomingMotion, assetId: oldToNew.get(block.incomingMotion.assetId)! } : undefined
        }))
      }))
    }
    duplicate.backgroundAssetId = source.backgroundAssetId ? oldToNew.get(source.backgroundAssetId) ?? null : null
    const originalMotions = new Map<string, ReturnType<typeof editorV6MotionPlans>[number]>(editorV6MotionPlans(source).map((plan) => [oldToNewBlocks.get(plan.blockId)!, plan]))
    const copiedMotions = new Map(editorV6MotionPlans(duplicate).map((plan) => [plan.blockId, plan]))
    duplicate.timeline = { ...duplicate.timeline, tracks: duplicate.timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => ({ ...block, incomingMotion: block.incomingMotion && originalMotions.get(block.id)?.key === block.incomingMotion.key && copiedMotions.has(block.id) ? { ...block.incomingMotion, key: copiedMotions.get(block.id)!.key } : undefined })) })) }
    try {
      setError(null)
      if (source.exportAudio?.length) await window.desktop.cloneEditorV6ExportAudio(source.id, duplicate.id, source.exportAudio)
      if (source.media?.length) await window.desktop.cloneEditorV6Media(source.id, duplicate.id, source.media)
      await window.desktop.saveEditorV6Project(duplicate)
      upsertEditorV6Summary(editorV6ProjectSummary(duplicate))
      setSelectedId(duplicate.id)
      setSaved(true)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível duplicar o projeto do Editor V6.') }
  }

  const saveStudio = useCallback(async (document = activeEditorV6) => {
    if (!document) return true
    const generation = ++saveGenerationRef.current
    try {
      // Enfileirar antes de preparar a miniatura: uma geração PNG lenta não pode
      // fazer um snapshot antigo ser gravado depois de um novo.
      const savedDocument = await studioSaveQueue.current.run(async () => {
        const thumbnailDataUrl = await makeStudioThumbnail(document).catch(() => document.thumbnailDataUrl)
        const next = { ...document, ...(thumbnailDataUrl ? { thumbnailDataUrl } : {}), updatedAt: new Date().toISOString() }
        await window.desktop.saveEditorV6Project(next)
        return next
      })
      if (generation === saveGenerationRef.current) {
        if (savedDocument.thumbnailDataUrl !== document.thumbnailDataUrl) {
          updateActiveEditorV6Project((studio) => studio.id === document.id && studio.updatedAt === document.updatedAt && studio.thumbnailDataUrl !== savedDocument.thumbnailDataUrl
            ? { ...studio, thumbnailDataUrl: savedDocument.thumbnailDataUrl }
            : studio)
        }
        setSaved(true)
        setError(null)
      }
      return true
    } catch (reason) {
      if (generation === saveGenerationRef.current) setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o projeto do Editor V6 neste dispositivo.')
      return false
    }
  }, [activeEditorV6])

  useEffect(() => {
    if (!activeEditorV6 || dragRef.current) return
    setSaved(false)
    const signature = JSON.stringify(activeEditorV6.elements.filter((element) => element.kind === 'character').map((element) => [element.id, element.activeExpressionCollectionId, element.activeExpressionPresetId]))
    const previous = expressionSaveSignatureRef.current
    expressionSaveSignatureRef.current = { studioId: activeEditorV6.id, value: signature }
    if (previous?.studioId === activeEditorV6.id && previous.value !== signature) {
      void saveStudio(activeEditorV6)
      return
    }
    const timer = window.setTimeout(() => { void saveStudio(activeEditorV6) }, 650)
    return () => window.clearTimeout(timer)
  }, [activeEditorV6, saveStudio])

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
    setSaved(false)
  }

  const recordHistory = (document = activeEditorV6) => {
    if (!document) return
    const history = useEditorV6Store.getState().record(document.id, document)
    setCanUndo(history.undo.length > 0)
    setCanRedo(false)
    setHistoryVersion(value => value + 1)
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

  const importImage = async (category: EditorV6Asset['category']) => {
    if (!activeEditorV6) return
    pausePlayback()
    if (category !== 'background' && activeEditorV6.timeline.tracks.some((track) => track.kind === 'video' && track.locked)) { setError('Desbloqueie a faixa Vídeo para adicionar uma imagem.'); return }
    try {
      const frameAtImport = getEditorV6PlaybackFrame()
      const asset = await window.desktop.importEditorV6Image(category)
      if (!asset) return
      const studioAtImport = activeEditorV6
      let nextStudio: EditorV6Document = category === 'background'
        ? editEditorV6BackgroundAtFrame({ ...studioAtImport, assets: [...studioAtImport.assets, asset], updatedAt: new Date().toISOString() }, frameAtImport, { backgroundAssetId: asset.id, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 })
        : {
            ...studioAtImport,
            assets: [...studioAtImport.assets, asset],
            elements: [...studioAtImport.elements, {
              id: crypto.randomUUID(), kind: 'image', assetId: asset.id, text: '', x: 0, y: 0, width: 25, height: 25, rotation: 0,
              zIndex: Math.max(0, ...studioAtImport.elements.map((item) => item.zIndex)) + 1
            }],
            updatedAt: new Date().toISOString()
          }

      if (category !== 'background') nextStudio = addEditorV6ElementAtFrame(nextStudio, nextStudio.elements.at(-1)!, frameAtImport)
      nextStudio = { ...nextStudio, timeline: normalizeEditorV6Timeline(syncEditorV6TimelineElements(nextStudio.timeline, nextStudio.elements)) }
      // Persist imported image bytes and their manifest before showing the asset as saved.
      await window.desktop.saveEditorV6Project(nextStudio)
      if (activeEditorV6Id === studioAtImport.id) {
        recordHistory()
        setActiveEditorV6Project(nextStudio)
        setSaved(true)
      }
      if (category === 'background') {
        setSelectedElementId('background')
      } else {
        setSelectedElementId(nextStudio.elements.at(-1)?.id ?? null)
        setSelectedTimelineBlockId(editorV6ClipAtFrame(nextStudio.timeline, nextStudio.elements.at(-1)!.id, frameAtImport)?.block.id ?? null)
      }
      setActiveTool(category === 'background' ? 'background' : 'objects')
      setInspectorOpen(true)
      setInspectorTab('editor')
      setError(null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível importar a imagem.') }
  }

  const importTimelineMedia = async (kind: 'video' | 'audio') => {
    if (!activeEditorV6) return
    if (kind === 'video') { setVideoPickerOpen(true); return }
    const track = activeEditorV6.timeline.tracks.find((item) => item.kind === kind)
    if (track?.locked) { setError('Desbloqueie a faixa Áudio para importar mídia.'); return }
    pausePlayback()
    const sourceProject = activeEditorV6
    const frameAtImport = getEditorV6PlaybackFrame()
    try {
      const media = await window.desktop.importEditorV6Media(sourceProject.id, kind)
      if (!media) return
      const startFrame = Math.min(frameAtImport, sourceProject.timeline.durationFrames)
      const durationFrames = Math.max(1, Math.min(media.sourceFrames, 1_000_000 - startFrame))
      const block = { id: crypto.randomUUID(), mediaId: media.id, mediaInFrame: 0, label: media.name.slice(0, 120), startFrame, durationFrames, audioEnabled: true, gain: 1 }
      const timeline = normalizeEditorV6Timeline({ ...sourceProject.timeline, durationFrames: Math.max(sourceProject.timeline.durationFrames, startFrame + durationFrames), tracks: sourceProject.timeline.tracks.map((item) => item.kind === kind ? { ...item, blocks: [...item.blocks, block] } : item) })
      const next: EditorV6Document = { ...sourceProject, media: [...(sourceProject.media ?? []), media], timeline, updatedAt: new Date().toISOString() }
      await window.desktop.saveEditorV6Project(next)
      if (activeEditorV6Id !== sourceProject.id) return
      recordHistory(sourceProject)
      setActiveEditorV6Project(next)
      publishPlayheadFrame(startFrame)
      setSelectedTimelineBlockId(block.id)
      setSelectedElementId(null)
      setActiveTool(null)
      setInspectorOpen(true)
      setInspectorTab('editor')
      setSaved(true)
      setError(null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível importar o áudio.') }
  }

  const linkVideoLibraryItem = async (item: import('../../../../shared/studio').VideoLibraryItem) => {
    const sourceProject = activeEditorV6
    if (!sourceProject) return
    const track = sourceProject.timeline.tracks.find((entry) => entry.kind === 'video')
    if (track?.locked) throw new Error('Desbloqueie a faixa Vídeo antes de adicionar um vídeo.')
    pausePlayback()
    const startFrame = Math.min(getEditorV6PlaybackFrame(), sourceProject.timeline.durationFrames)
    const media = await window.desktop.linkEditorV6LibraryVideo(sourceProject.id, item.id)
    const durationFrames = Math.max(1, Math.min(media.sourceFrames, 1_000_000 - startFrame))
    const block = { id: crypto.randomUUID(), mediaId: media.id, mediaInFrame: 0, label: media.name.slice(0, 120), startFrame, durationFrames, audioEnabled: true, gain: 1 }
    const mediaList = sourceProject.media ?? []
    const timeline = normalizeEditorV6Timeline({ ...sourceProject.timeline, durationFrames: Math.max(sourceProject.timeline.durationFrames, startFrame + durationFrames), tracks: sourceProject.timeline.tracks.map((entry) => entry.kind === 'video' ? { ...entry, blocks: [...entry.blocks, block] } : entry) })
    const next: EditorV6Document = { ...sourceProject, media: mediaList.some((entry) => entry.id === media.id) ? mediaList : [...mediaList, media], timeline, updatedAt: new Date().toISOString() }
    await window.desktop.saveEditorV6Project(next)
    if (activeEditorV6Id !== sourceProject.id) return
    recordHistory(sourceProject)
    setActiveEditorV6Project(next)
    publishPlayheadFrame(startFrame)
    setSelectedTimelineBlockId(block.id)
    setSelectedElementId(null)
    setActiveTool(null)
    setInspectorOpen(true)
    setInspectorTab('editor')
    setSaved(true)
    setError(null)
    setVideoPickerOpen(false)
  }

  const selectBackground = (asset: EditorV6Asset) => {
    const frame = getEditorV6PlaybackFrame()
    changeScene((studio) => ({ ...editEditorV6BackgroundAtFrame(studio, frame, { backgroundAssetId: asset.id, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0 }), updatedAt: new Date().toISOString() }))
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
      ...makeElement(kind, Math.max(0, ...activeEditorV6.elements.map((item) => item.zIndex)) + 1),
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
          const rendered = await renderer.render(undefined, undefined, undefined, 'idle')
          const baked = await bakeFaceModeAssets(character.name, renderer, character.customization.faceAppearance, undefined, undefined, 'idle', rendered)
          const imageWidth = baked.crop?.width ?? rendered.width
          const imageHeight = baked.crop?.height ?? rendered.height
          const referenceCharacter = character.customization.poseSlot === null ? character : { ...character, customization: { ...character.customization, poseSlot: null } }
          const referenceRendered = referenceCharacter === character ? rendered : await renderSavedCharacter(referenceCharacter, undefined, undefined, 'idle')
          const referenceCrop = referenceCharacter === character ? baked.crop : await trimTransparentImage(referenceRendered.dataUrl)
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
      // Cancel queued slider renders and let any in-flight composition finish before
      // reusing its canvas for a new catalog selection.
      editorV6FaceRenderVersionRef.current += 1
      editorV6FaceRenderPendingRef.current = null
      if (editorV6FaceRenderTimerRef.current !== null) {
        window.clearTimeout(editorV6FaceRenderTimerRef.current)
        editorV6FaceRenderTimerRef.current = null
      }
      while (editorV6FaceRenderRunningRef.current) await new Promise((resolve) => window.setTimeout(resolve, 16))
      const characterCopy: CustomizerCharacter = {
        ...selectedEditorV6Character,
        customization: { ...selectedEditorV6Character.customization, poseSlot: selectedElement.poseSlot === undefined ? selectedEditorV6Character.customization.poseSlot : selectedElement.poseSlot, faceAppearance: appearance }
      }
      const key = editorV6CharacterRenderKey(characterCopy, selectedElement.poseSourceRevision)
      if (!editorV6FaceRendererRef.current || editorV6FaceRendererRef.current.key !== key) {
        const { prepareSavedCharacterRenderer } = await import('../../characters/editorV6CharacterRenderer')
        const renderer = await prepareSavedCharacterRenderer(characterCopy)
        editorV6FaceRendererRef.current?.renderer.dispose()
        editorV6FaceRendererRef.current = { key, renderer }
      }
      const activeEffects = expressionState && Object.hasOwn(expressionState, 'activeExpressionEffects') ? expressionState.activeExpressionEffects : selectedElement.activeExpressionEffects
      const faceMode = expressionState && Object.hasOwn(expressionState, 'activeFaceMode') ? expressionState.activeFaceMode : selectedElement.activeFaceMode
      const baseMode = faceMode ?? editorV6FaceModeForElement(selectedElement, appearance)
      const assetId = selectedElement.assetId
      const rendered = await editorV6FaceRendererRef.current.renderer.render(appearance, faceTransforms, activeEffects, baseMode)
      const baked = await bakeFaceModeAssets(selectedElement.text, editorV6FaceRendererRef.current.renderer, appearance, faceTransforms, activeEffects, baseMode, rendered)
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

  const applyStudioBaseExpression = async () => {
    const appearance = selectedEditorV6Character?.customization.faceAppearance ?? selectedEditorV6FaceAppearance
    if (!selectedElement || !appearance || editorV6ExpressionBusy || editorV6FaceBusy) return
    const faceMode = editorV6FaceModeForElement(selectedElement, appearance)
    const base = { ...resolveEditorV6ExpressionBase(selectedElement, appearance), appearance: structuredClone(appearance) }
    setEditorV6ExpressionBusy(true)
    try {
      await applyStudioFaceAppearance(base.appearance, base.transforms, true, { expressionBase: base, activeExpressionPresetId: null, activeExpressionGaze: 'right', activeExpressionPresetUpdatedAt: undefined, activeExpressionCollectionId: selectedEditorV6ExpressionCollectionId, activeExpressionEffects: undefined, activeFaceMode: faceMode })
    } finally { setEditorV6ExpressionBusy(false) }
  }

  const applyStudioExpressionPreset = async (summary: FaceExpressionPresetSummary, gaze: 'right' | 'left' = 'right') => {
    if (!selectedEditorV6Character || !selectedElement || selectedElement.kind !== 'character' || editorV6ExpressionBusy || editorV6FaceBusy) return
    setEditorV6ExpressionBusy(true)
    setError(null)
    try {
      const preset: FaceExpressionPreset | null = await window.desktop.loadFaceExpressionPreset(summary.modelSlot, summary.id)
      if (!preset || preset.modelSlot !== selectedEditorV6CharacterModelSlot) throw new Error('Este preset não está disponível para o modelo selecionado.')
      const characterAppearance = selectedEditorV6Character.customization.faceAppearance ?? selectedEditorV6FaceAppearance
      if (!characterAppearance) throw new Error('A personagem ainda não tem uma aparência facial para ajustar.')
      const faceMode = editorV6FaceModeForElement(selectedElement, selectedEditorV6FaceAppearance)
      const base = { ...resolveEditorV6ExpressionBase(selectedElement, characterAppearance), appearance: structuredClone(characterAppearance) }
      const appearance = base.appearance
      let nextAppearance = await buildEditorV6ExpressionAppearance(preset, appearance, (id) => window.desktop.loadFaceCatalogItem(preset.modelSlot, id))
      if (faceMode === 'talk' && selectedEditorV6OpenMouthId && !nextAppearance.mouthOpenCatalogId) {
        nextAppearance = { ...nextAppearance, mouthOpenCatalogId: selectedEditorV6OpenMouthId }
      }
      const faceTransforms = await buildEditorV6ExpressionTransforms(
        preset, nextAppearance, base.transforms,
        (id) => window.desktop.loadFaceComponentAsset(preset.modelSlot, id),
        (id) => window.desktop.loadFaceCatalogItem(preset.modelSlot, id),
        gaze
      )

      await applyStudioFaceAppearance(nextAppearance, faceTransforms, true, { expressionBase: base, activeExpressionPresetId: preset.id, activeExpressionGaze: gaze, activeExpressionPresetUpdatedAt: preset.updatedAt, activeExpressionCollectionId: preset.collectionId ?? 'standard', activeExpressionEffects: preset.effects, activeFaceMode: faceMode })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível aplicar este preset de expressão.')
    } finally {
      setEditorV6ExpressionBusy(false)
    }
  }

  const applyEditorV6FaceMode = async (mode: EditorV6FaceMode) => {
    if (!selectedElement || selectedElement.kind !== 'character' || !selectedEditorV6FaceAppearance || editorV6ExpressionBusy || editorV6FaceBusy) return
    const appearance = mode === 'talk' && selectedEditorV6OpenMouthId && !selectedEditorV6FaceAppearance.mouthOpenCatalogId
      ? { ...selectedEditorV6FaceAppearance, mouthOpenCatalogId: selectedEditorV6OpenMouthId }
      : selectedEditorV6FaceAppearance
    await applyStudioFaceAppearance(appearance, selectedElement.faceTransforms ?? {}, true, { activeFaceMode: mode })
  }

  const applyStudioPose = async (poseSlot: number | null) => {
    if (!activeEditorV6 || selectedElement?.kind !== 'character' || !selectedEditorV6Character || !selectedElement.assetId || editorV6FaceBusy) return
    setEditorV6FaceBusy(true)
    try {
      const { prepareSavedCharacterRenderer, renderSavedCharacter } = await import('../../characters/editorV6CharacterRenderer')
      let characterCanvasWidth = selectedElement.characterCanvasWidth
      if (!characterCanvasWidth) {
        const currentPoseCharacter: CustomizerCharacter = { ...selectedEditorV6Character, customization: { ...selectedEditorV6Character.customization, poseSlot: selectedElement.poseSlot === undefined ? selectedEditorV6Character.customization.poseSlot : selectedElement.poseSlot, faceAppearance: selectedElement.faceAppearance ?? selectedEditorV6Character.customization.faceAppearance } }
        const currentRendered = await renderSavedCharacter(currentPoseCharacter, selectedElement.faceTransforms, selectedElement.activeExpressionEffects, selectedElement.activeFaceMode)
        const currentCrop = await trimTransparentImage(currentRendered.dataUrl)
        characterCanvasWidth = selectedElement.width * currentRendered.width / (currentCrop?.width ?? currentRendered.width)
      }
      const characterCopy: CustomizerCharacter = { ...selectedEditorV6Character, customization: { ...selectedEditorV6Character.customization, poseSlot, faceAppearance: selectedElement.faceAppearance ?? selectedEditorV6Character.customization.faceAppearance } }
      const baseMode = editorV6FaceModeForElement(selectedElement, characterCopy.customization.faceAppearance)
      const poseRenderer = await prepareSavedCharacterRenderer(characterCopy)
      let rendered: { dataUrl: string; width: number; height: number }
      let baked: Awaited<ReturnType<typeof bakeFaceModeAssets>>
      try {
        rendered = await poseRenderer.render(characterCopy.customization.faceAppearance, selectedElement.faceTransforms, selectedElement.activeExpressionEffects, baseMode)
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

  const chooseStudioFaceSheet = async (summary: FaceCatalogItemSummary) => {
    if (!selectedEditorV6Character) return
    const key = `${summary.modelSlot}:${summary.id}`
    const item = editorV6FaceDetails[key] ?? await window.desktop.loadFaceCatalogItem(summary.modelSlot, summary.id)
    if (!item) return
    setEditorV6FaceDetails((current) => ({ ...current, [key]: item }))
    const previous = selectedEditorV6FaceAppearance
    const sameModel = previous?.modelSlot === item.modelSlot
    const field: Record<FaceSheetKind, keyof CustomizerFaceAppearance> = {
      eyes: 'eyeCatalogId', eyebrows: 'eyebrowCatalogId', nose: 'noseCatalogId',
      'mouth-closed': 'mouthClosedCatalogId', 'mouth-open': 'mouthOpenCatalogId'
    }
    const appearance: CustomizerFaceAppearance = {
      ...(sameModel ? previous : undefined),
      modelSlot: item.modelSlot,
      setId: undefined,
      [field[item.category]]: item.id,
      eyeState: sameModel ? previous.eyeState : 0,
      eyebrows: sameModel ? previous.eyebrows : true,
      noseIndex: item.category === 'nose' ? item.selectedNose : sameModel ? previous.noseIndex : item.selectedNose,
      expressionIndex: item.category.startsWith('mouth') ? item.selectedExpression : sameModel ? previous.expressionIndex : item.selectedExpression,
      mouthOpen: item.category === 'mouth-open' ? true : item.category === 'mouth-closed' ? false : sameModel ? previous.mouthOpen : false
    }
    const faceMode = item.category === 'mouth-open' ? 'talk' : item.category === 'mouth-closed' ? 'idle' : selectedElement?.activeFaceMode
    await applyStudioFaceAppearance(appearance, selectedElement?.faceTransforms ?? {}, true, { activeFaceMode: faceMode })
  }

  const updateStudioFaceVariant = (patch: Partial<CustomizerFaceAppearance>) => {
    if (!selectedEditorV6FaceAppearance || selectedEditorV6CharacterModelSlot === null) return
    const changesFaceMode = Object.hasOwn(patch, 'mouthOpen') || Object.hasOwn(patch, 'eyeState')
    let faceMode = selectedElement?.activeFaceMode
    if (Object.hasOwn(patch, 'mouthOpen')) faceMode = patch.mouthOpen ? 'talk' : 'idle'
    else if (Object.hasOwn(patch, 'eyeState')) {
      faceMode = patch.eyeState === 2 ? 'blink' : selectedEditorV6FaceMode === 'talk' ? 'talk' : 'idle'
    }
    void applyStudioFaceAppearance(
      { ...selectedEditorV6FaceAppearance, ...patch },
      selectedElement?.faceTransforms ?? {},
      true,
      changesFaceMode ? { activeFaceMode: faceMode } : undefined
    )
  }

  const updateEditorV6FaceTransform = (transformKey: string, patch: Partial<EditorV6FaceTransform>, record = false, baseTransform = defaultStudioEyeTransform) => {
    if (!selectedElement || selectedElement.kind !== 'character') return
    const saved = editorV6FaceTransformsRef.current[selectedElement.id] ?? selectedElement.faceTransforms ?? {}
    const transform = { ...(saved[transformKey] ?? baseTransform), ...patch }
    const next = { ...saved, [transformKey]: transform }
    editorV6FaceTransformsRef.current[selectedElement.id] = next
    updateElement(selectedElement.id, { faceTransforms: next }, record)
    if (selectedEditorV6Character && selectedEditorV6FaceAppearance && selectedElement.assetId && activeEditorV6Id) {
      const character: CustomizerCharacter = { ...selectedEditorV6Character, customization: { ...selectedEditorV6Character.customization, poseSlot: selectedElement.poseSlot ?? selectedEditorV6Character.customization.poseSlot, faceAppearance: selectedEditorV6FaceAppearance } }
      scheduleStudioFacePreview({ studioId: activeEditorV6Id, elementId: selectedElement.id, assetId: selectedElement.assetId, character, transforms: next })
    }
  }

  const finishEditorV6FaceTransform = (transformKey: string) => {
    if (!selectedElement || selectedElement.kind !== 'character') return
    const faceTransforms = editorV6FaceTransformsRef.current[selectedElement.id] ?? selectedElement.faceTransforms ?? {}
    if (!faceTransforms[transformKey]) return
    flushStudioFacePreview()
  }

  const scheduleStudioFacePreview = (job: NonNullable<typeof editorV6FaceRenderPendingRef.current>) => {
    editorV6FaceRenderPendingRef.current = job
    editorV6FaceRenderVersionRef.current += 1
    if (editorV6FaceRenderTimerRef.current !== null) return
    editorV6FaceRenderTimerRef.current = window.setTimeout(() => {
      editorV6FaceRenderTimerRef.current = null
      void renderPendingStudioFacePreview()
    }, 55)
  }

  const flushStudioFacePreview = () => {
    if (editorV6FaceRenderTimerRef.current !== null) window.clearTimeout(editorV6FaceRenderTimerRef.current)
    editorV6FaceRenderTimerRef.current = null
    void renderPendingStudioFacePreview()
  }

  const renderPendingStudioFacePreview = async () => {
    if (editorV6FaceRenderRunningRef.current) return
    editorV6FaceRenderRunningRef.current = true
    try {
      while (editorV6FaceRenderPendingRef.current) {
        const job = editorV6FaceRenderPendingRef.current
        editorV6FaceRenderPendingRef.current = null
        const version = editorV6FaceRenderVersionRef.current
        const renderElement = selectedElement?.id === job.elementId ? selectedElement : activeEditorV6?.elements.find((candidate) => candidate.id === job.elementId)
        const key = editorV6CharacterRenderKey(job.character, renderElement?.poseSourceRevision)
        try {
          if (!editorV6FaceRendererRef.current || editorV6FaceRendererRef.current.key !== key) {
            const { prepareSavedCharacterRenderer } = await import('../../characters/editorV6CharacterRenderer')
            const renderer = await prepareSavedCharacterRenderer(job.character)
            if (version !== editorV6FaceRenderVersionRef.current) continue
            editorV6FaceRendererRef.current?.renderer.dispose()
            editorV6FaceRendererRef.current = { key, renderer }
          }
          const element = renderElement
          const transforms = editorV6FaceTransformsRef.current[job.elementId] ?? job.transforms
          const effects = element?.activeExpressionEffects
          const baseMode = editorV6FaceModeForElement(element ?? null, job.character.customization.faceAppearance)
          const rendered = await editorV6FaceRendererRef.current.renderer.render(job.character.customization.faceAppearance, transforms, effects, baseMode)
          const baked = await bakeFaceModeAssets(element?.text ?? job.character.name, editorV6FaceRendererRef.current.renderer, job.character.customization.faceAppearance, transforms, effects, baseMode, rendered)
          if (version === editorV6FaceRenderVersionRef.current && job.studioId === activeEditorV6Id) {
            patchStudio((studio) => ({
              ...studio,
              elements: studio.elements.map((element) => element.id === job.elementId ? { ...element, faceRendererVersion: EDITOR_V6_FACE_RENDER_VERSION, faceModeAssetIds: { ...baked.assetIds, [baseMode]: job.assetId }, ...faceRenderGeometry(element, rendered, baked.crop, sceneRef.current?.clientWidth ?? 1000, sceneRef.current?.clientHeight ?? 562) } : element),
              assets: [...studio.assets.map((asset) => asset.id === job.assetId ? { ...asset, dataUrl: baked.dataUrl, mimeType: 'image/png' as const } : asset), ...baked.extraAssets],
              updatedAt: new Date().toISOString()
            }))
          }
        } catch (reason) {
          if (version === editorV6FaceRenderVersionRef.current && job.studioId === activeEditorV6Id) setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar a prévia facial.')
        }
      }
    } finally {
      editorV6FaceRenderRunningRef.current = false
    }
    if (editorV6FaceRenderPendingRef.current && editorV6FaceRenderTimerRef.current === null) {
      editorV6FaceRenderTimerRef.current = window.setTimeout(() => {
        editorV6FaceRenderTimerRef.current = null
        void renderPendingStudioFacePreview()
      }, 0)
    }
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

  const cancelSceneDrag = () => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    if (drag.moved) {
      updateActiveEditorV6Project((project) => project.id === drag.before.id ? { ...drag.before, updatedAt: new Date().toISOString() } : project)
      setSelectedTimelineBlockId(drag.target === 'background' ? null : drag.target === 'video' ? drag.blockId : editorV6ClipAtFrame(drag.before.timeline, drag.id, drag.frame)?.block.id ?? null)
      setSaved(false)
    }
  }

  const startDrag = (event: ScenePointerEvent, id: string) => {
    if (!activeEditorV6 || !sceneRef.current || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    pausePlayback()
    const currentScene = resolveEditorV6SceneAtFrame(activeEditorV6, getEditorV6PlaybackFrame(), { includeMotion: false })
    const currentBackground = currentScene.background
    const videoBlockId = id.startsWith('media-video:') ? id.slice('media-video:'.length) : null
    const target: DragState['target'] = videoBlockId ? 'video' : id === 'background' ? 'background' : 'element'
    setSelectedElementId(target === 'video' ? null : id)
    setActiveTool(target === 'background' ? 'background' : null)
    setInspectorOpen(true)
    const element = target === 'element' ? currentScene.elements.find((item) => item.id === id) : undefined
    const videoClip = videoBlockId ? timelineClips(activeEditorV6.timeline).find(({ track, block }) => track.kind === 'video' && block.id === videoBlockId) : undefined
    if (target === 'video' && (!videoClip || videoClip.track.locked)) return
    const currentClip = target === 'background' || target === 'video' ? null : editorV6ClipAtFrame(activeEditorV6.timeline, id, currentScene.frame)
    setSelectedTimelineBlockId(currentClip?.block.id ?? null)
    if (videoClip) setSelectedTimelineBlockId(videoClip.block.id)
    if (element?.kind === 'character') restoreCharacterInspectorView()
    else setInspectorTab('editor')
    if (editorV6FaceBusy || editorV6ExpressionBusy || editorV6FaceRenderRunningRef.current) return
    const frame = currentScene.frame
    let prepared: EditorV6Document, blockId: string
    if (target === 'video' && videoClip) {
      prepared = activeEditorV6
      blockId = videoClip.block.id
    } else if (target === 'background') {
      if (activeEditorV6.timeline.tracks.some((track) => track.kind === 'video' && track.locked)) return
      prepared = editEditorV6BackgroundAtFrame(activeEditorV6, frame, {})
      blockId = timelineClips(prepared.timeline).find(({ block }) => block.background && block.startFrame === frame)!.block.id
    } else {
      const operation = prepareEditorV6PositionAtFrame(activeEditorV6, id, frame)
      if (!operation || !element) return
      prepared = operation.document
      blockId = operation.blockId
    }
    const rect = sceneRef.current.getBoundingClientRect()
    const videoAsset = videoClip?.block.mediaId ? activeEditorV6.media?.find((media) => media.id === videoClip.block.mediaId) : undefined
    const videoLayout = videoClip?.block.mediaLayout ?? editorV6DefaultVideoLayout(videoAsset?.width, videoAsset?.height)
    dragRef.current = { id, target, ...(target === 'video' ? { videoLayout } : {}), pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originalX: target === 'background' ? currentBackground.backgroundX : target === 'video' ? videoLayout.x : element!.x, originalY: target === 'background' ? currentBackground.backgroundY : target === 'video' ? videoLayout.y : element!.y, width: rect.width, height: rect.height, before: activeEditorV6, prepared, blockId, frame, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: ScenePointerEvent) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 2) return
    const x = drag.originalX + (event.clientX - drag.startX) / drag.width * 100
    const y = drag.originalY + (event.clientY - drag.startY) / drag.height * 100
    const next = drag.target === 'background' ? editEditorV6BackgroundAtFrame(drag.prepared, drag.frame, { backgroundX: x, backgroundY: y }, drag.blockId)
      : drag.target === 'video' ? { ...drag.prepared, timeline: normalizeEditorV6Timeline({ ...drag.prepared.timeline, tracks: drag.prepared.timeline.tracks.map((track) => ({ ...track, blocks: track.blocks.map((block) => block.id === drag.blockId ? { ...block, mediaLayout: { ...(block.mediaLayout ?? drag.videoLayout ?? EDITOR_V6_DEFAULT_VIDEO_LAYOUT), x, y } } : block) })) }) }
        : moveEditorV6ElementInPeriod(drag.prepared, drag.blockId, x, y)
    drag.moved = true
    publishPlayheadFrame(drag.frame)
    setSelectedTimelineBlockId(drag.blockId)
    updateActiveEditorV6Project((project) => project.id === drag.before.id ? { ...next, updatedAt: new Date().toISOString() } : project)
    setSaved(false)
  }

  const endDrag = (event: ScenePointerEvent) => {
    const drag = dragRef.current
    if (drag?.pointerId !== event.pointerId) return
    if (event.type === 'pointercancel') { cancelSceneDrag(); return }
    dragRef.current = null
    if (!drag.moved) return
    recordHistory(drag.before)
    updateActiveEditorV6Project((project) => project.id === drag.before.id ? { ...project, updatedAt: new Date().toISOString() } : project)
    setSaved(false)
  }
  sceneInteractionRef.current = { start: startDrag, move: moveDrag, end: endDrag }

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
    try {
      await window.desktop.deleteEditorV6Project(target.id)
      removeEditorV6Summary(target.id)
      setSelectedId((current) => current === target.id ? null : current)
      if (activeEditorV6Id === target.id) { pausePlayback(); setActiveStudioId(null) }
      setSaved(true)
      setError(null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o projeto do Editor V6.') }
  }

  const leaveStudio = async () => {
    if (!await saveStudio(activeEditorV6)) return
    pausePlayback()
    setActiveStudioId(null)
    setActiveTool(null)
    setSelectedElementId(null)
    setFullView(false)
  }

  const exportPrint = async () => {
    if (!activeEditorV6) return
    try {
      if (!await saveStudio(activeEditorV6)) return
      const { captureEditorV6Frame } = await import('./sceneCapture')
      const image = await captureEditorV6Frame(activeEditorV6, getEditorV6PlaybackFrame(), 1920, 1080, 'image/png')
      const path = await window.desktop.saveEditorV6Print(activeEditorV6.id, image)
      if (path) { setError(null); setNotice(`Print salvo em ${path}`) }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível gerar o print.') }
  }

  const openPrints = async () => {
    if (!activeEditorV6) return
    try { await window.desktop.openEditorV6Prints(activeEditorV6.id) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a pasta de prints.') }
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
    <StudioNumericControl key={label} label={label} value={value} onChange={onChange} onStart={() => recordHistory()} onFinish={onFinish} disabled={disabled} min={min} max={max} suffix={suffix} />
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
        if (activeEditorV6.timeline.tracks.some((track) => track.kind === 'video' && track.locked)) { setError('Desbloqueie a faixa Vídeo para adicionar uma imagem.'); return }
        const element: EditorV6Element = { id: crypto.randomUUID(), kind: 'image', assetId: asset.id, text: '', x: 0, y: 0, width: 25, height: 25, rotation: 0, zIndex: Math.max(0, ...activeEditorV6.elements.map((item) => item.zIndex)) + 1 }
        const blockId = crypto.randomUUID()
        const frame = getEditorV6PlaybackFrame()
        changeScene((studio) => ({ ...addEditorV6ElementAtFrame(studio, element, frame, blockId), updatedAt: new Date().toISOString() }))
        setSelectedElementId(element.id)
        setSelectedTimelineBlockId(blockId)
        setInspectorOpen(true)
        setInspectorTab('editor')
      }}><img src={asset.dataUrl} alt="" /><span>{asset.name}</span></button>)}</div>
      {selectedElementId && selectedElement && <ElementControls element={selectedElement} update={(values, record) => updateElement(selectedElement.id, values, record)} remove={deleteSelected} control={control} />}
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
      <ElementControls element={selectedElement} update={(values, record) => updateElement(selectedElement.id, values, record)} remove={deleteSelected} control={control} />
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
    const sheetKind: FaceSheetKind = editorV6FaceCategory === 'mouth'
      ? selectedEditorV6FaceMode === 'talk' ? 'mouth-open' : 'mouth-closed'
      : editorV6FaceCategory
    const selectedItemId = sheetKind === 'eyes' ? selectedEditorV6FaceAppearance?.eyeCatalogId
      : sheetKind === 'eyebrows' ? selectedEditorV6FaceAppearance?.eyebrowCatalogId
        : sheetKind === 'nose' ? selectedEditorV6FaceAppearance?.noseCatalogId
          : sheetKind === 'mouth-open' ? selectedEditorV6FaceAppearance?.mouthOpenCatalogId ?? selectedEditorV6OpenMouthId
            : selectedEditorV6FaceAppearance?.mouthClosedCatalogId
    const activeItem = selectedItemId ? editorV6FaceDetails[`${selectedEditorV6CharacterModelSlot}:${selectedItemId}`] : null
    const studioTransformKey = editorV6FaceCategory === 'mouth' ? 'mouth' : selectedItemId ? `${sheetKind}:${selectedItemId}` : editorV6FaceCategory
    const legacyMouthTransform = selectedEditorV6FaceAppearance?.mouthClosedCatalogId
      ? selectedElement.faceTransforms?.[`mouth-closed:${selectedEditorV6FaceAppearance.mouthClosedCatalogId}`]
      : selectedEditorV6FaceAppearance?.mouthOpenCatalogId
        ? selectedElement.faceTransforms?.[`mouth-open:${selectedEditorV6FaceAppearance.mouthOpenCatalogId}`]
        : undefined
    const selectedEditorV6FaceTransform = selectedElement.faceTransforms?.[studioTransformKey]
      ?? (editorV6FaceCategory === 'mouth' ? (selectedItemId ? selectedElement.faceTransforms?.[`${sheetKind}:${selectedItemId}`] : undefined) ?? legacyMouthTransform : undefined)
      ?? selectedElement.faceTransforms?.[editorV6FaceCategory]
      ?? defaultStudioEyeTransform
    const catalogItems = editorV6FaceItems.filter((item) => item.category === sheetKind)
    const renderPair = (pieces: FaceCatalogItem['pieces']) => pieces.slice(0, 2).map((piece) => <img key={piece.id} src={piece.dataUrl} alt="" />)
    const categoryButtons = [
      { id: 'eyes', label: 'Olhos' }, { id: 'eyebrows', label: 'Sobrancelhas' },
      { id: 'nose', label: 'Nariz' }, { id: 'mouth', label: 'Boca' }
    ] as const
    return <div className="studio-custom-face">
      <div className="studio-custom-face-categories" aria-label="Categorias do rosto">
        {categoryButtons.map((category) => <button key={category.id} className={editorV6FaceCategory === category.id ? 'active' : ''} onClick={() => setEditorV6FaceCategory(category.id)} type="button">{category.label}</button>)}
      </div>
      {editorV6FaceCategory === 'mouth' && <div className="studio-custom-mouth-tabs"><button className={selectedEditorV6FaceMode !== 'talk' ? 'active' : ''} onClick={() => void applyEditorV6FaceMode('idle')} disabled={!selectedEditorV6FaceAppearance || editorV6FaceBusy || editorV6ExpressionBusy} type="button">Fechada</button><button className={selectedEditorV6FaceMode === 'talk' ? 'active' : ''} onClick={() => void applyEditorV6FaceMode('talk')} disabled={!selectedEditorV6FaceAppearance || editorV6FaceBusy || editorV6ExpressionBusy || !selectedEditorV6TalkAvailable} type="button">Aberta</button></div>}
      <label className="studio-custom-eye-sheet-select"><span>{editorV6FaceCategory === 'eyes' ? 'Folha de olhos' : editorV6FaceCategory === 'eyebrows' ? 'Folha de sobrancelhas' : editorV6FaceCategory === 'nose' ? 'Folha de nariz' : 'Folha de boca'}</span><select value={selectedItemId ?? ''} onChange={(event) => { const summary = catalogItems.find((item) => item.id === event.target.value); if (summary) void chooseStudioFaceSheet(summary) }} disabled={editorV6FaceBusy || editorV6FaceLoading}><option value="">Selecione uma folha</option>{catalogItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {editorV6FaceLoading && <p className="studio-custom-hint">Carregando catálogo facial…</p>}
      {editorV6FaceCategory === 'eyebrows' && selectedEditorV6FaceAppearance?.eyebrowCatalogId && <button className={`studio-custom-toggle${selectedEditorV6FaceAppearance.eyebrows ? ' active' : ''}`} onClick={() => updateStudioFaceVariant({ eyebrows: !selectedEditorV6FaceAppearance.eyebrows })} disabled={editorV6FaceBusy} type="button">{selectedEditorV6FaceAppearance.eyebrows ? 'Ocultar sobrancelhas' : 'Mostrar sobrancelhas'}</button>}
      {sheetKind === 'eyes' && <>
        {activeItem ? <div className="studio-custom-face-variants">{[0, 1, 2].map((index) => {
          const pieces = activeItem.pieces.filter((piece) => piece.index === index)
          const labels = ['Direita', 'Esquerda', 'Fechados']
          const displayedEyeState = selectedEditorV6FaceMode === 'blink' ? 2 : selectedEditorV6FaceAppearance?.eyeState === 1 ? 1 : 0
          return <button className={(displayedEyeState === index ? 'selected' : '')} key={index} onClick={() => updateStudioFaceVariant({ eyeState: index as 0 | 1 | 2 })} disabled={editorV6FaceBusy} type="button"><span>{renderPair(pieces)}</span><b>{labels[index]}</b></button>
        })}</div> : <p className="studio-custom-hint">Escolha uma folha de olhos para ver as três variantes.</p>}
      </>}
      {activeItem && <>
        {sheetKind === 'nose' && <div className="studio-custom-face-variants studio-custom-face-grid">{activeItem.pieces.map((piece) => <button className={(selectedEditorV6FaceAppearance?.noseIndex === piece.index ? 'selected' : '')} key={piece.id} onClick={() => updateStudioFaceVariant({ noseIndex: piece.index })} disabled={editorV6FaceBusy} type="button"><span><img src={piece.dataUrl} alt="" /></span><b>{piece.index + 1}</b></button>)}</div>}
        {sheetKind.startsWith('mouth') && <div className="studio-custom-face-variants studio-custom-face-grid">{activeItem.pieces.map((piece) => <button className={(selectedEditorV6FaceAppearance?.expressionIndex === piece.index ? 'selected' : '')} key={piece.id} onClick={() => updateStudioFaceVariant({ expressionIndex: piece.index })} disabled={editorV6FaceBusy} type="button"><span><img src={piece.dataUrl} alt="" /></span><b>{String(piece.index + 1).padStart(2, '0')}</b></button>)}</div>}
      </>}
      <div className="studio-controls-grid studio-custom-eye-controls">
        {control('X', selectedEditorV6FaceTransform.x, (value, record) => updateEditorV6FaceTransform(studioTransformKey, { x: value }, record, selectedEditorV6FaceTransform), -100, 100, '%', () => finishEditorV6FaceTransform(studioTransformKey), editorV6FaceBusy)}
        {control('Y', selectedEditorV6FaceTransform.y, (value, record) => updateEditorV6FaceTransform(studioTransformKey, { y: value }, record, selectedEditorV6FaceTransform), -100, 100, '%', () => finishEditorV6FaceTransform(studioTransformKey), editorV6FaceBusy)}
        {control('Largura', selectedEditorV6FaceTransform.width, (value, record) => updateEditorV6FaceTransform(studioTransformKey, { width: value }, record, selectedEditorV6FaceTransform), 1, 300, '%', () => finishEditorV6FaceTransform(studioTransformKey), editorV6FaceBusy)}
        {control('Altura', selectedEditorV6FaceTransform.height, (value, record) => updateEditorV6FaceTransform(studioTransformKey, { height: value }, record, selectedEditorV6FaceTransform), 1, 300, '%', () => finishEditorV6FaceTransform(studioTransformKey), editorV6FaceBusy)}
        {control('Rotação', selectedEditorV6FaceTransform.rotation, (value, record) => updateEditorV6FaceTransform(studioTransformKey, { rotation: value }, record, selectedEditorV6FaceTransform), -180, 180, '°', () => finishEditorV6FaceTransform(studioTransformKey), editorV6FaceBusy)}
      </div>
      {editorV6FaceBusy && <p className="studio-custom-hint" role="status">Atualizando personagem…</p>}
    </div>
  }

  const presetsPanel = (): ReactNode => {
    const presetOptions = [
      { id: 'pose' as const, label: 'Pose', icon: 'frame' },
      { id: 'expression' as const, label: 'Expressão', icon: 'face' },
      { id: 'reserved-1', label: 'Em breve', icon: 'sparkles' },
      { id: 'reserved-2', label: 'Em breve', icon: 'sparkles' },
      { id: 'reserved-3', label: 'Em breve', icon: 'sparkles' },
      { id: 'reserved-4', label: 'Em breve', icon: 'sparkles' }
    ] as const
    if (!selectedEditorV6Character || selectedElement?.kind !== 'character') return <div className="studio-custom-empty"><strong>Presets</strong><span>Selecione um personagem na cena para ver poses e expressões.</span></div>
    return <div className="studio-presets-panel">
      <div className="studio-preset-buttons" aria-label="Categorias de presets">
        {presetOptions.map((option) => <button key={option.id} className={`studio-preset-button${option.id === editorV6PresetCategory ? ' active' : ''}${option.id.startsWith('reserved') ? ' reserved' : ''}`} disabled={option.id.startsWith('reserved')} onClick={() => { if (option.id === 'pose') { setEditorV6PresetCategory('pose') } else if (option.id === 'expression') setEditorV6PresetCategory('expression') }} type="button"><Icon name={option.icon} /><span>{option.label}</span></button>)}
      </div>
        {editorV6PresetCategory === 'pose' && <section className="studio-preset-catalog" aria-label="Catálogo de poses">
        <h3>Poses do modelo</h3>
        <div className="studio-preset-list">
          {editorV6PoseSlots.filter((pose): pose is NonNullable<FabricatorPoseSummary> => pose !== null).map((pose) => {
            const dimensions = editorV6PoseDimensions[pose.slot]
            return <button className={`studio-pose-option${selectedEditorV6PoseSlot === pose.slot ? ' selected' : ''}`} key={pose.slot} onClick={() => void applyStudioPose(pose.slot)} disabled={editorV6FaceBusy} aria-label={`Selecionar pose ${pose.name}`} title={pose.name} style={dimensions ? { aspectRatio: `${dimensions.width}/${dimensions.height}` } : undefined} type="button">{editorV6PoseThumbnails[pose.slot] ? <img src={editorV6PoseThumbnails[pose.slot]} alt="" /> : <span className="studio-pose-thumb-placeholder" />}</button>
          })}
          {!editorV6PoseSlots.length && <p className="studio-custom-hint">Este modelo ainda não tem poses salvas.</p>}
        </div>
      </section>}
      {editorV6PresetCategory === 'expression' && <section className="studio-expression-catalog" aria-label="Presets do Expressão Dev">
        {editorV6ExpressionLoading ? <p className="studio-custom-hint">Carregando conjuntos de expressão…</p> : <>
          <div className="studio-expression-modes" role="group" aria-label="Estado facial do personagem">
            {([{ id: 'idle', label: 'Idle' }, { id: 'blink', label: 'Blink' }, { id: 'talk', label: 'Talk' }] as const).map((mode) => <button key={mode.id} className={`studio-expression-mode${selectedEditorV6FaceMode === mode.id ? ' active' : ''}`} type="button" aria-pressed={selectedEditorV6FaceMode === mode.id} disabled={editorV6ExpressionBusy || editorV6FaceBusy || !selectedEditorV6FaceAppearance || mode.id === 'talk' && !selectedEditorV6TalkAvailable} onClick={() => void applyEditorV6FaceMode(mode.id)}>{mode.label}</button>)}
          </div>
          <div className="studio-expression-collections" aria-label="Selecionar conjunto de expressão">
            <button className="studio-expression-collection-button" type="button" aria-expanded={editorV6ExpressionCollectionMenuOpen} onClick={() => setEditorV6ExpressionCollectionMenuOpen((open) => !open)}>
              <strong>{[{ id: 'standard', name: 'Padrão' }, ...editorV6ExpressionCollections].find((item) => item.id === selectedEditorV6ExpressionCollectionId)?.name ?? 'Escolher conjunto'}</strong><Icon name="chevronDown" />
            </button>
            {editorV6ExpressionCollectionMenuOpen && <div className="studio-expression-collection-options" role="listbox" aria-label="Conjuntos disponíveis">
              {[{ id: 'standard', name: 'Padrão' }, ...editorV6ExpressionCollections].map((collection) => {
                const selected = selectedEditorV6ExpressionCollectionId === collection.id
                return <button className={`studio-expression-collection-option${selected ? ' selected' : ''}`} key={collection.id} type="button" role="option" aria-selected={selected} onClick={() => { updateElement(selectedElement.id, { activeExpressionCollectionId: collection.id }); setEditorV6ExpressionCollectionMenuOpen(false) }}>
                  <span>{collection.name}</span>{selected && <Icon name="check" />}
                </button>
              })}
            </div>}
          </div>
          {selectedEditorV6ExpressionCollectionId ? (() => {
            const expressions = editorV6ExpressionPresets
              .filter((preset) => preset.collectionId === selectedEditorV6ExpressionCollectionId && Number.isInteger(preset.expressionIndex))
              .sort((a, b) => a.expressionIndex! - b.expressionIndex!)
            return <div className="studio-expression-selected">
              <div className="studio-expression-list">
                <button className={`studio-expression-option${!selectedElement.activeExpressionPresetId ? ' selected' : ''}`} type="button" onClick={() => void applyStudioBaseExpression()} disabled={editorV6ExpressionBusy || editorV6FaceBusy} aria-pressed={!selectedElement.activeExpressionPresetId}><b>•</b><span>Base</span></button>
                {expressions.map((preset) => <div className="studio-expression-row" key={preset.id}>
                  <button className={`studio-expression-option${selectedElement.activeExpressionPresetId === preset.id && selectedElement.activeExpressionGaze !== 'left' ? ' selected' : ''}`} type="button" aria-pressed={selectedElement.activeExpressionPresetId === preset.id} onClick={() => void applyStudioExpressionPreset(preset)} disabled={editorV6ExpressionBusy || editorV6FaceBusy}>
                    <b>{String((preset.expressionIndex ?? 0) + 1).padStart(2, '0')}</b><span>{preset.name}</span>
                  </button>
                  <button className="studio-expression-look-left" type="button" aria-pressed={selectedElement.activeExpressionPresetId === preset.id && selectedElement.activeExpressionGaze === 'left'} title={`Aplicar ${preset.name} com as pupilas voltadas à esquerda`} aria-label={`Pupilas à esquerda: ${preset.name}`} onClick={() => void applyStudioExpressionPreset(preset, 'left')} disabled={editorV6ExpressionBusy || editorV6FaceBusy}>pt</button>
                </div>)}
                {!expressions.length && <p className="studio-custom-hint">Nenhuma expressão salva neste conjunto. Salve expressões no Expressão Dev para listá-las aqui.</p>}
              </div>
            </div>
          })() : <p className="studio-custom-hint">Selecione um conjunto para ver as expressões disponíveis.</p>}
          {(editorV6ExpressionBusy || editorV6FaceBusy) && <p className="studio-custom-hint" role="status">Aplicando expressão…</p>}
        </>}
      </section>}
    </div>
  }

  const castPanel = () => <div className="studio-cast-content">
    <header><span><h2>Elenco</h2><small>{stageCharacters.length} na cena</small></span><button className="studio-cast-add-button" onClick={openCastPicker} type="button"><Icon name="plus" />Adicionar</button></header>
    <section className="studio-cast-section" aria-label="Personagens na cena">
      <header><h3>Na cena</h3><button className={`studio-cast-lock${allStageCharactersLocked ? ' active' : ''}`} onClick={toggleStageCharacterPositionLock} disabled={!stageCharacters.length} aria-label={allStageCharactersLocked ? 'Desbloquear posição dos personagens' : 'Bloquear posição dos personagens'} title={allStageCharactersLocked ? 'Desbloquear posições' : 'Bloquear posições'} type="button"><Icon name={allStageCharactersLocked ? 'lock' : 'unlock'} /></button></header>
      {stageCharacters.length ? stageCharacters.map((element) => {
        const character = availableCharacters.find((item) => item.id === element.characterId)
        const firstName = (character?.name ?? element.text).trim().split(/\s+/)[0] || element.text
        return <article className={`studio-cast-item${selectedElementId === element.id ? ' selected' : ''}`} key={element.id}>
          <button className="studio-cast-select" onClick={() => { pausePlayback(); setSelectedElementId(element.id); setSelectedTimelineBlockId(editorV6ClipAtFrame(activeEditorV6!.timeline, element.id, getEditorV6PlaybackFrame())?.block.id ?? null); setActiveTool(null); setInspectorOpen(true); restoreCharacterInspectorView() }} type="button">
            {character ? <CharacterPortrait character={character} /> : <span className="studio-cast-fallback">{element.text.slice(0, 1)}</span>}
            <span>{firstName}</span>
          </button>
          <button className="studio-cast-remove" onClick={() => removeStageCharacter(element)} aria-label={`Remover ${firstName} do elenco`} title="Remover da cena" type="button">×</button>
        </article>
      }) : <p className="studio-cast-empty">Adicione personagens para montar a cena.</p>}
    </section>
  </div>

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
            <button className="studio-round-action" onClick={() => void saveStudio(activeEditorV6)} title="Salvar agora no computador" aria-label="Salvar Editor V6" type="button"><Icon name="save" /></button>
          </div>
          <div className="studio-editor-quick-actions studio-history-actions">
            <button className="studio-round-action" disabled={!canUndo} onClick={undo} title="Desfazer (Ctrl+Z)" aria-label="Desfazer" type="button"><Icon name="undo" /></button>
            <button className="studio-round-action" disabled={!canRedo} onClick={redo} title="Refazer (Ctrl+Y)" aria-label="Refazer" type="button"><Icon name="redo" /></button>
          </div>
          <nav className="studio-tool-list" aria-label="Ferramentas da cena">
            {studioTools.map((tool) => <button className={`studio-tool-button${activeTool === tool.id ? ' active' : ''}`} key={tool.id} onClick={() => { setActiveTool(tool.id); setInspectorOpen(true); setInspectorTab('editor') }} type="button"><Icon name={tool.icon} /><span>{tool.label}</span><i aria-hidden="true">✦</i></button>)}
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
              {inspectorTab === 'editor' ? <div className="studio-inspector-content">{propertyPanel()}</div> : <div className="studio-inspector-content">{inspectorCustomView === 'presets' ? presetsPanel() : customPanel()}</div>}
            </aside>}
          </div>
        </section>
        {!fullView && <aside className="studio-editor-rail studio-editor-right" aria-label="Elenco do Editor V6">{castPanel()}</aside>}
        {!fullView && <Profiler id="/editor-v6/timeline" onRender={recordUiCommit}><EditorV6Timeline key={activeEditorV6.id} document={activeEditorV6} playing={isPlaying} selectedId={selectedTimelineBlockId}
          onSeek={(frame) => { if (dragRef.current) cancelSceneDrag(); pausePlayback(); publishPlayheadFrame(frame) }} onPlay={toggleTimelinePlayback} onChange={changeScene}
          onSelect={(block) => { setSelectedTimelineBlockId(block.id); setSelectedElementId(block.background ? 'background' : block.elementId ?? null); setActiveTool(block.background ? 'background' : null); setInspectorOpen(true); if (block.state?.kind === 'character') restoreCharacterInspectorView(); else setInspectorTab('editor') }} /></Profiler> }
        <EditorV6ExportPanel key={`export-${activeEditorV6.id}`} project={activeEditorV6} open={exportOpen} onClose={() => setExportOpen(false)} onChange={(update) => patchStudio(update, false)} />
        {videoPickerOpen && <EditorV6VideoPickerModal onClose={() => setVideoPickerOpen(false)} onSelect={linkVideoLibraryItem} />}
        {castPickerOpen && <div className="studio-cast-modal-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && !savingCast) setCastPickerOpen(false) }}>
          <section className="studio-cast-modal" role="dialog" aria-modal="true" aria-labelledby="studio-cast-modal-title">
            <header><span><small>EDITAR ELENCO</small><h2 id="studio-cast-modal-title">Personagens do Editor V6</h2></span><button className="studio-cast-modal-close" onClick={() => setCastPickerOpen(false)} aria-label="Fechar" disabled={savingCast} type="button">×</button></header>
            <div className="studio-cast-modal-summary"><strong>Escolha os personagens</strong><span>{castSelection.length} selecionado{castSelection.length === 1 ? '' : 's'}</span></div>
            <div className="studio-cast-modal-list">
              {availableCharacters.length ? availableCharacters.map((character) => {
                const selected = castSelection.includes(character.id)
                return <button className={`studio-cast-modal-option${selected ? ' selected' : ''}`} key={character.id} onClick={() => setCastSelection((current) => selected ? current.filter((id) => id !== character.id) : [...current, character.id])} disabled={savingCast} type="button">
                  <CharacterPortrait character={character} /><strong>{character.name}</strong><i>{selected ? '✓' : '+'}</i>
                </button>
              }) : <p className="studio-cast-modal-empty">Crie personagens em Customizar para adicioná-los ao elenco.</p>}
            </div>
            <footer><button className="studio-cast-modal-cancel" onClick={() => setCastPickerOpen(false)} disabled={savingCast} type="button">Cancelar</button><button className="studio-cast-modal-save" onClick={() => void saveCastSelection()} disabled={savingCast} type="button">{savingCast ? 'Salvando…' : 'Salvar elenco'}</button></footer>
          </section>
        </div>}
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
            <header className="studio-card-heading"><button className="studio-card-open" onClick={() => { setSelectedId(studio.id); setActiveStudioId(studio.id) }} aria-label={`Abrir ${studio.title}`} type="button">{studio.title}</button><div className="studio-card-actions"><button className="studio-card-action" onClick={() => void duplicateStudio(studio)} aria-label={`Duplicar ${studio.title}`} title={`Duplicar ${studio.title}`} type="button"><span className="studio-duplicate-icon" aria-hidden="true">▢</span></button><button className="studio-card-action danger" onClick={() => void deleteStudio(studio)} aria-label={`Excluir ${studio.title}`} title={`Excluir ${studio.title}`} type="button"><Icon name="trash" /></button></div></header>
            <button className="studio-cover" style={{ backgroundColor: studio.color, ...(studio.thumbnailDataUrl ? { backgroundImage: `url(${studio.thumbnailDataUrl})` } : {}) }} onClick={() => { setSelectedId(studio.id); setActiveStudioId(studio.id) }} aria-label={`Abrir ${studio.title}`} type="button" />
          </article>)}
        </section>
      ) : <section className="studio-empty-state"><span><Icon name="camera" /></span><strong>Nenhum projeto criado</strong><small>Crie um projeto para começar.</small></section>}
    </main>
  )
}

function StudioNumericControl({ label, value, onChange, onStart, onFinish, disabled, min, max, suffix }: {
  label: string
  value: number
  onChange: (value: number, record?: boolean) => void
  onStart: () => void
  onFinish?: () => void
  disabled: boolean
  min: number
  max: number
  suffix: string
}) {
  const format = (number: number) => String(Number(number.toFixed(1)))
  const [draft, setDraft] = useState(() => format(value))

  useEffect(() => { setDraft(format(value)) }, [value])

  const commit = () => {
    const parsed = Number(draft)
    if (!draft.trim() || !Number.isFinite(parsed)) {
      setDraft(format(value))
      return
    }
    const next = Math.min(max, Math.max(min, parsed))
    setDraft(format(next))
    if (next !== value) { onStart(); onChange(next, false); onFinish?.() }
  }

  return <div className="studio-control">
    <span>{label}</span>
    <input
      type="number"
      inputMode="decimal"
      value={draft}
      min={min}
      max={max}
      step="0.1"
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); commit() }
        if (event.key === 'Escape') { setDraft(format(value)) }
      }}
      aria-label={label}
    />
    <small>{suffix}</small>
    <input
      className="studio-control-range"
      type="range"
      min={min}
      max={max}
      step="0.1"
      value={Math.min(max, Math.max(min, value))}
      disabled={disabled}
      onPointerDown={onStart}
      onPointerUp={() => onFinish?.()}
      onPointerCancel={() => onFinish?.()}
      onKeyDown={(event) => { if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') onStart() }}
      onKeyUp={() => onFinish?.()}
      onChange={(event) => { const next = Number(event.target.value); setDraft(format(next)); onChange(next, false) }}
      aria-label={`${label} pela barra`}
    />
  </div>
}

function ElementControls({ element, update, remove, control }: {
  element: EditorV6Element
  update: (values: Partial<EditorV6Element>, record?: boolean) => void
  remove: () => void
  control: (label: string, value: number, onChange: (value: number, record?: boolean) => void, min: number, max: number, suffix?: string) => ReactNode
}) {
  return <>
    <div className="studio-controls-grid">
      {control('X', element.x, (value, record) => update({ x: value }, record), -100, 100)}
      {control('Y', element.y, (value, record) => update({ y: value }, record), -100, 100)}
      {element.kind === 'character' && control('Scale', element.characterScale ?? 100, (value, record) => update({ characterScale: value }, record), 1, 300)}
      {element.kind === 'character'
        ? <>
          {control('Largura', element.characterWidthScale ?? 100, (value, record) => update({ characterWidthScale: value }, record), 1, 300)}
          {control('Altura', element.characterHeightScale ?? 100, (value, record) => update({ characterHeightScale: value }, record), 1, 300)}
        </>
        : <>
          {control('Largura', element.width, (value, record) => update({ width: value }, record), 1, 200)}
          {control('Altura', element.height, (value, record) => update({ height: value }, record), 1, 200)}
        </>}
      {control('Rotação', element.rotation, (value, record) => update({ rotation: value }, record), -180, 180, '°')}
    </div>
    {element.kind === 'character' && <small>A posição X e Y é compartilhada por todos os blocos deste personagem.</small>}
    {element.kind === 'character' && <button className="studio-side-primary studio-character-reset" type="button" onClick={() => update({ x: 0, y: 0, characterScale: 100, characterWidthScale: 100, characterHeightScale: 100, rotation: 0, flipX: false })}><Icon name="reset" />Restaurar ajustes</button>}
    {element.kind === 'character' && <div className="studio-layer-actions studio-character-actions"><button type="button" onClick={() => update({ flipX: !element.flipX })}><Icon name="flipHorizontal" />Espelhar personagem</button><button type="button" onClick={() => update({ zIndex: Math.max(0, element.zIndex - 1) })}>Para trás</button><button type="button" onClick={() => update({ zIndex: element.zIndex + 1 })}>Para frente</button></div>}
    {element.kind === 'image' && <div className="studio-layer-actions"><button type="button" onClick={() => update({ zIndex: element.zIndex + 1 })}>Para frente</button><button type="button" onClick={() => update({ zIndex: Math.max(0, element.zIndex - 1) })}>Para trás</button></div>}
    <button className="studio-side-danger" type="button" onClick={remove}><Icon name="trash" />Excluir da cena</button>
  </>
}
