import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FabricatorAssetSave, FabricatorHistoryAction, FabricatorHistoryState, FabricatorProject, FabricatorSlotSummary, ModelPart } from '../../../../shared/fabricator'
import { Icon, type IconName } from '../../ui/components/Icon'
import { usePreviewBackground } from './usePreviewBackground'
import { autoConnectParts, normalizeLayerOrder, normalizePartAnchors, orderedParts, partJointAnchor, reorderLayer, sourcePointFromCanvas } from './models/rig'
import { connectFabricatorParts, isTorsoPart, moveFabricatorPartBranch, rotateFabricatorPartBranch, toggleFabricatorJointFixed } from './models/rigEditing'
import { headSizePercent, isHeadPart, resizeHeadPart } from './models/resize'
import { PoseWorkspace } from './PoseWorkspace'
import { WardrobeWorkspace } from './wardrobe/WardrobeWorkspace'
import { FaceComponentsWorkspace } from './face/FaceComponentsWorkspace'
import { HeadExtrasWorkspace } from './face/HeadExtrasWorkspace'
import { HairWorkspace } from './HairWorkspace'
import { AnimatorWorkspace } from './AnimatorWorkspace'
import { DesignWorkspace } from './DesignWorkspace'
import { ExpressionPresetWorkspace } from './ExpressionPresetWorkspace'
import { FaceAnimatorWorkspace } from './FaceAnimatorWorkspace'
import { ModelSourceEditor } from './ModelSourceEditor'
import { broadcastModelSourceUpdate } from './models/modelSourceEvents'
import { splitImage, mergeImages } from './models/partImages'
import { pngDataUrlFromBuffer } from './models/imageData'
import { paintSeamMixerSegment as applySeamMixerSegment, type SeamMixerSurface } from './models/seamMixer'
import { serializeFabricatorProject } from './models/projectSerialization'
import { persistFabricatorProjectSnapshot } from './projectPersistence'
import { useFabricatorHistory } from './useFabricatorHistory'
import { prepareLoadedFabricatorProject } from './models/projectHydration'
import { MAX_CHROMA_TOLERANCE, type ModelSourceResult } from './models/modelSource'
import { ModelSkinTonePicker } from './ModelSkinTonePicker'
import { ModelSkinContourEditor } from './ModelSkinContourEditor'
import { cachedModelBodyAppearancePreview } from './models/modelSkinTone'
import { connectBodyContourJoints } from './models/contourJoints'
import { isValidSkinTone } from '../../../../shared/skinTones'
import { ModelAppearanceProvider } from './ModelAppearanceContext'

const sections: { id: string; label: string; icon: IconName }[] = [
  { id: 'Modelos', label: 'Modelos Dev', icon: 'sparkles' }, { id: 'Poses', label: 'Poses Dev', icon: 'expand' }, { id: 'Roupas', label: 'Roupas Dev', icon: 'shirt' }, { id: 'Olhos', label: 'Olhos Dev', icon: 'face' }, { id: 'Rosto', label: 'Rosto Dev', icon: 'face' }, { id: 'Preset Expressão Dev', label: 'Preset Expressão Dev', icon: 'face' }, { id: 'Animador Rosto Dev', label: 'Animador Rosto Dev', icon: 'face' }, { id: 'Cabeças extra', label: 'Cabeças extra dev', icon: 'face' }, { id: 'Cabelos Dev', label: 'Cabelos Dev', icon: 'bow' }, { id: 'Animador Dev', label: 'Animador Dev', icon: 'body' }, { id: 'Design Dev', label: 'Design Dev', icon: 'flower' }
]

type ProcessedPart = Omit<ModelPart, 'dataUrl' | 'chromaBaseDataUrl'> & { png: ArrayBuffer; basePng: ArrayBuffer }
type ProcessorMessage =
  | { type: 'progress'; id: number; value: number }
  | { type: 'complete'; id: number; width: number; height: number; parts: ProcessedPart[] }
  | { type: 'error'; id: number; message: string }
type ChromaAdjustMessage =
  | { type: 'complete'; id: number; parts: Array<{ id: string; png: ArrayBuffer }> }
  | { type: 'error'; id: number; message: string }
type DragState = { partId: string; pointerId: number; x: number; y: number }
type AnchorDragState = { partId: string; pointerId: number; x: number; y: number; offsetX: number }
type PanState = { pointerId: number; x: number; y: number; originX: number; originY: number }
type MixerStrokeState = { pointerId: number; x: number; y: number }
type PanelTab = 'parts' | 'layers' | 'joints'

const DEFAULT_CHROMA_TOLERANCE = 74

