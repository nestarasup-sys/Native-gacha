import { projectForOriginalPreview, selectOriginalModelSource } from '../../../../../shared/fabricatorModelViews'
import { useModelSourceRefresh } from '../models/useModelSourceRefresh'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { FabricatorPose, FabricatorPoseSummary, FabricatorProject, FabricatorSlotSummary, WardrobeCategory, WardrobeComponent, WardrobePreviewGender, WardrobeSet, WardrobeSetSummary } from '../../../../../shared/fabricator'
import { Icon } from '../../../ui/components/Icon'
import { usePreviewBackground } from '../../../ui/hooks/usePreviewBackground'
import { normalizeLayerOrder, orderedParts } from '../models/rig'
import { bindWardrobeComponent, mapWardrobeComponentToPose, poseDeltaToSource, wardrobePosePadding, rebaseWardrobeSetToOriginalSheet } from './poseTransform'
import { suggestWardrobeGlueTarget, wardrobeGlueState } from '../../../../../shared/wardrobeGlue'
import { WardrobeGlueControls } from './WardrobeGlueControls'
import { snapWardrobePlacement } from '../../../../../shared/wardrobeMagnet'
import { useWardrobePoseAudit } from './useWardrobePoseAudit'
import { WardrobePoseAuditPanel } from './WardrobePoseAuditPanel'
import { useWardrobeComparisonPose } from './useWardrobeComparisonPose'
import { WardrobeComparisonPreview } from './WardrobeComparisonPreview'
import { applyWardrobeComponentEdit, nudgeWardrobeComponent, resizeWardrobeComponent, restoreWardrobeComponentOrigin, scaleWardrobeComponentAxis } from './wardrobeComponentEditing'
import { saveWardrobeSetDraft } from './saveWardrobeSetDraft'
import { createWardrobeGridHistory } from './wardrobeGridHistory'
import { isWardrobePairedGridImportKind, wardrobePairImageMode, type WardrobePairedSheetKind } from './wardrobePairedSheetPolicy'
import { WardrobeTestPosePicker } from './WardrobeTestPosePicker'
import { createWardrobeTestPoseCommands } from './wardrobeTestPoseCommands'
import { mirrorWardrobeImageDataUrl } from './mirrorWardrobeImage'
import { duplicateWardrobeOpposite, oppositeWardrobePart } from './duplicateWardrobeOpposite'
import { useWardrobeDeformation } from './useWardrobeDeformation'
import { rebindWardrobeComponents } from './wardrobeBindings'
import { WardrobeGarmentEditorModal } from './WardrobeGarmentEditorModal'
import { WardrobeDeformationBrushControls, WardrobePreviewToolbar } from './WardrobePreviewControls'
import { WardrobeJointCutGuide, WardrobeJointCutPositionControl } from './WardrobeJointCutControls'
import { loadWardrobeJointCutSettings, saveWardrobeJointCutSettings, wardrobeJointCutAdjustmentFor, wardrobeJointCutTarget } from './wardrobeJointCutSettings'
import { wardrobePreviewGenderOf, wardrobePreviewTorsoImage } from './wardrobePreviewGender'
import { useModelAppearanceTarget, useModelPartAppearancePreview } from '../ModelAppearanceContext'
import { createWardrobeJointAssemblyOffsets, findWardrobeJointCut, wardrobeComponentPreviewOffset } from './wardrobeJointAssembly'
import { useWardrobeSheetEditing } from './useWardrobeSheetEditing'
import { useWardrobeCatalogSession } from './useWardrobeCatalogSession'
import { createWardrobeBindingCommands } from './wardrobeBindingCommands'
import { calibrateWardrobeSourceParts } from './wardrobeSourceCalibration'
import {
  getWardrobeBodyLayer as getBodyLayer,
  isLongJointSplitCandidate,
  serializeWardrobeReferenceModel as serializeModel,
  wardrobeCategoryNames as categoryNames,
  wardrobeCategories as categories,
  wardrobeImageCounterpart,
  selectWardrobePreviewComponents,
  wardrobeSetPresentation
} from './wardrobeWorkspaceModel'
import './wardrobe.css'

type PieceDrag = { pointerId: number; componentId: string; pointerX: number; pointerY: number; originX: number; originY: number }
type PreviewPanDrag = { pointerId: number; pointerX: number; pointerY: number; originX: number; originY: number }
type SourceReferencePart = { x: number; y: number; width: number; height: number; imageDataUrl: string }
type Point = { x: number; y: number }
const zeroOffset: Point = { x: 0, y: 0 }

