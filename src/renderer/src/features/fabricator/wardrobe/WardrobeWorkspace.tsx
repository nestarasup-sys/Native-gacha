import { projectForOriginalPreview, selectOriginalModelSource } from '../../../../../shared/fabricatorModelViews'
import { useModelSourceRefresh } from '../models/useModelSourceRefresh'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { FabricatorPose, FabricatorPoseSummary, FabricatorProject, FabricatorProjectSave, FabricatorSlotSummary, ModelPart, WardrobeCategory, WardrobeComponent, WardrobeSet, WardrobeSetSave, WardrobeSetSummary } from '../../../../../shared/fabricator'
import { Icon } from '../../../ui/components/Icon'
import { usePreviewBackground } from '../../../ui/hooks/usePreviewBackground'
import { normalizeLayerOrder, orderedParts, partJointAnchor } from '../models/rig'
import { bindWardrobeComponent, mapWardrobeComponentToPose, poseDeltaToSource, wardrobePosePadding, rebaseWardrobeSetToOriginalSheet } from './poseTransform'
import { editWardrobeGlue, fixWardrobeGlue, releaseWardrobeGlue, suggestWardrobeGlueTarget, wardrobeGlueState } from '../../../../../shared/wardrobeGlue'
import { WardrobeGlueControls } from './WardrobeGlueControls'
import { snapWardrobePlacement } from '../../../../../shared/wardrobeMagnet'
import { useWardrobePoseAudit } from './useWardrobePoseAudit'
import { WardrobePoseAuditPanel } from './WardrobePoseAuditPanel'
import { useWardrobeComparisonPose } from './useWardrobeComparisonPose'
import { WardrobeComparisonPreview } from './WardrobeComparisonPreview'
import { suggestWardrobeBone } from './boneSelection'
import { guessWardrobeCategoryForBone, guessWardrobeNameForBone } from './wardrobeAutoDetection'
import { createWardrobeTorsoGridComponents } from './wardrobeGridImport'
import { createWardrobeComponentsFromProcessedSheet } from './wardrobeSheetImport'
import type { WardrobeProcessorResponse } from './wardrobeProcessorProtocol'
import { recoverWardrobeReferenceModel } from './wardrobeReferenceRecovery'
import { normalizeEditableImageFile } from '../normalizeImage'
import { applyWardrobeWarpBrush, createWardrobeWarpMesh, drawWardrobeWarp, type WardrobeWarpBounds, type WardrobeWarpMesh, type WardrobeWarpPoint, wardrobeWarpPadding } from './wardrobeMeshWarp'
import { WardrobeGarmentEditorModal } from './WardrobeGarmentEditorModal'
import { useModelAppearanceTarget, useModelPartAppearancePreview } from '../ModelAppearanceContext'
import './wardrobe.css'

type PieceDrag = { pointerId: number; componentId: string; pointerX: number; pointerY: number; originX: number; originY: number }
type PreviewPanDrag = { pointerId: number; pointerX: number; pointerY: number; originX: number; originY: number }
type SourceReferencePart = { x: number; y: number; width: number; height: number; imageDataUrl: string }
type BodyDrag = { pointerId: number; partId: string; pointerX: number; pointerY: number; originX: number; originY: number }
type WardrobeWarpSession = { sourceUrl: string; committedUrl: string; image: HTMLImageElement; mesh: WardrobeWarpMesh; committedPadding: number }
type WardrobeWarpDrag = { pointerId: number; componentId: string; last: WardrobeWarpPoint; displayOffset: Point; originalX: Float32Array; originalY: Float32Array; changed: boolean }
type Point = { x: number; y: number }
const zeroOffset: Point = { x: 0, y: 0 }

function loadWardrobeWarpImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível carregar a imagem da peça para deformar.'))
    image.src = source
    if (image.complete && image.naturalWidth > 0) resolve(image)
  })
}

function wardrobeWarpBaseBounds(component: WardrobeComponent, image: HTMLImageElement, committedPadding: number, displayOffset: Point = zeroOffset): WardrobeWarpBounds {
  const outputWidth = image.naturalWidth + committedPadding * 2
  const outputHeight = image.naturalHeight + committedPadding * 2
  const scaleX = component.width / outputWidth
  const scaleY = component.height / outputHeight
  return {
    x: component.x + displayOffset.x + committedPadding * scaleX,
    y: component.y + displayOffset.y + committedPadding * scaleY,
    width: image.naturalWidth * scaleX,
    height: image.naturalHeight * scaleY,
    rotation: component.rotation
  }
}