export function FabricatorPage() {
  const [previewBackground] = usePreviewBackground()
  const [activeSection, setActiveSection] = useState('Modelos')
  const [slots, setSlots] = useState<FabricatorSlotSummary[]>(Array.from({ length: 10 }, () => null))
  const [slotsLoaded, setSlotsLoaded] = useState(false)
  const [slotSwitching, setSlotSwitching] = useState(false)
  const [activeSlot, setActiveSlot] = useState(1)
  const [project, setProject] = useState<FabricatorProject | null>(null)
  const [appearanceTargetSlot, setAppearanceTargetSlotState] = useState<number | null>(null)
  const [otherAppearanceProject, setOtherAppearanceProject] = useState<FabricatorProject | null>(null)
  const [appearanceSaveState, setAppearanceSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [appearanceSaveError, setAppearanceSaveError] = useState('')
  const [bodyAppearancePreviewUrls, setBodyAppearancePreviewUrls] = useState<Record<string, string>>({})
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [processing, setProcessing] = useState(false)
  const [chromaApplying, setChromaApplying] = useState(false)
  const [modelSourceOpen, setModelSourceOpen] = useState(false)
  const [skinContourEditorOpen, setSkinContourEditorOpen] = useState(false)
  const [modelSourcePublishing, setModelSourcePublishing] = useState(false)
  const [chromaValue, setChromaValue] = useState(DEFAULT_CHROMA_TOLERANCE)
  const [deletingSlot, setDeletingSlot] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [connectMode, setConnectMode] = useState(false)
  const [connectFromId, setConnectFromId] = useState<string | null>(null)
  const [contourConnecting, setContourConnecting] = useState(false)
  const [jointConnectMessage, setJointConnectMessage] = useState('')
  const [panelTab, setPanelTab] = useState<PanelTab>('parts')
  const [layerDragId, setLayerDragId] = useState<string | null>(null)
  const [showJointPivots, setShowJointPivots] = useState(true)
  const [mixerActive, setMixerActive] = useState(false)
  const [mixerPainting, setMixerPainting] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  const [renamingPartId, setRenamingPartId] = useState<string | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const projectRef = useRef<FabricatorProject | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const anchorDragRef = useRef<AnchorDragState | null>(null)
  const panRef = useRef<PanState | null>(null)
  const mixerStrokeRef = useRef<MixerStrokeState | null>(null)
  const mixerTouchedRef = useRef<Map<string, Uint8Array>>(new Map())
  const mixerSurfacesRef = useRef<Map<string, SeamMixerSurface>>(new Map())
  const mixerQueueRef = useRef<Promise<void>>(Promise.resolve())
  const mixerSessionRef = useRef(0)
  const layerDragRef = useRef<string | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const chromaWorkerRef = useRef<Worker | null>(null)
  const requestId = useRef(0)
  const slotSelectionGeneration = useRef(0)
  const dirtyAssets = useRef<Map<string, string>>(new Map())
  const dirtyChromaBases = useRef<Map<string, string>>(new Map())
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const appearanceSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingAppearanceSave = useRef<FabricatorProject | null>(null)
  const appearanceSaveQueue = useRef<Promise<unknown>>(Promise.resolve())
  const appearanceTargetRef = useRef<number | null>(null)
  const initialSlotLoad = useRef(false)
  const {
    history, historyBusy, clearHistory, replaceHistory,
    recordHistorySnapshot, startHistoryGesture, finishHistoryGesture,
    resetHistoryGesture, trackProjectChange, restoreHistory
  } = useFabricatorHistory({
    projectRef, dirtyAssets, dirtyChromaBases,
    setProject, setSelectedIds, setSaveState, setError, setSlots,
    processing, chromaApplying
  })

  const persistProject = useCallback(async (snapshot: FabricatorProject) => {
    const assets = await persistFabricatorProjectSnapshot(
      snapshot,
      dirtyAssets.current,
      dirtyChromaBases.current,
      (serialized, changedAssets) => window.desktop.saveFabricatorProject(serialized, changedAssets)
    )
    for (const asset of assets) {
      if (dirtyAssets.current.get(asset.id) === asset.dataUrl) dirtyAssets.current.delete(asset.id)
      if (asset.chromaBaseDataUrl && dirtyChromaBases.current.get(asset.id) === asset.chromaBaseDataUrl) dirtyChromaBases.current.delete(asset.id)
    }
    setSaveState('saved')
    window.dispatchEvent(new Event('fabricator:assets-updated'))
    setSlots((current) => current.map((item, index) => index + 1 === snapshot.slot ? { slot: snapshot.slot, name: snapshot.name, sourceName: snapshot.sourceName, partCount: snapshot.parts.length, updatedAt: snapshot.updatedAt } : item))
  }, [])

  const persistExternalAppearance = useCallback(async (snapshot: FabricatorProject) => {
    const previous = appearanceSaveQueue.current
    const current = previous.catch(() => undefined).then(async () => {
      await window.desktop.saveFabricatorProject(serializeFabricatorProject(snapshot), [])
      window.dispatchEvent(new Event('fabricator:assets-updated'))
      setSlots((items) => items.map((item) => item?.slot === snapshot.slot ? { ...item, updatedAt: snapshot.updatedAt } : item))
      if (!pendingAppearanceSave.current) {
        setAppearanceSaveState('saved')
        setAppearanceSaveError('')
      }
    })
    appearanceSaveQueue.current = current
    try {
      await current
    } catch (reason) {
      setAppearanceSaveState('error')
      setAppearanceSaveError(reason instanceof Error ? reason.message : 'Não foi possível salvar as cores deste modelo.')
    }
  }, [])

  const flushExternalAppearanceSave = useCallback(async () => {
    if (appearanceSaveTimer.current) clearTimeout(appearanceSaveTimer.current)
    appearanceSaveTimer.current = null
    const snapshot = pendingAppearanceSave.current
    if (snapshot) {
      pendingAppearanceSave.current = null
      await persistExternalAppearance(snapshot)
    }
    await appearanceSaveQueue.current.catch(() => undefined)
  }, [persistExternalAppearance])

  const setAppearanceTargetSlot = useCallback((slot: number | null) => {
    if (slot === null) return
    if (appearanceTargetRef.current === slot) {
      void flushExternalAppearanceSave()
      return
    }
    appearanceTargetRef.current = slot
    void flushExternalAppearanceSave().finally(() => {
      if (appearanceTargetRef.current === slot) setAppearanceTargetSlotState(slot)
    })
  }, [flushExternalAppearanceSave])

  const scheduleExternalAppearanceSave = useCallback((snapshot: FabricatorProject) => {
    pendingAppearanceSave.current = snapshot
    setAppearanceSaveState('saving')
    setAppearanceSaveError('')
    if (appearanceSaveTimer.current) clearTimeout(appearanceSaveTimer.current)
    appearanceSaveTimer.current = setTimeout(() => { void flushExternalAppearanceSave() }, 500)
  }, [flushExternalAppearanceSave])

  const visibleAppearanceSlot = activeSection === 'Modelos' ? activeSlot : appearanceTargetSlot ?? activeSlot
  const appearanceProject = project?.slot === visibleAppearanceSlot
    ? project
    : otherAppearanceProject?.slot === visibleAppearanceSlot ? otherAppearanceProject : null
  const appearanceUsesEditorProject = appearanceProject?.slot === project?.slot
  const visibleAppearanceSaveState = appearanceUsesEditorProject ? saveState : appearanceSaveState
  const visibleAppearanceSaveLabel = visibleAppearanceSaveState === 'saving'
    ? appearanceUsesEditorProject ? 'Salvando…' : 'Salvando cores…'
    : visibleAppearanceSaveState === 'error' ? 'Erro ao salvar' : 'Salvo localmente'

  useEffect(() => {
    if (visibleAppearanceSlot === project?.slot) {
      setOtherAppearanceProject(null)
      setAppearanceSaveState('saved')
      setAppearanceSaveError('')
      return
    }
    let active = true
    void window.desktop.loadFabricatorSlot(visibleAppearanceSlot).then((loaded) => {
      if (active) {
        setOtherAppearanceProject(loaded)
        setAppearanceSaveState('saved')
        setAppearanceSaveError('')
      }
    }).catch((reason: unknown) => {
      if (active) {
        setOtherAppearanceProject(null)
        setAppearanceSaveState('error')
        setAppearanceSaveError(reason instanceof Error ? reason.message : 'Não foi possível carregar as cores deste modelo.')
      }
    })
    return () => { active = false }
  }, [visibleAppearanceSlot, project?.slot])

  useEffect(() => {
    void window.desktop.listFabricatorSlots()
      .then((items) => { setSlots(items); setSlotsLoaded(true) })
      .catch((reason: unknown) => { setSlotsLoaded(true); setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a biblioteca.') })
    return () => {
      workerRef.current?.terminate(); chromaWorkerRef.current?.terminate()
      if (savedTimer.current) clearTimeout(savedTimer.current)
      if (appearanceSaveTimer.current) clearTimeout(appearanceSaveTimer.current)
      const pendingAppearance = pendingAppearanceSave.current
      pendingAppearanceSave.current = null
      if (pendingAppearance) void persistExternalAppearance(pendingAppearance)
    }
  }, [persistExternalAppearance])

  useEffect(() => { projectRef.current = project }, [project])

  useEffect(() => { if (!project) setSkinContourEditorOpen(false) }, [project])

  useEffect(() => {
    if (activeSection !== 'Modelos') return
    const element = stageRef.current
    if (!element) return
    const measure = () => {
      const bounds = element.getBoundingClientRect()
      setStageSize((previous) => previous.width === bounds.width && previous.height === bounds.height ? previous : { width: bounds.width, height: bounds.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [activeSection, project])

  useEffect(() => {
    if (!project) { setSaveState('saved'); return }
    setSaveState('saving')
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => {
      void persistProject(project).catch((reason: unknown) => {
        setSaveState('error')
        setError(reason instanceof Error ? `Falha ao salvar: ${reason.message}` : 'Falha ao salvar o projeto.')
      })
    }, 700)
    return () => { if (savedTimer.current) clearTimeout(savedTimer.current) }
  }, [persistProject, project])

  useEffect(() => {
    if (!appearanceProject) {
      setBodyAppearancePreviewUrls({})
      return
    }
    let active = true
    const slot = appearanceProject.slot
    const tone = isValidSkinTone(appearanceProject.modelSkinTone) ? appearanceProject.modelSkinTone : undefined
    const outlineColor = isValidSkinTone(appearanceProject.modelOutlineColor) ? appearanceProject.modelOutlineColor : undefined
    void (async () => {
      const previews: Record<string, string> = {}
      for (const part of appearanceProject.parts) {
        const preview = await cachedModelBodyAppearancePreview(slot, part, tone, outlineColor)
        if (!active) return
        if (preview) previews[`${slot}:${part.id}`] = preview
      }
      if (active) setBodyAppearancePreviewUrls(previews)
    })().catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível aplicar a cor de pele do modelo.')
    })
    return () => { active = false }
  }, [appearanceProject?.slot, appearanceProject?.modelSkinTone, appearanceProject?.modelOutlineColor, appearanceProject?.parts])

  useEffect(() => {
    if (connectMode && mixerActive) setMixerActive(false)
  }, [connectMode, mixerActive])

  const selectedPartIds = selectedIds
  const selectedPart = project?.parts.find((part) => part.id === selectedPartIds[0]) ?? null
  const normalizedPartFilter = useMemo(() => filter.toLowerCase(), [filter])
  const visibleParts = useMemo(() => (project?.parts ?? []).filter((part) => part.name.toLowerCase().includes(normalizedPartFilter)), [project, normalizedPartFilter])
  const canvasParts = useMemo(() => project ? orderedParts(project.parts, project.layerOrder) : [], [project])
  const partPreviewSource = (part: ModelPart) => bodyAppearancePreviewUrls[`${project?.slot}:${part.id}`] ?? part.dataUrl
  const frontToBackLayers = useMemo(() => canvasParts.slice().reverse(), [canvasParts])
  const jointedParts = useMemo(() => {
    if (!project) return []
    const withAnchors = project.parts.flatMap((part) => {
      const anchor = partJointAnchor(part, project.joints)
      return anchor ? [{ part, anchor, offset: 0 }] : []
    })
    const groups = new Map<string, typeof withAnchors>()
    for (const item of withAnchors) {
      const key = `${item.anchor.x.toFixed(2)}:${item.anchor.y.toFixed(2)}`
      groups.set(key, [...(groups.get(key) ?? []), item])
    }
    return withAnchors.map((item) => {
      const key = `${item.anchor.x.toFixed(2)}:${item.anchor.y.toFixed(2)}`
      const group = groups.get(key) ?? []
      return { ...item, offset: (group.findIndex((candidate) => candidate.part.id === item.part.id) - (group.length - 1) / 2) * 20 }
    })
  }, [project])
  const jointMarkers = useMemo(() => jointedParts
    .filter(({ part }) => !isTorsoPart(part))
    .map((item) => ({ ...item, fixed: Boolean(project?.joints.some((joint) => joint.childPartId === item.part.id && joint.fixed)) }))
    .sort((a, b) => Number(selectedIds.includes(a.part.id)) - Number(selectedIds.includes(b.part.id))), [jointedParts, project?.joints, selectedIds])
  const hiddenPartIds = project?.hiddenPartIds ?? []
  const measuredWidth = Math.max(stageSize.width, stageRef.current?.clientWidth ?? 0)
  const measuredHeight = Math.max(stageSize.height, stageRef.current?.clientHeight ?? 0)
  const scale = project ? Math.max(0.05, Math.min((measuredWidth - 48) / project.width, (measuredHeight - 48) / project.height)) * zoom : 1

  const updateProject = (updater: (current: FabricatorProject) => FabricatorProject, action: FabricatorHistoryAction = 'edit') => {
    const current = projectRef.current
    if (!current) return
    const next = updater(current)
    if (next === current) return
    const validIds = new Set(next.parts.map((part) => part.id))
    const normalized: FabricatorProject = {
      ...next,
      layerOrder: normalizeLayerOrder(next.parts, next.layerOrder),
      hiddenPartIds: (next.hiddenPartIds ?? []).filter((id) => validIds.has(id)),
      joints: next.joints.filter((joint) => validIds.has(joint.parentPartId) && validIds.has(joint.childPartId)),
      updatedAt: new Date().toISOString()
    }
    projectRef.current = normalized
    setProject(normalized)
    trackProjectChange(current, normalized, action)
  }

  const updateModelAppearance = (field: 'modelSkinTone' | 'modelOutlineColor', value: string | undefined) => {
    const current = appearanceProject
    if (!current) return
    if (projectRef.current?.slot === current.slot) {
      updateProject((latest) => ({ ...latest, [field]: value }))
      return
    }
    const next = { ...current, [field]: value, updatedAt: new Date().toISOString() }
    setOtherAppearanceProject(next)
    scheduleExternalAppearanceSave(next)
  }

  const moveLayer = (partId: string, direction: -1 | 1) => {
    updateProject((current) => {
      const topDown = normalizeLayerOrder(current.parts, current.layerOrder).reverse()
      const index = topDown.indexOf(partId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= topDown.length) return current
      ;[topDown[index], topDown[nextIndex]] = [topDown[nextIndex], topDown[index]]
      return { ...current, layerOrder: topDown.reverse() }
    })
  }

  const dropLayer = (sourceId: string, targetId: string) => {
    updateProject((current) => ({ ...current, layerOrder: reorderLayer(normalizeLayerOrder(current.parts, current.layerOrder).reverse(), sourceId, targetId).reverse() }))
  }

  const toggleLayerVisibility = (partId: string) => updateProject((current) => {
    const hidden = new Set(current.hiddenPartIds ?? [])
    if (hidden.has(partId)) hidden.delete(partId)
    else hidden.add(partId)
    return { ...current, hiddenPartIds: Array.from(hidden) }
  })

  const selectSlot = async (slot: number) => {
    const generation = ++slotSelectionGeneration.current
    await flushExternalAppearanceSave()
    if (generation !== slotSelectionGeneration.current) return
    setSlotSwitching(true)
    requestId.current += 1
    workerRef.current?.terminate(); workerRef.current = null
    chromaWorkerRef.current?.terminate(); chromaWorkerRef.current = null
    setProcessing(false); setProgress(0); setChromaApplying(false)
    const projectToSave = projectRef.current ?? project
    if (projectToSave) {
      if (savedTimer.current) clearTimeout(savedTimer.current)
      try { await persistProject(projectToSave) } catch (reason) {
        if (generation === slotSelectionGeneration.current) {
          setError(reason instanceof Error ? `Falha ao salvar antes de trocar de slot: ${reason.message}` : 'Falha ao salvar antes de trocar de slot.')
          setSlotSwitching(false)
        }
        return
      }
    }
    if (generation !== slotSelectionGeneration.current) return
    mixerSessionRef.current += 1
    resetHistoryGesture()
    clearHistory()
    projectRef.current = null
    setActiveSlot(slot); setProject(null); setSelectedIds([]); setError(''); dirtyAssets.current.clear(); dirtyChromaBases.current.clear(); mixerSurfacesRef.current.clear(); mixerStrokeRef.current = null; setMixerActive(false); setMixerPainting(false); setZoom(1); setPan({ x: 0, y: 0 })
    const summary = slots[slot - 1]
    if (!summary) { setSlotSwitching(false); return }
    try {
      const loaded = await window.desktop.loadFabricatorSlot(slot)
      if (generation !== slotSelectionGeneration.current) return
      if (!loaded) throw new Error('O projeto salvo não pôde ser carregado.')
      let loadedHistory: FabricatorHistoryState = { undo: [], redo: [] }
      try { loadedHistory = await window.desktop.loadFabricatorHistory(slot) } catch {
        if (generation !== slotSelectionGeneration.current) return
        setError('O modelo abriu, mas o histórico persistido não pôde ser carregado.')
      }
      if (generation !== slotSelectionGeneration.current) return
      replaceHistory(loadedHistory)
      const prepared = await prepareLoadedFabricatorProject(
        loaded,
        loadedHistory,
        () => generation === slotSelectionGeneration.current
      )
      if (!prepared || generation !== slotSelectionGeneration.current) return
      for (const [partId, dataUrl] of prepared.dirtyAssets) dirtyAssets.current.set(partId, dataUrl)
      for (const [partId, dataUrl] of prepared.dirtyChromaBases) dirtyChromaBases.current.set(partId, dataUrl)
      if (prepared.warning) setError(prepared.warning)
      const loadedProject = prepared.project
      projectRef.current = loadedProject
      setProject(loadedProject); setSelectedIds(loaded.parts[0] ? [loaded.parts[0].id] : [])
      setChromaValue(loaded.tolerance)
      setSlotSwitching(false)
    } catch (reason) {
      if (generation === slotSelectionGeneration.current) {
        setError(reason instanceof Error ? reason.message : 'Falha ao abrir modelo.')
        setSlotSwitching(false)
      }
    }
  }

  useEffect(() => {
    if (!slotsLoaded || initialSlotLoad.current) return
    initialSlotLoad.current = true
    if (slots[0]) void selectSlot(1)
  }, [slotsLoaded, slots[0]])

  const deleteSlot = async (slot: number) => {
    const summary = slots[slot - 1]
    if (!summary || deletingSlot !== null) return
    if (!window.confirm(`Excluir permanentemente “${summary.name}” do slot ${slot}? A imagem original e todas as peças salvas serão apagadas.`)) return
    setDeletingSlot(slot)
    if (activeSlot === slot) {
      slotSelectionGeneration.current += 1
      requestId.current += 1
      if (savedTimer.current) clearTimeout(savedTimer.current)
      workerRef.current?.terminate(); workerRef.current = null
      chromaWorkerRef.current?.terminate(); chromaWorkerRef.current = null; setChromaApplying(false)
      setProcessing(false); setProgress(0)
    }
    try {
      await window.desktop.deleteFabricatorSlot(slot)
      setSlots((current) => current.map((item, index) => index === slot - 1 ? null : item))
      if (activeSlot === slot) {
        workerRef.current?.terminate(); workerRef.current = null
        projectRef.current = null
        setProcessing(false); setProgress(0); setProject(null); setSelectedIds([]); dirtyAssets.current.clear(); dirtyChromaBases.current.clear(); setError('')
      }
    } catch (reason) {
      setError(reason instanceof Error ? `Não foi possível excluir o modelo: ${reason.message}` : 'Não foi possível excluir o modelo.')
      if (activeSlot === slot) {
        const currentProject = projectRef.current ?? project
        if (currentProject) {
          const restored = { ...currentProject, updatedAt: new Date().toISOString() }
          projectRef.current = restored
          setProject(restored)
        }
        else await selectSlot(slot)
      }
    } finally {
      setDeletingSlot(null)
    }
  }

  const runProcessor = (sourceDataUrl: string, tolerance: number, metadata: { slot: number; name: string; sourceName: string; sourceAssetName: string }, recordBefore?: FabricatorProject) => {
    workerRef.current?.terminate()
    const worker = new Worker(new URL('./models/imageProcessor.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    const id = ++requestId.current
    setProcessing(true); setProgress(1); setError('')
    worker.onmessage = (event: MessageEvent<ProcessorMessage>) => {
      if (event.data.id !== id || id !== requestId.current) return
      const message = event.data
      if (message.type === 'progress') { setProgress(message.value); return }
      worker.terminate(); workerRef.current = null; setProcessing(false)
      if (message.type === 'error') { setError(message.message); return }
      if (message.parts.length === 0) { setError('Nenhuma peça foi encontrada. Aumente a tolerância ou escolha outra imagem.'); return }
      const parts: ModelPart[] = message.parts.map(({ png, basePng, ...part }) => ({ ...part, rotation: 0, chromaBaseSaved: true, dataUrl: pngDataUrlFromBuffer(png), chromaBaseDataUrl: pngDataUrlFromBuffer(basePng) }))
      for (const part of parts) { dirtyAssets.current.set(part.id, part.dataUrl); if (part.chromaBaseDataUrl) dirtyChromaBases.current.set(part.id, part.chromaBaseDataUrl) }
      const detectedJoints = autoConnectParts(parts)
      const rig = normalizePartAnchors(parts, detectedJoints)
      const sourceParts = rig.parts.map((part) => ({ ...part, sourceTransform: { x: part.x, y: part.y, width: part.width, height: part.height, rotation: part.rotation, anchorVersion: 1 as const, ...(part.jointAnchor ? { jointAnchor: { ...part.jointAnchor } } : {}) } }))
      const nextProject: FabricatorProject = {
        schemaVersion: 1, chromaVersion: 2, chromaBaseTolerance: 0, slot: metadata.slot, name: metadata.name, sourceName: metadata.sourceName,
        sourceAssetName: metadata.sourceAssetName, sourceDataUrl, width: message.width, height: message.height,
        tolerance, parts: sourceParts, joints: rig.joints, layerOrder: parts.map((part) => part.id), hiddenPartIds: [], updatedAt: new Date().toISOString()
      }
      if (recordBefore) recordHistorySnapshot(recordBefore, 'reset', nextProject)
      setChromaValue(tolerance)
      projectRef.current = nextProject
      setProject(nextProject); setSelectedIds(parts[0] ? [parts[0].id] : [])
    }
    worker.onerror = () => {
      if (id !== requestId.current) return
      worker.terminate(); workerRef.current = null; setProcessing(false); setError('O processamento da imagem falhou.')
    }
    worker.postMessage({ id, sourceDataUrl, tolerance })
  }


  const publishEditedModelSource = async (result: ModelSourceResult): Promise<void> => {
    const current = projectRef.current
    if (!current || modelSourcePublishing || processing || chromaApplying || historyBusy) throw new Error('O modelo não está disponível para edição.')
    setModelSourcePublishing(true)
    setSaveState('saving')
    if (savedTimer.current) clearTimeout(savedTimer.current)
    try {
      await persistProject(current)
      const next: FabricatorProject = {
        ...current,
        sourceDataUrl: result.sourceDataUrl,
        modelSkinTone: result.modelSkinTone,
        modelOutlineColor: result.modelOutlineColor,
        parts: result.parts,
        joints: result.joints,
        layerOrder: result.layerOrder,
        hiddenPartIds: result.hiddenPartIds,
        tolerance: result.tolerance,
        chromaBaseTolerance: 0,
        chromaVersion: 2,
        updatedAt: new Date().toISOString()
      }
      const serialized = serializeFabricatorProject(next)
      const changedAssets: FabricatorAssetSave[] = result.parts.map(part => ({
        id: part.id,
        dataUrl: part.dataUrl,
        ...(part.chromaBaseDataUrl ? { chromaBaseDataUrl: part.chromaBaseDataUrl } : {})
      }))
      const newSourceName = await window.desktop.publishFabricatorModelSource(serialized, result.sourceDataUrl, changedAssets)
      const published: FabricatorProject = { ...next, sourceAssetName: newSourceName }
      clearHistory()
      dirtyAssets.current.clear()
      dirtyChromaBases.current.clear()
      mixerSurfacesRef.current.clear()
      projectRef.current = published
      setProject(published)
      setChromaValue(result.tolerance)
      setSaveState('saved')
      setModelSourceOpen(false)
      broadcastModelSourceUpdate({ slot: published.slot, sourceAssetName: newSourceName })
      window.dispatchEvent(new Event('fabricator:assets-updated'))
    } catch (reason) {
      setSaveState('error')
      throw reason
    } finally {
      setModelSourcePublishing(false)
    }
  }

  const applyChromaKey = () => {
    if (!project || chromaApplying || processing || historyBusy || chromaValue === project.tolerance) return
    chromaWorkerRef.current?.terminate()
    const worker = new Worker(new URL('./models/chromaAdjust.worker.ts', import.meta.url), { type: 'module' })
    chromaWorkerRef.current = worker
    const id = ++requestId.current
    const slot = project.slot
    const tolerance = chromaValue
    setChromaApplying(true); setError('')
    worker.onmessage = (event: MessageEvent<ChromaAdjustMessage>) => {
      if (event.data.id !== id || id !== requestId.current) return
      worker.terminate(); chromaWorkerRef.current = null; setChromaApplying(false)
      if (event.data.type === 'error') { setError(`Chroma key: ${event.data.message}`); return }
      const updatedAssets = new Map(event.data.parts.map(({ id: partId, png }) => [partId, pngDataUrlFromBuffer(png)]))
      for (const [partId, dataUrl] of updatedAssets) dirtyAssets.current.set(partId, dataUrl)
      mixerSurfacesRef.current.clear()
      updateProject((current) => current.slot !== slot ? current : {
        ...current,
        tolerance,
        parts: current.parts.map((part) => updatedAssets.has(part.id) ? { ...part, dataUrl: updatedAssets.get(part.id)! } : part)
      })
    }
    worker.onerror = () => {
      if (id !== requestId.current) return
      worker.terminate(); chromaWorkerRef.current = null; setChromaApplying(false)
      setError('O ajuste do chroma key falhou. Suas posições e conexões foram preservadas.')
    }
    worker.postMessage({
      id,
      sourceDataUrl: project.sourceDataUrl,
      tolerance,
      parts: project.parts.map(({ id: partId, dataUrl, chromaBaseDataUrl }) => ({ id: partId, dataUrl: chromaBaseDataUrl ?? dataUrl }))
    })
  }

  const resetModel = async () => {
    if (!project || processing || chromaApplying || historyBusy) return
    const originalName = project.sourceName.replace(/\.[^.]+$/, '') || `Modelo ${project.slot}`
    if (!window.confirm('Resetar este modelo para a importação original? Isso vai apagar os recortes, posições, camadas, juntas e ajustes atuais.')) return
    if (savedTimer.current) clearTimeout(savedTimer.current)
    setProcessing(true)
    try {
      await persistProject(project)
    } catch (reason) {
      setProcessing(false)
      setError(reason instanceof Error ? `Não foi possível salvar antes de resetar: ${reason.message}` : 'Não foi possível salvar antes de resetar.')
      setProject((current) => current ? { ...current, updatedAt: new Date().toISOString() } : current)
      return
    }
    chromaWorkerRef.current?.terminate(); chromaWorkerRef.current = null; setChromaApplying(false)
    setChromaValue(DEFAULT_CHROMA_TOLERANCE)
    dirtyAssets.current.clear(); dirtyChromaBases.current.clear()
    runProcessor(project.sourceDataUrl, DEFAULT_CHROMA_TOLERANCE, {
      slot: project.slot,
      name: originalName,
      sourceName: project.sourceName,
      sourceAssetName: project.sourceAssetName
    }, project)
  }

  const importSlot = async (slot: number, preserveExisting = false) => {
    const selectionGeneration = slotSelectionGeneration.current
    const reimporting = preserveExisting && Boolean(slots[slot - 1])
    if (slots[slot - 1] && !reimporting && !window.confirm(`Substituir o modelo do slot ${slot}? O projeto atual será trocado.`)) return
    const projectToSave = projectRef.current ?? project
    if (projectToSave) {
      if (savedTimer.current) clearTimeout(savedTimer.current)
      try { await persistProject(projectToSave) } catch (reason) { setError(reason instanceof Error ? `Falha ao salvar antes da importação: ${reason.message}` : 'Falha ao salvar antes da importação.'); return }
    }
    if (selectionGeneration !== slotSelectionGeneration.current) return
    setError('')
    try {
      const selected = await window.desktop.importFabricatorModel(slot, reimporting ? 'reimport' : 'import')
      if (!selected) return
      if (reimporting) {
        const current = projectRef.current
        const existing = current?.slot === slot ? current : await window.desktop.loadFabricatorSlot(slot)
        if (!existing) throw new Error('O modelo salvo não foi encontrado. Nenhuma configuração foi alterada.')
        const updated: FabricatorProject = {
          ...existing,
          sourceName: selected.sourceName,
          sourceAssetName: selected.sourceAssetName,
          sourceDataUrl: selected.sourceDataUrl
        }
        await persistProject(updated)
        if (selectionGeneration !== slotSelectionGeneration.current) {
          broadcastModelSourceUpdate({ slot, sourceAssetName: selected.sourceAssetName })
          return
        }
        if (activeSlot !== slot || projectRef.current?.slot !== slot) {
          let loadedHistory: FabricatorHistoryState = { undo: [], redo: [] }
          try { loadedHistory = await window.desktop.loadFabricatorHistory(slot) } catch {
            if (selectionGeneration !== slotSelectionGeneration.current) return
            setError('A imagem foi reimportada, mas não foi possível carregar o histórico salvo.')
          }
          if (selectionGeneration !== slotSelectionGeneration.current) return
          replaceHistory(loadedHistory)
          setActiveSlot(slot)
          setSelectedIds(updated.parts[0] ? [updated.parts[0].id] : [])
        }
        projectRef.current = updated
        setProject(updated)
        setChromaValue(updated.tolerance)
        broadcastModelSourceUpdate({ slot, sourceAssetName: selected.sourceAssetName })
        return
      }
      chromaWorkerRef.current?.terminate(); chromaWorkerRef.current = null; setChromaApplying(false)
      mixerSessionRef.current += 1
      projectRef.current = null
      setActiveSlot(slot); setProject(null); setSelectedIds([]); dirtyAssets.current.clear(); dirtyChromaBases.current.clear(); mixerSurfacesRef.current.clear(); mixerStrokeRef.current = null; setMixerActive(false); setMixerPainting(false)
      const name = selected.sourceName.replace(/\.[^.]+$/, '') || `Modelo ${slot}`
      const recordBefore = project?.slot === slot ? project : undefined
      if (!recordBefore) clearHistory()
      runProcessor(selected.sourceDataUrl, 74, { slot, name, sourceName: selected.sourceName, sourceAssetName: selected.sourceAssetName }, recordBefore)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível importar a imagem.') }
  }

  const removePart = (partId: string) => {
    updateProject((current) => ({ ...current, parts: current.parts.filter((part) => part.id !== partId), joints: current.joints.filter((joint) => joint.parentPartId !== partId && joint.childPartId !== partId) }))
    setSelectedIds((current) => current.filter((id) => id !== partId))
    dirtyAssets.current.delete(partId)
    dirtyChromaBases.current.delete(partId)
  }

  const splitSelected = async (axis: 'horizontal' | 'vertical') => {
    if (!selectedPart || selectedPart.rotation !== 0) return
    const split = await splitImage(selectedPart, axis)
    for (const part of split) { dirtyAssets.current.set(part.id, part.dataUrl); if (part.chromaBaseDataUrl) dirtyChromaBases.current.set(part.id, part.chromaBaseDataUrl) }
    updateProject((current) => ({ ...current, parts: [...current.parts.filter((part) => part.id !== selectedPart.id), ...split], joints: current.joints.filter((joint) => joint.parentPartId !== selectedPart.id && joint.childPartId !== selectedPart.id) }))
    setSelectedIds(split.map((part) => part.id)); dirtyAssets.current.delete(selectedPart.id)
  }

  const mergeSelected = async () => {
    if (!project || selectedPartIds.length < 2) return
    const parts = project.parts.filter((part) => selectedPartIds.includes(part.id))
    const merged = await mergeImages(parts)
    dirtyAssets.current.set(merged.id, merged.dataUrl)
    if (merged.chromaBaseDataUrl) dirtyChromaBases.current.set(merged.id, merged.chromaBaseDataUrl)
    const ids = new Set(parts.map((part) => part.id))
    updateProject((current) => ({ ...current, parts: [...current.parts.filter((part) => !ids.has(part.id)), merged], joints: current.joints.filter((joint) => !ids.has(joint.parentPartId) && !ids.has(joint.childPartId)) }))
    for (const id of ids) { dirtyAssets.current.delete(id); dirtyChromaBases.current.delete(id) }
    setSelectedIds([merged.id])
  }

  const handlePartClick = (partId: string, toggle = false) => {
    if (connectMode) {
      if (!connectFromId) { setConnectFromId(partId); setSelectedIds([partId]); return }
      if (connectFromId !== partId && project) {
        updateProject((current) => connectFabricatorParts(current, connectFromId, partId, () => crypto.randomUUID()))
        setConnectFromId(null); setConnectMode(false); setSelectedIds([partId]); return
      }
    }
    setSelectedIds((current) => toggle
      ? current.includes(partId) ? current.filter((id) => id !== partId) : [...current, partId]
      : [partId])
  }

  const updatePartPosition = (partId: string, dx: number, dy: number) => updateProject((current) => moveFabricatorPartBranch(current, partId, dx, dy))

  const setPartCoordinate = (partId: string, axis: 'x' | 'y', rawValue: string) => {
    updateProject((current) => {
      const target = current.parts.find((part) => part.id === partId)
      if (!target || isTorsoPart(target)) return current
      return { ...current, parts: current.parts.map((part) => part.id === partId ? { ...part, [axis]: Number(rawValue) || 0 } : part) }
    })
  }

  const toggleJointFix = (partId: string) => updateProject((current) => toggleFabricatorJointFixed(current, partId, () => crypto.randomUUID()))

  const rotateBranch = (jointId: string, amount: number) => updateProject((current) => rotateFabricatorPartBranch(current, jointId, amount))

  const autoConnectBodyContours = async () => {
    const snapshot = projectRef.current
    if (!snapshot || contourConnecting) return
    setContourConnecting(true)
    setJointConnectMessage('')
    try {
      const result = await connectBodyContourJoints(snapshot)
      if (projectRef.current !== snapshot) {
        setJointConnectMessage('O modelo mudou durante o cálculo. Execute a conexão automática novamente.')
        return
      }
      updateProject(() => result.project)
      setJointConnectMessage(result.pairCount
        ? `Juntas automáticas concluídas: ${result.alignedCount} de ${result.pairCount} contornos anatômicos alinhados.`
        : 'Não encontrei pares identificáveis de braço superior/antebraço ou coxa/canela.')
    } catch (reason) {
      setJointConnectMessage(reason instanceof Error ? reason.message : 'Não foi possível conectar os contornos das juntas.')
    } finally {
      setContourConnecting(false)
    }
  }

  const paintMixerSegment = async (fromX: number, fromY: number, toX: number, toY: number, touchedPixels: Map<string, Uint8Array>, session: number) => {
    if (!project || !scale || session !== mixerSessionRef.current) return
    const stage = stageRef.current
    if (!stage) return
    const stageBounds = stage.getBoundingClientRect()
    const changedAssets = await applySeamMixerSegment({
      fromX,
      fromY,
      toX,
      toY,
      projectSize: project,
      scale,
      pan,
      stageBounds,
      candidates: frontToBackLayers.filter((part) => !hiddenPartIds.includes(part.id)),
      touchedPixels,
      surfaces: mixerSurfacesRef.current,
      session,
      getCurrentSession: () => mixerSessionRef.current
    })
    if (!changedAssets?.size) return
    for (const [partId, dataUrl] of changedAssets) dirtyAssets.current.set(partId, dataUrl)
    updateProject((current) => ({
      ...current,
      parts: current.parts.map((part) => changedAssets.has(part.id)
        ? { ...part, dataUrl: changedAssets.get(part.id)! }
        : part)
    }), 'mixer')
  }
  const queueMixerSegment = (fromX: number, fromY: number, toX: number, toY: number) => {
    const touchedPixels = mixerTouchedRef.current
    const session = mixerSessionRef.current
    mixerQueueRef.current = mixerQueueRef.current
      .then(() => paintMixerSegment(fromX, fromY, toX, toY, touchedPixels, session))
      .catch((reason: unknown) => { if (session === mixerSessionRef.current) setError(reason instanceof Error ? `Misturador: ${reason.message}` : 'O misturador não conseguiu editar essa peça.') })
  }

  const startMixerStroke = <T extends Element,>(event: React.PointerEvent<T>) => {
    if (!project || !stageRef.current) return
    event.preventDefault(); event.stopPropagation()
    stageRef.current.setPointerCapture(event.pointerId)
    startHistoryGesture('mixer')
    mixerTouchedRef.current = new Map()
    mixerStrokeRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    setMixerPainting(true)
    queueMixerSegment(event.clientX, event.clientY, event.clientX, event.clientY)
  }

  const moveMixerStroke = (event: React.PointerEvent<HTMLDivElement>) => {
    const stroke = mixerStrokeRef.current
    if (!stroke || stroke.pointerId !== event.pointerId) return
    queueMixerSegment(stroke.x, stroke.y, event.clientX, event.clientY)
    stroke.x = event.clientX; stroke.y = event.clientY
  }

  const beginPartDrag = (event: React.PointerEvent<HTMLImageElement>, part: ModelPart) => {
    if (mixerActive) { startMixerStroke(event); return }
    if (connectMode || !project) return
    if (isTorsoPart(part)) {
      event.preventDefault(); event.stopPropagation()
      setSelectedIds([part.id])
      return
    }
    event.preventDefault(); event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    startHistoryGesture('edit')
    setSelectedIds((current) => current.includes(part.id) ? current : [part.id])
    dragRef.current = { partId: part.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY }
  }

  const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!project || (event.target instanceof Element && event.target.closest('.model-stage-tools'))) return
    if (mixerActive) { startMixerStroke(event); return }
    if (event.target instanceof Element && event.target.closest('.model-canvas-part, .model-joint-anchor')) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: pan.x, originY: pan.y }
    setPanning(true)
  }

  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = panRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPan({ x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y })
  }

  const movePartDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || !project || drag.pointerId !== event.pointerId || !scale) return
    const dx = (event.clientX - drag.x) / scale; const dy = (event.clientY - drag.y) / scale
    if (Math.abs(dx) + Math.abs(dy) > 0) updatePartPosition(drag.partId, dx, dy)
    drag.x = event.clientX; drag.y = event.clientY
  }

  const moveAnchorDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = anchorDragRef.current
    if (!drag || !project || drag.pointerId !== event.pointerId || !scale) return
    const dx = (event.clientX - drag.x) / scale + drag.offsetX; const dy = (event.clientY - drag.y) / scale
    updateProject((current) => {
      const part = current.parts.find((item) => item.id === drag.partId)
      if (!part) return current
      const anchor = partJointAnchor(part, current.joints)
      if (!anchor) return current
      const movedAnchor = { x: anchor.x + dx, y: anchor.y + dy }
      const sourceAnchor = sourcePointFromCanvas(part, movedAnchor)
      return {
        ...current,
        parts: current.parts.map((item) => item.id === drag.partId ? { ...item, jointAnchor: movedAnchor, ...(sourceAnchor && item.sourceTransform ? { sourceTransform: { ...item.sourceTransform, jointAnchor: sourceAnchor, anchorVersion: 1 as const } } : {}) } : item),
        joints: current.joints.map((joint) => {
          const parentAnchor = joint.parentPartId === drag.partId ? movedAnchor : joint.parentAnchor
          const childAnchor = joint.childPartId === drag.partId ? movedAnchor : joint.childAnchor
          return { ...joint, parentAnchor, childAnchor, pivot: { x: (parentAnchor.x + childAnchor.x) / 2, y: (parentAnchor.y + childAnchor.y) / 2 } }
        })
      }
    })
    drag.x = event.clientX; drag.y = event.clientY; drag.offsetX = 0
  }

  const beginAnchorDrag = (event: React.PointerEvent<SVGCircleElement>, partId: string, displayOffset: number) => {
    if (mixerActive) { startMixerStroke(event); return }
    event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
    startHistoryGesture('edit')
    anchorDragRef.current = { partId, pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX: displayOffset / scale }
  }

  const renderEmptyState = () => (
    <div className="model-empty-state">
      <div className="model-empty-symbol"><Icon name="sparkles" /></div>
      <p className="model-eyebrow">BIBLIOTECA DE MODELOS</p>
      <h1>{slots[activeSlot - 1] ? 'Abrindo projeto…' : 'Sua mesa de montagem'}</h1>
      <p>Importe uma folha de peças. O Nymi remove o fundo, recorta cada elemento e abre o canvas para você montar e articular o modelo.</p>
      <button className="model-primary-button" onClick={() => void importSlot(activeSlot, true)} type="button"><Icon name={slots[activeSlot - 1] ? 'reset' : 'plus'} /> {slots[activeSlot - 1] ? 'Reimportar imagem' : 'Importar imagem'}</button>
      <span className="model-supported-formats">PNG · JPG · WEBP · processamento local</span>
    </div>
  )

  return (
    <main className="fabricator-layout" aria-label="Fabricador Dev">
      <aside className="fabricator-sidebar">
        <div className="fabricator-sidebar-heading">
          <span className="fabricator-heading-icon"><Icon name="box" /></span>
          <span><strong>Fabricador Dev</strong><small>ÁREAS DE PRODUÇÃO</small></span>
        </div>
        <nav className="fabricator-section-list" aria-label="Seções do Fabricador Dev">
          {sections.map((section) => (
            <button aria-pressed={activeSection === section.id} className={`fabricator-section-button${activeSection === section.id ? ' active' : ''}`} key={section.id} onClick={() => { setActiveSection(section.id); setAppearanceTargetSlot(activeSlot) }} type="button">
              <Icon name={section.icon} /><span>{section.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {modelSourceOpen && project && <ModelSourceEditor project={project} onClose={() => { if (!modelSourcePublishing) setModelSourceOpen(false) }} onPublish={publishEditedModelSource} />}
      {skinContourEditorOpen && project && <ModelSkinContourEditor key={project.slot} parts={project.parts} skinTone={project.modelSkinTone} outlineColor={project.modelOutlineColor} onClose={() => setSkinContourEditorOpen(false)} onSave={(contoursByPart) => updateProject(current => ({ ...current, parts: current.parts.map(part => {
        if (!(part.id in contoursByPart)) return part
        const fakeSkinContours = contoursByPart[part.id]
        return { ...part, fakeSkinContours: fakeSkinContours.length ? fakeSkinContours : undefined }
      }) }))} />}
      <ModelAppearanceProvider slot={appearanceProject?.slot ?? null} previewUrls={bodyAppearancePreviewUrls} modelSkinTone={appearanceProject?.modelSkinTone} modelOutlineColor={appearanceProject?.modelOutlineColor} setTargetSlot={setAppearanceTargetSlot}>
        <section className="fabricator-workspace-shell">
          {activeSection !== 'Modelos' && appearanceProject && <div className="fabricator-shared-appearance">
            <div className="fabricator-shared-appearance-heading">
              <span><small>MODELO BASE · SLOT {String(appearanceProject.slot).padStart(2, '0')}</small><strong>{appearanceProject.name}</strong></span>
              <span className={`model-save-state ${visibleAppearanceSaveState}`}><i />{visibleAppearanceSaveLabel}</span>
            </div>
            <ModelSkinTonePicker
              value={appearanceProject.modelSkinTone}
              outlineColor={appearanceProject.modelOutlineColor}
              contourPartCount={appearanceProject.parts.filter(part => part.fakeSkinContours?.length).length}
              disabled={!appearanceProject || (slotSwitching && appearanceProject.slot === activeSlot)}
              showContourButton={false}
              onSelect={(tone) => updateModelAppearance('modelSkinTone', tone)}
              onOutlineSelect={(color) => updateModelAppearance('modelOutlineColor', color)}
              onEditContours={() => undefined}
            />
            {appearanceSaveError && !appearanceUsesEditorProject && <small className="fabricator-shared-appearance-error" role="status">Não foi possível salvar as cores: {appearanceSaveError}</small>}
          </div>}
      {activeSection === 'Design Dev' ? <DesignWorkspace /> : activeSection === 'Poses' ? <PoseWorkspace baseModelSlot={activeSlot} /> : activeSection === 'Roupas' ? <WardrobeWorkspace baseModelSlot={activeSlot} /> : activeSection === 'Olhos' ? <FaceComponentsWorkspace mode="eyes" baseModelSlot={activeSlot} /> : activeSection === 'Rosto' ? <FaceComponentsWorkspace mode="face" baseModelSlot={activeSlot} /> : activeSection === 'Preset Expressão Dev' ? <ExpressionPresetWorkspace modelSlot={activeSlot} /> : activeSection === 'Animador Rosto Dev' ? <FaceAnimatorWorkspace modelSlot={activeSlot} /> : activeSection === 'Cabeças extra' ? <HeadExtrasWorkspace baseModelSlot={activeSlot} /> : activeSection === 'Cabelos Dev' ? <HairWorkspace baseModelSlot={activeSlot} /> : activeSection === 'Animador Dev' ? <AnimatorWorkspace baseModelSlot={activeSlot} /> : (
        <section className="fabricator-model-editor" aria-label="Editor de modelos">
          <header className="model-slotbar">
            <div className="model-slot-title"><span className="model-slot-logo"><Icon name="sparkles" /></span><span><strong>Modelos</strong><small>10 espaços de trabalho</small></span></div>
            <div className="model-slots" role="tablist" aria-label="Slots de modelos">
              {slots.map((slot, index) => {
                const number = index + 1
                return <button key={number} className={`model-slot${activeSlot === number ? ' active' : ''}${slot ? ' filled' : ' empty'}`} onClick={() => void selectSlot(number)} disabled={deletingSlot !== null} role="tab" aria-selected={activeSlot === number} aria-label={`Slot ${number}, ${slot ? 'preenchido' : 'vazio'}`} title={slot ? `Slot ${number}: ${slot.name} — ${slot.partCount} peças` : `Slot ${number}: vazio`} type="button">
                  <span>{String(number).padStart(2, '0')}</span><small>{slot ? 'Preenchido' : 'Vazio'}</small>
                </button>
              })}
            </div>
            {slots[activeSlot - 1] && <button className="model-delete-compact" onClick={() => void deleteSlot(activeSlot)} disabled={slotSwitching || deletingSlot === activeSlot} title="Excluir permanentemente este modelo" type="button"><Icon name="trash" /><span>{deletingSlot === activeSlot ? 'Excluindo…' : 'Excluir modelo'}</span></button>}
            <button className="model-import-compact" onClick={() => void importSlot(activeSlot, true)} disabled={slotSwitching || deletingSlot !== null || processing || chromaApplying || historyBusy || modelSourcePublishing} title={slots[activeSlot - 1] ? 'Substituir a imagem original preservando peças, poses, juntas e demais configurações' : 'Importar folha para este slot'} type="button"><Icon name={slots[activeSlot - 1] ? 'reset' : 'plus'} /><span>{slots[activeSlot - 1] ? 'Reimportar' : 'Importar'}</span></button>
          </header>

          {slotSwitching ? (
            <div className="model-editor-content model-editor-empty" aria-busy="true">
              <div className="model-processing"><div className="model-spinner" /><p className="model-eyebrow">BIBLIOTECA DE MODELOS</p><h2>Abrindo slot {String(activeSlot).padStart(2, '0')}…</h2><p>Salvando o projeto atual e carregando o próximo.</p></div>
            </div>
          ) : !project ? (
            <div className="model-editor-content model-editor-empty">
              {processing ? <div className="model-processing"><div className="model-spinner" /><p className="model-eyebrow">PROCESSANDO LOCALMENTE</p><h2>Separando as peças…</h2><p>Removendo o fundo e encontrando cada área da imagem.</p><div className="model-progress"><span style={{ width: `${progress}%` }} /></div><small>{progress}%</small></div> : renderEmptyState()}
            </div>
          ) : (
            <>
              <div className="model-editor-toolbar">
                <div className="model-history-controls" aria-label="Histórico de alterações">
                  <button className="model-history-button" onClick={() => void restoreHistory('undo')} disabled={!history.undo.length || historyBusy || processing || chromaApplying} title={`Desfazer${history.undo.length ? ` — ${history.undo.length} alterações disponíveis` : ''}`} aria-label={`Desfazer, ${history.undo.length} alterações disponíveis`} type="button"><Icon name="undo" /></button>
                  <button className="model-history-button" onClick={() => void restoreHistory('redo')} disabled={!history.redo.length || historyBusy || processing || chromaApplying} title={`Refazer${history.redo.length ? ` — ${history.redo.length} alterações disponíveis` : ''}`} aria-label={`Refazer, ${history.redo.length} alterações disponíveis`} type="button"><Icon name="redo" /></button>
                  <small className="model-history-count" title="Histórico salvo localmente; mantém até 50 alterações">{history.undo.length}/50</small>
                </div>
                <div className="model-current-title" aria-label={`Modelo ${String(project.slot).padStart(2, '0')}`}><span className="model-eyebrow">MODELO {String(project.slot).padStart(2, '0')}</span></div>
                <div className="model-toolbar-actions">
                  <span className={`model-save-state ${saveState}`}><i />{saveState === 'saving' ? 'Salvando…' : saveState === 'error' ? 'Erro ao salvar' : 'Salvo localmente'}</span>
                  <div className="model-chroma-control">
                    <div className="model-chroma-heading"><label htmlFor="model-chroma-range"><Icon name="sliders" />Chroma key</label><output htmlFor="model-chroma-range">{chromaValue}</output></div>
                    <div className="model-chroma-adjust"><input id="model-chroma-range" aria-label="Intensidade do chroma key" type="range" min={project.chromaBaseTolerance ?? project.tolerance} max={MAX_CHROMA_TOLERANCE} value={Math.max(chromaValue, project.chromaBaseTolerance ?? project.tolerance)} disabled={chromaApplying || processing || historyBusy} onChange={(event) => setChromaValue(Number(event.target.value))} /><button className="model-chroma-apply" onClick={applyChromaKey} disabled={chromaApplying || processing || historyBusy || chromaValue === project.tolerance} type="button">{chromaApplying ? 'Aplicando…' : 'Aplicar'}</button></div>
                    <small>Arraste para ajustar em qualquer direção · Resetar restaura a importação</small>
                  </div>
                  <button className="model-tool-button" onClick={() => setModelSourceOpen(true)} disabled={processing || chromaApplying || historyBusy || modelSourcePublishing || saveState === 'error'} title="Alterar permanentemente a largura e a altura das peças na imagem de origem" type="button"><Icon name="edit" /><span>Editar imagem original</span></button>
                  <button className="model-tool-button model-reset-button" onClick={() => void resetModel()} disabled={processing || chromaApplying || historyBusy} title="Voltar o modelo inteiro ao estado da imagem importada" type="button"><Icon name="reset" /><span>{processing ? 'Resetando…' : 'Resetar'}</span></button>
                  <button className={`model-tool-button model-mixer-toggle${mixerActive ? ' active' : ''}`} aria-pressed={mixerActive} onClick={() => { setMixerActive((active) => !active); setConnectMode(false); setConnectFromId(null) }} disabled={processing || chromaApplying || historyBusy} title="Pinte sobre a junta: o pincel edita a peça visível mais alta, mesmo que outra esteja selecionada" type="button"><Icon name="brush" /><span>Misturador</span></button>
                  <button className="model-tool-button model-mixer-clear" onClick={() => { setMixerActive(false); void restoreHistory('undo') }} disabled={history.undo[history.undo.length - 1]?.action !== 'mixer' || historyBusy || processing || chromaApplying} title="Limpar o último traço do Misturador" aria-label="Limpar último traço do Misturador" type="button"><Icon name="eraser" /></button>
                  <button className={`model-tool-button model-pivot-visibility${showJointPivots ? ' active' : ''}`} aria-pressed={showJointPivots} onClick={() => setShowJointPivots((visible) => !visible)} disabled={processing || chromaApplying || historyBusy} title={showJointPivots ? 'Ocultar bolinhas das juntas' : 'Mostrar bolinhas das juntas'} type="button"><Icon name={showJointPivots ? 'eye' : 'eyeOff'} /><span>{showJointPivots ? 'Ocultar bolinhas' : 'Mostrar bolinhas'}</span></button>
                </div>
              </div>
              <ModelSkinTonePicker value={project.modelSkinTone} outlineColor={project.modelOutlineColor} contourPartCount={project.parts.filter(part => part.fakeSkinContours?.length).length} disabled={processing || chromaApplying || historyBusy || modelSourcePublishing} onSelect={(tone) => updateProject((current) => ({ ...current, modelSkinTone: tone }))} onOutlineSelect={(color) => updateProject((current) => ({ ...current, modelOutlineColor: color }))} onEditContours={() => setSkinContourEditorOpen(true)} />
              <div className={`model-editor-content${processing || chromaApplying || historyBusy ? ' chroma-applying' : ''}`} aria-busy={processing || chromaApplying || historyBusy}>
                <section className="model-canvas-column" aria-label="Prévia e montagem">
                  <div className="model-canvas-topline"><span><i /> CANVAS DE MONTAGEM</span><span>{project.width} × {project.height}</span></div>
                  <div ref={stageRef} className={`model-stage${panning ? ' panning' : ''}${mixerActive ? ' mixer-active' : ''}${mixerPainting ? ' mixer-painting' : ''}`} style={{ '--preview-background': previewBackground } as import('react').CSSProperties} onPointerDown={beginPan} onPointerMove={(event) => { moveMixerStroke(event); movePan(event); movePartDrag(event); moveAnchorDrag(event) }} onPointerUp={(event) => { if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null; if (anchorDragRef.current?.pointerId === event.pointerId) anchorDragRef.current = null; if (panRef.current?.pointerId === event.pointerId) { panRef.current = null; setPanning(false) } if (mixerStrokeRef.current?.pointerId === event.pointerId) { mixerStrokeRef.current = null; setMixerPainting(false) } void mixerQueueRef.current.then(() => finishHistoryGesture()) }} onPointerCancel={() => { dragRef.current = null; anchorDragRef.current = null; panRef.current = null; mixerStrokeRef.current = null; setPanning(false); setMixerPainting(false); void mixerQueueRef.current.then(() => finishHistoryGesture()) }}>
                    <div className="model-artboard" style={{ width: `${project.width * scale}px`, height: `${project.height * scale}px`, left: `calc(50% + ${pan.x}px)`, top: `calc(50% + ${pan.y}px)` }}>
                      {canvasParts.filter((part) => !hiddenPartIds.includes(part.id)).map((part) => <img key={part.id} className={`model-canvas-part${selectedIds.includes(part.id) ? ' selected' : ''}${connectFromId === part.id ? ' connect-source' : ''}`} src={partPreviewSource(part)} alt={part.name} draggable={false} onClick={(event) => { event.stopPropagation(); if (!mixerActive) handlePartClick(part.id, event.ctrlKey || event.metaKey) }} onPointerDown={(event) => beginPartDrag(event, part)} style={{ left: part.x * scale, top: part.y * scale, width: part.width * scale, height: part.height * scale, transform: `rotate(${part.rotation}deg)` }} />)}
                      <svg className="model-joint-layer" viewBox={`0 0 ${project.width} ${project.height}`} preserveAspectRatio="none" aria-label="Conexões entre as peças">
                        {showJointPivots && jointMarkers.map(({ part, anchor, offset, fixed }) => <circle key={part.id} className={`model-joint-anchor${fixed ? ' fixed' : selectedIds.includes(part.id) ? ' selected' : ''}`} cx={anchor.x + offset / scale} cy={anchor.y} r={Math.max(selectedIds.includes(part.id) ? 11 : 8, (selectedIds.includes(part.id) ? 13 : 10) / scale)} aria-label={`Pivô de ${part.name}`} onPointerDown={(event) => beginAnchorDrag(event, part.id, offset)} />)}
                      </svg>
                    </div>
                    <div className="model-stage-tools"><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.min(2.4, value + 0.15))} title="Aumentar zoom" type="button"><Icon name="zoomIn" /></button><button onClick={() => setZoom((value) => Math.max(0.5, value - 0.15))} title="Diminuir zoom" type="button"><Icon name="zoomOut" /></button><button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} title="Centralizar prévia" type="button"><Icon name="frame" /></button></div>
                  </div>
                  <div className="model-canvas-footer"><span>{mixerActive ? <><kbd>Misturador ativo</kbd> passe sobre a junta; ele afeta a camada visível mais alta</> : <><kbd>Arraste o fundo</kbd> para mover a prévia <i /> <kbd>Arraste a peça</kbd> para posicionar <i /> <kbd>Ctrl</kbd> + clique para selecionar várias</>}</span><span>{project.parts.length} peças <i /> {project.joints.length} conexões</span></div>
                </section>

                <aside className="model-parts-panel model-work-panel" aria-label="Painel de edição">
                  <div className="model-panel-header"><div><span className="model-eyebrow">MONTAGEM</span><h2>{panelTab === 'parts' ? 'Peças' : panelTab === 'layers' ? 'Camadas' : 'Articulações'} <small>{panelTab === 'joints' ? project.joints.length : project.parts.length}</small></h2></div><button className="model-icon-button" title="Adicionar outra folha" onClick={() => void importSlot(project.slot)} type="button"><Icon name="plus" /></button></div>
                  <div className="model-panel-tabs" role="tablist" aria-label="Ferramentas do modelo">
                    {([['parts', 'Peças'], ['layers', 'Camadas'], ['joints', 'Juntas']] as const).map(([tab, label]) => <button key={tab} role="tab" aria-selected={panelTab === tab} className={panelTab === tab ? 'active' : ''} onClick={() => setPanelTab(tab)} type="button">{label}</button>)}
                  </div>
                  {panelTab === 'parts' && <div className="model-panel-body">
                    <label className="model-part-search"><Icon name="search" /><input placeholder="Buscar peça…" value={filter} onChange={(event) => setFilter(event.target.value)} /></label>
                    <div className="model-part-grid">{visibleParts.map((part) => <button key={part.id} className={`model-part-card${selectedIds.includes(part.id) ? ' selected' : ''}`} onClick={(event) => handlePartClick(part.id, event.ctrlKey || event.metaKey)} type="button" title={`${part.name} · selecione ou arraste no canvas`}><span className="model-part-thumb"><img src={partPreviewSource(part)} alt="" /></span><span className="model-part-card-name">{part.name}</span><small>{Math.round(part.width)} × {Math.round(part.height)}</small></button>)}{visibleParts.length === 0 && <p className="model-no-parts">Nenhuma peça encontrada.</p>}</div>
                    {selectedPart && <div className="model-selected-tools"><div className="model-selected-name">{renamingPartId === selectedPart.id ? <input autoFocus value={selectedPart.name} onBlur={() => setRenamingPartId(null)} onChange={(event) => updateProject((current) => ({ ...current, parts: current.parts.map((part) => part.id === selectedPart.id ? { ...part, name: event.target.value } : part) }))} onKeyDown={(event) => { if (event.key === 'Enter') setRenamingPartId(null) }} /> : <><strong>{selectedPart.name}</strong><button title="Renomear peça" onClick={() => setRenamingPartId(selectedPart.id)} type="button"><Icon name="edit" /></button></>}</div><div className="model-transform-controls"><strong>Transformação</strong><label title={isTorsoPart(selectedPart) ? "O tronco fica fixo como âncora da montagem." : undefined}>X<input type="number" step="1" value={Number(selectedPart.x.toFixed(1))} disabled={isTorsoPart(selectedPart)} onChange={(event) => setPartCoordinate(selectedPart.id, "x", event.target.value)} /></label><label title={isTorsoPart(selectedPart) ? "O tronco fica fixo como âncora da montagem." : undefined}>Y<input type="number" step="1" value={Number(selectedPart.y.toFixed(1))} disabled={isTorsoPart(selectedPart)} onChange={(event) => setPartCoordinate(selectedPart.id, "y", event.target.value)} /></label><label>Rotação<input type="number" step="1" value={Number(selectedPart.rotation.toFixed(1))} onChange={(event) => updateProject((current) => ({ ...current, parts: current.parts.map((part) => part.id === selectedPart.id ? { ...part, rotation: Number(event.target.value) || 0 } : part) }))} /></label></div>{isTorsoPart(selectedPart) && <small style={{ color: "#a9b5c4" }}>O tronco fica fixo como âncora; monte as demais peças ao redor dele.</small>}{isHeadPart(selectedPart) && <div className="model-head-resize">
                      <div className="model-head-resize-heading"><div><strong>Formato da cabeça</strong><small>Ajuste cada direção sem soltar o encaixe do pescoço.</small></div><button type="button" onClick={() => updateProject((current) => resizeHeadPart(resizeHeadPart(current, selectedPart.id, 'width', 100), selectedPart.id, 'height', 100))}>Restaurar 100%</button></div>
                      {(['width', 'height'] as const).map((axis) => <label className="model-head-resize-row" key={axis}><span>{axis === 'width' ? 'Largura' : 'Altura'}</span><input type="range" min="20" max="300" step="1" value={headSizePercent(selectedPart, axis)} onPointerDown={() => startHistoryGesture('edit')} onPointerUp={finishHistoryGesture} onPointerCancel={finishHistoryGesture} onChange={(event) => updateProject((current) => resizeHeadPart(current, selectedPart.id, axis, Number(event.target.value)))} /><span className="model-head-resize-number"><input type="number" min="20" max="300" step="1" value={headSizePercent(selectedPart, axis)} onChange={(event) => updateProject((current) => resizeHeadPart(current, selectedPart.id, axis, Number(event.target.value)))} />%</span></label>)}
                    </div>}<div className="model-action-row"><button className="model-tool-button" onClick={() => void splitSelected('vertical')} disabled={selectedPart.rotation !== 0 || selectedPart.width < 2} type="button">Dividir ↔</button><button className="model-tool-button" onClick={() => void splitSelected('horizontal')} disabled={selectedPart.rotation !== 0 || selectedPart.height < 2} type="button">Dividir ↕</button><button className="model-tool-button danger" onClick={() => removePart(selectedPart.id)} type="button">Excluir</button></div>{selectedPartIds.length > 1 && <button className="model-merge-button" onClick={() => void mergeSelected()} type="button">Mesclar {selectedPartIds.length} peças selecionadas</button>}</div>}
                    <div className="model-source-info"><span><Icon name="frame" /> Fonte</span><small title={project.sourceName}>{project.sourceName}</small></div>
                  </div>}
                  {panelTab === 'layers' && <div className="model-panel-body model-layer-panel"><p className="model-panel-intro">Arraste uma linha ou use as setas. O item no topo fica na frente. Fixar cria uma conexão automática quando a peça ainda não tem uma e faz o encaixe acompanhar os próximos movimentos.</p><div className="model-layer-list">{frontToBackLayers.map((part, index) => { const joint = project.joints.find((item) => item.childPartId === part.id); const fixed = Boolean(joint?.fixed); const canFix = !isTorsoPart(part) && project.parts.length > 1; return <div key={part.id} draggable className={`model-layer-row${selectedIds.includes(part.id) ? ' selected' : ''}${layerDragId === part.id ? ' dragging' : ''}`} onDragStart={(event) => { layerDragRef.current = part.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', part.id); setLayerDragId(part.id) }} onDragEnd={() => { layerDragRef.current = null; setLayerDragId(null) }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} onDrop={(event) => { event.preventDefault(); const sourceId = event.dataTransfer.getData('text/plain') || layerDragRef.current; if (sourceId) dropLayer(sourceId, part.id); layerDragRef.current = null; setLayerDragId(null) }}><button className="model-layer-select" onClick={() => setSelectedIds([part.id])} type="button"><span className="model-layer-thumb"><img src={partPreviewSource(part)} alt="" /></span><span><strong>{part.name}</strong><small>Camada {frontToBackLayers.length - index} · {hiddenPartIds.includes(part.id) ? 'Oculta' : 'Visível'}{joint ? ` · ${fixed ? 'Fixada' : 'Solta'}` : ' · Sem junta'}</small></span></button><div className="model-layer-controls"><button title="Mover para frente" aria-label={`Mover ${part.name} para frente`} disabled={index === 0} onClick={() => moveLayer(part.id, -1)} type="button">↑</button><button title="Mover para trás" aria-label={`Mover ${part.name} para trás`} disabled={index === frontToBackLayers.length - 1} onClick={() => moveLayer(part.id, 1)} type="button">↓</button><button className={`model-layer-fix${fixed ? ' fixed' : ''}`} title={joint ? fixed ? 'Desfixar conexão' : 'Fixar conexão' : 'Criar conexão automática e fixar'} aria-label={joint ? fixed ? `Desfixar ${part.name}` : `Fixar ${part.name}` : `Criar conexão automática e fixar ${part.name}`} aria-pressed={fixed} disabled={!canFix} onClick={() => toggleJointFix(part.id)} type="button"><Icon name="link" /></button><button title={hiddenPartIds.includes(part.id) ? 'Mostrar peça' : 'Ocultar peça'} aria-label={hiddenPartIds.includes(part.id) ? `Mostrar ${part.name}` : `Ocultar ${part.name}`} aria-pressed={!hiddenPartIds.includes(part.id)} onClick={() => toggleLayerVisibility(part.id)} type="button">{hiddenPartIds.includes(part.id) ? '○' : '◉'}</button></div></div>})}</div></div>}
                  {panelTab === 'joints' && <div className="model-panel-body model-joint-panel"><button className="model-auto-connect" onClick={() => { void autoConnectBodyContours() }} disabled={contourConnecting || processing || chromaApplying || historyBusy || modelSourcePublishing} type="button"><Icon name="sparkles" /><span><strong>{contourConnecting ? 'Conectando contornos…' : 'Conectar automaticamente'}</strong><small>Juntas e contornos de braços e pernas</small></span></button>{jointConnectMessage && <p className="model-connect-hint" role="status">{jointConnectMessage}</p>}<button className={`model-tool-button model-manual-connect${connectMode ? ' active' : ''}`} onClick={() => { setConnectMode((value) => !value); setConnectFromId(null) }} type="button"><span className="model-link-dot" />{connectMode ? 'Selecione duas peças no canvas' : 'Ligar peças manualmente'}</button>{connectMode && <p className="model-connect-hint">Clique primeiro na peça que ficará parada e depois na peça que ela movimenta.</p>}<p className="model-panel-intro">Cada peça conectada tem uma única bolinha. Todas as conexões dessa peça usam o mesmo pivô; selecione a peça para destacar e arraste essa bolinha. O tronco é o centro e não recebe bolinha.</p><div className="model-joint-legend"><span><i className="loose" />Solta</span><span><i className="selected" />Selecionada</span><span><i className="fixed" />Fixada</span></div><div className="model-joint-list"><div className="model-joint-list-heading"><strong>Conexões do esqueleto</strong><small>{project.joints.length}</small></div>{project.joints.length === 0 ? <p className="model-joint-empty">Ainda não há conexões. Use a sugestão automática ou ligue duas peças manualmente.</p> : project.joints.map((joint) => { const parent = project.parts.find((part) => part.id === joint.parentPartId); const child = project.parts.find((part) => part.id === joint.childPartId); return <div className="model-joint-row" key={joint.id}><span className="model-joint-row-name"><b>{parent?.name ?? 'Peça'}</b><Icon name="chevronRight" /><b>{child?.name ?? 'Peça'}</b>{joint.suggested && <small>AUTO</small>}</span><span className="model-joint-controls"><button title="Girar ramo à esquerda" onClick={() => rotateBranch(joint.id, -15)} type="button">−15°</button><button title="Girar ramo à direita" onClick={() => rotateBranch(joint.id, 15)} type="button">+15°</button><button title="Desconectar" onClick={() => updateProject((current) => ({ ...current, joints: current.joints.filter((item) => item.id !== joint.id) }))} type="button">×</button></span></div>})}</div></div>}
                </aside>
              </div>
            </>
          )}
          {error && <div className="model-toast" role="status"><span>{error}</span><button onClick={() => setError('')} type="button" aria-label="Fechar aviso">×</button></div>}
          {processing && project && <div className="model-processing-overlay"><div className="model-spinner" /><span>Reanalisando imagem · {progress}%</span></div>}
        </section>
      )}
      </section>
      </ModelAppearanceProvider>
    </main>
  )
}
