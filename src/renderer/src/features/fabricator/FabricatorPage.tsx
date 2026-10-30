import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FabricatorAssetSave, FabricatorHistoryAction, FabricatorHistoryState, FabricatorProject, FabricatorSlotSummary, ModelPart } from '../../../../shared/fabricator'
import { Icon, type IconName } from '../../ui/components/Icon'
import { usePreviewBackground } from '../../ui/hooks/usePreviewBackground'
import { modelRigSegmentKind, normalizeLayerOrder, orderedParts, reorderLayer } from './models/rig'
import { connectFabricatorParts, isTorsoPart, moveFabricatorPartBranch, rotateFabricatorPartBranch, toggleFabricatorJointFixed } from './models/rigEditing'
import { buildFabricatorJointMarkers } from './models/jointMarkerModel'
import { createFabricatorCanvasInteraction, type AnchorDragState, type DragState, type PanState } from './canvasInteraction'
import { FabricatorModelCanvas } from './FabricatorModelCanvas'
import { FabricatorModelPanel, type FabricatorPanelTab } from './FabricatorModelPanel'
import { resizeHeadPart } from './models/resize'
import { ModelSourceEditor } from './ModelSourceEditor'
import { broadcastModelSourceUpdate } from './models/modelSourceEvents'
import { splitImage, mergeImages } from './models/partImages'
import { createImportedModelProject } from './models/processedModelProject'
import { startChromaAdjustWorker, ChromaAdjustTaskError, type ChromaAdjustTask } from './models/runChromaAdjustWorker'
import { startImageProcessorWorker, ImageProcessorTaskError, type ImageProcessorTask } from './models/runImageProcessorWorker'
import { serializeFabricatorProject } from './models/projectSerialization'
import { createFabricatorProjectSaveCoordinator } from './projectSaveCoordinator'
import { useFabricatorHistory } from './useFabricatorHistory'
import { prepareLoadedFabricatorProject } from './models/projectHydration'
import { MAX_CHROMA_TOLERANCE, type ModelSourceResult } from './models/modelSource'
import { ModelSkinTonePicker } from './ModelSkinTonePicker'
import { ModelSkinContourEditor } from './ModelSkinContourEditor'
import { DuplicateModelDialog } from './DuplicateModelDialog'
import { cachedModelBodyAppearancePreview } from './models/modelSkinTone'
import { connectBodyContourJoints } from './models/contourJoints'
import { isValidSkinTone } from '../../../../shared/skinTones'
import { ModelAppearanceProvider } from './ModelAppearanceContext'
import { useFabricatorModelAppearance } from './useFabricatorModelAppearance'
import { useFabricatorSeamMixer } from './useFabricatorSeamMixer'
import { flushPendingRendererWrites, registerPendingWriteFlusher } from '../../ui/pendingPersistence'
// Several workspaces share selectors; preserve their availability before any
// lazy workspace mounts, regardless of the order in which areas are opened.
import './wardrobe/wardrobe.css'
import './face/face-components.css'
import './face/head-extras.css'

const PoseWorkspace = lazy(async () => ({ default: (await import('./PoseWorkspace')).PoseWorkspace }))
const WardrobeWorkspace = lazy(async () => ({ default: (await import('./wardrobe/WardrobeWorkspace')).WardrobeWorkspace }))
const FaceComponentsWorkspace = lazy(async () => ({ default: (await import('./face/FaceComponentsWorkspace')).FaceComponentsWorkspace }))
const HeadExtrasWorkspace = lazy(async () => ({ default: (await import('./face/HeadExtrasWorkspace')).HeadExtrasWorkspace }))
const HairWorkspace = lazy(async () => ({ default: (await import('./HairWorkspace')).HairWorkspace }))
const AnimatorWorkspace = lazy(async () => ({ default: (await import('./AnimatorWorkspace')).AnimatorWorkspace }))
const DesignWorkspace = lazy(async () => ({ default: (await import('./DesignWorkspace')).DesignWorkspace }))
const ExpressionPresetWorkspace = lazy(async () => ({ default: (await import('./ExpressionPresetWorkspace')).ExpressionPresetWorkspace }))
const FaceAnimatorWorkspace = lazy(async () => ({ default: (await import('./FaceAnimatorWorkspace')).FaceAnimatorWorkspace }))

const sections: { id: string; label: string; icon: IconName }[] = [
  { id: 'Modelos', label: 'Modelos Dev', icon: 'sparkles' }, { id: 'Poses', label: 'Poses Dev', icon: 'expand' }, { id: 'Roupas', label: 'Roupas Dev', icon: 'shirt' }, { id: 'Olhos', label: 'Olhos Dev', icon: 'face' }, { id: 'Rosto', label: 'Rosto Dev', icon: 'face' }, { id: 'Preset Expressão Dev', label: 'Preset Expressão Dev', icon: 'face' }, { id: 'Animador Rosto Dev', label: 'Animador Rosto Dev', icon: 'face' }, { id: 'Cabeças extra', label: 'Cabeças extra dev', icon: 'face' }, { id: 'Cabelos Dev', label: 'Cabelos Dev', icon: 'bow' }, { id: 'Animador Dev', label: 'Animador Dev', icon: 'body' }, { id: 'Design Dev', label: 'Design Dev', icon: 'flower' }
]

