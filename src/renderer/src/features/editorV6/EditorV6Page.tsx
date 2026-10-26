import { editorV6CharacterRenderKey, editorV6ElementSize } from '../../../../shared/editorV6SceneModel'
import { SerializedDocumentSaveQueue } from '../../../../shared/editorV6DocumentSave'
import { isPoseSnapshotForModel } from '../../../../shared/characterSourceContinuity'
import { useEditorV6Store } from './editorV6Store'
import { createEditorV6Timeline, syncEditorV6TimelineElements } from '../../../../shared/editorV6'
import { EditorV6Timeline } from './EditorV6Timeline'
import { addEditorV6ElementAtFrame, editEditorV6DocumentAtBlock, editorV6ClipAtFrame, normalizeEditorV6Timeline, pruneEditorV6TimelineSnapshots, repairEditorV6DuplicateAssets, resolveEditorV6ElementsAtFrame, timelineClips } from '../../../../shared/editorV6Timeline'
import { useEditorV6InspectorState } from './useEditorV6InspectorState'
import { trimTransparentImage, fitElementToTrim, faceRenderGeometry, type TrimmedImage } from '../../characters/characterGeometry'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { buildEditorV6ExpressionAppearance, buildEditorV6ExpressionTransforms, resolveEditorV6ExpressionBase, editorV6ExpressionCollection } from './expressionTransforms'
import { Icon } from '../../ui/components/Icon'
import { CharacterPortrait } from '../../ui/components/CharacterPortrait'
import { resolveEditorV6TalkMouthId } from '../../../../shared/editorV6'
import { fitEditorV6CharacterToStage } from '../../../../shared/editorV6CharacterGeometry'
import type { EditorV6Asset, EditorV6Document, EditorV6Element, EditorV6FaceMode, EditorV6FaceTransform, EditorV6FaceTransforms } from '../../../../shared/editorV6'
import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { FaceCatalogItem, FaceCatalogItemSummary, FaceExpressionEffects, FaceExpressionPreset, FaceExpressionPresetSummary, FaceSheetKind, FabricatorPoseSummary } from '../../../../shared/fabricator'
type EditorV6Card = EditorV6Document
type Tool = 'background' | 'objects' | null
type DragState = { id: string; pointerId: number; startX: number; startY: number; originalX: number; originalY: number; width: number; height: number }
const STORAGE_KEY = 'gacha-nymi-editor-v6-catalog-v1'
const EDITOR_V6_FACE_RENDER_VERSION = 7
const studioColor = (number: number) => `hsl(${(number * 137.508) % 360} 45% 78%)`
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

function makeCanvasPrint(studio: EditorV6Document, outputWidth = 1920, outputHeight = 1080, mimeType = 'image/png', frame = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const context = canvas.getContext('2d')
    if (!context) return reject(new Error('Não foi possível preparar a imagem do print.'))
    context.scale(outputWidth / 1920, outputHeight / 1080)
    context.fillStyle = studio.backgroundColor
    context.fillRect(0, 0, canvas.width, canvas.height)
    const load = (src: string) => new Promise<HTMLImageElement>((ok, fail) => {
      const image = new Image()
      image.onload = () => ok(image)
      image.onerror = () => fail(new Error('Uma imagem da cena não pôde ser carregada para o print.'))
      image.src = src
    })
    const drawImage = async (src: string, x: number, y: number, width: number, height: number, rotation: number, flipX = false) => {
      const image = await load(src)
      context.save()
      context.translate((50 + x) * 19.2, (50 + y) * 10.8)
      context.rotate(rotation * Math.PI / 180)
      if (flipX) context.scale(-1, 1)
      context.drawImage(image, -width * 9.6, -height * 5.4, width * 19.2, height * 10.8)
      context.restore()
    }
    const drawText = (element: EditorV6Element) => {
      const cx = (50 + element.x) * 19.2
      const cy = (50 + element.y) * 10.8
      const width = element.width * 19.2
      const height = element.height * 10.8
      context.save()
      context.translate(cx, cy)
      context.rotate(element.rotation * Math.PI / 180)
      context.fillStyle = element.kind === 'narrator' ? 'rgba(255,255,255,.90)' : 'rgba(255,250,253,.96)'
      context.strokeStyle = '#604b59'
      context.lineWidth = 4
      context.beginPath()
      context.roundRect(-width / 2, -height / 2, width, height, element.kind === 'narrator' ? 20 : height / 2)
      context.fill()
      context.stroke()
      context.fillStyle = '#352d35'
      context.font = `600 ${Math.max(22, Math.round(height * .3))}px sans-serif`
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      const words = element.text.split(/\s+/)
      const lines: string[] = []
      let line = ''
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word
        if (context.measureText(candidate).width > width - 36 && line) { lines.push(line); line = word } else line = candidate
      }
      if (line) lines.push(line)
      lines.slice(0, 5).forEach((value, index, values) => context.fillText(value, 0, (index - (values.length - 1) / 2) * Math.max(28, height * .32), width - 30))
      context.restore()
    }
    void (async () => {
      try {
        const bg = studio.assets.find((asset) => asset.id === studio.backgroundAssetId)
        if (bg) await drawImage(bg.dataUrl, studio.backgroundX, studio.backgroundY, studio.backgroundWidth, studio.backgroundHeight, studio.backgroundRotation)
        for (const element of resolveEditorV6ElementsAtFrame(studio, frame)) {
          if (element.kind === 'image' || element.kind === 'character') {
            const asset = studio.assets.find((item) => item.id === element.assetId)
            if (asset) {
              const size = editorV6ElementSize(element)
              await drawImage(asset.dataUrl, element.x, element.y, size.width, size.height, element.rotation, element.kind === 'character' && element.flipX === true)
            }
          } else drawText(element)
        }
        resolve(canvas.toDataURL(mimeType, mimeType === 'image/jpeg' ? 0.78 : undefined))
      } catch (reason) { reject(reason) }
    })()
  })
}

