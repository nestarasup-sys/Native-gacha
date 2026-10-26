import { projectForOriginalPreview, selectOriginalModelSource } from '../../../../../shared/fabricatorModelViews'
import { useModelSourceRefresh } from '../models/useModelSourceRefresh'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { FabricatorHistoryState, FabricatorPose, FabricatorPoseSummary, FabricatorProject, FabricatorProjectSave, FabricatorSlotSummary, ModelPart, WardrobeCategory, WardrobeComponent, WardrobeSet, WardrobeSetSave, WardrobeSetSummary } from '../../../../../shared/fabricator'
import { Icon } from '../../../ui/components/Icon'
import { usePreviewBackground } from '../usePreviewBackground'
import { normalizeLayerOrder, orderedParts, partJointAnchor, sourcePointFromCanvas } from '../models/rig'
import { bindWardrobeComponent, mapWardrobeComponentToPose, poseDeltaToSource, wardrobePosePadding, rebaseWardrobeSetToOriginalSheet } from './poseTransform'
import { editWardrobeGlue, fixWardrobeGlue, releaseWardrobeGlue, suggestWardrobeGlueTarget, wardrobeGlueState } from '../../../../../shared/wardrobeGlue'
import { WardrobeGlueControls } from './WardrobeGlueControls'
import { snapWardrobePlacement } from '../../../../../shared/wardrobeMagnet'
import { useWardrobePoseAudit } from './useWardrobePoseAudit'
import { WardrobePoseAuditPanel } from './WardrobePoseAuditPanel'
import { useWardrobeComparisonPose } from './useWardrobeComparisonPose'
import { WardrobeComparisonPreview } from './WardrobeComparisonPreview'
import { suggestWardrobeBone } from './boneSelection'
import { normalizeEditableImageFile } from '../normalizeImage'
import './wardrobe.css'