export function WardrobeWorkspace({ baseModelSlot }: { baseModelSlot: number }) {
  const [previewBackground, setPreviewBackground] = usePreviewBackground()
  const [models, setModels] = useState<FabricatorSlotSummary[]>(Array.from({ length: 10 }, () => null))
  const [modelSlot, setModelSlot] = useState(baseModelSlot)
  useModelAppearanceTarget(modelSlot)
  const appearancePreviewForPart = useModelPartAppearancePreview(modelSlot)
  const [model, setModel] = useState<FabricatorProject | null>(null)
  useModelSourceRefresh(modelSlot, fresh => setModel(fresh))
  const [sets, setSets] = useState<WardrobeSetSummary[]>([])
  const [catalogIssues, setCatalogIssues] = useState<Array<{ id: string; reason: string }>>([])
  const [activeSetId, setActiveSetId] = useState<string | null>(null)
  const [draft, setDraft] = useState<WardrobeSet | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [garmentEditorOpen, setGarmentEditorOpen] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [openingSet, setOpeningSet] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)
  const [previewPan, setPreviewPan] = useState<Point>(zeroOffset)
  const [lockAspectRatio, setLockAspectRatio] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const torsoAccessoryInputRef = useRef<HTMLInputElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const requestRef = useRef(0)
  const testPoseRequestRef = useRef(0)
  const pieceDragRef = useRef<PieceDrag | null>(null)
  const previewPanDragRef = useRef<PreviewPanDrag | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const artboardRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 })
  const [joinJointsMode, setJoinJointsMode] = useState(false)
  const [jointCutLinesLocked, setJointCutLinesLocked] = useState(false)
  const [jointCutSettings, setJointCutSettings] = useState(loadWardrobeJointCutSettings)
  const jointCutSettingsRef = useRef(jointCutSettings)
  jointCutSettingsRef.current = jointCutSettings
  const [jointCutPreview, setJointCutPreview] = useState<{ componentId: string; ratio: number; rotationDegrees: number } | null>(null)
  const [magneticSnap, setMagneticSnap] = useState(true)
  const [showPoseComparison, setShowPoseComparison] = useState(false)
  const [testPosePickerOpen, setTestPosePickerOpen] = useState(false)
  const [importPickerOpen, setImportPickerOpen] = useState(false)
  const gridSizeRef = useRef<3 | 4>(4)
  const gridInputRef = useRef<HTMLInputElement>(null)
  const pairedSheetKindRef = useRef<WardrobePairedSheetKind>('sleeves')
  const pairedSheetInputRef = useRef<HTMLInputElement>(null)
  const pairedGridHistoryRef = useRef(createWardrobeGridHistory())
  const [testPoseSlots, setTestPoseSlots] = useState<Array<NonNullable<FabricatorPoseSummary>>>([])
  const [testPose, setTestPose] = useState<FabricatorPose | null>(null)
  const [testPoseLoading, setTestPoseLoading] = useState(false)
  const [testDragOffsets, setTestDragOffsets] = useState<Record<string, { x: number; y: number }>>({})
  const testPoseCommands = createWardrobeTestPoseCommands({
    requestRef: testPoseRequestRef,
    listPoseSlots: (slot) => window.desktop.fabricator.listFabricatorPoseSlots(slot),
    loadPose: (slot, poseSlot) => window.desktop.fabricator.loadFabricatorPose(slot, poseSlot),
    setPoseSlots: setTestPoseSlots,
    setPose: setTestPose,
    setLoading: setTestPoseLoading,
    setPickerOpen: setTestPosePickerOpen,
    clearDragOffsets: () => setTestDragOffsets({}),
    disableJoinJoints: () => setJoinJointsMode(false),
    setError
  })
  const [calibratingPartId, setCalibratingPartId] = useState<string | null>(null)
  const poseAudit = useWardrobePoseAudit(model,draft)
  const defaultPose = useWardrobeComparisonPose(modelSlot,Boolean(model && draft))
  const selected = draft?.components.find((component) => component.id === selectedId) ?? null
  const selectedImageCounterpart = wardrobeImageCounterpart(selected, draft?.components ?? [])
  const previewComponents = draft ? selectWardrobePreviewComponents(draft.components, draft.importKind, selected) : []
  const selectedIndex = draft?.components.findIndex((component) => component.id === selectedId) ?? -1
  const previewProject = testPose ?? model
  const previewPoseOrder = testPose ? normalizeLayerOrder(testPose.parts, testPose.layerOrder) : []
  const previewPoseParts = testPose ? orderedParts(testPose.parts, testPose.layerOrder).filter((part) => !(testPose.hiddenPartIds ?? []).includes(part.id)) : []
  const poseMissingAttachments = testPose && draft ? draft.components.filter((component) =>
    !model?.parts.some((part) => part.id === component.attachedPartId) || !testPose.parts.some((part) => part.id === component.attachedPartId)) : []
  const poseUsesOlderModel = Boolean(testPose && model && testPose.sourceModelUpdatedAt !== model.updatedAt)
  const previewLayerStride = (draft?.components.length ?? 0) + 2
  const scale = previewProject && previewSize.width && previewSize.height ? Math.max(0.05, Math.min((previewSize.width - 48) / previewProject.width, (previewSize.height - 48) / previewProject.height)) * zoom : 1
  // Use the original local frames and the EDITED PNGs persisted under their
  // stable body-part IDs. Recropping the raw uploaded sheet can swap parts and
  // disagree with the source used by the Customizer.
  const sourceParts = useMemo<Record<string, SourceReferencePart> | null>(() => model
    ? Object.fromEntries(selectOriginalModelSource(model).parts.map((part) =>
      [part.id, { x: part.x, y: part.y, width: part.width, height: part.height, imageDataUrl: part.dataUrl }]))
    : null, [model])
  const referenceModel = useMemo(() => projectForOriginalPreview(model), [model])
  const { fixSelectedBinding, releaseSelectedBinding } = createWardrobeBindingCommands({
    selected,
    referenceModel,
    pairedGridHistoryRef,
    setDraft,
    setDirty,
    setError
  })
  const bodyOffsets = useMemo(() => joinJointsMode && referenceModel && model ? createWardrobeJointAssemblyOffsets(referenceModel, model) : {}, [joinJointsMode, referenceModel, model])
  const referenceBone = useCallback((partId: string) => referenceModel?.parts.find((part) => part.id === partId), [referenceModel])
  const selectedBone = selected ? referenceBone(selected.attachedPartId) : undefined
  const oppositePart = selected && referenceModel ? oppositeWardrobePart(selected, referenceModel.parts) : null
  const selectedBodySource = selected && sourceParts ? sourceParts[selected.attachedPartId] : undefined
  const selectedBodyOffset = selected ? wardrobeComponentPreviewOffset(selected, bodyOffsets) : zeroOffset
  const selectedSplitComponent = selected ? { ...selected, x: selected.x + selectedBodyOffset.x, y: selected.y + selectedBodyOffset.y } : null
  const selectedJointCutAdjustment = selected && jointCutPreview?.componentId === selected.id
    ? { offsetRatio: jointCutPreview.ratio, rotationDegrees: jointCutPreview.rotationDegrees }
    : selected ? wardrobeJointCutAdjustmentFor(selected, jointCutSettings, referenceModel) : undefined
  const selectedJointCutTarget = selected && isLongJointSplitCandidate(selected) ? wardrobeJointCutTarget(selected, referenceModel) : null
  const selectedJointCut = joinJointsMode && selectedSplitComponent && isLongJointSplitCandidate(selectedSplitComponent) && referenceModel
    ? findWardrobeJointCut(selectedSplitComponent, referenceModel, bodyOffsets, selectedJointCutAdjustment)
    : null
  const editorBodyReference = selected && selectedBodySource && selectedBone ? {
    name: selectedBone.name,
    dataUrl: selectedBodySource.imageDataUrl,
    x: selectedBodySource.x,
    y: selectedBodySource.y,
    width: selectedBodySource.width,
    height: selectedBodySource.height,
    rotation: selectedBone.sourceTransform?.rotation ?? selectedBone.rotation
  } : undefined
  const glueStatus = selected ? wardrobeGlueState(selected, selectedBone) : 'loose'
  const suggestedBone = selected && referenceModel ? suggestWardrobeGlueTarget(selected, referenceModel.parts) : null

  const updateComponent = useCallback((id: string, values: Partial<WardrobeComponent>) => {
    if (!sourceParts || draft?.edition === 2) return
    setDirty(true)
    setDraft((current) => current ? (() => {
      if (!pieceDragRef.current) pairedGridHistoryRef.current.record(current)
      return ({ ...current, components: current.components.map((component) => {
      if (component.id !== id) return component
      return applyWardrobeComponentEdit(component, values, referenceModel, current.width)
      }), updatedAt: new Date().toISOString() })
    })() : current)
  }, [sourceParts, draft?.edition, referenceModel, referenceBone])

  const mirrorSelectedComponent = async () => {
    if (!selected || !draft || draft.edition === 2 || saving || processing || openingSet) return
    try {
      const dataUrl = await mirrorWardrobeImageDataUrl(selected.dataUrl)
      const deformationOriginalDataUrl = selected.deformationOriginalDataUrl
        ? await mirrorWardrobeImageDataUrl(selected.deformationOriginalDataUrl)
        : undefined
      const current = draftRef.current?.components.find((component) => component.id === selected.id)
      if (!current || current.dataUrl !== selected.dataUrl) {
        setError('A peça mudou enquanto era espelhada. Tente novamente.')
        return
      }
      setDeformMode(false)
      updateComponent(selected.id, { dataUrl, ...(deformationOriginalDataUrl ? { deformationOriginalDataUrl } : {}) })
      invalidateWarpImage(selected.id)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível espelhar a peça.')
    }
  }

  const duplicateSelectedOpposite = () => {
    if (!selected || !selectedBone || !oppositePart || !draft || draft.edition === 2 || saving || processing || openingSet || testPose) return
    const current = draftRef.current
    if (!current || current.id !== draft.id || !current.components.some((component) => component.id === selected.id)) return
    const { original, copy } = duplicateWardrobeOpposite(selected, selectedBone, oppositePart, crypto.randomUUID(), crypto.randomUUID())
    pairedGridHistoryRef.current.record(current)
    setDraft({ ...current, components: [...current.components.map((component) => component.id === selected.id ? original : component), copy], updatedAt: new Date().toISOString() })
    setDeformMode(false)
    setSelectedId(copy.id)
    setDirty(true)
    setError('')
  }

  const previewJointCutAdjustment = (componentId: string, ratio: number, rotationDegrees: number) => {
    setJointCutPreview({ componentId, ratio: Math.max(-1, Math.min(1, ratio)), rotationDegrees: Math.max(-45, Math.min(45, rotationDegrees)) })
  }

  const commitJointCutAdjustment = (componentId: string, ratio: number, rotationDegrees: number) => {
    const component = draftRef.current?.components.find((item) => item.id === componentId)
    setJointCutPreview(null)
    if (!component) return
    const target = wardrobeJointCutTarget(component, referenceModel)
    try {
      const next = saveWardrobeJointCutSettings({
        ...jointCutSettingsRef.current,
        [target]: { offsetRatio: Math.max(-1, Math.min(1, ratio)), rotationDegrees: Math.max(-45, Math.min(45, rotationDegrees)) }
      })
      jointCutSettingsRef.current = next
      setJointCutSettings(next)
      setError('')
    } catch {
      setError('Não foi possível salvar o ajuste global da linha. Verifique o armazenamento do app e tente novamente.')
    }
  }

  const {
    deformMode, setDeformMode, warpReadyId, warpRadius, setWarpRadius, warpStrength, setWarpStrength,
    warpCanvasRef, warpBrushCursorRef, clear: clearWarpSession, invalidateImage: invalidateWarpImage,
    restoreDeformation: restoreSelectedDeformation,
    beginWardrobeWarp, moveWardrobeWarp, finishWardrobeWarp, leaveWardrobeWarp
  } = useWardrobeDeformation({
    selected,
    selectedId,
    draftEdition: draft?.edition,
    draftRef,
    artboardRef,
    scale,
    testPose: Boolean(testPose),
    bodyOffsets,
    updateComponent,
    setDirty,
    setError
  })

  const clearWardrobeWarpState = useCallback(() => {
    clearWarpSession()
    setGarmentEditorOpen(false)
  }, [clearWarpSession])

  const applyWardrobeImageEdit = async (componentId: string, imageUrl: string) => {
    const current = draftRef.current
    const edited = current?.components.find((component) => component.id === componentId)
    if (!current || !edited || edited.dataUrl === imageUrl) {
      setGarmentEditorOpen(false)
      return
    }

    const counterpart = wardrobeImageCounterpart(edited, current.components)
    const counterpartImageUrl = counterpart
      ? wardrobePairImageMode(current.importKind, edited.category) === 'mirror' ? await mirrorWardrobeImageDataUrl(imageUrl) : imageUrl
      : undefined
    const latest = draftRef.current
    const latestEdited = latest?.components.find((component) => component.id === componentId)
    const latestCounterpart = counterpart && latest
      ? latest.components.find((component) => component.id === counterpart.id)
      : undefined
    if (!latest || latest.id !== current.id || latest.importKind !== current.importKind || !latestEdited || latestEdited.dataUrl !== edited.dataUrl
      || latestEdited.sleevePairId !== edited.sleevePairId || latestEdited.sleeveSide !== edited.sleeveSide
      || latestEdited.sleeveSegment !== edited.sleeveSegment
      || counterpart && (!latestCounterpart || latestCounterpart.sleevePairId !== counterpart.sleevePairId
        || latestCounterpart.sleeveSide !== counterpart.sleeveSide || latestCounterpart.sleeveSegment !== counterpart.sleeveSegment)) {
      throw new Error('O conjunto mudou durante a edição da imagem. Feche e abra a peça novamente antes de aplicar.')
    }

    const resetImageEdits = (component: WardrobeComponent, dataUrl: string): WardrobeComponent => ({
      ...component,
      dataUrl,
      hasDeformationOriginal: undefined,
      deformationOriginalDataUrl: undefined,
      deformationOriginalFrame: undefined,
      isDeformed: false
    })
    const updatedComponents = new Map<string, WardrobeComponent>([
      [componentId, resetImageEdits(latestEdited, imageUrl)]
    ])
    if (counterpart && latestCounterpart && counterpartImageUrl) {
      updatedComponents.set(counterpart.id, resetImageEdits(latestCounterpart, counterpartImageUrl))
    }
    pairedGridHistoryRef.current.record(latest)
    setDraft({
      ...latest,
      components: latest.components.map((component) => updatedComponents.get(component.id) ?? component),
      updatedAt: new Date().toISOString()
    })
    updatedComponents.forEach((_component, id) => invalidateWarpImage(id))
    setDirty(true)
    setGarmentEditorOpen(false)
  }

  const { openSet } = useWardrobeCatalogSession({
    modelSlot,
    model,
    referenceModel,
    dirty,
    processing,
    saving,
    openingSet,
    requestRef,
    workerRef,
    pairedGridHistoryRef,
    invalidateTestPose: () => testPoseCommands.invalidate(),
    clearDeformationSession: clearWardrobeWarpState,
    setModelSlot,
    setModels,
    setModel,
    setSets,
    setCatalogIssues,
    setDraft,
    setActiveSetId,
    setSelectedId,
    setOpeningSet,
    setDirty,
    setError,
    setJoinJointsMode,
    setTestPose,
    setTestPoseLoading,
    setTestPosePickerOpen,
    setTestDragOffsets,
    setCalibratingPartId,
    setDeformMode
  })
  useEffect(() => {
    const element = previewRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setPreviewSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(element); return () => observer.disconnect()
  }, [model])
  useEffect(() => {
    if (!sourceParts || !referenceModel || !draft) return
    if (draft.edition === 2) {
      setDraft((current) => current?.id === draft.id ? rebaseWardrobeSetToOriginalSheet(current, referenceModel) : current)
      setDirty(true)
      return
    }
    const rebound = rebindWardrobeComponents(draft.components, referenceModel)
    if (!rebound.changed) return
    setDraft((current) => current?.id === draft.id ? { ...current, components: rebindWardrobeComponents(current.components, referenceModel).components } : current)
    setDirty(true)
  }, [sourceParts, draft?.id])
  useEffect(() => {
    if (!draft || !referenceModel) return
    let next = jointCutSettingsRef.current
    let migrated = false
    for (const component of draft.components) {
      if (!isLongJointSplitCandidate(component)) continue
      const target = wardrobeJointCutTarget(component, referenceModel)
      if (next[target]) continue
      const legacy = wardrobeJointCutAdjustmentFor(component, {}, referenceModel)
      if (legacy.offsetRatio === 0) continue
      next = { ...next, [target]: legacy }
      migrated = true
    }
    if (!migrated) return
    try {
      const saved = saveWardrobeJointCutSettings(next)
      jointCutSettingsRef.current = saved
      setJointCutSettings(saved)
    } catch {
      setError('Não foi possível migrar o ajuste antigo para a configuração global. A peça original foi preservada.')
    }
  }, [draft?.components, referenceModel])
  const {
    importSheet,
    importTorsoGrid,
    importPairedSheet,
    splitSelectedGarmentAtJoint,
    undoPairedGridEdit,
    redoPairedGridEdit
  } = useWardrobeSheetEditing({
    model,
    referenceModel,
    modelSlot,
    sourceReady: Boolean(sourceParts),
    draft,
    draftRef,
    selected,
    bodyOffsets,
    processing,
    saving,
    openingSet,
    joinJointsMode,
    jointCutSettingsRef,
    gridSizeRef,
    pairedSheetKindRef,
    pairedGridHistoryRef,
    workerRef,
    requestRef,
    setDraft,
    setActiveSetId,
    setSelectedId,
    setDirty,
    setProcessing,
    setError,
    setDeformMode,
    setImportPickerOpen,
    setJoinJointsMode,
    clearDeformationSession: clearWardrobeWarpState
  })
  const calibrateSourceAnchor = async (partId: string, x: number, y: number) => {
    if (!model) return
    const parts = calibrateWardrobeSourceParts(model, partId, x, y)
    if (!parts) return
    const calibrated = { ...model, parts, updatedAt: new Date().toISOString() }
    setModel(calibrated); setCalibratingPartId(null); setError('')
    try { await window.desktop.fabricator.saveFabricatorProject(serializeModel(calibrated), []) }
    catch (reason) { setError(reason instanceof Error ? `Calibração aplicada nesta sessão, mas não foi salva: ${reason.message}` : 'Calibração aplicada nesta sessão, mas não foi salva.') }
  }
  const handleArtboardPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!calibratingPartId || !previewRef.current) return
    event.preventDefault(); event.stopPropagation()
    const bounds = event.currentTarget.getBoundingClientRect()
    void calibrateSourceAnchor(calibratingPartId, (event.clientX - bounds.left) / scale, (event.clientY - bounds.top) / scale)
  }
  const handlePreviewPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (deformMode || testPose || calibratingPartId || event.button !== 0 || !artboardRef.current) return
    const target = event.target as HTMLElement
    if (target !== event.currentTarget && target !== artboardRef.current) return

    const bounds = artboardRef.current.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / scale
    const y = (event.clientY - bounds.top) / scale
    const overBody = Boolean(model && sourceParts && model.parts.some((part) => {
      const source = sourceParts[part.id]
      if (!source) return false
      const offset = bodyOffsets[part.id] ?? zeroOffset
      return x >= source.x + offset.x && x <= source.x + offset.x + source.width && y >= source.y + offset.y && y <= source.y + offset.y + source.height
    }))
    const overGarment = Boolean(draft?.components.some((component) => x >= component.x && x <= component.x + component.width && y >= component.y && y <= component.y + component.height))
    if (overBody || overGarment) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    previewPanDragRef.current = { pointerId: event.pointerId, pointerX: event.clientX, pointerY: event.clientY, originX: previewPan.x, originY: previewPan.y }
  }
  const movePreviewPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = previewPanDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPreviewPan({ x: drag.originX + event.clientX - drag.pointerX, y: drag.originY + event.clientY - drag.pointerY })
  }
  const finishPreviewPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (previewPanDragRef.current?.pointerId === event.pointerId) previewPanDragRef.current = null
  }
  const moveComponentLayer = (id: string, direction: -1 | 1) => {
    setDirty(true)
    setDraft((current) => {
      if (!current) return current
      const index = current.components.findIndex((component) => component.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.components.length) return current
      pairedGridHistoryRef.current.record(current)
      const components = [...current.components]
      ;[components[index], components[target]] = [components[target], components[index]]
      return { ...current, components, updatedAt: new Date().toISOString() }
    })
  }
  const beginPieceDrag = (event: ReactPointerEvent<HTMLElement>, component: WardrobeComponent) => {
    if (event.button !== 0 || (deformMode && !testPose)) return
    event.preventDefault()
    event.stopPropagation()
    if (calibratingPartId && !testPose) {
      const bounds = event.currentTarget.parentElement?.getBoundingClientRect()
      if (bounds) void calibrateSourceAnchor(calibratingPartId, (event.clientX - bounds.left) / scale, (event.clientY - bounds.top) / scale)
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    const testOffset = testPose ? testDragOffsets[component.id] ?? { x: 0, y: 0 } : { x: 0, y: 0 }
    if (!testPose && draft && isWardrobePairedGridImportKind(draft.importKind)) pairedGridHistoryRef.current.record(draft)
    pieceDragRef.current = { pointerId: event.pointerId, componentId: component.id, pointerX: event.clientX, pointerY: event.clientY, originX: component.x + testOffset.x, originY: component.y + testOffset.y }
    setSelectedId(component.id)
  }
  const movePieceDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = pieceDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const delta = { x: (event.clientX - drag.pointerX) / scale, y: (event.clientY - drag.pointerY) / scale }
    const component = draft?.components.find((item) => item.id === drag.componentId)
    const modelBone = component && referenceBone(component.attachedPartId)
    const poseBone = component && testPose?.parts.find((part) => part.id === component.attachedPartId)
    const sourceDelta = testPose && modelBone && poseBone ? poseDeltaToSource(delta, modelBone, poseBone) : delta
    let x = drag.originX + sourceDelta.x
    let y = drag.originY + sourceDelta.y
    // Snap only a LOOSE piece; a fixed fit never jumps to another coordinate.
    if (!testPose && magneticSnap && component && component.glue?.mode === 'loose') {
      const target = referenceBone(component.attachedPartId)
        ?? (referenceModel ? suggestWardrobeGlueTarget({...component,x,y}, referenceModel.parts) : null)
      const snapped = snapWardrobePlacement({...component,x,y},target ?? undefined)
      if (snapped) { x=snapped.x; y=snapped.y }
    }
    if (testPose) {
      if (component) setTestDragOffsets((current) => ({ ...current, [drag.componentId]: { x: x - component.x, y: y - component.y } }))
    } else updateComponent(drag.componentId, { x, y })
  }
  const finishPieceDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (pieceDragRef.current?.pointerId === event.pointerId) pieceDragRef.current = null
  }
  const nudgeSelected = (dx: number, dy: number) => { if (selected) updateComponent(selected.id, nudgeWardrobeComponent(selected, dx, dy)) }
  const resizeSelected = (factor: number) => { if (selected) updateComponent(selected.id, resizeWardrobeComponent(selected, factor)) }
  const scaleSelectedAxis = (axis: 'width' | 'height', value: number) => {
    if (!selected) return
    const patch = scaleWardrobeComponentAxis(selected, axis, value, lockAspectRatio)
    if (patch) updateComponent(selected.id, patch)
  }
  const restoreSelectedOrigin = () => { if (selected) updateComponent(selected.id, restoreWardrobeComponentOrigin(selected)) }
  const choosePreviewGender = (gender: WardrobePreviewGender) => {
    if (!draft || draft.previewGender === gender) return
    setDraft((current) => current ? { ...current, previewGender: gender } : current)
    setDirty(true)
  }
  const save = async () => {
    if (!draft || draft.edition === 2 || !draft.components.length || saving || processing || openingSet || !sourceParts) return
    setSaving(true); setError('')
    try {
      const result = await saveWardrobeSetDraft(draft, modelSlot, model?.name, {
        saveWardrobeSet: (slot, metadata, assets) => window.desktop.fabricator.saveWardrobeSet(slot, metadata, assets),
        listWardrobeSets: (slot) => window.desktop.fabricator.listWardrobeSets(slot),
        notifyAssetsUpdated: () => window.dispatchEvent(new Event('fabricator:assets-updated'))
      })
      setDraft(result.set); setActiveSetId(result.set.id); setDirty(false); setSets(result.sets)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o conjunto.') }
    finally { setSaving(false) }
  }
  const deleteSet = async () => {
    if (processing || saving || openingSet) return
    if (!activeSetId || !window.confirm(`Excluir permanentemente o conjunto “${draft?.name ?? activeSetId}”?`)) return
    try { await window.desktop.fabricator.deleteWardrobeSet(modelSlot, activeSetId); clearWardrobeWarpState(); setDraft(null); setActiveSetId(null); setSelectedId(null); setDirty(false); setSets(await window.desktop.fabricator.listWardrobeSets(modelSlot)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível excluir o conjunto.') }
  }
  const openTestPosePicker = async () => {
    if (!sourceParts) { setError('Aguarde a referência original do corpo carregar antes de testar a pose.'); return }
    const missingOrigins = Array.from(new Set((draft?.components ?? []).filter((component) => {
      const bone = referenceBone(component.attachedPartId)
      return !bone?.sourceTransform
    }).map((component) => referenceBone(component.attachedPartId)?.name ?? component.name)))
    if (missingOrigins.length) {
      setError(`Calibre a origem na folha original antes do teste: ${missingOrigins.join(', ')}. Selecione cada peça do conjunto e use “Calibrar origem”.`)
      return
    }
    await testPoseCommands.openPicker(modelSlot)
  }
  const loadTestPose = (slot: number) => testPoseCommands.loadPose(modelSlot, slot)
  const exitTestPose = testPoseCommands.exitPose
  const closeTestPosePicker = testPoseCommands.closePicker

  const renderComponentList = () => <div className="wardrobe-component-list">{draft?.components.map((component) => <button key={component.id} className={`wardrobe-component-row${selectedId === component.id ? ' active' : ''}`} onClick={() => setSelectedId(component.id)} type="button"><img src={component.dataUrl} alt="" /><span><b>{component.name}</b><small>{categoryNames[component.category]}{component.sleeveSide ? ` · ${component.sleeveSide === 'left' ? 'esquerda' : 'direita'}` : ''}</small></span></button>)}</div>
  return <section className="fabricator-workspace wardrobe-workspace" aria-label="Biblioteca de roupas">
    <header className="wardrobe-toolbar">
      <div className="wardrobe-title"><span className="model-slot-logo"><Icon name="shirt" /></span><span><strong>Roupas Dev</strong><small>Todos os conjuntos e categorias por modelo</small></span></div>
      <label className="wardrobe-model-select">Modelo<select value={modelSlot} disabled={processing || saving || openingSet || testPoseLoading} onChange={(event) => { if (dirty && !window.confirm('Há alterações não salvas. Descartar e trocar de modelo?')) return; testPoseCommands.invalidate(); setTestPoseLoading(false); setTestPosePickerOpen(false); setTestPoseSlots([]); setTestPose(null); setModelSlot(Number(event.target.value)) }}>{models.map((item, index) => <option key={index + 1} value={index + 1} disabled={!item}>{String(index + 1).padStart(2, '0')} · {item?.name ?? 'Vazio'}</option>)}</select></label>
      {draft && <input aria-label="Nome do conjunto" className="wardrobe-name-input" value={draft.name} onChange={(event) => { setDirty(true); setDraft((current) => { if (!current) return current; pairedGridHistoryRef.current.record(current); return { ...current, name: event.target.value } }) }} placeholder="Nome do conjunto" />}
      <div className="wardrobe-toolbar-actions"><span className={`wardrobe-save-state${dirty ? ' pending' : ''}`}><i />{dirty ? 'Alterações não salvas' : model ? `${model.parts.length} peças no modelo` : 'Escolha um modelo salvo'}</span><button className="pose-button secondary" disabled={!model || processing || saving || openingSet || !sourceParts} onClick={() => { if (dirty && !window.confirm('Descartar as alterações atuais e importar outra folha?')) return; setImportPickerOpen(true) }} type="button"><Icon name="plus" /> Importar</button>{isWardrobePairedGridImportKind(draft?.importKind) && <><button className="pose-button secondary" title="Desfazer (Ctrl+Z)" disabled={!pairedGridHistoryRef.current.canUndo} onClick={undoPairedGridEdit} type="button">↶ Desfazer</button><button className="pose-button secondary" title="Refazer (Ctrl+Y)" disabled={!pairedGridHistoryRef.current.canRedo} onClick={redoPairedGridEdit} type="button">↷ Refazer</button></>}{testPose ? <button className="pose-button danger" onClick={exitTestPose} type="button"><Icon name="eyeOff" /> Sair do teste</button> : <button className="pose-button secondary" disabled={!model || !draft?.components.length} onClick={() => void openTestPosePicker()} type="button"><Icon name="eye" /> Testar pose</button>}<button className="pose-button primary" disabled={!draft || draft.edition === 2 || saving || processing || openingSet || !sourceParts} onClick={() => void save()} type="button"><Icon name="check" />{saving ? 'Salvando…' : activeSetId ? 'Salvar alterações' : 'Salvar conjunto'}</button>{activeSetId && <button className="pose-icon-button" title="Excluir conjunto" disabled={processing || saving || openingSet} onClick={() => void deleteSet()} type="button"><Icon name="trash" /></button>}<input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void importSheet(event.target.files?.[0]); event.currentTarget.value = '' }} /><input ref={torsoAccessoryInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void importSheet(event.target.files?.[0], 'cinto'); event.currentTarget.value = '' }} /><input ref={gridInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void importTorsoGrid(event.target.files?.[0]); event.currentTarget.value = '' }} /><input ref={pairedSheetInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void importPairedSheet(event.target.files?.[0]); event.currentTarget.value = '' }} /></div>
    </header>
    {!!catalogIssues.length && <div className="wardrobe-error" role="alert">{catalogIssues.length} conjunto(s) exigem revisão: {catalogIssues.map(issue => `${issue.id}: ${issue.reason}`).join(' · ')}. Os demais conjuntos continuam disponíveis; nenhum arquivo problemático foi descartado.</div>}
    {error && <div className="wardrobe-error" role="alert">{error}<button onClick={() => setError('')} type="button">Fechar</button></div>}
    {testPose && (poseMissingAttachments.length > 0 || poseUsesOlderModel) && <div className="wardrobe-error" role="alert">
      {poseMissingAttachments.length > 0 && <span>Esta pose não contém a parte corporal de {poseMissingAttachments.length} peça(s): {poseMissingAttachments.map((part) => part.name).join(', ')}. Elas foram ocultadas no teste, sem alterar a roupa salva. </span>}
      {poseUsesOlderModel && <span>Esta pose foi salva a partir de outra revisão do modelo. Confira o encaixe visual antes de confiar na prévia.</span>}
    </div>}
    <div className="wardrobe-body wardrobe-body-v2">
      <aside className="wardrobe-library"><header><span><strong>Conjuntos</strong><small>{sets.length} salvos para este modelo</small></span><span className="wardrobe-count">{sets.length}</span></header><div className="wardrobe-set-list">{sets.map((set) => <button className={`wardrobe-set-row${activeSetId === set.id ? ' active' : ''} ${wardrobeSetPresentation(set.importKind).className}`} key={set.id} disabled={processing || saving || openingSet} onClick={() => void openSet(set.id)} type="button"><span className="wardrobe-set-icon"><Icon name="shirt" /></span><span><b>{wardrobeSetPresentation(set.importKind).title}</b><small title={set.name}>{set.name}</small><small>{set.importKind === 'torso-grid-4x3' ? 'Grade 4×3' : set.importKind === 'torso-grid-3x3' ? 'Grade 3×3' : set.importKind === 'pants-grid-3x4' ? 'Calças · grade 3×4' : set.importKind === 'sleeve-grid-3x4' ? 'Mangas · grade 3×4' : set.importKind === 'shoe-grid-3x4' ? 'Sapatos · grade 3×4' : ''}{set.importKind ? ' · ' : ''}{set.componentCount} peças</small></span><Icon name="chevronRight" /></button>)}{!sets.length && <div className="wardrobe-library-empty"><Icon name="box" /><span>Nenhum conjunto salvo.<br />Importe sua primeira folha.</span></div>}</div><div className="wardrobe-category-legend"><strong>Categorias</strong>{categories.map((category) => <span key={category}><i />{categoryNames[category]}</span>)}</div></aside>
      <aside className="wardrobe-catalog-panel" aria-label="Catálogo de peças do conjunto">
        <header><span><strong>Catálogo</strong><small>{draft ? `${draft.components.length} peças deste conjunto` : 'Escolha um conjunto'}</small></span>{draft && <span className="wardrobe-count">{draft.components.length}</span>}</header>
        {draft ? renderComponentList() : <div className="wardrobe-edit-empty"><Icon name="shirt" /><strong>Nenhum conjunto aberto</strong><small>Escolha um conjunto à esquerda para ver as peças.</small></div>}
      </aside>
      <section className="wardrobe-preview-card"><header><span><i /> {testPose ? `TESTE DA POSE · ${testPose.name}` : 'PRÉVIA DE ENCAIXE · FOLHA ORIGINAL'}</span><span>{previewProject ? `${previewProject.width} × ${previewProject.height}` : 'Sem modelo'}</span></header>
        {draft && model && <WardrobePoseAuditPanel disabled={processing || saving || openingSet} running={poseAudit.running} results={poseAudit.results} error={poseAudit.error} onAudit={() => void poseAudit.audit()} onPreview={(slot) => void loadTestPose(slot)} />}
        {draft && model && (testPose || defaultPose) && <div className="wardrobe-comparison-toggle">
          <button type="button" className="pose-button secondary" aria-expanded={showPoseComparison}
            onClick={() => setShowPoseComparison(visible => !visible)}>
            {showPoseComparison ? 'Ocultar comparação' : 'Comparar original e pose'}
          </button>
          {showPoseComparison && <WardrobeComparisonPreview model={model} outfit={{ ...draft, components: previewComponents }} pose={testPose ?? defaultPose!} onClose={() => setShowPoseComparison(false)}/>}
        </div>}
        <WardrobePreviewToolbar
          showToolbar={!testPose}
          assembly={{ active: joinJointsMode, disabled: !sourceParts || Boolean(calibratingPartId) || deformMode, onToggle: () => setJoinJointsMode((value) => !value) }}
          deformation={{ active: deformMode, disabled: !selected || draft?.edition === 2 || saving || processing || openingSet, canRestore: Boolean(selected?.isDeformed && selected.deformationOriginalDataUrl) && !saving && !processing && !openingSet && draft?.edition !== 2 && !testPose, onToggle: () => { const next = !deformMode; if (next) setCalibratingPartId(null); setDeformMode(next) }, onRestore: () => restoreSelectedDeformation(selected) }}
          magnet={{ enabled: magneticSnap, disabled: deformMode, onToggle: () => setMagneticSnap((active) => !active) }}
          viewport={{ canCenter: (previewPan.x !== 0 || previewPan.y !== 0) && !deformMode, onCenter: () => setPreviewPan(zeroOffset) }}
          background={{ color: previewBackground, onChange: setPreviewBackground }}
        />
        <div ref={previewRef} className={`wardrobe-preview-stage${testPose ? ' testing-pose' : ''}${deformMode ? ' deforming' : ''}${!deformMode && !calibratingPartId && !testPose ? ' pan-ready' : ''}`} onPointerDown={handlePreviewPointerDown} onPointerMove={movePreviewPan} onPointerUp={finishPreviewPan} onPointerCancel={finishPreviewPan} style={{ '--preview-background': previewBackground } as import('react').CSSProperties}>
        <WardrobeDeformationBrushControls active={deformMode} ready={warpReadyId === selected?.id} radius={warpRadius} strength={warpStrength} onRadiusChange={setWarpRadius} onStrengthChange={setWarpStrength} />
        {previewProject && <div ref={artboardRef} className={`wardrobe-artboard${calibratingPartId ? ' calibrating-origin' : ''}${deformMode ? ' deforming' : ''}${!deformMode && !calibratingPartId && !testPose ? ' pan-ready' : ''}`} onPointerDown={handleArtboardPointerDown} style={{ width: previewProject.width * scale, height: previewProject.height * scale, transform: `translate(${previewPan.x}px, ${previewPan.y}px)` }}>
        {!testPose && model && sourceParts && orderedParts(model.parts, model.layerOrder).map((part) => {
          const source = sourceParts[part.id]
          if (!source) return null
          const offset = bodyOffsets[part.id] ?? zeroOffset
          const maleTorsoImage = wardrobePreviewTorsoImage(part, model.maleTorso, wardrobePreviewGenderOf(draft?.previewGender))
          return <img key={part.id} className={`wardrobe-reference-body-part${joinJointsMode ? ' assembled' : ''}`} src={maleTorsoImage ?? appearancePreviewForPart(part)} alt={part.name} title={joinJointsMode && (offset.x !== 0 || offset.y !== 0) ? `${part.name} · posição relativa do modelo montado aplicada apenas na prévia` : undefined} draggable={false} style={{ left: (source.x + offset.x) * scale, top: (source.y + offset.y) * scale, width: source.width * scale, height: source.height * scale, outline: selected?.attachedPartId === part.id ? '2px solid #27a7a5' : undefined, transform: `rotate(${part.sourceTransform?.rotation ?? part.rotation}deg)`, zIndex: 1 }} />
        })}
        {testPose && previewPoseParts.map((part) => { const maleTorsoImage = wardrobePreviewTorsoImage(part, model?.maleTorso, wardrobePreviewGenderOf(draft?.previewGender)); return <img key={part.id} className="wardrobe-pose-body-part" src={maleTorsoImage ?? appearancePreviewForPart(part)} alt={part.name} draggable={false} style={{ left: part.x * scale, top: part.y * scale, width: part.width * scale, height: part.height * scale, zIndex: 2 + previewPoseOrder.indexOf(part.id) * previewLayerStride, transform: `rotate(${part.rotation}deg)` }} /> })}
        {previewComponents.map((component, index) => {
          const layer = getBodyLayer(model, component.attachedPartId)
          const layerBand = testPose ? previewLayerStride : (draft?.components.length ?? 0) + 1
           const modelBone = referenceBone(component.attachedPartId)
          const poseBone = testPose?.parts.find((part) => part.id === component.attachedPartId)
          const testOffset = testDragOffsets[component.id] ?? { x: 0, y: 0 }
           const bodyOffset = !testPose ? wardrobeComponentPreviewOffset(component, bodyOffsets) : zeroOffset
           const componentX = component.x + (testPose ? testOffset.x : bodyOffset.x)
           const componentY = component.y + (testPose ? testOffset.y : bodyOffset.y)
          const testComponent = { ...component, x: componentX, y: componentY }
          if (testPose && modelBone && (testOffset.x !== 0 || testOffset.y !== 0)) testComponent.binding = bindWardrobeComponent(testComponent, modelBone)
          const { kneeOverlap, edgePadding } = wardrobePosePadding(component, draft?.components ?? [])
          const poseTransform = testPose && component.glue?.mode !== 'loose' && modelBone && poseBone
            ? mapWardrobeComponentToPose(testComponent, modelBone, poseBone, kneeOverlap, edgePadding)
            : null
          const poseLayer = previewPoseOrder.indexOf(component.attachedPartId)
          const zIndex = testPose ? 3 + Math.max(0, poseLayer) * layerBand + index : 2 + layer * layerBand + index
          const imageClassName = `wardrobe-preview-part${component.id === selectedId ? ' selected' : ''}`
          const imageTitle = `${component.name} · ${categoryNames[component.category]} · camada do modelo ${layer + 1}`
          if (draft?.importKind?.startsWith('torso-grid-') && selectedId && component.id !== selectedId) return null
          if (isWardrobePairedGridImportKind(draft?.importKind) && selected?.sleevePairId && component.sleevePairId !== selected.sleevePairId) return null
          if (!testPose) {
            if (deformMode && component.id === selectedId && warpReadyId === component.id) return <canvas key={component.id} width={1} height={1} ref={warpCanvasRef} className={`${imageClassName} wardrobe-warp-canvas`} aria-label={`Pincel de deformação sobre ${component.name}`} title={imageTitle} onPointerDown={(event) => beginWardrobeWarp(event, component, bodyOffset)} onPointerMove={(event) => moveWardrobeWarp(event, component, bodyOffset)} onPointerUp={(event) => finishWardrobeWarp(event, component, bodyOffset)} onPointerCancel={(event) => finishWardrobeWarp(event, component, bodyOffset)} onPointerLeave={leaveWardrobeWarp} style={{ zIndex: 10000 }} />
            return <img key={component.id} className={imageClassName} src={component.dataUrl} alt={component.name} title={imageTitle} draggable={false} onClick={() => setSelectedId(component.id)} onPointerDown={(event) => beginPieceDrag(event, component)} onPointerMove={movePieceDrag} onPointerUp={finishPieceDrag} onPointerCancel={finishPieceDrag} style={{ left: componentX * scale, top: componentY * scale, width: component.width * scale, height: component.height * scale, zIndex: component.id === selectedId ? 9999 : zIndex, transform: `rotate(${component.rotation}deg)`, pointerEvents: deformMode ? 'none' : 'auto' }} />
          }
          if (!poseTransform) return null
          const image = <img className={imageClassName} src={component.dataUrl} alt={component.name} title={imageTitle} draggable={false} onClick={() => setSelectedId(component.id)} onPointerDown={(event) => beginPieceDrag(event, component)} onPointerMove={movePieceDrag} onPointerUp={finishPieceDrag} onPointerCancel={finishPieceDrag} style={{ left: poseTransform.localLeft * scale, top: poseTransform.localTop * scale, width: poseTransform.renderWidth * scale, height: poseTransform.renderHeight * scale, transformOrigin: 'center', transform: `rotate(${poseTransform.localRotation}deg)` }} />
          return <div key={component.id} className="wardrobe-pose-garment" style={{ left: poseTransform.origin.x * scale, top: poseTransform.origin.y * scale, width: 0, height: 0, zIndex, transformOrigin: '0 0', transform: poseTransform.matrix }}>{image}</div>
        })}
        {selected && selectedJointCut && previewProject && !jointCutLinesLocked && <WardrobeJointCutGuide cut={selectedJointCut} componentId={selected.id} projectWidth={previewProject.width} projectHeight={previewProject.height} scale={scale} lineLength={Math.hypot(selected.width, selected.height)} disabled={draft?.edition === 2 || processing || saving || openingSet || Boolean(testPose)} onPreview={(componentId, ratio, rotationDegrees) => previewJointCutAdjustment(componentId, ratio, rotationDegrees)} onCommit={(componentId, ratio, rotationDegrees) => commitJointCutAdjustment(componentId, ratio, rotationDegrees)} />}
        {deformMode && selected && warpReadyId === selected.id && <div ref={warpBrushCursorRef} className="wardrobe-warp-brush-cursor" aria-hidden="true" />}

      </div>}{!model && <div className="wardrobe-empty"><Icon name="shirt" /><strong>Selecione um modelo salvo</strong><small>O modelo será usado como guia na prévia de encaixe.</small></div>}{model && !draft && !testPose && <div className="wardrobe-stage-hint">Importe uma folha para começar · fundo transparente preservado</div>}{testPose && <div className="wardrobe-stage-hint wardrobe-test-hint">Teste temporário · a pose salva não será alterada</div>}{calibratingPartId && <div className="wardrobe-stage-hint wardrobe-calibration-hint">Clique na junta de “{model?.parts.find((part) => part.id === calibratingPartId)?.name}” na folha original</div>}<div className="wardrobe-zoom"><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.min(4, value + .1))} type="button">+</button><button onClick={() => setZoom((value) => Math.max(.55, value - .1))} type="button">−</button></div>{processing && <div className="wardrobe-processing"><span className="model-spinner" />Processando imagem…</div>}</div><footer>{testPose ? 'Arraste as roupas para testar o encaixe. Use “Sair do teste” para voltar à folha original.' : 'Arraste a roupa para encaixar. Clique em Fixar para grudar a roupa na parte selecionada; Juntar juntas usa a posição relativa de canelas e antebraços no modelo montado, só na prévia, para dividir calças e mangas longas na articulação.'}</footer></section>
      <aside className="wardrobe-edit-panel wardrobe-edit-panel-v2"><header><span><strong>Ajuste da peça</strong><small>{selected?.name ?? 'Escolha uma peça no catálogo'}</small>{draft && <div className="wardrobe-preview-gender" role="group" aria-label="Gênero do corpo de referência">
        <button className={`female${wardrobePreviewGenderOf(draft.previewGender) === 'female' ? ' selected' : ''}`} type="button" aria-pressed={wardrobePreviewGenderOf(draft.previewGender) === 'female'} disabled={saving || processing || openingSet} onClick={() => choosePreviewGender('female')}>Feminino</button>
        <button className={`male${wardrobePreviewGenderOf(draft.previewGender) === 'male' ? ' selected' : ''}`} type="button" aria-pressed={wardrobePreviewGenderOf(draft.previewGender) === 'male'} disabled={!model?.maleTorso || saving || processing || openingSet} title={model?.maleTorso ? 'Exibir o tronco masculino salvo como referência de encaixe' : 'Crie e salve o tronco masculino em Modelos DEV para habilitar esta opção'} onClick={() => choosePreviewGender('male')}>Masculino</button>
      </div>}</span></header>
        {draft ? <>{selected && <div className="wardrobe-fields"><div className="wardrobe-field-title"><strong>Editar peça · camada do modelo {getBodyLayer(model, selected.attachedPartId) + 1}</strong><button title="Subir camada" aria-label="Subir camada" disabled={selectedIndex === (draft?.components.length ?? 0) - 1} onClick={() => moveComponentLayer(selected.id, 1)} type="button">↑</button><button title="Descer camada" aria-label="Descer camada" disabled={selectedIndex <= 0} onClick={() => moveComponentLayer(selected.id, -1)} type="button">↓</button><button title="Remover esta peça do conjunto" onClick={() => { setDraft((current) => { if (!current) return current; pairedGridHistoryRef.current.record(current); return { ...current, components: current.components.filter((component) => component.id !== selected.id) } }); setSelectedId(draft.components.find((component) => component.id !== selected.id)?.id ?? null); setDirty(true) }} type="button"><Icon name="trash" /></button></div>{isLongJointSplitCandidate(selected) && <section className="wardrobe-sleeve-cut" aria-label="Separar pela junta do modelo"><div className="wardrobe-joint-cut-heading"><strong>Separar na junta do modelo</strong><button className={jointCutLinesLocked ? 'pose-button primary wardrobe-joint-cut-lock' : 'pose-button secondary wardrobe-joint-cut-lock'} aria-label={jointCutLinesLocked ? 'Mostrar linhas de corte' : 'Ocultar linhas de corte'} title={jointCutLinesLocked ? 'Mostrar e liberar os ajustes da linha' : 'Ocultar e bloquear a linha'} aria-pressed={jointCutLinesLocked} onClick={() => setJointCutLinesLocked((value) => !value)} type="button"><Icon name={jointCutLinesLocked ? 'unlock' : 'lock'} />{jointCutLinesLocked ? 'Mostrar linha' : 'Ocultar linha'}</button></div>{joinJointsMode && selectedJointCut && <WardrobeJointCutPositionControl key={selected.id} ratio={selectedJointCutAdjustment?.offsetRatio ?? 0} rotationDegrees={selectedJointCutAdjustment?.rotationDegrees ?? 0} scope={selectedJointCutTarget === 'sleeve-left' ? 'manga esquerda' : selectedJointCutTarget === 'sleeve-right' ? 'manga direita' : selectedJointCutTarget === 'pants-left' ? 'calça esquerda' : 'calça direita'} disabled={draft.edition === 2 || processing || saving || openingSet || Boolean(testPose) || jointCutLinesLocked} onPreview={(ratio, rotationDegrees) => previewJointCutAdjustment(selected.id, ratio, rotationDegrees)} onCommit={(ratio, rotationDegrees) => commitJointCutAdjustment(selected.id, ratio, rotationDegrees)} />}<button className="pose-button secondary" disabled={!joinJointsMode || !selectedJointCut || processing || saving || openingSet || draft.edition === 2} onClick={() => void splitSelectedGarmentAtJoint()} type="button">Dividir o par na junta</button></section>}<button className="wardrobe-image-edit-button" type="button" disabled={saving || processing || openingSet || draft.edition === 2 || Boolean(testPose)} onClick={() => { setDeformMode(false); setGarmentEditorOpen(true) }}><Icon name="edit" /> Editar imagem da roupa</button><button className="wardrobe-image-edit-button" type="button" disabled={!oppositePart || saving || processing || openingSet || draft.edition === 2 || Boolean(testPose)} title={oppositePart ? `Duplicar para ${oppositePart.name}` : "Selecione uma parte com lado oposto no modelo"} onClick={duplicateSelectedOpposite}><Icon name="plus" /> {oppositePart ? `Duplicar para ${oppositePart.name}` : "Duplicar para o outro lado"}</button><label>Nome<input value={selected.name} onChange={(event) => updateComponent(selected.id, { name: event.target.value })} /></label><label>Categoria<select value={selected.category} onChange={(event) => updateComponent(selected.id, { category: event.target.value as WardrobeCategory })}>{categories.map((category) => <option key={category} value={category}>{categoryNames[category]}</option>)}</select></label>{(selected.category === 'oculos' || selected.category === 'acessorio-cabeca') && <label className="wardrobe-option-toggle"><input type="checkbox" checked={selected.renderAboveHair ?? false} onChange={(event) => updateComponent(selected.id, { renderAboveHair: event.target.checked })} /><span>Exibir por cima de todos os cabelos</span></label>}<label>Parte correspondente<select value={selected.attachedPartId} onChange={(event) => updateComponent(selected.id, { attachedPartId: event.target.value })}><option value="" disabled>Escolha a parte do corpo</option>{model?.parts.map((part) => <option key={part.id} value={part.id}>{part.name}{part.sourceTransform ? '' : ' · calibrar origem'}</option>)}</select></label>{(() => { const linkedPart = model?.parts.find((part) => part.id === selected.attachedPartId); return linkedPart && !linkedPart.sourceTransform ? <button className="pose-button secondary wardrobe-calibrate-button" onClick={() => { setTestPose(null); setCalibratingPartId(linkedPart.id); setError('') }} type="button"><Icon name="frame" /> Calibrar origem na folha</button> : null })()}<WardrobeGlueControls component={selected} target={selectedBone} suggested={suggestedBone} status={glueStatus} onChooseTarget={(id) => updateComponent(selected.id, { attachedPartId: id })} onFix={fixSelectedBinding} onRelease={releaseSelectedBinding} /><div className="wardrobe-quick-controls"><div className="wardrobe-nudge-pad"><button aria-label="Mover para cima" title="Mover para cima" onClick={() => nudgeSelected(0, -5)} type="button">↑</button><button aria-label="Mover para esquerda" title="Mover para esquerda" onClick={() => nudgeSelected(-5, 0)} type="button">←</button><span>mover</span><button aria-label="Mover para direita" title="Mover para direita" onClick={() => nudgeSelected(5, 0)} type="button">→</button><button aria-label="Mover para baixo" title="Mover para baixo" onClick={() => nudgeSelected(0, 5)} type="button">↓</button></div><div className="wardrobe-quick-actions"><button title="Diminuir tamanho em 10%" onClick={() => resizeSelected(.9)} type="button">− Tamanho</button><button title="Aumentar tamanho em 10%" onClick={() => resizeSelected(1.1)} type="button">+ Tamanho</button><button title="Girar 15 graus para a esquerda" onClick={() => updateComponent(selected.id, { rotation: selected.rotation - 15 })} type="button">↶ 15°</button><button title="Girar 15 graus para a direita" onClick={() => updateComponent(selected.id, { rotation: selected.rotation + 15 })} type="button">↷ 15°</button><button className="wardrobe-origin-button" onClick={restoreSelectedOrigin} type="button">Voltar à posição original</button><button className="wardrobe-mirror-button" aria-label="Espelhar a peça horizontalmente" title="Espelha os pixels da peça na horizontal. Clique novamente para voltar" disabled={saving || processing || openingSet || draft.edition === 2} onClick={() => void mirrorSelectedComponent()} type="button"><Icon name="flipHorizontal" /> Espelhar peça</button></div></div><section className="wardrobe-scale-controls" aria-label="Escala horizontal e vertical"><div className="wardrobe-scale-heading"><strong>Escala da peça</strong><label className="wardrobe-aspect-lock"><input type="checkbox" checked={lockAspectRatio} onChange={(event) => setLockAspectRatio(event.target.checked)} /><span>Manter proporção</span></label></div><label className="wardrobe-scale-row"><span><b>↔ Horizontal</b><output>{Math.round(selected.width / (selected.originWidth ?? selected.width) * 100)}%</output></span><input aria-label="Escala horizontal" type="range" min="10" max="300" step="1" value={Math.max(10, Math.min(300, Math.round(selected.width / (selected.originWidth ?? selected.width) * 100)))} onChange={(event) => scaleSelectedAxis('width', (selected.originWidth ?? selected.width) * Number(event.target.value) / 100)} /></label><label className="wardrobe-scale-row"><span><b>↕ Vertical</b><output>{Math.round(selected.height / (selected.originHeight ?? selected.height) * 100)}%</output></span><input aria-label="Escala vertical" type="range" min="10" max="300" step="1" value={Math.max(10, Math.min(300, Math.round(selected.height / (selected.originHeight ?? selected.height) * 100)))} onChange={(event) => scaleSelectedAxis('height', (selected.originHeight ?? selected.height) * Number(event.target.value) / 100)} /></label></section><div className="wardrobe-number-grid">{([['x', 'X'], ['y', 'Y'], ['width', 'Largura'], ['height', 'Altura'], ['rotation', 'Ângulo']] as const).map(([field, label]) => <label key={field}>{label}<input type="number" step={field === 'rotation' ? 1 : 2} value={Number(selected[field].toFixed(1))} onChange={(event) => { const value = Number(event.target.value); if (field === 'width' || field === 'height') scaleSelectedAxis(field, value); else updateComponent(selected.id, { [field]: value }) }} /></label>)}</div><small className="wardrobe-note">A peça acompanha o osso e a pose selecionados ao equipá-la no Customizador.</small></div>}{!selected && <div className="wardrobe-edit-empty"><Icon name="shirt" /><strong>Escolha uma peça</strong><small>Selecione no catálogo para ajustar posição, tamanho e vínculo.</small></div>}</> : <div className="wardrobe-edit-empty"><Icon name="sparkles" /><strong>Pré-encaixe automático</strong><small>A folha é separada por transparência. Depois você revisa categoria, peça do corpo e posição de cada recorte.</small></div>}
      </aside>
    </div>
    {garmentEditorOpen && selected && <WardrobeGarmentEditorModal key={selected.id} component={selected} previewBackground={previewBackground} bodyReference={editorBodyReference} pairedImageMode={selectedImageCounterpart ? wardrobePairImageMode(draft?.importKind, selected.category) : undefined} onClose={() => setGarmentEditorOpen(false)} onApply={(imageUrl) => applyWardrobeImageEdit(selected.id, imageUrl)} />}
    {importPickerOpen && <div className="pose-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setImportPickerOpen(false) }}><section className="pose-model-picker" role="dialog" aria-modal="true" aria-labelledby="wardrobe-import-title"><header><span><small>BIBLIOTECA DE ROUPAS</small><strong id="wardrobe-import-title">Como deseja importar?</strong></span><button onClick={() => setImportPickerOpen(false)} aria-label="Fechar" type="button">×</button></header><p>Na folha automática, organize os acessórios na faixa de cima e as roupas do corpo abaixo.</p><div className="pose-model-options"><button className="pose-model-option" onClick={() => { setImportPickerOpen(false); inputRef.current?.click() }} type="button"><span className="pose-model-number"><Icon name="sparkles" /></span><span><b>Separar automaticamente</b><small>Separa os recortes transparentes, detecta acessórios no topo e sugere tronco, braços, pernas, meias e sapatos abaixo.</small></span><Icon name="chevronRight" /></button><button className="pose-model-option" onClick={() => { setImportPickerOpen(false); torsoAccessoryInputRef.current?.click() }} type="button"><span className="pose-model-number"><Icon name="sparkles" /></span><span><b>Acessórios de tronco · Cinto e acessório</b><small>Importa os recortes na categoria cinto, com sugestão de encaixe no quadril ou tronco. Revise o vínculo de cada peça antes de salvar.</small></span><Icon name="chevronRight" /></button><button className="pose-model-option" onClick={() => { gridSizeRef.current = 4; gridInputRef.current?.click() }} type="button"><span className="pose-model-number">4×3</span><span><b>Roupas para tronco · grade 4×3</b><small>Até 12 roupas, com remoção automática do fundo.</small></span><Icon name="chevronRight" /></button><button className="pose-model-option" onClick={() => { gridSizeRef.current = 3; gridInputRef.current?.click() }} type="button"><span className="pose-model-number">3×3</span><span><b>Roupas para tronco · grade 3×3</b><small>Até 9 roupas, com remoção automática do fundo.</small></span><Icon name="chevronRight" /></button><button className="pose-model-option" onClick={() => { pairedSheetKindRef.current = 'pants'; pairedSheetInputRef.current?.click() }} type="button"><span className="pose-model-number">3×4</span><span><b>Importar Calças (Sheet)</b><small>12 peças esquerdas: 6 shorts nas coxas e 6 calças inteiras; posicione sobre coxa e canela com “Juntar juntas” e divida automaticamente na junta. O lado direito é espelhado.</small></span><Icon name="chevronRight" /></button><button className="pose-model-option" onClick={() => { pairedSheetKindRef.current = 'sleeves'; pairedSheetInputRef.current?.click() }} type="button"><span className="pose-model-number">3×4</span><span><b>Importar Mangas (Sheet)</b><small>12 posições: mangas curtas nas 2 primeiras linhas; as longas ficam inteiras para posicionar e dividir na junta do modelo. Gera cada lado direito espelhando a manga esquerda.</small></span><Icon name="chevronRight" /></button><button className="pose-model-option" onClick={() => { pairedSheetKindRef.current = 'shoes'; pairedSheetInputRef.current?.click() }} type="button"><span className="pose-model-number">3×4</span><span><b>Importar Sapatos (Sheet)</b><small>12 sapatos esquerdos em 3 colunas e 4 linhas. O lado direito é duplicado sem inverter horizontalmente.</small></span><Icon name="chevronRight" /></button></div></section></div>}{testPosePickerOpen && <WardrobeTestPosePicker poses={testPoseSlots} loading={testPoseLoading} onClose={closeTestPosePicker} onSelect={(slot) => void loadTestPose(slot)} />}
  </section>
}