function makeStudioThumbnail(studio: EditorV6Document): Promise<string> {
  return makeCanvasPrint(studio, 480, 270, 'image/jpeg')
}

/** Layout do Editor V6. */
export function EditorV6Page() {
  const editorV6Projects = useEditorV6Store((state) => state.projects)
  const setEditorV6Projects = useEditorV6Store((state) => state.setProjects)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [availableCharacters, setAvailableCharacters] = useState<CustomizerCharacter[]>([])
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
  const [saved, setSaved] = useState(true)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [playheadFrame, setPlayheadFrame] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
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
  const editorV6FaceRendererRef = useRef<{ key: string; render: (appearance?: CustomizerFaceAppearance, transforms?: EditorV6FaceTransforms, effects?: FaceExpressionEffects, mode?: EditorV6FaceMode) => Promise<{ dataUrl: string; width: number; height: number }> } | null>(null)
  const saveGenerationRef = useRef(0)
  const studioSaveQueue = useRef(new SerializedDocumentSaveQueue())
  const expressionSaveSignatureRef = useRef<{ studioId: string; value: string } | null>(null)
  const normalizedStudioIdsRef = useRef(new Set<string>())
  const nextStudioNumber = useRef(1)
  const selectedEditorV6 = editorV6Projects.find((studio) => studio.id === selectedId) ?? null
  const activeEditorV6 = editorV6Projects.find((studio) => studio.id === activeEditorV6Id) ?? null
  const timelineDurationFrames = activeEditorV6?.timeline.durationFrames ?? 300
  const visibleTimelineElements = useMemo(() => activeEditorV6 ? resolveEditorV6ElementsAtFrame(activeEditorV6, playheadFrame) : [], [activeEditorV6, playheadFrame])
  useEffect(() => {
    if (!activeEditorV6 || new Set(activeEditorV6.assets.map((asset) => asset.id)).size === activeEditorV6.assets.length) return
    setEditorV6Projects((projects) => projects.map((project) => project.id === activeEditorV6.id ? repairEditorV6DuplicateAssets(project, selectedTimelineBlockId) : project))
    setSaved(false)
  }, [activeEditorV6, selectedTimelineBlockId])
  const selectedTimelineClip = activeEditorV6 ? timelineClips(activeEditorV6.timeline).find(({ block }) => block.id === selectedTimelineBlockId && block.elementId === selectedElementId)
    ?? (selectedElementId ? editorV6ClipAtFrame(activeEditorV6.timeline, selectedElementId, playheadFrame) : undefined) : undefined
  const selectedElement = selectedTimelineClip?.block.state ?? visibleTimelineElements.find((element) => element.id === selectedElementId)
    ?? activeEditorV6?.elements.find((element) => element.id === selectedElementId) ?? null
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
  const selectedBackgroundAsset = activeEditorV6?.assets.find((asset) => asset.id === activeEditorV6.backgroundAssetId) ?? null
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
    let cancelled = false
    void window.desktop.listCustomizerCharacters().then((characters) => {
      if (!cancelled) setAvailableCharacters(characters)
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o elenco de personagens.')
    })
    return () => { cancelled = true }
  }, [])

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
    setPlayheadFrame(0)
    setIsPlaying(false)
    setSelectedTimelineBlockId(null)
    setCanUndo(false)
    setCanRedo(false)
    setHistoryVersion((value) => value + 1)
    setSelectedElementId(null)
  }, [activeEditorV6Id])

  useEffect(() => {
    if (!isPlaying) return
    const initialFrame = playheadFrame
    const started = performance.now()
    let animation = 0
    const tick = (now: number) => {
      const frame = Math.min(timelineDurationFrames, initialFrame + Math.floor((now - started) * 30 / 1000))
      setPlayheadFrame(frame)
      if (frame >= timelineDurationFrames) setIsPlaying(false)
      else animation = requestAnimationFrame(tick)
    }
    animation = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animation)
  }, [isPlaying, timelineDurationFrames, activeEditorV6Id])

  useEffect(() => {
    if (!activeEditorV6 || normalizedStudioIdsRef.current.has(activeEditorV6.id)) return
    let cancelled = false
    const studioId = activeEditorV6.id
    void (async () => {
      const characterAssets = activeEditorV6.assets.filter((asset) => asset.category === 'character' && activeEditorV6.elements.some((element) => element.kind === 'character' && element.assetId === asset.id))
      const crops = await Promise.all(characterAssets.map(async (asset) => ({ assetId: asset.id, crop: await trimTransparentImage(asset.dataUrl) })))
      if (cancelled) return
      normalizedStudioIdsRef.current.add(studioId)
      const byAsset = new Map(crops.filter((entry): entry is { assetId: string; crop: TrimmedImage } => entry.crop !== null).map((entry) => [entry.assetId, entry.crop]))
      if (!byAsset.size) return
      setEditorV6Projects((current) => current.map((studio) => studio.id !== studioId ? studio : {
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
      }))
      setSaved(false)
    })()
    return () => { cancelled = true }
  }, [activeEditorV6])

  const allocateNumber = () => {
    const highest = editorV6Projects.reduce((max, studio) => Math.max(max, Number(studio.title.match(/^Editor V6\s+(\d+)/i)?.[1] ?? 0)), 0)
    const number = Math.max(nextStudioNumber.current, highest + 1)
    nextStudioNumber.current = number + 1
    return number
  }

  const createStudio = async () => {
    const number = allocateNumber()
    const now = new Date().toISOString()
    const studio: EditorV6Card = {
      schemaVersion: 1, id: crypto.randomUUID(), title: `Editor V6 ${String(number).padStart(2, '0')}`,
      color: studioColor(number), createdAt: now, updatedAt: now, backgroundColor: '#d7b5cd',
      backgroundAssetId: null, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100,
      backgroundRotation: 0, assets: [], elements: [], timeline: createEditorV6Timeline()
    }
    try {
      setError(null)
      await window.desktop.saveEditorV6Project(studio)
      setEditorV6Projects((current) => [...current, studio])
      setSelectedId(studio.id)
      setSaved(true)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível criar o projeto do Editor V6.') }
  }

  const duplicateStudio = async (source: EditorV6Card | null = selectedEditorV6) => {
    if (!source) return
    const number = allocateNumber()
    const now = new Date().toISOString()
    const duplicate: EditorV6Card = {
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
      ...duplicate.elements[index], assetId: element.assetId ? oldToNew.get(element.assetId) : undefined
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
          state: block.state ? { ...block.state, id: oldToNewElements.get(block.state.id) ?? block.state.id, assetId: block.state.assetId ? oldToNew.get(block.state.assetId) : undefined } : undefined
        }))
      }))
    }
    duplicate.backgroundAssetId = source.backgroundAssetId ? oldToNew.get(source.backgroundAssetId) ?? null : null
    try {
      setError(null)
      await window.desktop.saveEditorV6Project(duplicate)
      setEditorV6Projects((current) => [...current, duplicate])
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
          setEditorV6Projects((current) => current.map((studio) => studio.id === document.id && studio.updatedAt === document.updatedAt && studio.thumbnailDataUrl !== savedDocument.thumbnailDataUrl
            ? { ...studio, thumbnailDataUrl: savedDocument.thumbnailDataUrl }
            : studio))
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
    if (!activeEditorV6) return
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

  const patchStudio = (transform: (studio: EditorV6Document) => EditorV6Document) => {
    if (!activeEditorV6Id) return
    setEditorV6Projects((current) => current.map((studio) => {
      if (studio.id !== activeEditorV6Id) return studio
      const selected = timelineClips(studio.timeline).find(({ block }) => block.id === selectedTimelineBlockId && block.elementId === selectedElementId)
        ?? (selectedElementId ? editorV6ClipAtFrame(studio.timeline, selectedElementId, playheadFrame) : undefined)
      const next = editEditorV6DocumentAtBlock(studio, selected?.block.id ?? null, transform)
      return pruneEditorV6TimelineSnapshots({ ...next, timeline: normalizeEditorV6Timeline(next.timeline) })
    }))
    setSaved(false)
  }

  const recordHistory = () => {
    if (!activeEditorV6) return
    const history = useEditorV6Store.getState().record(activeEditorV6.id, activeEditorV6)
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
    patchStudio(() => document)
    setCanUndo(Boolean(history?.undo.length))
    setCanRedo(true)
    setHistoryVersion(value => value + 1)
  }

  const redo = () => {
    if (!activeEditorV6) return
    const document = useEditorV6Store.getState().redo(activeEditorV6.id, activeEditorV6)
    if (!document) return
    const history = useEditorV6Store.getState().histories[activeEditorV6.id]
    patchStudio(() => document)
    setCanUndo(Boolean(history?.undo.length))
    setCanRedo(Boolean(history?.redo.length))
    setHistoryVersion(value => value + 1)
  }

  const importImage = async (category: EditorV6Asset['category']) => {
    if (!activeEditorV6) return
    setIsPlaying(false)
    if (category !== 'background' && activeEditorV6.timeline.tracks.some((track) => track.kind === 'video' && track.locked)) { setError('Desbloqueie a faixa Vídeo para adicionar uma imagem.'); return }
    try {
      const asset = await window.desktop.importEditorV6Image(category)
      if (!asset) return
      const studioAtImport = activeEditorV6
      let nextStudio: EditorV6Document = category === 'background'
        ? { ...studioAtImport, assets: [...studioAtImport.assets, asset], backgroundAssetId: asset.id, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, updatedAt: new Date().toISOString() }
        : {
            ...studioAtImport,
            assets: [...studioAtImport.assets, asset],
            elements: [...studioAtImport.elements, {
              id: crypto.randomUUID(), kind: 'image', assetId: asset.id, text: '', x: 0, y: 0, width: 25, height: 25, rotation: 0,
              zIndex: Math.max(0, ...studioAtImport.elements.map((item) => item.zIndex)) + 1
            }],
            updatedAt: new Date().toISOString()
          }

      if (category !== 'background') nextStudio = addEditorV6ElementAtFrame(nextStudio, nextStudio.elements.at(-1)!, playheadFrame)
      nextStudio = { ...nextStudio, timeline: normalizeEditorV6Timeline(syncEditorV6TimelineElements(nextStudio.timeline, nextStudio.elements)) }
      // Persist imported image bytes and their manifest before showing the asset as saved.
      await window.desktop.saveEditorV6Project(nextStudio)
      if (activeEditorV6Id === studioAtImport.id) {
        recordHistory()
        setEditorV6Projects((current) => current.map((studio) => studio.id === studioAtImport.id ? nextStudio : studio))
        setSaved(true)
      }
      if (category === 'background') {
        setSelectedElementId('background')
      } else {
        setSelectedElementId(nextStudio.elements.at(-1)?.id ?? null)
        setSelectedTimelineBlockId(editorV6ClipAtFrame(nextStudio.timeline, nextStudio.elements.at(-1)!.id, playheadFrame)?.block.id ?? null)
      }
      setActiveTool(category === 'background' ? 'background' : 'objects')
      setInspectorOpen(true)
      setInspectorTab('editor')
      setError(null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível importar a imagem.') }
  }

  const selectBackground = (asset: EditorV6Asset) => {
    changeScene((studio) => ({ ...studio, backgroundAssetId: asset.id, backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0, updatedAt: new Date().toISOString() }))
    setSelectedElementId('background')
    setInspectorOpen(true)
    setInspectorTab('editor')
  }

  const addTextElement = (kind: 'narrator' | 'speech' | 'thought') => {
    if (!activeEditorV6) return
    setIsPlaying(false)
    if (activeEditorV6.timeline.tracks.some((track) => track.kind === (kind === 'narrator' ? 'video' : kind) && track.locked)) { setError('Desbloqueie a faixa para adicionar um bloco.'); return }
    const element = makeElement(kind, Math.max(0, ...activeEditorV6.elements.map((item) => item.zIndex)) + 1)
    const blockId = crypto.randomUUID()
    changeScene((studio) => ({ ...addEditorV6ElementAtFrame(studio, element, playheadFrame, blockId), updatedAt: new Date().toISOString() }))
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
      const { renderSavedCharacter } = await import('../../characters/editorV6CharacterRenderer')
      const assets: EditorV6Asset[] = []
      const elements: EditorV6Element[] = []
      const stageWidth = sceneRef.current?.clientWidth ?? 1000
      const stageHeight = sceneRef.current?.clientHeight ?? 562
      let zIndex = Math.max(0, ...retained.map((item) => item.zIndex))
      for (const character of additions) {
        const rendered = await renderSavedCharacter(character, undefined, undefined, 'idle')
        const crop = await trimTransparentImage(rendered.dataUrl)
        const imageData = crop?.dataUrl ?? rendered.dataUrl
        const imageWidth = crop?.width ?? rendered.width
        const imageHeight = crop?.height ?? rendered.height
        const referenceCharacter = character.customization.poseSlot === null ? character : { ...character, customization: { ...character.customization, poseSlot: null } }
        const referenceRendered = referenceCharacter === character ? rendered : await renderSavedCharacter(referenceCharacter, undefined, undefined, 'idle')
        const referenceCrop = referenceCharacter === character ? crop : await trimTransparentImage(referenceRendered.dataUrl)
        const referenceWidth = referenceCrop?.width ?? referenceRendered.width
        const referenceHeight = referenceCrop?.height ?? referenceRendered.height
        const asset: EditorV6Asset = { id: crypto.randomUUID(), category: 'character', name: character.name, mimeType: 'image/png', dataUrl: imageData }
        const { width, height, characterCanvasWidth } = fitEditorV6CharacterToStage(referenceRendered, { width: referenceWidth, height: referenceHeight }, rendered, { width: imageWidth, height: imageHeight }, stageWidth, stageHeight)
        assets.push(asset)
        elements.push({ id: crypto.randomUUID(), kind: 'character', assetId: asset.id, characterId: character.id, characterSourceUpdatedAt: character.updatedAt, faceRendererVersion: EDITOR_V6_FACE_RENDER_VERSION, activeExpressionCollectionId: 'standard', activeExpressionPresetId: null, activeFaceMode: 'idle', characterScale: 100, characterWidthScale: 100, characterHeightScale: 100, ...(character.customization.faceAppearance ? { expressionBase: { appearance: structuredClone(character.customization.faceAppearance), transforms: {} } } : {}), characterCanvasWidth, text: character.name, x: 0, y: 0, width, height, rotation: 0, zIndex: ++zIndex })
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
      const key = editorV6CharacterRenderKey(characterCopy)
      if (!editorV6FaceRendererRef.current || editorV6FaceRendererRef.current.key !== key) {
        const { prepareSavedCharacterRenderer } = await import('../../characters/editorV6CharacterRenderer')
        const renderer = await prepareSavedCharacterRenderer(characterCopy)
        editorV6FaceRendererRef.current = { key, render: renderer.render }
      }
      const activeEffects = expressionState && Object.hasOwn(expressionState, 'activeExpressionEffects') ? expressionState.activeExpressionEffects : selectedElement.activeExpressionEffects
      const faceMode = expressionState && Object.hasOwn(expressionState, 'activeFaceMode') ? expressionState.activeFaceMode : selectedElement.activeFaceMode
      const rendered = await editorV6FaceRendererRef.current.render(appearance, faceTransforms, activeEffects, faceMode)
      const trimmed = await trimTransparentImage(rendered.dataUrl)
      const studioDataUrl = trimmed?.dataUrl ?? rendered.dataUrl
      const elementId = selectedElement.id
      const assetId = selectedElement.assetId
      const update = (studio: EditorV6Document): EditorV6Document => ({
        ...studio,
        elements: studio.elements.map((element) => element.id === elementId ? { ...element, ...expressionState, faceRendererVersion: EDITOR_V6_FACE_RENDER_VERSION, ...faceRenderGeometry(element, rendered, trimmed, sceneRef.current?.clientWidth ?? 1000, sceneRef.current?.clientHeight ?? 562), faceAppearance: appearance, faceTransforms, characterSourceUpdatedAt: selectedEditorV6Character.updatedAt } : element),
        assets: studio.assets.map((asset) => asset.id === assetId ? { ...asset, dataUrl: studioDataUrl, mimeType: 'image/png' } : asset),
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
      const { renderSavedCharacter } = await import('../../characters/editorV6CharacterRenderer')
      let characterCanvasWidth = selectedElement.characterCanvasWidth
      if (!characterCanvasWidth) {
        const currentPoseCharacter: CustomizerCharacter = { ...selectedEditorV6Character, customization: { ...selectedEditorV6Character.customization, poseSlot: selectedElement.poseSlot === undefined ? selectedEditorV6Character.customization.poseSlot : selectedElement.poseSlot, faceAppearance: selectedElement.faceAppearance ?? selectedEditorV6Character.customization.faceAppearance } }
        const currentRendered = await renderSavedCharacter(currentPoseCharacter, selectedElement.faceTransforms, selectedElement.activeExpressionEffects, selectedElement.activeFaceMode)
        const currentCrop = await trimTransparentImage(currentRendered.dataUrl)
        characterCanvasWidth = selectedElement.width * currentRendered.width / (currentCrop?.width ?? currentRendered.width)
      }
      const characterCopy: CustomizerCharacter = { ...selectedEditorV6Character, customization: { ...selectedEditorV6Character.customization, poseSlot, faceAppearance: selectedElement.faceAppearance ?? selectedEditorV6Character.customization.faceAppearance } }
      const rendered = await renderSavedCharacter(characterCopy, selectedElement.faceTransforms, selectedElement.activeExpressionEffects, selectedElement.activeFaceMode)
      const trimmed = await trimTransparentImage(rendered.dataUrl)
      const dataUrl = trimmed?.dataUrl ?? rendered.dataUrl
      const cropWidth = trimmed?.width ?? rendered.width
      const cropHeight = trimmed?.height ?? rendered.height
      const stageWidth = sceneRef.current?.clientWidth ?? 1000
      const stageHeight = sceneRef.current?.clientHeight ?? 562
      const fullCanvasHeight = characterCanvasWidth * stageWidth / stageHeight * rendered.height / rendered.width
      const width = characterCanvasWidth * cropWidth / rendered.width
      const height = fullCanvasHeight * cropHeight / rendered.height
      const elementId = selectedElement.id
      const assetId = selectedElement.assetId
      changeScene((studio) => ({
        ...studio,
        elements: studio.elements.map((element) => element.id === elementId ? { ...element, poseSlot, characterCanvasWidth, width, height, characterSourceUpdatedAt: selectedEditorV6Character.updatedAt } : element),
        assets: studio.assets.map((asset) => asset.id === assetId ? { ...asset, dataUrl, mimeType: 'image/png' } : asset),
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
        const key = editorV6CharacterRenderKey(job.character)
        try {
          if (!editorV6FaceRendererRef.current || editorV6FaceRendererRef.current.key !== key) {
            const { prepareSavedCharacterRenderer } = await import('../../characters/editorV6CharacterRenderer')
            const renderer = await prepareSavedCharacterRenderer(job.character)
            if (version !== editorV6FaceRenderVersionRef.current) continue
            editorV6FaceRendererRef.current = { key, render: renderer.render }
          }
          const element = selectedElement?.id === job.elementId ? selectedElement : activeEditorV6?.elements.find((candidate) => candidate.id === job.elementId)
          const rendered = await editorV6FaceRendererRef.current.render(job.character.customization.faceAppearance, editorV6FaceTransformsRef.current[job.elementId] ?? job.transforms, element?.activeExpressionEffects, element?.activeFaceMode)
          const trimmed = await trimTransparentImage(rendered.dataUrl)
          const studioDataUrl = trimmed?.dataUrl ?? rendered.dataUrl
          if (version === editorV6FaceRenderVersionRef.current && job.studioId === activeEditorV6Id) {
            patchStudio((studio) => ({
              ...studio,
              elements: studio.elements.map((element) => element.id === job.elementId ? { ...element, faceRendererVersion: EDITOR_V6_FACE_RENDER_VERSION, ...faceRenderGeometry(element, rendered, trimmed, sceneRef.current?.clientWidth ?? 1000, sceneRef.current?.clientHeight ?? 562) } : element),
              assets: studio.assets.map((asset) => asset.id === job.assetId ? { ...asset, dataUrl: studioDataUrl, mimeType: 'image/png' } : asset),
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

  const updateBackground = (values: Partial<Pick<EditorV6Document, 'backgroundColor' | 'backgroundX' | 'backgroundY' | 'backgroundWidth' | 'backgroundHeight' | 'backgroundRotation'>>, record = true) => {
    const update = (studio: EditorV6Document) => ({ ...studio, ...values, updatedAt: new Date().toISOString() })
    if (record) changeScene(update)
    else patchStudio(update)
  }

  const startDrag = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (!activeEditorV6 || !sceneRef.current) return
    event.preventDefault()
    event.stopPropagation()
    if (id === 'background') {
      const rect = sceneRef.current.getBoundingClientRect()
      recordHistory()
      setSelectedElementId('background')
      setActiveTool('background')
      setInspectorOpen(true)
      setInspectorTab('editor')
      dragRef.current = { id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originalX: activeEditorV6.backgroundX, originalY: activeEditorV6.backgroundY, width: rect.width, height: rect.height }
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    setIsPlaying(false)
    const element = visibleTimelineElements.find((item) => item.id === id) ?? activeEditorV6.elements.find((item) => item.id === id)
    if (!element) return
    setSelectedTimelineBlockId(editorV6ClipAtFrame(activeEditorV6.timeline, id, playheadFrame)?.block.id ?? null)
    if (element.kind === 'character' && element.positionLocked) {
      setSelectedElementId(id)
      setActiveTool(null)
      setInspectorOpen(true)
      restoreCharacterInspectorView()
      return
    }
    const rect = sceneRef.current.getBoundingClientRect()
    recordHistory()
    setSelectedElementId(id)
    setActiveTool(null)
    setInspectorOpen(true)
    if (element.kind === 'character') restoreCharacterInspectorView()
    else setInspectorTab('editor')
    dragRef.current = { id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originalX: element.x, originalY: element.y, width: rect.width, height: rect.height }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const x = drag.originalX + (event.clientX - drag.startX) / drag.width * 100
    const y = drag.originalY + (event.clientY - drag.startY) / drag.height * 100
    if (drag.id === 'background') patchStudio((studio) => ({ ...studio, backgroundX: x, backgroundY: y, updatedAt: new Date().toISOString() }))
    else updateElement(drag.id, { x, y }, false)
  }

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
  }

  const deleteSelected = () => {
    if (!activeEditorV6) return
    if (selectedElementId === 'background') {
      changeScene((studio) => ({ ...studio, backgroundAssetId: null, updatedAt: new Date().toISOString() }))
      setSelectedElementId(null)
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
      setEditorV6Projects((current) => current.filter((studio) => studio.id !== target.id))
      setSelectedId((current) => current === target.id ? null : current)
      setSaved(true)
      setError(null)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o projeto do Editor V6.') }
  }

  const leaveStudio = async () => {
    if (!await saveStudio(activeEditorV6)) return
    setActiveStudioId(null)
    setActiveTool(null)
    setSelectedElementId(null)
    setFullView(false)
  }

  const exportPrint = async () => {
    if (!activeEditorV6) return
    try {
      if (!await saveStudio(activeEditorV6)) return
      const image = await makeCanvasPrint(activeEditorV6, 1920, 1080, 'image/png', playheadFrame)
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
      if (event.key === 'Escape' && castPickerOpen && !savingCast) setCastPickerOpen(false)
      else if (event.key === 'Escape' && fullView) setFullView(false)
      if (event.target instanceof HTMLElement && event.target.closest('input,textarea,select,[contenteditable=true]')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo() }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [castPickerOpen, savingCast, fullView, activeEditorV6, historyVersion])

  const imageStyle = (x: number, y: number, width: number, height: number, rotation: number, flipX = false) => ({
    left: `calc(50% + ${x}%)`, top: `calc(50% + ${y}%)`, width: `${width}%`, height: `${height}%`,
    transform: `translate(-50%, -50%) rotate(${rotation}deg) scaleX(${flipX ? -1 : 1})`
  })

  const control = (label: string, value: number, onChange: (value: number, record?: boolean) => void, min: number, max: number, suffix = '%', onFinish?: () => void, disabled = false) => (
    <StudioNumericControl key={label} label={label} value={value} onChange={onChange} onStart={recordHistory} onFinish={onFinish} disabled={disabled} min={min} max={max} suffix={suffix} />
  )

  const propertyPanel = (): ReactNode => {
    if (!activeEditorV6) return null
    if (activeTool === 'background') return <div className="studio-side-content">
      <h2>Fundos</h2><p>Escolha um fundo salvo ou adicione uma imagem.</p>
      <label className="studio-color-control">Cor sólida<input type="color" value={activeEditorV6.backgroundColor} onChange={(event) => updateBackground({ backgroundColor: event.target.value })} /></label>
      <button className="studio-side-primary" type="button" onClick={() => void importImage('background')}><Icon name="plus" />Adicionar imagem</button>
      <div className="studio-asset-grid">{activeEditorV6.assets.filter((asset) => asset.category === 'background').map((asset) => <button key={asset.id} className={`studio-asset-card${activeEditorV6.backgroundAssetId === asset.id ? ' active' : ''}`} type="button" onClick={() => selectBackground(asset)}><img src={asset.dataUrl} alt="" /><span>{asset.name}</span></button>)}</div>
      {selectedBackgroundAsset && selectedElementId === 'background' && <><div className="studio-controls-grid">{control('X', activeEditorV6.backgroundX, (value, record) => updateBackground({ backgroundX: value }, record), -100, 100)}{control('Y', activeEditorV6.backgroundY, (value, record) => updateBackground({ backgroundY: value }, record), -100, 100)}{control('Largura', activeEditorV6.backgroundWidth, (value, record) => updateBackground({ backgroundWidth: value }, record), 1, 300)}{control('Altura', activeEditorV6.backgroundHeight, (value, record) => updateBackground({ backgroundHeight: value }, record), 1, 300)}{control('Rotação', activeEditorV6.backgroundRotation, (value, record) => updateBackground({ backgroundRotation: value }, record), -180, 180, '°')}</div><button className="studio-side-danger" type="button" onClick={deleteSelected}><Icon name="trash" />Remover fundo da cena</button></>}
    </div>
    if (activeTool === 'objects') return <div className="studio-side-content">
      <h2>Objetos</h2><p>Imagens importadas ficam disponíveis neste Studio.</p>
      <button className="studio-side-primary" type="button" onClick={() => void importImage('object')}><Icon name="plus" />Importar imagem</button>
      <div className="studio-asset-grid">{activeEditorV6.assets.filter((asset) => asset.category === 'object').map((asset) => <button key={asset.id} className="studio-asset-card" type="button" onClick={() => {
        if (activeEditorV6.timeline.tracks.some((track) => track.kind === 'video' && track.locked)) { setError('Desbloqueie a faixa Vídeo para adicionar uma imagem.'); return }
        const element: EditorV6Element = { id: crypto.randomUUID(), kind: 'image', assetId: asset.id, text: '', x: 0, y: 0, width: 25, height: 25, rotation: 0, zIndex: Math.max(0, ...activeEditorV6.elements.map((item) => item.zIndex)) + 1 }
        const blockId = crypto.randomUUID()
        changeScene((studio) => ({ ...addEditorV6ElementAtFrame(studio, element, playheadFrame, blockId), updatedAt: new Date().toISOString() }))
        setSelectedElementId(element.id)
        setSelectedTimelineBlockId(blockId)
        setInspectorOpen(true)
        setInspectorTab('editor')
      }}><img src={asset.dataUrl} alt="" /><span>{asset.name}</span></button>)}</div>
      {selectedElementId && selectedElement && <ElementControls element={selectedElement} update={(values, record) => updateElement(selectedElement.id, values, record)} remove={deleteSelected} control={control} />}
    </div>
    if (selectedElement && activeEditorV6) return <div className="studio-side-content">
      <h2>{selectedElement.kind === 'character' ? selectedElement.text : selectedElement.kind === 'image' ? 'Objeto selecionado' : selectedElement.kind === 'narrator' ? 'Narrador' : selectedElement.kind === 'speech' ? 'Balão de fala' : 'Balão de pensamento'}</h2>
      {selectedElement.kind !== 'image' && selectedElement.kind !== 'character' && <label className="studio-text-control">Texto<textarea value={selectedElement.text} onChange={(event) => updateElement(selectedElement.id, { text: event.target.value })} rows={3} /></label>}
      <ElementControls element={selectedElement} update={(values, record) => updateElement(selectedElement.id, values, record)} remove={deleteSelected} control={control} />
    </div>
    if (selectedElementId === 'background' && selectedBackgroundAsset) return <div className="studio-side-content">
      <h2>Imagem de fundo</h2><p>{selectedBackgroundAsset.name}</p>
      <div className="studio-controls-grid">{control('X', activeEditorV6.backgroundX, (value, record) => updateBackground({ backgroundX: value }, record), -100, 100)}{control('Y', activeEditorV6.backgroundY, (value, record) => updateBackground({ backgroundY: value }, record), -100, 100)}{control('Largura', activeEditorV6.backgroundWidth, (value, record) => updateBackground({ backgroundWidth: value }, record), 1, 300)}{control('Altura', activeEditorV6.backgroundHeight, (value, record) => updateBackground({ backgroundHeight: value }, record), 1, 300)}{control('Rotação', activeEditorV6.backgroundRotation, (value, record) => updateBackground({ backgroundRotation: value }, record), -180, 180, '°')}</div>
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
          <button className="studio-cast-select" onClick={() => { setIsPlaying(false); setSelectedElementId(element.id); setSelectedTimelineBlockId(editorV6ClipAtFrame(activeEditorV6!.timeline, element.id, playheadFrame)?.block.id ?? null); setActiveTool(null); setInspectorOpen(true); restoreCharacterInspectorView() }} type="button">
            {character ? <CharacterPortrait character={character} /> : <span className="studio-cast-fallback">{element.text.slice(0, 1)}</span>}
            <span>{firstName}</span>
          </button>
          <button className="studio-cast-remove" onClick={() => removeStageCharacter(element)} aria-label={`Remover ${firstName} do elenco`} title="Remover da cena" type="button">×</button>
        </article>
      }) : <p className="studio-cast-empty">Adicione personagens para montar a cena.</p>}
    </section>
  </div>

  const toggleTimelinePlayback = () => {
    if (isPlaying) { setIsPlaying(false); return }
    if (playheadFrame >= timelineDurationFrames) setPlayheadFrame(0)
    setIsPlaying(true)
  }

  if (activeEditorV6) {
    const backgroundAsset = activeEditorV6.assets.find((asset) => asset.id === activeEditorV6.backgroundAssetId)
    const inspectorWidth = sceneRef.current ? Math.min(38, 276 / sceneRef.current.clientWidth * 100) : 28
    const selectedBounds = selectedElement
      ? { left: 50 + selectedElement.x - editorV6ElementSize(selectedElement).width / 2, right: 50 + selectedElement.x + editorV6ElementSize(selectedElement).width / 2 }
      : selectedElementId === 'background'
        ? { left: 50 + activeEditorV6.backgroundX - activeEditorV6.backgroundWidth / 2, right: 50 + activeEditorV6.backgroundX + activeEditorV6.backgroundWidth / 2 }
        : null
    const inspectorSide = selectedBounds?.right !== undefined && selectedBounds.right > 100 - inspectorWidth
      ? 'left'
      : selectedBounds?.left !== undefined && selectedBounds.left < inspectorWidth ? 'right' : 'right'
    return (
      <main className={`studio-editor${fullView ? ' full-view' : ''}`} aria-label={`Editor do ${activeEditorV6.title}`}>
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
            <button className="studio-tool-button" onClick={() => addTextElement('speech')} type="button"><Icon name="message" /><span>Fala</span><i aria-hidden="true">✦</i></button>
            <button className="studio-tool-button" onClick={() => addTextElement('thought')} type="button"><Icon name="face" /><span>Pensamento</span><i aria-hidden="true">✦</i></button>
            <span className="studio-tool-separator" />
            <button className="studio-tool-button" onClick={() => void exportPrint()} type="button"><Icon name="download" /><span>Print</span><i aria-hidden="true">✦</i></button>
            <button className="studio-tool-button" onClick={() => void openPrints()} type="button"><Icon name="folder" /><span>Pasta</span><i aria-hidden="true">✦</i></button>
            <button className="studio-tool-button studio-view-button" onClick={() => setFullView(true)} type="button"><Icon name="expand" /><span>View</span></button>
          </nav>
          <small className={`studio-save-indicator${saved ? '' : ' unsaved'}`}><i />{saved ? 'Salvo automaticamente' : 'Salvando alterações…'}</small>
          {error && <small className="studio-error-message" role="alert">{error}</small>}
          {notice && <small className="studio-save-notice" role="status">{notice}</small>}
        </aside>}
        <section className="studio-scene-area" aria-label="Prévia da cena">
          <div className="studio-scene-canvas" ref={sceneRef} style={{ backgroundColor: activeEditorV6.backgroundColor }} onPointerDown={() => setSelectedElementId(null)}>
            {backgroundAsset && <img className={`studio-canvas-background${selectedElementId === 'background' && !fullView ? ' selected' : ''}`} src={backgroundAsset.dataUrl} alt="" style={imageStyle(activeEditorV6.backgroundX, activeEditorV6.backgroundY, activeEditorV6.backgroundWidth, activeEditorV6.backgroundHeight, activeEditorV6.backgroundRotation)} onPointerDown={(event) => startDrag(event, 'background')} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} />}
            {[...visibleTimelineElements].sort((a, b) => a.zIndex - b.zIndex).map((element) => {
              const asset = element.assetId ? activeEditorV6.assets.find((item) => item.id === element.assetId) : undefined
              const size = editorV6ElementSize(element)
              return <div key={element.id} className={`studio-canvas-element studio-element-${element.kind}${selectedElementId === element.id && !fullView ? ' selected' : ''}`} style={{ ...imageStyle(element.x, element.y, size.width, size.height, element.rotation, element.kind === 'character' && element.flipX === true), zIndex: element.zIndex + 1 }} onPointerDown={(event) => startDrag(event, element.id)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
                {(element.kind === 'image' || element.kind === 'character') && asset ? <img src={asset.dataUrl} alt={asset.name} draggable={false} /> : <span>{element.text}</span>}
              </div>
            })}
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
        {!fullView && <EditorV6Timeline key={activeEditorV6.id} document={activeEditorV6} frame={playheadFrame} playing={isPlaying} selectedId={selectedTimelineBlockId}
          onSeek={(frame) => { setIsPlaying(false); setPlayheadFrame(frame) }} onPlay={toggleTimelinePlayback} onChange={changeScene}
          onSelect={(block) => { setSelectedTimelineBlockId(block.id); setSelectedElementId(block.elementId ?? null); setActiveTool(null); setInspectorOpen(true); if (block.state?.kind === 'character') restoreCharacterInspectorView(); else setInspectorTab('editor') }} /> }
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
    {element.kind === 'character' && <button className="studio-side-primary studio-character-reset" type="button" onClick={() => update({ x: 0, y: 0, characterScale: 100, characterWidthScale: 100, characterHeightScale: 100, rotation: 0, flipX: false })}><Icon name="reset" />Restaurar ajustes</button>}
    {element.kind === 'character' && <div className="studio-layer-actions studio-character-actions"><button type="button" onClick={() => update({ flipX: !element.flipX })}><Icon name="flipHorizontal" />Espelhar personagem</button><button type="button" onClick={() => update({ zIndex: Math.max(0, element.zIndex - 1) })}>Para trás</button><button type="button" onClick={() => update({ zIndex: element.zIndex + 1 })}>Para frente</button></div>}
    {element.kind === 'image' && <div className="studio-layer-actions"><button type="button" onClick={() => update({ zIndex: element.zIndex + 1 })}>Para frente</button><button type="button" onClick={() => update({ zIndex: Math.max(0, element.zIndex - 1) })}>Para trás</button></div>}
    <button className="studio-side-danger" type="button" onClick={remove}><Icon name="trash" />Excluir da cena</button>
  </>
}