const DEFAULT_CHROMA_TOLERANCE = 74

export function FabricatorPage() {
  const [previewBackground] = usePreviewBackground()
  const [activeSection, setActiveSection] = useState('Modelos')
  const [slots, setSlots] = useState<FabricatorSlotSummary[]>(Array.from({ length: 10 }, () => null))
  const [slotsLoaded, setSlotsLoaded] = useState(false)
  const [slotSwitching, setSlotSwitching] = useState(false)
  const [activeSlot, setActiveSlot] = useState(1)
  const [project, setProject] = useState<FabricatorProject | null>(null)
  const [bodyAppearancePreviewUrls, setBodyAppearancePreviewUrls] = useState<Record<string, string>>({})
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [processing, setProcessing] = useState(false)
  const [chromaApplying, setChromaApplying] = useState(false)
  const [modelSourceOpen, setModelSourceOpen] = useState(false)
  const [skinContourEditorOpen, setSkinContourEditorOpen] = useState(false)
  const [modelSourcePublishing, setModelSourcePublishing] = useState(false)
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false)
  const [duplicateTargetSlot, setDuplicateTargetSlot] = useState<number | null>(null)
  const [duplicatingModel, setDuplicatingModel] = useState(false)
  const [duplicateError, setDuplicateError] = useState('')
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
  const [panelTab, setPanelTab] = useState<FabricatorPanelTab>('parts')
  const [layerDragId, setLayerDragId] = useState<string | null>(null)
  const [showJointPivots, setShowJointPivots] = useState(true)
  const [mixerActive, setMixerActive] = useState(false)
  const [mixerPainting, setMixerPainting] = useState(false)
  const [thighDeformationActive, setThighDeformationActive] = useState(false)
  const [temporaryThighDeformationIds, setTemporaryThighDeformationIds] = useState<Set<string>>(() => new Set())
  const [thighDeformationRadius, setThighDeformationRadius] = useState(28)
  const [thighDeformationStrength, setThighDeformationStrength] = useState(70)
  const [temporaryThighResetToken, setTemporaryThighResetToken] = useState(0)
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
  const layerDragRef = useRef<string | null>(null)
  const imageProcessingTaskRef = useRef<ImageProcessorTask | null>(null)
  const chromaTaskRef = useRef<ChromaAdjustTask | null>(null)
  const requestId = useRef(0)
  const slotSelectionGeneration = useRef(0)
  const dirtyAssets = useRef<Map<string, string>>(new Map())
  const dirtyChromaBases = useRef<Map<string, string>>(new Map())
  const initialSlotLoad = useRef(false)
  const cancelImageProcessingTask = useCallback(() => {
    const task = imageProcessingTaskRef.current
    imageProcessingTaskRef.current = null
    task?.cancel()
  }, [])
  const cancelChromaTask = useCallback(() => {
    const task = chromaTaskRef.current
    chromaTaskRef.current = null
    task?.cancel()
  }, [])
  const {
    history, historyBusy, clearHistory, replaceHistory,
    recordHistorySnapshot, startHistoryGesture, finishHistoryGesture,
    resetHistoryGesture, trackProjectChange, restoreHistory
  } = useFabricatorHistory({
    projectRef, dirtyAssets, dirtyChromaBases,
    setProject, setSelectedIds, setSaveState, setError, setSlots,
    processing, chromaApplying
  })

  const projectSaveCoordinator = useMemo(() => createFabricatorProjectSaveCoordinator({
    projectRef, dirtyAssets, dirtyChromaBases,
    saveProject: (serialized, changedAssets) => window.desktop.fabricator.saveFabricatorProject(serialized, changedAssets),
    setSaveState,
    setError,
    onProjectSaved: (snapshot) => {
      window.dispatchEvent(new Event('fabricator:assets-updated'))
      setSlots((items) => items.map((item, index) => index + 1 === snapshot.slot
        ? { slot: snapshot.slot, name: snapshot.name, sourceName: snapshot.sourceName, partCount: snapshot.parts.length, updatedAt: snapshot.updatedAt }
        : item))
    }
  }), [])
  const { persistProject, flushProjectWrites, cancelScheduledSave, waitForProjectWrites } = projectSaveCoordinator

  useEffect(() => registerPendingWriteFlusher(flushProjectWrites), [flushProjectWrites])

  const { appearanceProject, appearanceLoadError, setAppearanceTargetSlot } = useFabricatorModelAppearance({ activeSection, activeSlot, project })

  useEffect(() => {
    void window.desktop.fabricator.listFabricatorSlots()
      .then((items) => { setSlots(items); setSlotsLoaded(true) })
      .catch((reason: unknown) => { setSlotsLoaded(true); setError(reason instanceof Error ? reason.message : 'Não foi possível abrir a biblioteca.') })
    return () => {
      requestId.current += 1
      cancelImageProcessingTask()
      cancelChromaTask()
    }
  }, [cancelChromaTask, cancelImageProcessingTask])

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

  useEffect(() => projectSaveCoordinator.scheduleSave(project), [project, projectSaveCoordinator])

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
  const canDeformThigh = Boolean(project?.parts.some((part) => modelRigSegmentKind(part.name) === 'thigh'))
  const updateTemporaryThighDeformation = useCallback((partId: string, warped: boolean) => {
    setTemporaryThighDeformationIds((current) => {
      if (current.has(partId) === warped) return current
      const next = new Set(current)
      if (warped) next.add(partId)
      else next.delete(partId)
      return next
    })
  }, [])
  const reportTemporaryThighError = useCallback((message: string) => setError(message), [])
  const resetTemporaryThighDeformation = useCallback(() => {
    setTemporaryThighResetToken((current) => current + 1)
    setTemporaryThighDeformationIds(new Set())
  }, [])
  const toggleThighDeformation = useCallback(() => {
    if (!thighDeformationActive) {
      setMixerActive(false)
      setConnectMode(false)
      setConnectFromId(null)
    }
    setThighDeformationActive(!thighDeformationActive)
  }, [thighDeformationActive])
  const frontToBackLayers = useMemo(() => canvasParts.slice().reverse(), [canvasParts])
  const jointMarkers = useMemo(() => project
    ? buildFabricatorJointMarkers(project.parts, project.joints, selectedIds)
    : [], [project?.parts, project?.joints, selectedIds])
  const hiddenPartIds = project?.hiddenPartIds ?? []
  const measuredWidth = Math.max(stageSize.width, stageRef.current?.clientWidth ?? 0)
  const measuredHeight = Math.max(stageSize.height, stageRef.current?.clientHeight ?? 0)
  const scale = project ? Math.max(0.05, Math.min((measuredWidth - 48) / project.width, (measuredHeight - 48) / project.height)) * zoom : 1
  const toModelPoint = useCallback((clientX: number, clientY: number) => {
    const stage = stageRef.current
    if (!stage || !project || scale <= 0) return null
    const rect = stage.getBoundingClientRect()
    const x = clientX - rect.left - stage.clientLeft
    const y = clientY - rect.top - stage.clientTop
    return {
      x: (x - stage.clientWidth / 2 - pan.x) / scale + project.width / 2,
      y: (y - stage.clientHeight / 2 - pan.y) / scale + project.height / 2
    }
  }, [pan.x, pan.y, project?.height, project?.width, scale])

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
    setSlotSwitching(true)
    requestId.current += 1
    cancelImageProcessingTask()
    cancelChromaTask()
    setProcessing(false); setProgress(0); setChromaApplying(false)
    const projectToSave = projectRef.current ?? project
    if (projectToSave) {
      cancelScheduledSave()
      try { await persistProject(projectToSave) } catch (reason) {
        if (generation === slotSelectionGeneration.current) {
          setError(reason instanceof Error ? `Falha ao salvar antes de trocar de slot: ${reason.message}` : 'Falha ao salvar antes de trocar de slot.')
          setSlotSwitching(false)
        }
        return
      }
    }
    if (generation !== slotSelectionGeneration.current) return
    seamMixer.resetSession()
    resetHistoryGesture()
    clearHistory()
    projectRef.current = null
    setActiveSlot(slot); setProject(null); setSelectedIds([]); setError(''); dirtyAssets.current.clear(); dirtyChromaBases.current.clear(); setMixerActive(false); setMixerPainting(false); setZoom(1); setPan({ x: 0, y: 0 })
    const summary = slots[slot - 1]
    if (!summary) { setSlotSwitching(false); return }
    if (summary.recoveryRequired) {
      setActiveSection('Modelos')
      setError(`O slot ${slot} tem mais de uma cópia de recuperação válida, então o app não escolheu nenhuma automaticamente. Use “Excluir recuperação” somente se quiser apagar todas as cópias deste slot.`)
      setSlotSwitching(false)
      return
    }
    try {
      const loaded = await window.desktop.fabricator.loadFabricatorSlot(slot)
      if (generation !== slotSelectionGeneration.current) return
      if (!loaded) throw new Error('O projeto salvo não pôde ser carregado.')
      let loadedHistory: FabricatorHistoryState = { undo: [], redo: [] }
      try { loadedHistory = await window.desktop.fabricator.loadFabricatorHistory(slot) } catch {
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
    const confirmation = summary.recoveryRequired
      ? `Limpar permanentemente a recuperação pendente do slot ${slot}? Todos os backups, arquivos temporários e transações deste slot serão apagados sem possibilidade de restauração.`
      : `Excluir permanentemente “${summary.name}” do slot ${slot}? A imagem original, as peças salvas, os backups e as transações pendentes deste slot serão apagados sem possibilidade de restauração.`
    if (!window.confirm(confirmation)) return
    setDeletingSlot(slot)
    if (activeSlot === slot) {
      slotSelectionGeneration.current += 1
      requestId.current += 1
      cancelScheduledSave()
      cancelImageProcessingTask()
      cancelChromaTask(); setChromaApplying(false)
      setProcessing(false); setProgress(0)
    }
    try {
      await waitForProjectWrites()
      await window.desktop.fabricator.deleteFabricatorSlot(slot)
      setSlots((current) => current.map((item, index) => index === slot - 1 ? null : item))
      if (activeSlot === slot) {
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

  const openDuplicateModelDialog = () => {
    const source = projectRef.current ?? project
    if (!source) return
    const firstEmptySlot = slots.findIndex((summary, index) => !summary && index + 1 !== source.slot)
    setDuplicateTargetSlot(firstEmptySlot < 0 ? null : firstEmptySlot + 1)
    setDuplicateError('')
    setDuplicateModalOpen(true)
  }

  const duplicateModel = async () => {
    const source = projectRef.current ?? project
    const targetSlot = duplicateTargetSlot
    if (!source || !targetSlot || targetSlot === source.slot || slots[targetSlot - 1]) return
    setDuplicatingModel(true)
    setDuplicateError('')
    try {
      cancelScheduledSave()
      await persistProject(source)
      await window.desktop.fabricator.duplicateFabricatorSlot(source.slot, targetSlot)
      const updatedAt = new Date().toISOString()
      setSlots((current) => current.map((summary, index) => index + 1 === targetSlot
        ? { slot: targetSlot, name: source.name, sourceName: source.sourceName, partCount: source.parts.length, updatedAt }
        : summary))
      window.dispatchEvent(new Event('fabricator:assets-updated'))
      setDuplicateModalOpen(false)
      setDuplicateTargetSlot(null)
    } catch (reason) {
      setDuplicateError(reason instanceof Error ? reason.message : 'Não foi possível duplicar o modelo.')
    } finally {
      setDuplicatingModel(false)
    }
  }

  const discardImportedSource = async (slot: number, sourceAssetName: string, generation: number) => {
    try {
      await window.desktop.fabricator.discardImportedFabricatorSource(slot, sourceAssetName)
      return null
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      if (generation !== slotSelectionGeneration.current) console.error('Não foi possível limpar uma imagem de importação não usada.', reason)
      return message
    }
  }
  const withImportCleanupError = (message: string, cleanupError: string | null) => cleanupError
    ? `${message} A imagem temporária também não pôde ser removida: ${cleanupError}`
    : message

  const runProcessor = (
    sourceDataUrl: string,
    tolerance: number,
    metadata: { slot: number; name: string; sourceName: string; sourceAssetName: string },
    recordBefore?: FabricatorProject,
    importedSource?: { sourceAssetName: string; generation: number }
  ) => {
    const id = ++requestId.current
    cancelImageProcessingTask()
    const task = startImageProcessorWorker({ id, sourceDataUrl, tolerance }, setProgress)
    imageProcessingTaskRef.current = task
    setProcessing(true); setProgress(1); setError('')
    const discardUncommittedSource = () => importedSource
      ? discardImportedSource(metadata.slot, importedSource.sourceAssetName, importedSource.generation)
      : Promise.resolve(null)
    void task.result.then(async (message) => {
      if (id !== requestId.current) { await discardUncommittedSource(); return }
      if (imageProcessingTaskRef.current === task) imageProcessingTaskRef.current = null
      setProcessing(false)
      if (message.parts.length === 0) {
        const cleanupError = await discardUncommittedSource()
        setError(withImportCleanupError('Nenhuma peça foi encontrada. Aumente a tolerância ou escolha outra imagem.', cleanupError))
        return
      }
      let imported: ReturnType<typeof createImportedModelProject>
      try {
        imported = createImportedModelProject(message, sourceDataUrl, tolerance, metadata)
      } catch (reason) {
        const cleanupError = await discardUncommittedSource()
        setError(withImportCleanupError(reason instanceof Error ? reason.message : 'Não foi possível montar o modelo importado.', cleanupError))
        return
      }
      for (const [partId, dataUrl] of imported.dirtyAssets) dirtyAssets.current.set(partId, dataUrl)
      for (const [partId, dataUrl] of imported.dirtyChromaBases) dirtyChromaBases.current.set(partId, dataUrl)
      if (recordBefore) recordHistorySnapshot(recordBefore, 'reset', imported.project)
      setChromaValue(tolerance)
      projectRef.current = imported.project
      setProject(imported.project); setSelectedIds(imported.project.parts[0] ? [imported.project.parts[0].id] : [])
    }, async (reason: unknown) => {
      if (id !== requestId.current) { await discardUncommittedSource(); return }
      if (imageProcessingTaskRef.current === task) imageProcessingTaskRef.current = null
      setProcessing(false)
      if (reason instanceof ImageProcessorTaskError && reason.kind === 'cancelled') {
        const cleanupError = await discardUncommittedSource()
        if (cleanupError) setError(withImportCleanupError('A importação foi cancelada.', cleanupError))
        return
      }
      const cleanupError = await discardUncommittedSource()
      setError(withImportCleanupError(reason instanceof ImageProcessorTaskError && reason.kind === 'worker' ? reason.message : 'O processamento da imagem falhou.', cleanupError))
    }).catch((reason: unknown) => {
      if (id === requestId.current) setError(reason instanceof Error ? reason.message : 'Não foi possível concluir a importação do modelo.')
    })
  }


  const publishEditedModelSource = async (result: ModelSourceResult): Promise<void> => {
    const current = projectRef.current
    if (!current || modelSourcePublishing || processing || chromaApplying || historyBusy) throw new Error('O modelo não está disponível para edição.')
    setModelSourcePublishing(true)
    setSaveState('saving')
    cancelScheduledSave()
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
      const newSourceName = await window.desktop.fabricator.publishFabricatorModelSource(serialized, result.sourceDataUrl, changedAssets)
      const published: FabricatorProject = { ...next, sourceAssetName: newSourceName }
      clearHistory()
      dirtyAssets.current.clear()
      dirtyChromaBases.current.clear()
      seamMixer.clearSurfaces()
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
    const id = ++requestId.current
    cancelChromaTask()
    const slot = project.slot
    const tolerance = chromaValue
    const task = startChromaAdjustWorker({
      id,
      sourceDataUrl: project.sourceDataUrl,
      tolerance,
      parts: project.parts.map(({ id: partId, dataUrl, chromaBaseDataUrl }) => ({ id: partId, dataUrl: chromaBaseDataUrl ?? dataUrl }))
    })
    chromaTaskRef.current = task
    setChromaApplying(true); setError('')
    void task.result.then((updatedAssets) => {
      if (id !== requestId.current) return
      if (chromaTaskRef.current === task) chromaTaskRef.current = null
      setChromaApplying(false)
      for (const [partId, dataUrl] of updatedAssets) dirtyAssets.current.set(partId, dataUrl)
      seamMixer.clearSurfaces()
      updateProject((current) => current.slot !== slot ? current : {
        ...current,
        tolerance,
        parts: current.parts.map((part) => updatedAssets.has(part.id) ? { ...part, dataUrl: updatedAssets.get(part.id)! } : part)
      })
    }).catch((reason: unknown) => {
      if (id !== requestId.current) return
      if (chromaTaskRef.current === task) chromaTaskRef.current = null
      setChromaApplying(false)
      if (reason instanceof ChromaAdjustTaskError && reason.kind === 'cancelled') return
      if (reason instanceof ChromaAdjustTaskError && reason.kind === 'worker') {
        setError(`Chroma key: ${reason.message}`)
        return
      }
      setError('O ajuste do chroma key falhou. Suas posições e conexões foram preservadas.')
    })
  }

  const resetModel = async () => {
    if (!project || processing || chromaApplying || historyBusy) return
    const originalName = project.sourceName.replace(/\.[^.]+$/, '') || `Modelo ${project.slot}`
    if (!window.confirm('Resetar este modelo para a importação original? Isso vai apagar os recortes, posições, camadas, juntas e ajustes atuais.')) return
    cancelScheduledSave()
    setProcessing(true)
    try {
      await persistProject(project)
    } catch (reason) {
      setProcessing(false)
      setError(reason instanceof Error ? `Não foi possível salvar antes de resetar: ${reason.message}` : 'Não foi possível salvar antes de resetar.')
      setProject((current) => current ? { ...current, updatedAt: new Date().toISOString() } : current)
      return
    }
    cancelChromaTask(); setChromaApplying(false)
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
    if (slots[slot - 1]?.recoveryRequired) {
      setError(`O slot ${slot} tem backups de recuperação ambíguos. Exclua o slot antes de importar uma nova imagem.`)
      return
    }
    const reimporting = preserveExisting && Boolean(slots[slot - 1])
    if (slots[slot - 1] && !reimporting && !window.confirm(`Substituir o modelo do slot ${slot}? O projeto atual será trocado.`)) return
    const projectToSave = projectRef.current ?? project
    if (projectToSave) {
      cancelScheduledSave()
      try { await persistProject(projectToSave) } catch (reason) { setError(reason instanceof Error ? `Falha ao salvar antes da importação: ${reason.message}` : 'Falha ao salvar antes da importação.'); return }
    }
    if (selectionGeneration !== slotSelectionGeneration.current) return
    setError('')
    let selectedSource: { sourceName: string; sourceAssetName: string; sourceDataUrl: string } | null = null
    let sourcePersisted = false
    let cleanupDelegated = false
    try {
      const selected = await window.desktop.fabricator.importFabricatorModel(slot, reimporting ? 'reimport' : 'import')
      if (!selected) return
      selectedSource = selected
      if (selectionGeneration !== slotSelectionGeneration.current) {
        await discardImportedSource(slot, selected.sourceAssetName, selectionGeneration)
        cleanupDelegated = true
        return
      }
      if (reimporting) {
        const current = projectRef.current
        const existing = current?.slot === slot ? current : await window.desktop.fabricator.loadFabricatorSlot(slot)
        if (!existing) throw new Error('O modelo salvo não foi encontrado. Nenhuma configuração foi alterada.')
        if (selectionGeneration !== slotSelectionGeneration.current) {
          await discardImportedSource(slot, selected.sourceAssetName, selectionGeneration)
          cleanupDelegated = true
          return
        }
        const updated: FabricatorProject = {
          ...existing,
          sourceName: selected.sourceName,
          sourceAssetName: selected.sourceAssetName,
          sourceDataUrl: selected.sourceDataUrl
        }
        await persistProject(updated)
        sourcePersisted = true
        if (selectionGeneration !== slotSelectionGeneration.current) {
          broadcastModelSourceUpdate({ slot, sourceAssetName: selected.sourceAssetName })
          return
        }
        if (activeSlot !== slot || projectRef.current?.slot !== slot) {
          let loadedHistory: FabricatorHistoryState = { undo: [], redo: [] }
          try { loadedHistory = await window.desktop.fabricator.loadFabricatorHistory(slot) } catch {
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
      cancelChromaTask(); setChromaApplying(false)
      seamMixer.resetSession()
      projectRef.current = null
      setActiveSlot(slot); setProject(null); setSelectedIds([]); dirtyAssets.current.clear(); dirtyChromaBases.current.clear(); setMixerActive(false); setMixerPainting(false)
      const name = selected.sourceName.replace(/\.[^.]+$/, '') || `Modelo ${slot}`
      const recordBefore = project?.slot === slot ? project : undefined
      if (!recordBefore) clearHistory()
      runProcessor(selected.sourceDataUrl, 74, { slot, name, sourceName: selected.sourceName, sourceAssetName: selected.sourceAssetName }, recordBefore, {
        sourceAssetName: selected.sourceAssetName,
        generation: selectionGeneration
      })
      cleanupDelegated = true
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Não foi possível importar a imagem.'
      const cleanupError = selectedSource && !sourcePersisted && !cleanupDelegated
        ? await discardImportedSource(slot, selectedSource.sourceAssetName, selectionGeneration)
        : null
      setError(withImportCleanupError(message, cleanupError))
    }
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

  const seamMixer = useFabricatorSeamMixer({
    stageRef,
    projectRef,
    dirtyAssets,
    scale,
    pan,
    setMixerPainting,
    startHistoryGesture,
    updateProject,
    setError
  })

  const canvasInteraction = createFabricatorCanvasInteraction({
    project, dragRef, anchorDragRef, panRef, mixerStrokeRef: seamMixer.mixerStrokeRef,
    setSelectedIds, connectMode, mixerActive, thighDeformationActive, pan,
    setPan, setPanning, setMixerPainting, scale, mixerQueueRef: seamMixer.mixerQueueRef,
    startHistoryGesture, finishHistoryGesture, updateProject, updatePartPosition,
    startMixerStroke: seamMixer.startMixerStroke, moveMixerStroke: seamMixer.moveMixerStroke
  })

  const renderEmptyState = () => (
    <div className="model-empty-state">
      <div className="model-empty-symbol"><Icon name="sparkles" /></div>
      <p className="model-eyebrow">{slots[activeSlot - 1]?.recoveryRequired ? 'RECUPERAÇÃO DO MODEL SOURCE' : 'BIBLIOTECA DE MODELOS'}</p>
      <h1>{slots[activeSlot - 1]?.recoveryRequired ? 'Este slot precisa de uma decisão' : slots[activeSlot - 1] ? 'Abrindo projeto…' : 'Sua mesa de montagem'}</h1>
      <p>{slots[activeSlot - 1]?.recoveryRequired
        ? 'Foram encontrados vários backups válidos e o app não escolheu um automaticamente. Use “Excluir recuperação” para apagar permanentemente apenas os arquivos deste slot.'
        : 'Importe uma folha de peças. O Nymi remove o fundo, recorta cada elemento e abre o canvas para você montar e articular o modelo.'}</p>
      {!slots[activeSlot - 1]?.recoveryRequired && <button className="model-primary-button" onClick={() => void importSlot(activeSlot, true)} type="button"><Icon name={slots[activeSlot - 1] ? 'reset' : 'plus'} /> {slots[activeSlot - 1] ? 'Reimportar imagem' : 'Importar imagem'}</button>}
      <span className="model-supported-formats">PNG · JPG · WEBP · processamento local</span>
    </div>
  )

  const duplicateDestinationSlots = slots.flatMap((summary, index) =>
    !summary && index + 1 !== project?.slot ? [index + 1] : []
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
            <button aria-pressed={activeSection === section.id} className={`fabricator-section-button${activeSection === section.id ? ' active' : ''}`} key={section.id} onClick={() => {
              void flushPendingRendererWrites().then(() => {
                setActiveSection(section.id); setAppearanceTargetSlot(activeSlot)
                if (section.id !== 'Modelos') { setThighDeformationActive(false); setTemporaryThighDeformationIds(new Set()) }
              }).catch((reason: unknown) => setError(reason instanceof Error ? `Não foi possível salvar antes de trocar de área: ${reason.message}` : 'Não foi possível salvar antes de trocar de área.'))
            }} disabled={Boolean(slots[activeSlot - 1]?.recoveryRequired) && section.id !== 'Modelos'} title={slots[activeSlot - 1]?.recoveryRequired && section.id !== 'Modelos' ? 'Resolva a recuperação pendente do slot antes de abrir esta área.' : undefined} type="button">
              <Icon name={section.icon} /><span>{section.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {modelSourceOpen && project && <ModelSourceEditor project={project} onClose={() => { if (!modelSourcePublishing) setModelSourceOpen(false) }} onPublish={publishEditedModelSource} />}
      {duplicateModalOpen && project && <DuplicateModelDialog
        modelName={project.name}
        sourceSlot={project.slot}
        destinationSlots={duplicateDestinationSlots}
        targetSlot={duplicateTargetSlot}
        busy={duplicatingModel}
        error={duplicateError}
        onSelectSlot={(slot) => { setDuplicateTargetSlot(slot); setDuplicateError('') }}
        onCancel={() => setDuplicateModalOpen(false)}
        onDuplicate={() => void duplicateModel()}
      />}
      {skinContourEditorOpen && project && <ModelSkinContourEditor key={project.slot} parts={project.parts} skinTone={project.modelSkinTone} outlineColor={project.modelOutlineColor} onClose={() => setSkinContourEditorOpen(false)} onSave={(contoursByPart) => updateProject(current => ({ ...current, parts: current.parts.map(part => {
        if (!(part.id in contoursByPart)) return part
        const fakeSkinContours = contoursByPart[part.id]
        return { ...part, fakeSkinContours: fakeSkinContours.length ? fakeSkinContours : undefined }
      }) }))} />}
      <ModelAppearanceProvider slot={appearanceProject?.slot ?? null} previewUrls={bodyAppearancePreviewUrls} modelSkinTone={appearanceProject?.modelSkinTone} modelOutlineColor={appearanceProject?.modelOutlineColor} setTargetSlot={setAppearanceTargetSlot}>
        <section className="fabricator-workspace-shell">
          {activeSection !== 'Modelos' && appearanceLoadError && <small className="fabricator-appearance-error" role="status">Não foi possível carregar a prévia do modelo base: {appearanceLoadError}</small>}
      <Suspense fallback={<div role="status" aria-busy="true">Carregando área…</div>}>
      {activeSection === 'Design Dev' ? <DesignWorkspace /> : activeSection === 'Poses' ? <PoseWorkspace baseModelSlot={activeSlot} /> : activeSection === 'Roupas' ? <WardrobeWorkspace baseModelSlot={activeSlot} /> : activeSection === 'Olhos' ? <FaceComponentsWorkspace mode="eyes" baseModelSlot={activeSlot} /> : activeSection === 'Rosto' ? <FaceComponentsWorkspace mode="face" baseModelSlot={activeSlot} /> : activeSection === 'Preset Expressão Dev' ? <ExpressionPresetWorkspace modelSlot={activeSlot} /> : activeSection === 'Animador Rosto Dev' ? <FaceAnimatorWorkspace modelSlot={activeSlot} /> : activeSection === 'Cabeças extra' ? <HeadExtrasWorkspace baseModelSlot={activeSlot} /> : activeSection === 'Cabelos Dev' ? <HairWorkspace baseModelSlot={activeSlot} /> : activeSection === 'Animador Dev' ? <AnimatorWorkspace baseModelSlot={activeSlot} /> : (
        <section className="fabricator-model-editor" aria-label="Editor de modelos">
          <header className="model-slotbar">
            <div className="model-slot-title"><span className="model-slot-logo"><Icon name="sparkles" /></span><span><strong>Modelos</strong><small>10 espaços de trabalho</small></span></div>
            <div className="model-slots" role="tablist" aria-label="Slots de modelos">
              {slots.map((slot, index) => {
                const number = index + 1
                return <button key={number} className={`model-slot${activeSlot === number ? ' active' : ''}${slot ? ' filled' : ' empty'}`} onClick={() => void selectSlot(number)} disabled={deletingSlot !== null} role="tab" aria-selected={activeSlot === number} aria-label={`Slot ${number}, ${slot?.recoveryRequired ? 'recuperação pendente' : slot ? 'preenchido' : 'vazio'}`} title={slot ? `Slot ${number}: ${slot.name}${slot.recoveryRequired ? ' — vários backups válidos' : ` — ${slot.partCount} peças`}` : `Slot ${number}: vazio`} type="button">
                  <span>{String(number).padStart(2, '0')}</span><small>{slot?.recoveryRequired ? 'Recuperação' : slot ? 'Preenchido' : 'Vazio'}</small>
                </button>
              })}
            </div>
            {slots[activeSlot - 1] && <button className="model-delete-compact" onClick={() => void deleteSlot(activeSlot)} disabled={slotSwitching || deletingSlot === activeSlot} title={slots[activeSlot - 1]?.recoveryRequired ? 'Apagar permanentemente os backups e transações deste slot' : 'Excluir permanentemente este modelo'} type="button"><Icon name="trash" /><span>{deletingSlot === activeSlot ? 'Excluindo…' : slots[activeSlot - 1]?.recoveryRequired ? 'Excluir recuperação' : 'Excluir modelo'}</span></button>}
            {project?.slot === activeSlot && <button className="model-duplicate-compact" onClick={openDuplicateModelDialog} disabled={slotSwitching || deletingSlot !== null || processing || chromaApplying || historyBusy || modelSourcePublishing} title="Criar uma cópia deste modelo em outro slot vazio" type="button"><Icon name="box" /><span>Duplicar modelo</span></button>}
            <button className="model-import-compact" onClick={() => void importSlot(activeSlot, true)} disabled={Boolean(slots[activeSlot - 1]?.recoveryRequired) || slotSwitching || deletingSlot !== null || processing || chromaApplying || historyBusy || modelSourcePublishing} title={slots[activeSlot - 1]?.recoveryRequired ? 'Exclua a recuperação pendente antes de importar' : slots[activeSlot - 1] ? 'Substituir a imagem original preservando peças, poses, juntas e demais configurações' : 'Importar folha para este slot'} type="button"><Icon name={slots[activeSlot - 1] ? 'reset' : 'plus'} /><span>{slots[activeSlot - 1]?.recoveryRequired ? 'Recuperação' : slots[activeSlot - 1] ? 'Reimportar' : 'Importar'}</span></button>
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
              <ModelSkinTonePicker value={project.modelSkinTone} outlineColor={project.modelOutlineColor} contourPartCount={project.parts.filter(part => part.fakeSkinContours?.length).length} disabled={processing || chromaApplying || historyBusy || modelSourcePublishing} thighDeformationActive={thighDeformationActive} hasTemporaryThighDeformation={temporaryThighDeformationIds.size > 0} thighDeformationDisabled={!canDeformThigh} thighDeformationRadius={thighDeformationRadius} thighDeformationStrength={thighDeformationStrength} onToggleThighDeformation={toggleThighDeformation} onResetTemporaryThighDeformation={resetTemporaryThighDeformation} onThighDeformationRadiusChange={setThighDeformationRadius} onThighDeformationStrengthChange={setThighDeformationStrength} onSelect={(tone) => updateProject((current) => ({ ...current, modelSkinTone: tone }))} onOutlineSelect={(color) => updateProject((current) => ({ ...current, modelOutlineColor: color }))} onEditContours={() => setSkinContourEditorOpen(true)} />
              <div className={`model-editor-content${processing || chromaApplying || historyBusy ? ' chroma-applying' : ''}`} aria-busy={processing || chromaApplying || historyBusy}>
                <FabricatorModelCanvas
                    project={project}
                    stageRef={stageRef}
                    previewBackground={previewBackground}
                    canvasParts={canvasParts}
                    hiddenPartIds={hiddenPartIds}
                    selectedIds={selectedIds}
                    connectFromId={connectFromId}
                    jointMarkers={jointMarkers}
                    scale={scale}
                    pan={pan}
                    zoom={zoom}
                    panning={panning}
                    mixerActive={mixerActive}
                    mixerPainting={mixerPainting}
                    thighDeformationActive={thighDeformationActive}
                    showJointPivots={showJointPivots}
                    thighDeformationRadius={thighDeformationRadius}
                    thighDeformationStrength={thighDeformationStrength}
                    temporaryThighResetToken={temporaryThighResetToken}
                    canvasInteraction={canvasInteraction}
                    partPreviewSource={partPreviewSource}
                    toModelPoint={toModelPoint}
                    onPartClick={handlePartClick}
                    onSelectPart={(partId) => setSelectedIds([partId])}
                    onWarpStateChange={updateTemporaryThighDeformation}
                    onWarpError={reportTemporaryThighError}
                    onZoomIn={() => setZoom((value) => Math.min(2.4, value + 0.15))}
                    onZoomOut={() => setZoom((value) => Math.max(0.5, value - 0.15))}
                    onCenter={() => { setZoom(1); setPan({ x: 0, y: 0 }) }}
                />

                <FabricatorModelPanel
                  project={project}
                  panelTab={panelTab}
                  filter={filter}
                  visibleParts={visibleParts}
                  selectedPart={selectedPart}
                  selectedIds={selectedIds}
                  frontToBackLayers={frontToBackLayers}
                  hiddenPartIds={hiddenPartIds}
                  layerDragId={layerDragId}
                  renamingPartId={renamingPartId}
                  connectMode={connectMode}
                  contourConnecting={contourConnecting}
                  jointConnectMessage={jointConnectMessage}
                  processing={processing}
                  chromaApplying={chromaApplying}
                  historyBusy={historyBusy}
                  modelSourcePublishing={modelSourcePublishing}
                  partPreviewSource={partPreviewSource}
                  actions={{
                    addSheet: (slot) => { void importSlot(slot) },
                    setTab: setPanelTab,
                    setFilter,
                    handlePartClick,
                    rename: {
                      begin: setRenamingPartId,
                      update: (partId, name) => updateProject((current) => ({ ...current, parts: current.parts.map((part) => part.id === partId ? { ...part, name } : part) })),
                      finish: () => setRenamingPartId(null)
                    },
                    transform: {
                      setCoordinate: setPartCoordinate,
                      setRotation: (partId, value) => updateProject((current) => ({ ...current, parts: current.parts.map((part) => part.id === partId ? { ...part, rotation: Number(value) || 0 } : part) })),
                      restoreHeadSize: (partId) => updateProject((current) => resizeHeadPart(resizeHeadPart(current, partId, 'width', 100), partId, 'height', 100)),
                      setHeadSize: (partId, axis, value) => updateProject((current) => resizeHeadPart(current, partId, axis, value)),
                      startGesture: () => startHistoryGesture('edit'),
                      finishGesture: finishHistoryGesture
                    },
                    removePart,
                    splitSelected,
                    mergeSelected,
                    layers: {
                      dragRef: layerDragRef,
                      setDragging: setLayerDragId,
                      drop: dropLayer,
                      select: (partId) => setSelectedIds([partId]),
                      move: moveLayer,
                      toggleFix: toggleJointFix,
                      toggleVisibility: toggleLayerVisibility
                    },
                    joints: {
                      autoConnect: () => { void autoConnectBodyContours() },
                      toggleConnectMode: () => { setConnectMode((value) => !value); setConnectFromId(null) },
                      rotateBranch,
                      disconnect: (jointId) => updateProject((current) => ({ ...current, joints: current.joints.filter((joint) => joint.id !== jointId) }))
                    }
                  }}
                />
              </div>
            </>
          )}
          {error && <div className="model-toast" role="status"><span>{error}</span><button onClick={() => setError('')} type="button" aria-label="Fechar aviso">×</button></div>}
          {processing && project && <div className="model-processing-overlay"><div className="model-spinner" /><span>Reanalisando imagem · {progress}%</span></div>}
        </section>
      )}
      </Suspense>
      </section>
      </ModelAppearanceProvider>
    </main>
  )
}