function rebindComponents(components: WardrobeComponent[], reference: FabricatorProject): { components: WardrobeComponent[]; changed: boolean } {
  const bones = new Map(reference.parts.map((part) => [part.id, part]))
  let changed = false
  const rebound = components.map((component) => {
    const bone = bones.get(component.attachedPartId)
    if (!bone || component.glue?.mode === 'fixed' || component.glue?.mode === 'loose') return component
    const expected = bindWardrobeComponent(component, bone)
    const current = component.binding
    if (current?.boneId === expected.boneId && Math.abs(current.localCenterX - expected.localCenterX) < 0.00001 && Math.abs(current.localCenterY - expected.localCenterY) < 0.00001 && Math.abs(current.widthRatio - expected.widthRatio) < 0.00001 && Math.abs(current.heightRatio - expected.heightRatio) < 0.00001 && Math.abs(current.relativeRotation - expected.relativeRotation) < 0.00001 && Math.abs(current.boneWidth - expected.boneWidth) < 0.00001 && Math.abs(current.boneHeight - expected.boneHeight) < 0.00001 && Math.abs(current.boneRotation - expected.boneRotation) < 0.00001) return component
    changed = true
    return { ...component, binding: expected }
  })
  return { components: changed ? rebound : components, changed }
}
const categoryNames: Record<WardrobeCategory, string> = {
  camisa: 'Camisas', jaqueta: 'Jaquetas', 'manga-superior': 'Mangas superiores', 'manga-inferior': 'Mangas inferiores', luvas: 'Luvas', capa: 'Capa', cinto: 'Cinto', oculos: 'Óculos', 'acessorio-cabeca': 'Acessórios de cabeça', saia: 'Saia', 'calca-coxa': 'Calças · coxas', 'calca-canela': 'Calças · canelas', shorts: 'Shorts', meia: 'Meias', sapato: 'Sapatos'
}
const categories = Object.keys(categoryNames) as WardrobeCategory[]
function deformationOriginalAssetId(componentId: string): string { return `${componentId}_deform_original` }
function readFile(file: File): Promise<string> { return normalizeEditableImageFile(file).then((image) => image.dataUrl) }
function getBodyLayer(model: FabricatorProject | null, partId: string): number {
  if (!model) return 0
  const order = model.layerOrder ?? model.parts.map((part) => part.id)
  const layer = order.indexOf(partId)
  return layer >= 0 ? layer : Math.max(0, model.parts.findIndex((part) => part.id === partId))
}
function serializeModel(model: FabricatorProject): FabricatorProjectSave {
  const { sourceDataUrl: _sourceDataUrl, parts, ...metadata } = model
  return { ...metadata, parts: parts.map(({ dataUrl: _dataUrl, chromaBaseDataUrl: _chromaBaseDataUrl, ...part }) => part) }
}
function guessBone(category: WardrobeCategory, x: number, width: number, model: FabricatorProject): ModelPart | undefined {
  return suggestWardrobeBone(category, x, width, model).bone ?? undefined
}
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
  const [deformMode, setDeformMode] = useState(false)
  const [warpReadyId, setWarpReadyId] = useState<string | null>(null)
  const [warpRadius, setWarpRadius] = useState(80)
  const [warpStrength, setWarpStrength] = useState(70)
  const inputRef = useRef<HTMLInputElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const requestRef = useRef(0)
  const testPoseRequestRef = useRef(0)
  const pieceDragRef = useRef<PieceDrag | null>(null)
  const previewPanDragRef = useRef<PreviewPanDrag | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const artboardRef = useRef<HTMLDivElement>(null)
  const warpCanvasRef = useRef<HTMLCanvasElement>(null)
  const warpBrushCursorRef = useRef<HTMLDivElement>(null)
  const warpSessionsRef = useRef(new Map<string, WardrobeWarpSession>())
  const warpDragRef = useRef<WardrobeWarpDrag | null>(null)
  const warpDrawFrameRef = useRef<number | null>(null)
  const lastWarpPointRef = useRef<WardrobeWarpPoint | null>(null)
  const dirtyWarpImageIdsRef = useRef(new Set<string>())
  const draftRef = useRef(draft)
  draftRef.current = draft
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 })
  const [moveBodyMode, setMoveBodyMode] = useState(false)
  const [magneticSnap, setMagneticSnap] = useState(true)
  const [showPoseComparison, setShowPoseComparison] = useState(false)
  const [bodyOffsets, setBodyOffsets] = useState<Record<string, Point>>({})
  const bodyDragRef = useRef<BodyDrag | null>(null)
  const [testPosePickerOpen, setTestPosePickerOpen] = useState(false)
  const [importPickerOpen, setImportPickerOpen] = useState(false)
  const gridSizeRef = useRef<3 | 4>(4)
  const gridInputRef = useRef<HTMLInputElement>(null)
  const [testPoseSlots, setTestPoseSlots] = useState<FabricatorPoseSummary[]>([])
  const [testPose, setTestPose] = useState<FabricatorPose | null>(null)
  const [testPoseLoading, setTestPoseLoading] = useState(false)
  const [testDragOffsets, setTestDragOffsets] = useState<Record<string, { x: number; y: number }>>({})
  const [calibratingPartId, setCalibratingPartId] = useState<string | null>(null)
  const poseAudit = useWardrobePoseAudit(model,draft)
  const defaultPose = useWardrobeComparisonPose(modelSlot,Boolean(model && draft))
  const selected = draft?.components.find((component) => component.id === selectedId) ?? null
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
  const referenceModel = projectForOriginalPreview(model)
  const referenceBone = (partId: string) => referenceModel?.parts.find((part) => part.id === partId)
  const selectedBone = selected ? referenceBone(selected.attachedPartId) : undefined
  const selectedBodySource = selected && sourceParts ? sourceParts[selected.attachedPartId] : undefined
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

  const clearWardrobeWarpState = useCallback(() => {
    if (warpDrawFrameRef.current !== null) cancelAnimationFrame(warpDrawFrameRef.current)
    warpDrawFrameRef.current = null
    warpDragRef.current = null
    lastWarpPointRef.current = null
    warpSessionsRef.current.clear()
    dirtyWarpImageIdsRef.current.clear()
    setWarpReadyId(null)
    setDeformMode(false)
    setGarmentEditorOpen(false)
    if (warpBrushCursorRef.current) warpBrushCursorRef.current.style.display = 'none'
  }, [])

  const ensureWardrobeWarpSession = useCallback(async (component: WardrobeComponent): Promise<WardrobeWarpSession> => {
    const cached = warpSessionsRef.current.get(component.id)
    if (cached && (cached.sourceUrl === component.dataUrl || cached.committedUrl === component.dataUrl)) {
      warpSessionsRef.current.delete(component.id)
      warpSessionsRef.current.set(component.id, cached)
      return cached
    }
    if (cached) warpSessionsRef.current.delete(component.id)
    const image = await loadWardrobeWarpImage(component.dataUrl)
    if (warpSessionsRef.current.size >= 4) {
      const oldest = warpSessionsRef.current.keys().next().value
      if (oldest) warpSessionsRef.current.delete(oldest)
    }
    const session: WardrobeWarpSession = { sourceUrl: component.dataUrl, committedUrl: component.dataUrl, image, mesh: createWardrobeWarpMesh(), committedPadding: 0 }
    warpSessionsRef.current.set(component.id, session)
    return session
  }, [])

  const drawWardrobeWarpPreview = useCallback((component: WardrobeComponent, displayOffset: Point = zeroOffset, displayScale = scale) => {
    const canvas = warpCanvasRef.current
    const session = warpSessionsRef.current.get(component.id)
    if (!canvas || !session) return null
    const bounds = wardrobeWarpBaseBounds(component, session.image, session.committedPadding, displayOffset)
    const padding = wardrobeWarpPadding(session.mesh)
    const result = drawWardrobeWarp(canvas, session.image, session.mesh, padding)
    const scaleX = bounds.width / session.image.naturalWidth
    const scaleY = bounds.height / session.image.naturalHeight
    canvas.style.left = `${(bounds.x - result.padding * scaleX) * displayScale}px`
    canvas.style.top = `${(bounds.y - result.padding * scaleY) * displayScale}px`
    canvas.style.width = `${result.width * scaleX * displayScale}px`
    canvas.style.height = `${result.height * scaleY * displayScale}px`
    canvas.style.transform = `rotate(${component.rotation}deg)`
    canvas.style.transformOrigin = 'center'
    return { session, bounds, padding: result.padding, scaleX, scaleY }
  }, [scale])

  const scheduleWardrobeWarpPreview = useCallback((component: WardrobeComponent, displayOffset: Point = zeroOffset) => {
    if (warpDrawFrameRef.current !== null) return
    warpDrawFrameRef.current = requestAnimationFrame(() => {
      warpDrawFrameRef.current = null
      const current = draftRef.current?.components.find((item) => item.id === component.id) ?? component
      drawWardrobeWarpPreview(current, displayOffset)
    })
  }, [drawWardrobeWarpPreview])

  const warpPointFromPointer = useCallback((event: ReactPointerEvent<HTMLElement>): WardrobeWarpPoint | null => {
    const bounds = artboardRef.current?.getBoundingClientRect()
    if (!bounds || scale <= 0) return null
    return { x: (event.clientX - bounds.left) / scale, y: (event.clientY - bounds.top) / scale }
  }, [scale])

  const updateWarpBrushCursor = useCallback((point: WardrobeWarpPoint | null) => {
    const cursor = warpBrushCursorRef.current
    if (!cursor || !point || !deformMode) {
      if (cursor) cursor.style.display = 'none'
      return
    }
    const diameter = warpRadius * 2 * scale
    cursor.style.display = 'block'
    cursor.style.width = `${diameter}px`
    cursor.style.height = `${diameter}px`
    cursor.style.left = `${point.x * scale - diameter / 2}px`
    cursor.style.top = `${point.y * scale - diameter / 2}px`
  }, [deformMode, warpRadius, scale])

  useEffect(() => {
    if (!deformMode || !selected || draft?.edition === 2) {
      setWarpReadyId(null)
      if (warpBrushCursorRef.current) warpBrushCursorRef.current.style.display = 'none'
      return
    }
    const cached = warpSessionsRef.current.get(selected.id)
    if (cached && (cached.sourceUrl === selected.dataUrl || cached.committedUrl === selected.dataUrl)) {
      warpSessionsRef.current.delete(selected.id)
      warpSessionsRef.current.set(selected.id, cached)
      setWarpReadyId(selected.id)
      return
    }
    let active = true
    setWarpReadyId(null)
    void ensureWardrobeWarpSession(selected).then(() => {
      if (active) setWarpReadyId(selected.id)
    }).catch((reason: unknown) => {
      if (active) {
        setDeformMode(false)
        setError(reason instanceof Error ? reason.message : 'Não foi possível preparar a peça para deformação.')
      }
    })
    return () => { active = false }
  }, [deformMode, selectedId, selected?.dataUrl, draft?.edition, ensureWardrobeWarpSession])

  useLayoutEffect(() => {
    if (!deformMode || !selected || warpReadyId !== selected.id || testPose) return
    const offset = selected.binding?.boneId === selected.attachedPartId ? bodyOffsets[selected.attachedPartId] ?? zeroOffset : zeroOffset
    drawWardrobeWarpPreview(selected, offset, scale)
    updateWarpBrushCursor(lastWarpPointRef.current)
  }, [deformMode, selectedId, warpReadyId, scale, selected?.dataUrl, selected?.x, selected?.y, selected?.width, selected?.height, selected?.rotation, selected?.attachedPartId, selected?.binding?.boneId, bodyOffsets, testPose, drawWardrobeWarpPreview, updateWarpBrushCursor])
  useEffect(() => { updateWarpBrushCursor(lastWarpPointRef.current) }, [updateWarpBrushCursor])
  useEffect(() => { if (testPose) setDeformMode(false) }, [testPose])

  const reload = useCallback(async (targetSlot: number) => {
    const requestId = ++requestRef.current
    clearWardrobeWarpState()
    workerRef.current?.terminate()
    setOpeningSet(false)
    setModel(null); setSets([]); setCatalogIssues([]); setDraft(null); setActiveSetId(null); setSelectedId(null)
    setError('')
    try {
      const [savedModels, reference, library] = await Promise.all([window.desktop.listFabricatorSlots(), window.desktop.loadFabricatorSlot(targetSlot), window.desktop.listWardrobeSetsDetailed(targetSlot)])
      if (requestRef.current !== requestId) return
      setModels(savedModels)
      const firstAvailableModel = savedModels.find((slot) => slot)
      if (!reference && firstAvailableModel && firstAvailableModel.slot !== targetSlot) { setModels(savedModels); setModelSlot(firstAvailableModel.slot); return }
      let recoveredModel = reference
      if (reference) {
        try {
          const history = await window.desktop.loadFabricatorHistory(targetSlot)
          if (history) recoveredModel = recoverWardrobeReferenceModel(reference, history)
        } catch { /* Keep calibration available if no history can be read. */ }
      }
      if (requestRef.current !== requestId) return
      setModels(savedModels); setModel(recoveredModel); setSets(library.sets); setCatalogIssues(library.issues)
      setActiveSetId(null); setDraft(null); setSelectedId(null); setDirty(false); setBodyOffsets({}); setMoveBodyMode(false)
    } catch (reason) {
      if (requestRef.current !== requestId) return
      setModel(null); setSets([]); setCatalogIssues([]); setDraft(null); setActiveSetId(null); setSelectedId(null)
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a biblioteca de roupas.')
    }
  }, [clearWardrobeWarpState])
  useEffect(() => { void reload(modelSlot) }, [modelSlot, reload])
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
    const rebound = rebindComponents(draft.components, referenceModel)
    if (!rebound.changed) return
    setDraft((current) => current?.id === draft.id ? { ...current, components: rebindComponents(current.components, referenceModel).components } : current)
    setDirty(true)
  }, [sourceParts, draft?.id])
  useEffect(() => () => {
    requestRef.current++
    testPoseRequestRef.current++
    workerRef.current?.terminate()
    if (warpDrawFrameRef.current !== null) cancelAnimationFrame(warpDrawFrameRef.current)
    warpSessionsRef.current.clear()
    dirtyWarpImageIdsRef.current.clear()
  }, [])

  const openSet = async (id: string) => {
    if (!model || processing || saving || openingSet) return
    if (dirty && !window.confirm('Há alterações não salvas neste conjunto. Descartar e abrir outro?')) return
    testPoseRequestRef.current += 1
    setTestPoseLoading(false)
    setTestPosePickerOpen(false)
    setDeformMode(false)
    const requestId = ++requestRef.current
    setOpeningSet(true)
    try {
      const loaded = await window.desktop.loadWardrobeSet(modelSlot, id)
      if (requestRef.current !== requestId) return
      if (!loaded) throw new Error('Não foi possível encontrar este conjunto.')
      const incompatible = loaded.components.filter((component) => {
        const bone = referenceBone(component.attachedPartId) ?? model.parts.find((part) => part.id === component.attachedPartId)
        return !bone || Boolean(component.binding && component.binding.boneId !== component.attachedPartId)
      })
      // Resolve the original sheet before translating any old separated-sheet
      // bindings. Opening a set does not publish the conversion to storage.
      clearWardrobeWarpState()
      setDraft(loaded); setActiveSetId(id); setSelectedId(loaded.components[0]?.id ?? null)
      setDirty(false); setBodyOffsets({}); setTestPose(null); setTestDragOffsets({}); setCalibratingPartId(null)
      setError(incompatible.length
        ? `${incompatible.length} peça(s) sem vínculo compatível com o modelo original (${incompatible.map((component) => component.name || component.id).join(', ')}). O conjunto foi preservado; corrija os ossos antes de salvar.`
        : '')
    } catch (reason) { if (requestRef.current === requestId) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o conjunto.') }
    finally { if (requestRef.current === requestId) setOpeningSet(false) }
  }
  const importSheet = async (file?: File) => {
    if (!file || !model || processing || saving || openingSet) return
    if (!sourceParts) { setError('Aguarde a referência corporal carregar antes de importar a folha.'); return }
    if (!/\.(png|jpe?g|webp)$/i.test(file.name)) { setError('Use uma imagem PNG, JPG ou WebP.'); return }
    setDeformMode(false)
    setProcessing(true); setError('')
    try {
      const source = await readFile(file)
      workerRef.current?.terminate()
      const worker = new Worker(new URL('./wardrobeProcessor.worker.ts', import.meta.url), { type: 'module' })
      workerRef.current = worker
      const id = ++requestRef.current
      worker.onmessage = (event: MessageEvent<WardrobeProcessorResponse>) => {
        const message = event.data
        if (message.id !== id) return
        setProcessing(false); worker.terminate(); workerRef.current = null
        if (message.type === 'error') { setError(message.message); return }
        if (!message.pieces.length) { setError('Não encontrei peças visíveis. Confira se a folha tem transparência entre as peças.'); return }
        const components = createWardrobeComponentsFromProcessedSheet(message.pieces, message.width, message.height, referenceModel ?? model)
        const unbound = components.filter((component) => !component.attachedPartId)
        if (unbound.length) {
          setError(`${unbound.length} peça(s) sem osso correspondente na referência original. Selecione o osso de cada peça antes de salvar; não faremos um encaixe arbitrário.`)
        }
        clearWardrobeWarpState()
        setDraft({ schemaVersion: 1, edition: 1, id: crypto.randomUUID(), modelSlot, modelName: model.name, name: file.name.replace(/\.[^.]+$/, ''), width: model.width, height: model.height, components, updatedAt: new Date().toISOString() })
        setActiveSetId(null); setSelectedId(components[0]?.id ?? null); setDirty(true); setBodyOffsets({})
      }
      worker.onerror = () => { setProcessing(false); setError('Falha ao processar a imagem localmente.'); worker.terminate(); workerRef.current = null }
      worker.postMessage({ id, dataUrl: source })
    } catch (reason) { setProcessing(false); setError(reason instanceof Error ? reason.message : 'Não foi possível importar a imagem.') }
  }
  const importTorsoGrid = async (file?: File) => {
    if (!file || !model || processing || saving || openingSet) return
    if (!sourceParts) { setError('Aguarde a referência corporal carregar antes de importar a folha.'); return }
    const gridSize = gridSizeRef.current
    setDeformMode(false)
    setProcessing(true); setError(''); setImportPickerOpen(false)
    try {
      const image = await createImageBitmap(file)
      const components = createWardrobeTorsoGridComponents(image, referenceModel ?? model, gridSize, () => crypto.randomUUID())
      if (!components.length) throw new Error('A grade ' + gridSize + '×3 não contém peças visíveis. Confira as células da imagem.')
      clearWardrobeWarpState()
      setDraft({ schemaVersion: 1, edition: 1, importKind: gridSize === 4 ? 'torso-grid-4x3' : 'torso-grid-3x3', id: crypto.randomUUID(), modelSlot, modelName: model.name, name: file.name.replace(/\.[^.]+$/, ''), width: model.width, height: model.height, components, updatedAt: new Date().toISOString() })
      setActiveSetId(null); setSelectedId(components[0].id); setDirty(true); setBodyOffsets({})
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível importar a grade de roupas.') }
    finally { setProcessing(false) }
  }
  const updateComponent = (id: string, values: Partial<WardrobeComponent>) => {
    if (!sourceParts || draft?.edition === 2) return
    setDirty(true)
    setDraft((current) => current ? ({ ...current, components: current.components.map((component) => {
      if (component.id !== id) return component
      const updated = { ...component, ...values }
      if (values.category && values.category !== 'oculos' && values.category !== 'acessorio-cabeca') updated.renderAboveHair = false
      if (values.attachedPartId !== undefined && values.attachedPartId !== component.attachedPartId && referenceModel) {
        const bone = referenceBone(values.attachedPartId)
        if (bone) {
          const category = guessWardrobeCategoryForBone(bone, component.category)
          if (category) {
            updated.category = category
            updated.name = guessWardrobeNameForBone(category, bone, referenceModel)
            if (category !== 'oculos' && category !== 'acessorio-cabeca') updated.renderAboveHair = false
          }
        }
      }
      if ((values.category === 'sapato' || values.category === 'luvas') && values.attachedPartId === undefined && referenceModel) {
        const target = guessBone(values.category, updated.x + updated.width / 2, current.width, referenceModel)
        updated.attachedPartId = target?.id ?? ''
        if (!target) updated.binding = undefined
      }
      return editWardrobeGlue(component, updated, referenceBone(updated.attachedPartId))
    }), updatedAt: new Date().toISOString() }) : current)
  }
  const fixSelectedBinding = () => {
    if (!selected) return
    const bone = referenceBone(selected.attachedPartId)
    if (!bone) return
    setDraft((current) => current ? { ...current, components: current.components.map((piece) => piece.id === selected.id ? fixWardrobeGlue(piece, bone) : piece), updatedAt: new Date().toISOString() } : current)
    setDirty(true)
    setBodyOffsets({})
    setError('')
  }
  const releaseSelectedBinding = () => {
    if (!selected) return
    setDraft((current) => current ? { ...current, components: current.components.map((piece) => piece.id === selected.id ? releaseWardrobeGlue(piece) : piece), updatedAt: new Date().toISOString() } : current)
    setDirty(true)
    setBodyOffsets({})
  }
  const calibrateSourceAnchor = async (partId: string, x: number, y: number) => {
    if (!model) return
    const selectedPart = model.parts.find((part) => part.id === partId)
    if (!selectedPart) return
    const currentAnchor = partJointAnchor(selectedPart, model.joints) ?? { x: selectedPart.x + selectedPart.width / 2, y: selectedPart.y + selectedPart.height / 2 }
    const currentCenter = { x: selectedPart.x + selectedPart.width / 2, y: selectedPart.y + selectedPart.height / 2 }
    const radians = -selectedPart.rotation * Math.PI / 180
    const dx = currentAnchor.x - currentCenter.x
    const dy = currentAnchor.y - currentCenter.y
    const localX = dx * Math.cos(radians) - dy * Math.sin(radians)
    const localY = dx * Math.sin(radians) + dy * Math.cos(radians)
    const sourceCenter = { x: x - localX, y: y - localY }
    const parts = model.parts.map((part) => part.id === partId
      ? { ...part, sourceTransform: { x: sourceCenter.x - part.width / 2, y: sourceCenter.y - part.height / 2, width: part.width, height: part.height, rotation: 0, anchorVersion: 1 as const, jointAnchor: { x, y } } }
      : part)
    const calibrated = { ...model, parts, updatedAt: new Date().toISOString() }
    setModel(calibrated); setCalibratingPartId(null); setError('')
    try { await window.desktop.saveFabricatorProject(serializeModel(calibrated), []) }
    catch (reason) { setError(reason instanceof Error ? `Calibração aplicada nesta sessão, mas não foi salva: ${reason.message}` : 'Calibração aplicada nesta sessão, mas não foi salva.') }
  }
  const handleArtboardPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!calibratingPartId || !previewRef.current) return
    event.preventDefault(); event.stopPropagation()
    const bounds = event.currentTarget.getBoundingClientRect()
    void calibrateSourceAnchor(calibratingPartId, (event.clientX - bounds.left) / scale, (event.clientY - bounds.top) / scale)
  }
  const handlePreviewPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (moveBodyMode || deformMode || testPose || calibratingPartId || event.button !== 0 || !artboardRef.current) return
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
      const components = [...current.components]
      ;[components[index], components[target]] = [components[target], components[index]]
      return { ...current, components, updatedAt: new Date().toISOString() }
    })
  }
  const beginBodyDrag = (event: ReactPointerEvent<HTMLImageElement>, partId: string) => {
    if (!moveBodyMode || testPose || event.button !== 0) return
    event.preventDefault(); event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const offset = bodyOffsets[partId] ?? zeroOffset
    bodyDragRef.current = { pointerId: event.pointerId, partId, pointerX: event.clientX, pointerY: event.clientY, originX: offset.x, originY: offset.y }
    const attached = draft?.components.find((component) => component.binding?.boneId === partId && component.glue?.mode !== 'loose')
    if (attached) setSelectedId(attached.id)
  }
  const moveBodyDrag = (event: ReactPointerEvent<HTMLImageElement>) => {
    const drag = bodyDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setBodyOffsets((current) => ({ ...current, [drag.partId]: { x: drag.originX + (event.clientX - drag.pointerX) / scale, y: drag.originY + (event.clientY - drag.pointerY) / scale } }))
  }
  const finishBodyDrag = (event: ReactPointerEvent<HTMLImageElement>) => {
    if (bodyDragRef.current?.pointerId === event.pointerId) bodyDragRef.current = null
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
  const beginWardrobeWarp = (event: ReactPointerEvent<HTMLCanvasElement>, component: WardrobeComponent, displayOffset: Point) => {
    if (event.button !== 0 || !deformMode || warpReadyId !== component.id || !selected || selected.id !== component.id) return
    const session = warpSessionsRef.current.get(component.id)
    const point = warpPointFromPointer(event)
    if (!session || !point) return
    drawWardrobeWarpPreview(component, displayOffset)
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    warpDragRef.current = {
      pointerId: event.pointerId,
      componentId: component.id,
      last: point,
      displayOffset,
      originalX: new Float32Array(session.mesh.offsetX),
      originalY: new Float32Array(session.mesh.offsetY),
      changed: false
    }
    lastWarpPointRef.current = point
    updateWarpBrushCursor(point)
  }
  const moveWardrobeWarp = (event: ReactPointerEvent<HTMLCanvasElement>, component: WardrobeComponent, displayOffset: Point) => {
    const point = warpPointFromPointer(event)
    if (!point) return
    lastWarpPointRef.current = point
    updateWarpBrushCursor(point)
    const drag = warpDragRef.current
    const session = warpSessionsRef.current.get(component.id)
    if (!drag || drag.pointerId !== event.pointerId || drag.componentId !== component.id || !session) return
    event.preventDefault()
    event.stopPropagation()
    const delta = { x: point.x - drag.last.x, y: point.y - drag.last.y }
    const distance = Math.hypot(delta.x, delta.y)
    if (distance <= 0.001) return
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, warpRadius * 0.2)))
    const bounds = wardrobeWarpBaseBounds(component, session.image, session.committedPadding, displayOffset)
    for (let step = 1; step <= steps; step += 1) {
      const previousPoint = { x: drag.last.x + delta.x * ((step - 1) / steps), y: drag.last.y + delta.y * ((step - 1) / steps) }
      const brushPoint = { x: drag.last.x + delta.x * (step / steps), y: drag.last.y + delta.y * (step / steps) }
      applyWardrobeWarpBrush(session.mesh, session.image, bounds, brushPoint, { x: brushPoint.x - previousPoint.x, y: brushPoint.y - previousPoint.y }, warpRadius, warpStrength / 100)
    }
    drag.last = point
    drag.changed = true
    scheduleWardrobeWarpPreview(component, displayOffset)
  }
  const finishWardrobeWarp = (event: ReactPointerEvent<HTMLCanvasElement>, component: WardrobeComponent, displayOffset: Point) => {
    if (event.type === 'pointerup') moveWardrobeWarp(event, component, displayOffset)
    const drag = warpDragRef.current
    if (!drag || drag.pointerId !== event.pointerId || drag.componentId !== component.id) return
    warpDragRef.current = null
    if (warpDrawFrameRef.current !== null) cancelAnimationFrame(warpDrawFrameRef.current)
    warpDrawFrameRef.current = null
    const session = warpSessionsRef.current.get(component.id)
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* Pointer capture may already have been released by Chromium. */ }
    if (!session) return
    if (event.type === 'pointercancel') {
      session.mesh.offsetX.set(drag.originalX)
      session.mesh.offsetY.set(drag.originalY)
      drawWardrobeWarpPreview(component, displayOffset)
      return
    }
    if (!drag.changed) {
      drawWardrobeWarpPreview(component, displayOffset)
      return
    }
    let layout: ReturnType<typeof drawWardrobeWarpPreview> = null
    let imageUrl = ''
    try {
      layout = drawWardrobeWarpPreview(component, displayOffset)
      const canvas = warpCanvasRef.current
      if (!layout || !canvas) return
      imageUrl = canvas.toDataURL('image/png')
    } catch (reason) {
      session.mesh.offsetX.set(drag.originalX)
      session.mesh.offsetY.set(drag.originalY)
      drawWardrobeWarpPreview(component, displayOffset)
      setError(reason instanceof Error ? `Não foi possível finalizar a deformação: ${reason.message}` : 'Não foi possível finalizar a deformação.')
      return
    }
    if (!layout || !imageUrl) return
    const oldPadding = session.committedPadding
    const padding = layout.padding
    const originWidth = component.originWidth ?? component.width
    const originHeight = component.originHeight ?? component.height
    const originScaleX = originWidth / (session.image.naturalWidth + oldPadding * 2)
    const originScaleY = originHeight / (session.image.naturalHeight + oldPadding * 2)
    const originBaseX = (component.originX ?? component.x) + oldPadding * originScaleX
    const originBaseY = (component.originY ?? component.y) + oldPadding * originScaleY
    const originalFrame = component.hasDeformationOriginal && component.deformationOriginalFrame
      ? component.deformationOriginalFrame
      : {
        x: component.x, y: component.y, width: component.width, height: component.height,
        originX: component.originX, originY: component.originY,
        originWidth: component.originWidth, originHeight: component.originHeight
      }
    const updated = {
      dataUrl: imageUrl,
      hasDeformationOriginal: true as const,
      deformationOriginalDataUrl: component.deformationOriginalDataUrl ?? session.sourceUrl,
      deformationOriginalFrame: originalFrame,
      isDeformed: true,
      x: layout.bounds.x - padding * layout.scaleX - displayOffset.x,
      y: layout.bounds.y - padding * layout.scaleY - displayOffset.y,
      width: (session.image.naturalWidth + padding * 2) * layout.scaleX,
      height: (session.image.naturalHeight + padding * 2) * layout.scaleY,
      originX: originBaseX - padding * originScaleX,
      originY: originBaseY - padding * originScaleY,
      originWidth: (session.image.naturalWidth + padding * 2) * originScaleX,
      originHeight: (session.image.naturalHeight + padding * 2) * originScaleY
    }
    session.committedPadding = padding
    session.committedUrl = imageUrl
    dirtyWarpImageIdsRef.current.add(component.id)
    setDirty(true)
    setError('')
    updateComponent(component.id, updated)
  }
  const nudgeSelected = (dx: number, dy: number) => { if (selected) updateComponent(selected.id, { x: selected.x + dx, y: selected.y + dy }) }
  const resizeSelected = (factor: number) => {
    if (!selected) return
    const width = selected.width * factor; const height = selected.height * factor
    updateComponent(selected.id, { originX: selected.originX ?? selected.x, originY: selected.originY ?? selected.y, originWidth: selected.originWidth ?? selected.width, originHeight: selected.originHeight ?? selected.height, x: selected.x + (selected.width - width) / 2, y: selected.y + (selected.height - height) / 2, width, height })
  }
  const scaleSelectedAxis = (axis: 'width' | 'height', value: number) => {
    if (!selected || !Number.isFinite(value)) return
    const originWidth = selected.originWidth ?? selected.width
    const originHeight = selected.originHeight ?? selected.height
    const centerX = selected.x + selected.width / 2
    const centerY = selected.y + selected.height / 2
    const ratio = value / (axis === 'width' ? originWidth : originHeight)
    const width = axis === 'width' ? value : lockAspectRatio ? originWidth * ratio : selected.width
    const height = axis === 'height' ? value : lockAspectRatio ? originHeight * ratio : selected.height
    updateComponent(selected.id, { originX: selected.originX ?? selected.x, originY: selected.originY ?? selected.y, originWidth, originHeight, x: centerX - width / 2, y: centerY - height / 2, width, height })
  }
  const restoreSelectedOrigin = () => {
    if (!selected) return
    updateComponent(selected.id, { x: selected.originX ?? selected.x, y: selected.originY ?? selected.y, width: selected.originWidth ?? selected.width, height: selected.originHeight ?? selected.height, rotation: 0 })
  }
  const restoreSelectedDeformation = () => {
    if (!selected?.isDeformed || !selected.deformationOriginalDataUrl) return
    const frame = selected.deformationOriginalFrame
    warpSessionsRef.current.delete(selected.id)
    dirtyWarpImageIdsRef.current.add(selected.id)
    setDeformMode(false)
    setWarpReadyId(null)
    setError('')
    updateComponent(selected.id, {
      dataUrl: selected.deformationOriginalDataUrl,
      isDeformed: false,
      ...(frame ? {
        x: frame.x, y: frame.y, width: frame.width, height: frame.height,
        originX: frame.originX, originY: frame.originY,
        originWidth: frame.originWidth, originHeight: frame.originHeight
      } : {})
    })
  }
  const save = async () => {
    if (!draft || draft.edition === 2 || !draft.components.length || saving || processing || openingSet || !sourceParts) return
    setSaving(true); setError('')
    try {
      const set: WardrobeSet = { ...draft, edition: 1, modelSlot, modelName: model?.name ?? draft.modelName, updatedAt: new Date().toISOString() }
      const serialized: WardrobeSetSave = { ...set, components: set.components.map(({ dataUrl: _dataUrl, deformationOriginalDataUrl: _deformationOriginalDataUrl, ...component }) => ({ ...component, renderAboveHair: (component.category === 'oculos' || component.category === 'acessorio-cabeca') && component.renderAboveHair === true })) }
      // Salvamentos só de metadados preservam os PNGs; envie imagens alteradas e seus backups.
       const images = set.components.flatMap((component) => {
         if (activeSetId === set.id && !dirtyWarpImageIdsRef.current.has(component.id)) return []
         const assets = [{ id: component.id, dataUrl: component.dataUrl }]
         if (component.hasDeformationOriginal && component.deformationOriginalDataUrl) {
           assets.push({ id: deformationOriginalAssetId(component.id), dataUrl: component.deformationOriginalDataUrl })
         }
         return assets
       })
       await window.desktop.saveWardrobeSet(modelSlot, serialized, images)
      window.dispatchEvent(new Event('fabricator:assets-updated'))
      dirtyWarpImageIdsRef.current.clear()
      setDraft(set); setActiveSetId(set.id); setDirty(false); setSets(await window.desktop.listWardrobeSets(modelSlot))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o conjunto.') }
    finally { setSaving(false) }
  }
  const deleteSet = async () => {
    if (processing || saving || openingSet) return
    if (!activeSetId || !window.confirm(`Excluir permanentemente o conjunto “${draft?.name ?? activeSetId}”?`)) return
    try { await window.desktop.deleteWardrobeSet(modelSlot, activeSetId); clearWardrobeWarpState(); setDraft(null); setActiveSetId(null); setSelectedId(null); setDirty(false); setSets(await window.desktop.listWardrobeSets(modelSlot)) }
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
    const requestId = ++testPoseRequestRef.current
    const requestedModelSlot = modelSlot
    setError('')
    setTestPosePickerOpen(true)
    setTestPoseLoading(true)
    try {
      const slots = await window.desktop.listFabricatorPoseSlots(requestedModelSlot)
      if (requestId !== testPoseRequestRef.current) return
      setTestPoseSlots(slots.filter((slot): slot is NonNullable<typeof slot> => slot !== null))
    }
    catch (reason) { if (requestId === testPoseRequestRef.current) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as poses deste modelo.') }
    finally { if (requestId === testPoseRequestRef.current) setTestPoseLoading(false) }
  }
  const loadTestPose = async (slot: number) => {
    const requestId = ++testPoseRequestRef.current
    const requestedModelSlot = modelSlot
    setTestPoseLoading(true)
    try {
      const pose = await window.desktop.loadFabricatorPose(requestedModelSlot, slot)
      if (requestId !== testPoseRequestRef.current) return
      if (!pose || pose.sourceModelSlot !== requestedModelSlot || pose.slot !== slot) throw new Error('Esta pose não está mais disponível para o modelo selecionado.')
      setTestDragOffsets({}); setBodyOffsets({}); setMoveBodyMode(false); setTestPose(pose); setTestPosePickerOpen(false); setError('')
    } catch (reason) { if (requestId === testPoseRequestRef.current) setError(reason instanceof Error ? reason.message : 'Não foi possível abrir esta pose.') }
    finally { if (requestId === testPoseRequestRef.current) setTestPoseLoading(false) }
  }
  const exitTestPose = () => { testPoseRequestRef.current += 1; setTestPose(null); setTestPoseLoading(false); setTestDragOffsets({}) }

  const renderComponentList = () => <div className="wardrobe-component-list">{draft?.components.map((component) => <button key={component.id} className={`wardrobe-component-row${selectedId === component.id ? ' active' : ''}`} onClick={() => setSelectedId(component.id)} type="button"><img src={component.dataUrl} alt="" /><span><b>{component.name}</b><small>{categoryNames[component.category]}</small></span></button>)}</div>
  return <section className="fabricator-workspace wardrobe-workspace" aria-label="Biblioteca de roupas">
    <header className="wardrobe-toolbar">
      <div className="wardrobe-title"><span className="model-slot-logo"><Icon name="shirt" /></span><span><strong>Roupas Dev</strong><small>Todos os conjuntos e categorias por modelo</small></span></div>
      <label className="wardrobe-model-select">Modelo<select value={modelSlot} disabled={processing || saving || openingSet || testPoseLoading} onChange={(event) => { if (dirty && !window.confirm('Há alterações não salvas. Descartar e trocar de modelo?')) return; testPoseRequestRef.current += 1; setTestPoseLoading(false); setTestPosePickerOpen(false); setTestPoseSlots([]); setTestPose(null); setModelSlot(Number(event.target.value)) }}>{models.map((item, index) => <option key={index + 1} value={index + 1} disabled={!item}>{String(index + 1).padStart(2, '0')} · {item?.name ?? 'Vazio'}</option>)}</select></label>
      {draft && <input aria-label="Nome do conjunto" className="wardrobe-name-input" value={draft.name} onChange={(event) => { setDirty(true); setDraft((current) => current ? { ...current, name: event.target.value } : current) }} placeholder="Nome do conjunto" />}
      <div className="wardrobe-toolbar-actions"><span className={`wardrobe-save-state${dirty ? ' pending' : ''}`}><i />{dirty ? 'Alterações não salvas' : model ? `${model.parts.length} peças no modelo` : 'Escolha um modelo salvo'}</span><button className="pose-button secondary" disabled={!model || processing || saving || openingSet || !sourceParts} onClick={() => { if (dirty && !window.confirm('Descartar as alterações atuais e importar outra folha?')) return; setImportPickerOpen(true) }} type="button"><Icon name="plus" /> Importar</button>{testPose ? <button className="pose-button danger" onClick={exitTestPose} type="button"><Icon name="eyeOff" /> Sair do teste</button> : <button className="pose-button secondary" disabled={!model || !draft?.components.length} onClick={() => void openTestPosePicker()} type="button"><Icon name="eye" /> Testar pose</button>}<button className="pose-button primary" disabled={!draft || draft.edition === 2 || saving || processing || openingSet || !sourceParts} onClick={() => void save()} type="button"><Icon name="check" />{saving ? 'Salvando…' : activeSetId ? 'Salvar alterações' : 'Salvar conjunto'}</button>{activeSetId && <button className="pose-icon-button" title="Excluir conjunto" disabled={processing || saving || openingSet} onClick={() => void deleteSet()} type="button"><Icon name="trash" /></button>}<input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void importSheet(event.target.files?.[0]); event.currentTarget.value = '' }} /><input ref={gridInputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void importTorsoGrid(event.target.files?.[0]); event.currentTarget.value = '' }} /></div>
    </header>
    {!!catalogIssues.length && <div className="wardrobe-error" role="alert">{catalogIssues.length} conjunto(s) exigem revisão: {catalogIssues.map(issue => `${issue.id}: ${issue.reason}`).join(' · ')}. Os demais conjuntos continuam disponíveis; nenhum arquivo problemático foi descartado.</div>}
    {error && <div className="wardrobe-error" role="alert">{error}<button onClick={() => setError('')} type="button">Fechar</button></div>}
    {testPose && (poseMissingAttachments.length > 0 || poseUsesOlderModel) && <div className="wardrobe-error" role="alert">
      {poseMissingAttachments.length > 0 && <span>Esta pose não contém a parte corporal de {poseMissingAttachments.length} peça(s): {poseMissingAttachments.map((part) => part.name).join(', ')}. Elas foram ocultadas no teste, sem alterar a roupa salva. </span>}
      {poseUsesOlderModel && <span>Esta pose foi salva a partir de outra revisão do modelo. Confira o encaixe visual antes de confiar na prévia.</span>}
    </div>}
    <div className="wardrobe-body wardrobe-body-v2">
      <aside className="wardrobe-library"><header><span><strong>Conjuntos</strong><small>{sets.length} salvos para este modelo</small></span><span className="wardrobe-count">{sets.length}</span></header><div className="wardrobe-set-list">{sets.map((set) => <button className={`wardrobe-set-row${activeSetId === set.id ? ' active' : ''}${set.importKind?.startsWith('torso-grid-') ? ' grid-import' : ''}`} key={set.id} disabled={processing || saving || openingSet} onClick={() => void openSet(set.id)} type="button"><span className="wardrobe-set-icon"><Icon name="shirt" /></span><span><b>{set.name}</b><small>{set.importKind === 'torso-grid-4x3' ? 'Grade 4×3' : set.importKind === 'torso-grid-3x3' ? 'Grade 3×3' : ''}{set.importKind ? ' · ' : ''}{set.componentCount} peças</small></span><Icon name="chevronRight" /></button>)}{!sets.length && <div className="wardrobe-library-empty"><Icon name="box" /><span>Nenhum conjunto salvo.<br />Importe sua primeira folha.</span></div>}</div><div className="wardrobe-category-legend"><strong>Categorias</strong>{categories.map((category) => <span key={category}><i />{categoryNames[category]}</span>)}</div></aside>
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
          {showPoseComparison && <WardrobeComparisonPreview model={model} outfit={draft} pose={testPose ?? defaultPose!} onClose={() => setShowPoseComparison(false)}/>}
        </div>}
        {!testPose && <div className="wardrobe-preview-controls">
          <button className={`pose-button wardrobe-control-move ${moveBodyMode ? 'primary' : 'secondary'}`} disabled={!sourceParts || Boolean(calibratingPartId) || deformMode} aria-label="Mover corpo" title="Mover o corpo para conferir o encaixe" aria-pressed={moveBodyMode} onClick={() => setMoveBodyMode((value) => !value)} type="button"><Icon name="move" /><span className="wardrobe-control-label-wide">Mover corpo</span><span className="wardrobe-control-label-compact">Mover</span></button>
          <button className={`pose-button wardrobe-control-deform ${deformMode ? 'primary' : 'secondary'}`} disabled={!selected || draft?.edition === 2 || saving || processing || openingSet} aria-pressed={deformMode} title="Arraste sobre a roupa selecionada para deformar somente aquela região" onClick={() => { const next = !deformMode; if (next) { setMoveBodyMode(false); setCalibratingPartId(null) } setDeformMode(next) }} type="button"><span className="wardrobe-control-label-wide">{deformMode ? 'Concluir deformação' : '〰 Deformar'}</span><span className="wardrobe-control-label-compact">{deformMode ? 'Concluir' : '〰 Deformar'}</span></button>
          <button className="pose-button secondary wardrobe-deformation-restore" type="button" aria-label="Restaurar deformação" disabled={!selected || !selected.isDeformed || !selected.deformationOriginalDataUrl || saving || processing || openingSet || draft?.edition === 2 || Boolean(testPose)} title="Restaurar deformação e devolver a peça à forma anterior" onClick={restoreSelectedDeformation}><Icon name="undo" /><span>Restaurar</span></button>
          <button className="pose-button secondary wardrobe-control-reset" aria-label="Repor corpo" disabled={!Object.keys(bodyOffsets).length || deformMode} onClick={() => setBodyOffsets({})} title="Repor corpo" type="button"><Icon name="reset" /><span>Repor</span></button>
          <button className={`pose-button wardrobe-control-magnet ${magneticSnap ? 'primary' : 'secondary'}`} disabled={deformMode} type="button" aria-label={magneticSnap ? 'Ímã ligado' : 'Ímã desligado'} aria-pressed={magneticSnap} title={`Ímã ${magneticSnap ? 'ligado' : 'desligado'}: aproxima bordas e centros durante o arraste`} onClick={() => setMagneticSnap((active) => !active)}><span className="wardrobe-control-label-wide">{magneticSnap ? 'Ímã ligado' : 'Ímã desligado'}</span><span className="wardrobe-control-label-compact">Ímã {magneticSnap ? '✓' : '×'}</span></button>
          <button className="pose-button secondary wardrobe-control-center" aria-label="Centralizar prévia" disabled={(previewPan.x === 0 && previewPan.y === 0) || deformMode} onClick={() => setPreviewPan(zeroOffset)} title="Centralizar prévia" type="button"><Icon name="frame" /><span>Centralizar</span></button>
          <label className="preview-background-picker" title="Mudar a cor do fundo em Modelos, Poses, Rosto e Roupas"><span>Fundo</span><input type="color" aria-label="Cor do fundo das prévias" value={previewBackground} onChange={(event) => setPreviewBackground(event.target.value)} /><code>{previewBackground.toUpperCase()}</code></label>
        </div>}
        <div ref={previewRef} className={`wardrobe-preview-stage${testPose ? ' testing-pose' : ''}${deformMode ? ' deforming' : ''}${!moveBodyMode && !deformMode && !calibratingPartId && !testPose ? ' pan-ready' : ''}`} onPointerDown={handlePreviewPointerDown} onPointerMove={movePreviewPan} onPointerUp={finishPreviewPan} onPointerCancel={finishPreviewPan} style={{ '--preview-background': previewBackground } as import('react').CSSProperties}>
        {deformMode && <div className="wardrobe-warp-controls" aria-label="Configurações do pincel de deformação" onPointerDown={(event) => event.stopPropagation()}>
          <label><span>Raio <output>{warpRadius}px</output></span><input aria-label="Raio do pincel de deformação" type="range" min="12" max="280" step="1" value={warpRadius} onChange={(event) => setWarpRadius(Number(event.target.value))} /></label>
          <label><span>Força <output>{warpStrength}%</output></span><input aria-label="Força do pincel de deformação" type="range" min="10" max="100" step="1" value={warpStrength} onChange={(event) => setWarpStrength(Number(event.target.value))} /></label>
          <small>{warpReadyId === selected?.id ? 'Arraste para deformar; salve o conjunto para aplicar no Customizador.' : 'Preparando a imagem da peça…'}</small>
        </div>}
        {previewProject && <div ref={artboardRef} className={`wardrobe-artboard${calibratingPartId ? ' calibrating-origin' : ''}${deformMode ? ' deforming' : ''}${!moveBodyMode && !deformMode && !calibratingPartId && !testPose ? ' pan-ready' : ''}`} onPointerDown={handleArtboardPointerDown} style={{ width: previewProject.width * scale, height: previewProject.height * scale, transform: `translate(${previewPan.x}px, ${previewPan.y}px)` }}>
        {!testPose && model && sourceParts && orderedParts(model.parts, model.layerOrder).map((part) => {
          const source = sourceParts[part.id]
          if (!source) return null
          const offset = moveBodyMode ? bodyOffsets[part.id] ?? zeroOffset : zeroOffset
          return <img key={part.id} className={`wardrobe-reference-body-part${moveBodyMode ? ' movable' : ''}`} src={appearancePreviewForPart(part)} alt={part.name} title={moveBodyMode ? `Arraste ${part.name} para conferir o vínculo` : undefined} draggable={false} onPointerDown={moveBodyMode ? (event) => beginBodyDrag(event, part.id) : undefined} onPointerMove={moveBodyMode ? moveBodyDrag : undefined} onPointerUp={moveBodyMode ? finishBodyDrag : undefined} onPointerCancel={moveBodyMode ? finishBodyDrag : undefined} style={{ left: (source.x + offset.x) * scale, top: (source.y + offset.y) * scale, width: source.width * scale, height: source.height * scale, outline: selected?.attachedPartId === part.id ? '2px solid #27a7a5' : undefined, transform: `rotate(${part.sourceTransform?.rotation ?? part.rotation}deg)`, zIndex: moveBodyMode ? 1000 + model.parts.indexOf(part) : 1 }} />
        })}
        {testPose && previewPoseParts.map((part) => <img key={part.id} className="wardrobe-pose-body-part" src={appearancePreviewForPart(part)} alt={part.name} draggable={false} style={{ left: part.x * scale, top: part.y * scale, width: part.width * scale, height: part.height * scale, zIndex: 2 + previewPoseOrder.indexOf(part.id) * previewLayerStride, transform: `rotate(${part.rotation}deg)` }} />)}
        {draft?.components.map((component, index) => {
          const layer = getBodyLayer(model, component.attachedPartId)
          const layerBand = testPose ? previewLayerStride : draft.components.length + 1
           const modelBone = referenceBone(component.attachedPartId)
          const poseBone = testPose?.parts.find((part) => part.id === component.attachedPartId)
          const testOffset = testDragOffsets[component.id] ?? { x: 0, y: 0 }
           const bodyOffset = !testPose && component.binding?.boneId === component.attachedPartId ? bodyOffsets[component.attachedPartId] ?? zeroOffset : zeroOffset
           const componentX = component.x + (testPose ? testOffset.x : bodyOffset.x)
           const componentY = component.y + (testPose ? testOffset.y : bodyOffset.y)
          const testComponent = { ...component, x: componentX, y: componentY }
          if (testPose && modelBone && (testOffset.x !== 0 || testOffset.y !== 0)) testComponent.binding = bindWardrobeComponent(testComponent, modelBone)
          const { kneeOverlap, edgePadding } = wardrobePosePadding(component, draft.components)
          const poseTransform = testPose && component.glue?.mode !== 'loose' && modelBone && poseBone
            ? mapWardrobeComponentToPose(testComponent, modelBone, poseBone, kneeOverlap, edgePadding)
            : null
          const poseLayer = previewPoseOrder.indexOf(component.attachedPartId)
          const zIndex = testPose ? 3 + Math.max(0, poseLayer) * layerBand + index : 2 + layer * layerBand + index
          const imageClassName = `wardrobe-preview-part${component.id === selectedId ? ' selected' : ''}`
          const imageTitle = `${component.name} · ${categoryNames[component.category]} · camada do modelo ${layer + 1}`
          if (draft?.importKind?.startsWith('torso-grid-') && selectedId && component.id !== selectedId) return null
          if (!testPose) {
            if (deformMode && component.id === selectedId && warpReadyId === component.id) return <canvas key={component.id} width={1} height={1} ref={warpCanvasRef} className={`${imageClassName} wardrobe-warp-canvas`} aria-label={`Pincel de deformação sobre ${component.name}`} title={imageTitle} onPointerDown={(event) => beginWardrobeWarp(event, component, bodyOffset)} onPointerMove={(event) => moveWardrobeWarp(event, component, bodyOffset)} onPointerUp={(event) => finishWardrobeWarp(event, component, bodyOffset)} onPointerCancel={(event) => finishWardrobeWarp(event, component, bodyOffset)} onPointerLeave={() => { if (!warpDragRef.current) { lastWarpPointRef.current = null; updateWarpBrushCursor(null) } }} style={{ zIndex: 10000 }} />
            return <img key={component.id} className={imageClassName} src={component.dataUrl} alt={component.name} title={imageTitle} draggable={false} onClick={() => setSelectedId(component.id)} onPointerDown={(event) => beginPieceDrag(event, component)} onPointerMove={movePieceDrag} onPointerUp={finishPieceDrag} onPointerCancel={finishPieceDrag} style={{ left: componentX * scale, top: componentY * scale, width: component.width * scale, height: component.height * scale, zIndex, transform: `rotate(${component.rotation}deg)`, pointerEvents: deformMode ? 'none' : 'auto' }} />
          }
          if (!poseTransform) return null
          const image = <img className={imageClassName} src={component.dataUrl} alt={component.name} title={imageTitle} draggable={false} onClick={() => setSelectedId(component.id)} onPointerDown={(event) => beginPieceDrag(event, component)} onPointerMove={movePieceDrag} onPointerUp={finishPieceDrag} onPointerCancel={finishPieceDrag} style={{ left: poseTransform.localLeft * scale, top: poseTransform.localTop * scale, width: poseTransform.renderWidth * scale, height: poseTransform.renderHeight * scale, transformOrigin: 'center', transform: `rotate(${poseTransform.localRotation}deg)` }} />
          return <div key={component.id} className="wardrobe-pose-garment" style={{ left: poseTransform.origin.x * scale, top: poseTransform.origin.y * scale, width: 0, height: 0, zIndex, transformOrigin: '0 0', transform: poseTransform.matrix }}>{image}</div>
        })}
        {deformMode && selected && warpReadyId === selected.id && <div ref={warpBrushCursorRef} className="wardrobe-warp-brush-cursor" aria-hidden="true" />}

      </div>}{!model && <div className="wardrobe-empty"><Icon name="shirt" /><strong>Selecione um modelo salvo</strong><small>O modelo será usado como guia na prévia de encaixe.</small></div>}{model && !draft && !testPose && <div className="wardrobe-stage-hint">Importe uma folha para começar · fundo transparente preservado</div>}{testPose && <div className="wardrobe-stage-hint wardrobe-test-hint">Teste temporário · a pose salva não será alterada</div>}{calibratingPartId && <div className="wardrobe-stage-hint wardrobe-calibration-hint">Clique na junta de “{model?.parts.find((part) => part.id === calibratingPartId)?.name}” na folha original</div>}<div className="wardrobe-zoom"><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.min(2.2, value + .1))} type="button">+</button><button onClick={() => setZoom((value) => Math.max(.55, value - .1))} type="button">−</button></div>{processing && <div className="wardrobe-processing"><span className="model-spinner" />Detectando peças transparentes…</div>}</div><footer>{testPose ? 'Arraste as roupas para testar o encaixe. Use “Sair do teste” para voltar à folha original.' : 'Arraste a roupa para encaixar. Clique em Fixar para grudar a roupa na parte selecionada; Mover corpo permite conferir o encaixe.'}</footer></section>
      <aside className="wardrobe-edit-panel wardrobe-edit-panel-v2"><header><span><strong>Ajuste da peça</strong><small>{selected?.name ?? 'Escolha uma peça no catálogo'}</small></span></header>
        {draft ? <>{selected && <div className="wardrobe-fields"><div className="wardrobe-field-title"><strong>Editar peça · camada do modelo {getBodyLayer(model, selected.attachedPartId) + 1}</strong><button title="Subir camada" aria-label="Subir camada" disabled={selectedIndex === (draft?.components.length ?? 0) - 1} onClick={() => moveComponentLayer(selected.id, 1)} type="button">↑</button><button title="Descer camada" aria-label="Descer camada" disabled={selectedIndex <= 0} onClick={() => moveComponentLayer(selected.id, -1)} type="button">↓</button><button title="Remover esta peça do conjunto" onClick={() => { setDraft((current) => current ? { ...current, components: current.components.filter((component) => component.id !== selected.id) } : current); setSelectedId(draft.components.find((component) => component.id !== selected.id)?.id ?? null); setDirty(true) }} type="button"><Icon name="trash" /></button></div><button className="wardrobe-image-edit-button" type="button" disabled={saving || processing || openingSet || draft.edition === 2 || Boolean(testPose)} onClick={() => { setDeformMode(false); setGarmentEditorOpen(true) }}><Icon name="edit" /> Editar imagem da roupa</button><label>Nome<input value={selected.name} onChange={(event) => updateComponent(selected.id, { name: event.target.value })} /></label><label>Categoria<select value={selected.category} onChange={(event) => updateComponent(selected.id, { category: event.target.value as WardrobeCategory })}>{categories.map((category) => <option key={category} value={category}>{categoryNames[category]}</option>)}</select></label>{(selected.category === 'oculos' || selected.category === 'acessorio-cabeca') && <label className="wardrobe-option-toggle"><input type="checkbox" checked={selected.renderAboveHair ?? false} onChange={(event) => updateComponent(selected.id, { renderAboveHair: event.target.checked })} /><span>Exibir por cima de todos os cabelos</span></label>}<label>Parte correspondente<select value={selected.attachedPartId} onChange={(event) => updateComponent(selected.id, { attachedPartId: event.target.value })}><option value="" disabled>Escolha a parte do corpo</option>{model?.parts.map((part) => <option key={part.id} value={part.id}>{part.name}{part.sourceTransform ? '' : ' · calibrar origem'}</option>)}</select></label>{(() => { const linkedPart = model?.parts.find((part) => part.id === selected.attachedPartId); return linkedPart && !linkedPart.sourceTransform ? <button className="pose-button secondary wardrobe-calibrate-button" onClick={() => { setTestPose(null); setCalibratingPartId(linkedPart.id); setError('') }} type="button"><Icon name="frame" /> Calibrar origem na folha</button> : null })()}<WardrobeGlueControls component={selected} target={selectedBone} suggested={suggestedBone} status={glueStatus} onChooseTarget={(id) => updateComponent(selected.id, { attachedPartId: id })} onFix={fixSelectedBinding} onRelease={releaseSelectedBinding} /><div className="wardrobe-quick-controls"><div className="wardrobe-nudge-pad"><button aria-label="Mover para cima" title="Mover para cima" onClick={() => nudgeSelected(0, -5)} type="button">↑</button><button aria-label="Mover para esquerda" title="Mover para esquerda" onClick={() => nudgeSelected(-5, 0)} type="button">←</button><span>mover</span><button aria-label="Mover para direita" title="Mover para direita" onClick={() => nudgeSelected(5, 0)} type="button">→</button><button aria-label="Mover para baixo" title="Mover para baixo" onClick={() => nudgeSelected(0, 5)} type="button">↓</button></div><div className="wardrobe-quick-actions"><button title="Diminuir tamanho em 10%" onClick={() => resizeSelected(.9)} type="button">− Tamanho</button><button title="Aumentar tamanho em 10%" onClick={() => resizeSelected(1.1)} type="button">+ Tamanho</button><button title="Girar 15 graus para a esquerda" onClick={() => updateComponent(selected.id, { rotation: selected.rotation - 15 })} type="button">↶ 15°</button><button title="Girar 15 graus para a direita" onClick={() => updateComponent(selected.id, { rotation: selected.rotation + 15 })} type="button">↷ 15°</button><button className="wardrobe-origin-button" onClick={restoreSelectedOrigin} type="button">Voltar à posição original</button></div></div><section className="wardrobe-scale-controls" aria-label="Escala horizontal e vertical"><div className="wardrobe-scale-heading"><strong>Escala da peça</strong><label className="wardrobe-aspect-lock"><input type="checkbox" checked={lockAspectRatio} onChange={(event) => setLockAspectRatio(event.target.checked)} /><span>Manter proporção</span></label></div><label className="wardrobe-scale-row"><span><b>↔ Horizontal</b><output>{Math.round(selected.width / (selected.originWidth ?? selected.width) * 100)}%</output></span><input aria-label="Escala horizontal" type="range" min="10" max="300" step="1" value={Math.max(10, Math.min(300, Math.round(selected.width / (selected.originWidth ?? selected.width) * 100)))} onChange={(event) => scaleSelectedAxis('width', (selected.originWidth ?? selected.width) * Number(event.target.value) / 100)} /></label><label className="wardrobe-scale-row"><span><b>↕ Vertical</b><output>{Math.round(selected.height / (selected.originHeight ?? selected.height) * 100)}%</output></span><input aria-label="Escala vertical" type="range" min="10" max="300" step="1" value={Math.max(10, Math.min(300, Math.round(selected.height / (selected.originHeight ?? selected.height) * 100)))} onChange={(event) => scaleSelectedAxis('height', (selected.originHeight ?? selected.height) * Number(event.target.value) / 100)} /></label></section><div className="wardrobe-number-grid">{([['x', 'X'], ['y', 'Y'], ['width', 'Largura'], ['height', 'Altura'], ['rotation', 'Ângulo']] as const).map(([field, label]) => <label key={field}>{label}<input type="number" step={field === 'rotation' ? 1 : 2} value={Number(selected[field].toFixed(1))} onChange={(event) => { const value = Number(event.target.value); if (field === 'width' || field === 'height') scaleSelectedAxis(field, value); else updateComponent(selected.id, { [field]: value }) }} /></label>)}</div><small className="wardrobe-note">A peça acompanha o osso e a pose selecionados ao equipá-la no Customizador.</small></div>}{!selected && <div className="wardrobe-edit-empty"><Icon name="shirt" /><strong>Escolha uma peça</strong><small>Selecione no catálogo para ajustar posição, tamanho e vínculo.</small></div>}</> : <div className="wardrobe-edit-empty"><Icon name="sparkles" /><strong>Pré-encaixe automático</strong><small>A folha é separada por transparência. Depois você revisa categoria, peça do corpo e posição de cada recorte.</small></div>}
      </aside>
    </div>
    {garmentEditorOpen && selected && <WardrobeGarmentEditorModal key={selected.id} component={selected} bodyReference={editorBodyReference} onClose={() => setGarmentEditorOpen(false)} onApply={(imageUrl) => { if (imageUrl !== selected.dataUrl) { dirtyWarpImageIdsRef.current.add(selected.id); warpSessionsRef.current.delete(selected.id); updateComponent(selected.id, { dataUrl: imageUrl, hasDeformationOriginal: undefined, deformationOriginalDataUrl: undefined, deformationOriginalFrame: undefined, isDeformed: false }) } setGarmentEditorOpen(false) }} />}
    {importPickerOpen && <div className="pose-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setImportPickerOpen(false) }}><section className="pose-model-picker" role="dialog" aria-modal="true" aria-labelledby="wardrobe-import-title"><header><span><small>BIBLIOTECA DE ROUPAS</small><strong id="wardrobe-import-title">Como deseja importar?</strong></span><button onClick={() => setImportPickerOpen(false)} aria-label="Fechar" type="button">×</button></header><p>Na folha automática, organize os acessórios na faixa de cima e as roupas do corpo abaixo.</p><div className="pose-model-options"><button className="pose-model-option" onClick={() => { setImportPickerOpen(false); inputRef.current?.click() }} type="button"><span className="pose-model-number"><Icon name="sparkles" /></span><span><b>Separar automaticamente</b><small>Separa os recortes transparentes, detecta acessórios no topo e sugere tronco, braços, pernas, meias e sapatos abaixo.</small></span><Icon name="chevronRight" /></button><button className="pose-model-option" onClick={() => { gridSizeRef.current = 4; gridInputRef.current?.click() }} type="button"><span className="pose-model-number">4×3</span><span><b>Roupas para tronco · grade 4×3</b><small>Até 12 roupas, com remoção automática do fundo.</small></span><Icon name="chevronRight" /></button><button className="pose-model-option" onClick={() => { gridSizeRef.current = 3; gridInputRef.current?.click() }} type="button"><span className="pose-model-number">3×3</span><span><b>Roupas para tronco · grade 3×3</b><small>Até 9 roupas, com remoção automática do fundo.</small></span><Icon name="chevronRight" /></button></div></section></div>}{testPosePickerOpen && <div className="pose-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { testPoseRequestRef.current += 1; setTestPoseLoading(false); setTestPosePickerOpen(false) } }}><section className="pose-model-picker" role="dialog" aria-modal="true" aria-labelledby="wardrobe-test-picker-title"><header><span><small>TESTE DE ROUPA</small><strong id="wardrobe-test-picker-title">Escolha uma pose</strong></span><button onClick={() => { testPoseRequestRef.current += 1; setTestPoseLoading(false); setTestPosePickerOpen(false) }} aria-label="Fechar" type="button">×</button></header><p>A roupa será exibida sobre uma cópia visual da pose. A pose salva não será modificada.</p><div className="pose-model-options">{testPoseLoading && <div className="pose-model-none">Carregando poses…</div>}{testPoseSlots.map((pose) => pose && <button key={`pose-${pose.slot}`} className="pose-model-option" disabled={testPoseLoading} onClick={() => void loadTestPose(pose.slot)} type="button"><span className="pose-model-number">{String(pose.slot).padStart(2, '0')}</span><span><b>{pose.name}</b><small>{pose.partCount} peças · {new Date(pose.updatedAt).toLocaleDateString('pt-BR')}</small></span><Icon name="chevronRight" /></button>)}{!testPoseLoading && testPoseSlots.length === 0 && <div className="pose-model-none">Este modelo ainda não tem poses salvas.</div>}</div></section></div>}
  </section>
}