type WorkerPiece = Omit<WardrobeComponent, 'category' | 'attachedPartId' | 'rotation' | 'dataUrl'> & { png: ArrayBuffer }
type WorkerMessage = { type: 'complete'; id: number; width: number; height: number; pieces: WorkerPiece[] } | { type: 'error'; id: number; message: string }
type PieceDrag = { pointerId: number; componentId: string; pointerX: number; pointerY: number; originX: number; originY: number }
type PreviewPanDrag = { pointerId: number; pointerX: number; pointerY: number; originX: number; originY: number }
type SourceReferencePart = { x: number; y: number; width: number; height: number; imageDataUrl: string }
type BodyDrag = { pointerId: number; partId: string; pointerX: number; pointerY: number; originX: number; originY: number }
type Point = { x: number; y: number }
const zeroOffset: Point = { x: 0, y: 0 }

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
function dataUrl(buffer: ArrayBuffer): string {
  let binary = ''; const bytes = new Uint8Array(buffer)
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, Math.min(bytes.length, start + 0x8000)))
  return `data:image/png;base64,${btoa(binary)}`
}
function readFile(file: File): Promise<string> { return normalizeEditableImageFile(file).then((image) => image.dataUrl) }
function removeFlatBackground(tile: ImageData): void {
  const { width, height, data } = tile
  const corners = [0, (width - 1) * 4, ((height - 1) * width) * 4, (height * width - 1) * 4]
  if (corners.some((at) => data[at + 3] <= 24)) return
  const background = [0, 0, 0].map((channel) => corners.reduce((sum, at) => sum + data[at + channel], 0) / corners.length)
  if (corners.some((at) => Math.hypot(data[at] - background[0], data[at + 1] - background[1], data[at + 2] - background[2]) > 90)) return
  for (let index = 0; index < width * height; index += 1) {
    const at = index * 4
    if (data[at + 3] <= 24) continue
    const distance = Math.hypot(data[at] - background[0], data[at + 1] - background[1], data[at + 2] - background[2])
    if (distance < 65) data[at + 3] = 0
    else if (distance < 112) data[at + 3] = Math.round(data[at + 3] * (distance - 65) / 47)
  }
}
function guessCategory(piece: WorkerPiece, width: number, height: number): WardrobeCategory {
  const cx = (piece.x + piece.width / 2) / width; const cy = (piece.y + piece.height / 2) / height
  if (cy < .19 && Math.abs(cx - .5) > .1) return 'manga-superior'
  if (cy < .39 && cx > .34 && cx < .66) return 'camisa'
  if (cy > .62) return 'calca-canela'
  if (cy > .34) return 'calca-coxa'
  return 'manga-inferior'
}
function guessName(category: WardrobeCategory, x: number, width: number): string {
  if (category === 'camisa') return 'Camisa'
  if (category === 'jaqueta') return 'Jaqueta'
  if (category === 'capa') return 'Capa'
  if (category === 'cinto') return 'Cinto'
  if (category === 'oculos') return 'Óculos'
  if (category === 'acessorio-cabeca') return 'Acessório de cabeça'
  if (category === 'saia') return 'Saia'
  if (category === 'shorts') return 'Bermuda'
  if (category === 'meia') return `Meia ${x < width / 2 ? 'esquerda' : 'direita'}`
  if (category === 'sapato') return `Sapato ${x < width / 2 ? 'esquerdo' : 'direito'}`
  const side = x < width / 2 ? 'esquerda' : 'direita'
  if (category === 'luvas') return `Luvas ${side}`
  if (category === 'manga-superior') return `Manga superior ${side}`
  if (category === 'manga-inferior') return `Manga inferior ${side}`
  if (category === 'calca-coxa') return `Calça · coxa ${side}`
  return `Calça · canela ${side}`
}
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
export function WardrobeWorkspace() {
  const [previewBackground, setPreviewBackground] = usePreviewBackground()
  const [models, setModels] = useState<FabricatorSlotSummary[]>(Array.from({ length: 10 }, () => null))
  const [modelSlot, setModelSlot] = useState(1)
  const [model, setModel] = useState<FabricatorProject | null>(null)
  useModelSourceRefresh(modelSlot, fresh => setModel(fresh))
  const [sets, setSets] = useState<WardrobeSetSummary[]>([])
  const [catalogIssues, setCatalogIssues] = useState<Array<{ id: string; reason: string }>>([])
  const [activeSetId, setActiveSetId] = useState<string | null>(null)
  const [draft, setDraft] = useState<WardrobeSet | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [openingSet, setOpeningSet] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)
  const [previewPan, setPreviewPan] = useState<Point>(zeroOffset)
  const [lockAspectRatio, setLockAspectRatio] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const requestRef = useRef(0)
  const pieceDragRef = useRef<PieceDrag | null>(null)
  const previewPanDragRef = useRef<PreviewPanDrag | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const artboardRef = useRef<HTMLDivElement>(null)
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 })
  const [moveBodyMode, setMoveBodyMode] = useState(false)
  const [magneticSnap, setMagneticSnap] = useState(true)
  const [showPoseComparison, setShowPoseComparison] = useState(false)
  const [bodyOffsets, setBodyOffsets] = useState<Record<string, Point>>({})
  const bodyDragRef = useRef<BodyDrag | null>(null)
  const [testPosePickerOpen, setTestPosePickerOpen] = useState(false)
  const [importPickerOpen, setImportPickerOpen] = useState(false)
  const [gridSize, setGridSize] = useState<3 | 4>(4)
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
  const glueStatus = selected ? wardrobeGlueState(selected, selectedBone) : 'loose'
  const suggestedBone = selected && referenceModel ? suggestWardrobeGlueTarget(selected, referenceModel.parts) : null

  const reload = useCallback(async (targetSlot: number) => {
    const requestId = ++requestRef.current
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
      let history: FabricatorHistoryState | null = null
      if (reference) {
        try { history = await window.desktop.loadFabricatorHistory(targetSlot) } catch { /* Keep calibration available if no history can be read. */ }
        if (history) {
          const original = history.undo[0]?.project
          const originalParts = new Map((original?.parts ?? []).map((part) => [part.id, part]))
          const recoveredParts = reference.parts.map((part) => {
            const sourcePart = originalParts.get(part.id)
            const baseTransform = part.sourceTransform ?? (sourcePart
              ? { x: sourcePart.x, y: sourcePart.y, width: sourcePart.width, height: sourcePart.height, rotation: sourcePart.rotation }
              : undefined)
            if (!baseTransform) return part
            const completeTransform = { ...baseTransform, width: baseTransform.width ?? sourcePart?.width ?? part.width, height: baseTransform.height ?? sourcePart?.height ?? part.height }
            if (part.sourceTransform?.anchorVersion === 1 && part.sourceTransform.width && part.sourceTransform.height) return part
            // Keep the user's current rig pivot, but express it in the original sheet's coordinates.
            const currentAnchor = partJointAnchor(part, reference.joints)
            const sourcePoint = currentAnchor
              ? sourcePointFromCanvas({ ...part, sourceTransform: completeTransform }, currentAnchor)
              : null
            const fallbackAnchor = sourcePart ? partJointAnchor(sourcePart, original?.joints ?? []) : completeTransform.jointAnchor
            const jointAnchor = sourcePoint ?? fallbackAnchor
            return { ...part, sourceTransform: { ...completeTransform, anchorVersion: 1 as const, ...(jointAnchor ? { jointAnchor: { ...jointAnchor } } : {}) } }
          })
          if (recoveredParts.some((part, index) => part !== reference.parts[index])) {
            recoveredModel = { ...reference, parts: recoveredParts }
            // Restore the reference for this session. Opening the combined
            // clothing library must not publish changes to the body model.
          }
        }
      }
      if (requestRef.current !== requestId) return
      setModels(savedModels); setModel(recoveredModel); setSets(library.sets); setCatalogIssues(library.issues)
      setActiveSetId(null); setDraft(null); setSelectedId(null); setDirty(false); setBodyOffsets({}); setMoveBodyMode(false)
    } catch (reason) {
      if (requestRef.current !== requestId) return
      setModel(null); setSets([]); setCatalogIssues([]); setDraft(null); setActiveSetId(null); setSelectedId(null)
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a biblioteca de roupas.')
    }
  }, [])
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
  useEffect(() => () => { requestRef.current++; workerRef.current?.terminate() }, [])

  const openSet = async (id: string) => {
    if (!model || processing || saving || openingSet) return
    if (dirty && !window.confirm('Há alterações não salvas neste conjunto. Descartar e abrir outro?')) return
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
    setProcessing(true); setError('')
    try {
      const source = await readFile(file)
      workerRef.current?.terminate()
      const worker = new Worker(new URL('./wardrobeProcessor.worker.ts', import.meta.url), { type: 'module' })
      workerRef.current = worker
      const id = ++requestRef.current
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const message = event.data
        if (message.id !== id) return
        setProcessing(false); worker.terminate(); workerRef.current = null
        if (message.type === 'error') { setError(message.message); return }
        if (!message.pieces.length) { setError('Não encontrei peças visíveis. Confira se a folha tem transparência entre as peças.'); return }
        const components = message.pieces.map((piece) => {
          const category = guessCategory(piece, message.width, message.height)
          const { png, ...metadata } = piece
          const bone = guessBone(category, piece.x + piece.width / 2, message.width, referenceModel ?? model)
          const positioned: WardrobeComponent = { ...metadata, category, attachedPartId: bone?.id ?? '', rotation: 0, originX: metadata.x, originY: metadata.y, originWidth: metadata.width, originHeight: metadata.height, dataUrl: dataUrl(png) }
          positioned.glue = { version: 1, mode: 'loose' }
          positioned.binding = undefined
          return { ...positioned, name: guessName(category, piece.x + piece.width / 2, message.width) }
        })
        const unbound = components.filter((component) => !component.attachedPartId)
        if (unbound.length) {
          setError(`${unbound.length} peça(s) sem osso correspondente na referência original. Selecione o osso de cada peça antes de salvar; não faremos um encaixe arbitrário.`)
        }
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
    setProcessing(true); setError(''); setImportPickerOpen(false)
    try {
      const image = await createImageBitmap(file)
      const columns = gridSize; const rows = 3
      if (!image.width || !image.height || image.width < columns || image.height < rows) {
        image.close()
        throw new Error(`A imagem está pequena demais para uma grade ${columns}×${rows}. Use uma imagem com pelo menos ${columns} colunas e 3 linhas de pixels.`)
      }
      if (image.width * image.height > 32_000_000) { image.close(); throw new Error('A imagem tem mais de 32 milhões de pixels. Reduza as dimensões para continuar.') }
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) throw new Error('Não foi possível ler a grade de roupas.')
      context.drawImage(image, 0, 0)
      image.close()
      const torso = (referenceModel ?? model).parts.find((part) => /tronco|corpo|torso|chest|peito/i.test(part.name))
      if (!torso) throw new Error('Não encontrei uma parte de tronco no modelo salvo.')
      const cellWidth = image.width / columns; const cellHeight = image.height / rows
      const components: WardrobeComponent[] = []
      for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
        const left = Math.floor(column * cellWidth); const top = Math.floor(row * cellHeight)
        const right = Math.floor((column + 1) * cellWidth); const bottom = Math.floor((row + 1) * cellHeight)
        const tileWidth = right - left; const tileHeight = bottom - top
        if (tileWidth <= 0 || tileHeight <= 0) continue
        const tile = context.getImageData(left, top, tileWidth, tileHeight)
        removeFlatBackground(tile)
        let minX = tile.width; let minY = tile.height; let maxX = -1; let maxY = -1
        for (let y = 0; y < tile.height; y += 1) for (let x = 0; x < tile.width; x += 1) if (tile.data[(y * tile.width + x) * 4 + 3] > 24) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
        if (maxX < minX || maxY < minY) continue
        const pieceCanvas = document.createElement('canvas'); pieceCanvas.width = maxX - minX + 1; pieceCanvas.height = maxY - minY + 1
        const pieceContext = pieceCanvas.getContext('2d')!
        const cropped = pieceContext.createImageData(pieceCanvas.width, pieceCanvas.height)
        for (let y = 0; y < pieceCanvas.height; y += 1) {
          const from = ((minY + y) * tile.width + minX) * 4
          cropped.data.set(tile.data.subarray(from, from + pieceCanvas.width * 4), y * pieceCanvas.width * 4)
        }
        pieceContext.putImageData(cropped, 0, 0)
        const width = pieceCanvas.width; const height = pieceCanvas.height
        const x = torso.x + (torso.width - width) / 2; const y = torso.y + (torso.height - height) / 2
        const id = crypto.randomUUID()
        components.push({ id, name: `Roupa tronco ${String(components.length + 1).padStart(2, '0')}`, category: 'camisa', x, y, width, height, rotation: 0, attachedPartId: torso.id, originX: x, originY: y, originWidth: width, originHeight: height, dataUrl: pieceCanvas.toDataURL('image/png'), glue: { version: 1, mode: 'loose' } })
      }
      if (!components.length) throw new Error(`A grade ${columns}×${rows} não contém peças visíveis. Confira as células da imagem.`)
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
    if (moveBodyMode || testPose || calibratingPartId || event.button !== 0 || !artboardRef.current) return
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
    if (event.button !== 0) return
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
  const save = async () => {
    if (!draft || draft.edition === 2 || !draft.components.length || saving || processing || openingSet || !sourceParts) return
    setSaving(true); setError('')
    try {
      const set: WardrobeSet = { ...draft, edition: 1, modelSlot, modelName: model?.name ?? draft.modelName, updatedAt: new Date().toISOString() }
      const serialized: WardrobeSetSave = { ...set, components: set.components.map(({ dataUrl: _dataUrl, ...component }) => ({ ...component, renderAboveHair: (component.category === 'oculos' || component.category === 'acessorio-cabeca') && component.renderAboveHair === true })) }
      // Alterações de encaixe de um conjunto já existente não mudam seus pixels.
       // Evita regravar PNGs do catálogo a partir de cópias carregadas em memória.
       const images = activeSetId === set.id ? [] : set.components.map(({ id, dataUrl: image }) => ({ id, dataUrl: image }))
       await window.desktop.saveWardrobeSet(modelSlot, serialized, images)
      window.dispatchEvent(new Event('fabricator:assets-updated'))
      setDraft(set); setActiveSetId(set.id); setDirty(false); setSets(await window.desktop.listWardrobeSets(modelSlot))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar o conjunto.') }
    finally { setSaving(false) }
  }
  const deleteSet = async () => {
    if (processing || saving || openingSet) return
    if (!activeSetId || !window.confirm(`Excluir permanentemente o conjunto “${draft?.name ?? activeSetId}”?`)) return
    try { await window.desktop.deleteWardrobeSet(modelSlot, activeSetId); setDraft(null); setActiveSetId(null); setSelectedId(null); setDirty(false); setSets(await window.desktop.listWardrobeSets(modelSlot)) }
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
    setError('')
    setTestPosePickerOpen(true)
    setTestPoseLoading(true)
    try {
      const slots = await window.desktop.listFabricatorPoseSlots(modelSlot)
      setTestPoseSlots(slots.filter((slot): slot is NonNullable<typeof slot> => slot !== null))
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as poses deste modelo.') }
    finally { setTestPoseLoading(false) }
  }
  const loadTestPose = async (slot: number) => {
    setTestPoseLoading(true)
    try {
      const pose = await window.desktop.loadFabricatorPose(modelSlot, slot)
      if (!pose) throw new Error('Esta pose não está mais disponível.')
      setTestDragOffsets({}); setBodyOffsets({}); setMoveBodyMode(false); setTestPose(pose); setTestPosePickerOpen(false); setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível abrir esta pose.') }
    finally { setTestPoseLoading(false) }
  }
  const exitTestPose = () => { setTestPose(null); setTestDragOffsets({}) }

  const renderComponentList = () => <div className="wardrobe-component-list">{draft?.components.map((component) => <button key={component.id} className={`wardrobe-component-row${selectedId === component.id ? ' active' : ''}`} onClick={() => setSelectedId(component.id)} type="button"><img src={component.dataUrl} alt="" /><span><b>{component.name}</b><small>{categoryNames[component.category]}</small></span></button>)}</div>
  return <section className="fabricator-workspace wardrobe-workspace" aria-label="Biblioteca de roupas">
    <header className="wardrobe-toolbar">
      <div className="wardrobe-title"><span className="model-slot-logo"><Icon name="shirt" /></span><span><strong>Roupas Dev</strong><small>Todos os conjuntos e categorias por modelo</small></span></div>
      <label className="wardrobe-model-select">Modelo<select value={modelSlot} disabled={processing || saving || openingSet} onChange={(event) => { if (dirty && !window.confirm('Há alterações não salvas. Descartar e trocar de modelo?')) return; setTestPose(null); setModelSlot(Number(event.target.value)) }}>{models.map((item, index) => <option key={index + 1} value={index + 1} disabled={!item}>{String(index + 1).padStart(2, '0')} · {item?.name ?? 'Vazio'}</option>)}</select></label>
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
        {!testPose && <div className="wardrobe-preview-controls"><button className={`pose-button ${moveBodyMode ? 'primary' : 'secondary'}`} disabled={!sourceParts || Boolean(calibratingPartId)} onClick={() => setMoveBodyMode((value) => !value)} type="button">{moveBodyMode ? 'Mover corpo: ligado' : 'Mover corpo'}</button><button className="pose-button secondary" disabled={!Object.keys(bodyOffsets).length} onClick={() => setBodyOffsets({})} type="button">Repor corpo</button><button className={`pose-button ${magneticSnap ? 'primary' : 'secondary'}`} type="button" aria-pressed={magneticSnap} title="Aproxima bordas e centros da peça corporal durante o arraste; não fixa sem clicar em Fixar" onClick={() => setMagneticSnap((active) => !active)}>{magneticSnap ? 'Ímã ligado' : 'Ímã desligado'}</button><button className="pose-button secondary" disabled={previewPan.x === 0 && previewPan.y === 0} onClick={() => setPreviewPan(zeroOffset)} type="button">Centralizar prévia</button><label className="preview-background-picker" title="Mudar a cor do fundo em Modelos, Poses, Rosto e Roupas"><span>Fundo da prévia</span><input type="color" aria-label="Cor do fundo das prévias" value={previewBackground} onChange={(event) => setPreviewBackground(event.target.value)} /><code>{previewBackground.toUpperCase()}</code></label></div>}
        <div ref={previewRef} className={`wardrobe-preview-stage${testPose ? ' testing-pose' : ''}${!moveBodyMode && !calibratingPartId && !testPose ? ' pan-ready' : ''}`} onPointerDown={handlePreviewPointerDown} onPointerMove={movePreviewPan} onPointerUp={finishPreviewPan} onPointerCancel={finishPreviewPan} style={{ '--preview-background': previewBackground } as import('react').CSSProperties}>{previewProject && <div ref={artboardRef} className={`wardrobe-artboard${calibratingPartId ? ' calibrating-origin' : ''}${!moveBodyMode && !calibratingPartId && !testPose ? ' pan-ready' : ''}`} onPointerDown={handleArtboardPointerDown} style={{ width: previewProject.width * scale, height: previewProject.height * scale, transform: `translate(${previewPan.x}px, ${previewPan.y}px)` }}>
        {!testPose && model && sourceParts && orderedParts(model.parts, model.layerOrder).map((part) => {
          const source = sourceParts[part.id]
          if (!source) return null
          const offset = moveBodyMode ? bodyOffsets[part.id] ?? zeroOffset : zeroOffset
          return <img key={part.id} className={`wardrobe-reference-body-part${moveBodyMode ? ' movable' : ''}`} src={source.imageDataUrl} alt={part.name} title={moveBodyMode ? `Arraste ${part.name} para conferir o vínculo` : undefined} draggable={false} onPointerDown={moveBodyMode ? (event) => beginBodyDrag(event, part.id) : undefined} onPointerMove={moveBodyMode ? moveBodyDrag : undefined} onPointerUp={moveBodyMode ? finishBodyDrag : undefined} onPointerCancel={moveBodyMode ? finishBodyDrag : undefined} style={{ left: (source.x + offset.x) * scale, top: (source.y + offset.y) * scale, width: source.width * scale, height: source.height * scale, outline: selected?.attachedPartId === part.id ? '2px solid #27a7a5' : undefined, transform: `rotate(${part.sourceTransform?.rotation ?? part.rotation}deg)`, zIndex: moveBodyMode ? 1000 + model.parts.indexOf(part) : 1 }} />
        })}
        {testPose && previewPoseParts.map((part) => <img key={part.id} className="wardrobe-pose-body-part" src={part.dataUrl} alt={part.name} draggable={false} style={{ left: part.x * scale, top: part.y * scale, width: part.width * scale, height: part.height * scale, zIndex: 2 + previewPoseOrder.indexOf(part.id) * previewLayerStride, transform: `rotate(${part.rotation}deg)` }} />)}
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
           if (!testPose) return <img key={component.id} className={imageClassName} src={component.dataUrl} alt={component.name} title={imageTitle} draggable={false} onClick={() => setSelectedId(component.id)} onPointerDown={(event) => beginPieceDrag(event, component)} onPointerMove={movePieceDrag} onPointerUp={finishPieceDrag} onPointerCancel={finishPieceDrag} style={{ left: componentX * scale, top: componentY * scale, width: component.width * scale, height: component.height * scale, zIndex, transform: `rotate(${component.rotation}deg)` }} />
          if (!poseTransform) return null
          const image = <img className={imageClassName} src={component.dataUrl} alt={component.name} title={imageTitle} draggable={false} onClick={() => setSelectedId(component.id)} onPointerDown={(event) => beginPieceDrag(event, component)} onPointerMove={movePieceDrag} onPointerUp={finishPieceDrag} onPointerCancel={finishPieceDrag} style={{ left: poseTransform.localLeft * scale, top: poseTransform.localTop * scale, width: poseTransform.renderWidth * scale, height: poseTransform.renderHeight * scale, transformOrigin: 'center', transform: `rotate(${poseTransform.localRotation}deg)` }} />
          return <div key={component.id} className="wardrobe-pose-garment" style={{ left: poseTransform.origin.x * scale, top: poseTransform.origin.y * scale, width: 0, height: 0, zIndex, transformOrigin: '0 0', transform: poseTransform.matrix }}>{image}</div>
        })}

      </div>}{!model && <div className="wardrobe-empty"><Icon name="shirt" /><strong>Selecione um modelo salvo</strong><small>O modelo será usado como guia na prévia de encaixe.</small></div>}{model && !draft && !testPose && <div className="wardrobe-stage-hint">Importe uma folha para começar · fundo transparente preservado</div>}{testPose && <div className="wardrobe-stage-hint wardrobe-test-hint">Teste temporário · a pose salva não será alterada</div>}{calibratingPartId && <div className="wardrobe-stage-hint wardrobe-calibration-hint">Clique na junta de “{model?.parts.find((part) => part.id === calibratingPartId)?.name}” na folha original</div>}<div className="wardrobe-zoom"><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom((value) => Math.min(2.2, value + .1))} type="button">+</button><button onClick={() => setZoom((value) => Math.max(.55, value - .1))} type="button">−</button></div>{processing && <div className="wardrobe-processing"><span className="model-spinner" />Detectando peças transparentes…</div>}</div><footer>{testPose ? 'Arraste as roupas para testar o encaixe. Use “Sair do teste” para voltar à folha original.' : 'Arraste a roupa para encaixar. Clique em Fixar para grudar a roupa na parte selecionada; Mover corpo permite conferir o encaixe.'}</footer></section>
      <aside className="wardrobe-edit-panel wardrobe-edit-panel-v2"><header><span><strong>Ajuste da peça</strong><small>{selected?.name ?? 'Escolha uma peça no catálogo'}</small></span></header>
        {draft ? <>{selected && <div className="wardrobe-fields"><div className="wardrobe-field-title"><strong>Editar peça · camada do modelo {getBodyLayer(model, selected.attachedPartId) + 1}</strong><button title="Subir camada" aria-label="Subir camada" disabled={selectedIndex === (draft?.components.length ?? 0) - 1} onClick={() => moveComponentLayer(selected.id, 1)} type="button">↑</button><button title="Descer camada" aria-label="Descer camada" disabled={selectedIndex <= 0} onClick={() => moveComponentLayer(selected.id, -1)} type="button">↓</button><button title="Remover esta peça do conjunto" onClick={() => { setDraft((current) => current ? { ...current, components: current.components.filter((component) => component.id !== selected.id) } : current); setSelectedId(draft.components.find((component) => component.id !== selected.id)?.id ?? null); setDirty(true) }} type="button"><Icon name="trash" /></button></div><label>Nome<input value={selected.name} onChange={(event) => updateComponent(selected.id, { name: event.target.value })} /></label><label>Categoria<select value={selected.category} onChange={(event) => updateComponent(selected.id, { category: event.target.value as WardrobeCategory })}>{categories.map((category) => <option key={category} value={category}>{categoryNames[category]}</option>)}</select></label>{(selected.category === 'oculos' || selected.category === 'acessorio-cabeca') && <label className="wardrobe-option-toggle"><input type="checkbox" checked={selected.renderAboveHair ?? false} onChange={(event) => updateComponent(selected.id, { renderAboveHair: event.target.checked })} /><span>Exibir por cima de todos os cabelos</span></label>}<label>Parte correspondente<select value={selected.attachedPartId} onChange={(event) => updateComponent(selected.id, { attachedPartId: event.target.value })}><option value="" disabled>Escolha a parte do corpo</option>{model?.parts.map((part) => <option key={part.id} value={part.id}>{part.name}{part.sourceTransform ? '' : ' · calibrar origem'}</option>)}</select></label>{(() => { const linkedPart = model?.parts.find((part) => part.id === selected.attachedPartId); return linkedPart && !linkedPart.sourceTransform ? <button className="pose-button secondary wardrobe-calibrate-button" onClick={() => { setTestPose(null); setCalibratingPartId(linkedPart.id); setError('') }} type="button"><Icon name="frame" /> Calibrar origem na folha</button> : null })()}<WardrobeGlueControls component={selected} target={selectedBone} suggested={suggestedBone} status={glueStatus} onChooseTarget={(id) => updateComponent(selected.id, { attachedPartId: id })} onFix={fixSelectedBinding} onRelease={releaseSelectedBinding} /><div className="wardrobe-quick-controls"><div className="wardrobe-nudge-pad"><button aria-label="Mover para cima" title="Mover para cima" onClick={() => nudgeSelected(0, -5)} type="button">↑</button><button aria-label="Mover para esquerda" title="Mover para esquerda" onClick={() => nudgeSelected(-5, 0)} type="button">←</button><span>mover</span><button aria-label="Mover para direita" title="Mover para direita" onClick={() => nudgeSelected(5, 0)} type="button">→</button><button aria-label="Mover para baixo" title="Mover para baixo" onClick={() => nudgeSelected(0, 5)} type="button">↓</button></div><div className="wardrobe-quick-actions"><button title="Diminuir tamanho em 10%" onClick={() => resizeSelected(.9)} type="button">− Tamanho</button><button title="Aumentar tamanho em 10%" onClick={() => resizeSelected(1.1)} type="button">+ Tamanho</button><button title="Girar 15 graus para a esquerda" onClick={() => updateComponent(selected.id, { rotation: selected.rotation - 15 })} type="button">↶ 15°</button><button title="Girar 15 graus para a direita" onClick={() => updateComponent(selected.id, { rotation: selected.rotation + 15 })} type="button">↷ 15°</button><button className="wardrobe-origin-button" onClick={restoreSelectedOrigin} type="button">Voltar à posição original</button></div></div><section className="wardrobe-scale-controls" aria-label="Escala horizontal e vertical"><div className="wardrobe-scale-heading"><strong>Escala da peça</strong><label className="wardrobe-aspect-lock"><input type="checkbox" checked={lockAspectRatio} onChange={(event) => setLockAspectRatio(event.target.checked)} /><span>Manter proporção</span></label></div><label className="wardrobe-scale-row"><span><b>↔ Horizontal</b><output>{Math.round(selected.width / (selected.originWidth ?? selected.width) * 100)}%</output></span><input aria-label="Escala horizontal" type="range" min="10" max="300" step="1" value={Math.max(10, Math.min(300, Math.round(selected.width / (selected.originWidth ?? selected.width) * 100)))} onChange={(event) => scaleSelectedAxis('width', (selected.originWidth ?? selected.width) * Number(event.target.value) / 100)} /></label><label className="wardrobe-scale-row"><span><b>↕ Vertical</b><output>{Math.round(selected.height / (selected.originHeight ?? selected.height) * 100)}%</output></span><input aria-label="Escala vertical" type="range" min="10" max="300" step="1" value={Math.max(10, Math.min(300, Math.round(selected.height / (selected.originHeight ?? selected.height) * 100)))} onChange={(event) => scaleSelectedAxis('height', (selected.originHeight ?? selected.height) * Number(event.target.value) / 100)} /></label></section><div className="wardrobe-number-grid">{([['x', 'X'], ['y', 'Y'], ['width', 'Largura'], ['height', 'Altura'], ['rotation', 'Ângulo']] as const).map(([field, label]) => <label key={field}>{label}<input type="number" step={field === 'rotation' ? 1 : 2} value={Number(selected[field].toFixed(1))} onChange={(event) => { const value = Number(event.target.value); if (field === 'width' || field === 'height') scaleSelectedAxis(field, value); else updateComponent(selected.id, { [field]: value }) }} /></label>)}</div><small className="wardrobe-note">Este vínculo ficará salvo para a futura integração em Customizar.</small></div>}{!selected && <div className="wardrobe-edit-empty"><Icon name="shirt" /><strong>Escolha uma peça</strong><small>Selecione no catálogo para ajustar posição, tamanho e vínculo.</small></div>}</> : <div className="wardrobe-edit-empty"><Icon name="sparkles" /><strong>Pré-encaixe automático</strong><small>A folha é separada por transparência. Depois você revisa categoria, peça do corpo e posição de cada recorte.</small></div>}
      </aside>
    </div>
    {importPickerOpen && <div className="pose-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setImportPickerOpen(false) }}><section className="pose-model-picker" role="dialog" aria-modal="true" aria-labelledby="wardrobe-import-title"><header><span><small>BIBLIOTECA DE ROUPAS</small><strong id="wardrobe-import-title">Como deseja importar?</strong></span><button onClick={() => setImportPickerOpen(false)} aria-label="Fechar" type="button">×</button></header><p>Escolha como separar as peças da imagem.</p><div className="pose-model-options"><button className="pose-model-option" onClick={() => { setImportPickerOpen(false); inputRef.current?.click() }} type="button"><span className="pose-model-number"><Icon name="sparkles" /></span><span><b>Separar automaticamente</b><small>Detecta peças pelas áreas transparentes da folha.</small></span><Icon name="chevronRight" /></button><button className="pose-model-option" onClick={() => { setGridSize(4); gridInputRef.current?.click() }} type="button"><span className="pose-model-number">4×3</span><span><b>Roupas para tronco · grade 4×3</b><small>Até 12 roupas, com remoção automática do fundo.</small></span><Icon name="chevronRight" /></button><button className="pose-model-option" onClick={() => { setGridSize(3); gridInputRef.current?.click() }} type="button"><span className="pose-model-number">3×3</span><span><b>Roupas para tronco · grade 3×3</b><small>Até 9 roupas, com remoção automática do fundo.</small></span><Icon name="chevronRight" /></button></div></section></div>}{testPosePickerOpen && <div className="pose-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !testPoseLoading) setTestPosePickerOpen(false) }}><section className="pose-model-picker" role="dialog" aria-modal="true" aria-labelledby="wardrobe-test-picker-title"><header><span><small>TESTE DE ROUPA</small><strong id="wardrobe-test-picker-title">Escolha uma pose</strong></span><button onClick={() => setTestPosePickerOpen(false)} aria-label="Fechar" type="button">×</button></header><p>A roupa será exibida sobre uma cópia visual da pose. A pose salva não será modificada.</p><div className="pose-model-options">{testPoseLoading && <div className="pose-model-none">Carregando poses…</div>}{testPoseSlots.map((pose) => pose && <button key={`pose-${pose.slot}`} className="pose-model-option" disabled={testPoseLoading} onClick={() => void loadTestPose(pose.slot)} type="button"><span className="pose-model-number">{String(pose.slot).padStart(2, '0')}</span><span><b>{pose.name}</b><small>{pose.partCount} peças · {new Date(pose.updatedAt).toLocaleDateString('pt-BR')}</small></span><Icon name="chevronRight" /></button>)}{!testPoseLoading && testPoseSlots.length === 0 && <div className="pose-model-none">Este modelo ainda não tem poses salvas.</div>}</div></section></div>}
  </section>
}
