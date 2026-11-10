import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import type { FabricatorProject, ModelPart } from '../../../../shared/fabricator'
import { modelRigSide } from '../../../../shared/modelRig'
import { Icon } from '../../ui/components/Icon'
import { isHeadPart } from './models/resize'
import { normalizePartAnchors } from './models/rig'
import { composeModelSource, sourceRect, MAX_CHROMA_TOLERANCE, type ModelSourceResult } from './models/modelSource'
import { cropModelSourcePart, eraseModelSourceBrush, mirrorModelSourcePart, normalizeModelSourceOutline, removeModelSourceColor, rotateModelSourcePart, sampleModelSourceColor, splitModelSourcePart, worldPointInsideCrop, worldPointToPart, type ModelSourceCrop, type ModelSourcePoint, type ModelSourceQuarterTurn } from './models/modelSourceEditing'
import { applyMirroredModelSourcePart, applyRotatedModelSourcePart } from './models/modelSourceProjectEditing'
import { applyImageWarpBrush, type ImageWarpPoint } from './models/imageMeshWarp'
import { createModelSourceWarpSession, drawModelSourceWarp, modelSourceWarpDataUrl, warpModelSkinContours, type ModelSourceWarpSession } from './models/modelSourceWarp'
import { useModelSourceGuides } from './models/useModelSourceGuides'
import { useModelSourceDraft } from './models/useModelSourceDraft'
import { articulateJoinedLimbSplit, canArticulateJoinedLimbSplit, findOppositeJoinedLimbCounterpart, mapJoinedLimbSplitLine } from './models/joinedLimbSplit'
import { isModelSkinPart } from './models/modelSkinTone'
import { findLimbReplacementTarget, replaceLimbPixelsFromOpposite } from './models/modelSourceLimbReplacement'
import { MODEL_SKIN_BASE_TONE } from '../../../../shared/skinTones'
import './model-source-editor.css'

type Props = {
  project: FabricatorProject
  onClose: () => void
  onPublish: (result: ModelSourceResult) => Promise<void>
}
type PreviewMode = 'part' | 'sheet'
type PreviewBackground = 'checker' | 'white' | 'dark' | 'green' | 'magenta'
type EditTool = 'select' | 'erase' | 'crop' | 'split' | 'joint-split' | 'outline' | 'deform' | 'guide'
type DrawingGesture = { tool: 'erase' | 'crop' | 'split' | 'joint-split' | 'outline'; start: ModelSourcePoint; current: ModelSourcePoint; points: ModelSourcePoint[] }
type WarpDrag = { pointerId: number; partId: string; last: ImageWarpPoint; originalX: Float32Array; originalY: Float32Array; changed: boolean }
type OutlinePreview = {
  part: ModelPart
  sourceDraft: FabricatorProject
  dimensions: Record<string, { width: number; height: number; x?: number; y?: number }>
  color: string
  thicknessPercent: number
  luminanceThreshold: number
}

const field: CSSProperties = { width: '100%', color: '#433b45', background: '#fff', border: '1px solid #e9e1e8', borderRadius: 8, padding: 8 }
const checker: CSSProperties = {
  backgroundColor: '#fff',
  backgroundImage: 'conic-gradient(#eee9ed 25%, transparent 0 50%, #eee9ed 0 75%, transparent 0)',
  backgroundSize: '20px 20px'
}
const previewBackgroundColors: Record<Exclude<PreviewBackground, 'checker'>, string> = {
  white: '#ffffff',
  dark: '#302b32',
  green: '#45a66d',
  magenta: '#e763ad'
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const toolButton = (active: boolean, disabled: boolean): CSSProperties => ({
  ...field,
  width: 'auto',
  padding: '7px 10px',
  fontSize: 12,
  cursor: disabled ? 'not-allowed' : 'pointer',
  borderColor: active ? '#e987aa' : '#e9e1e8',
  color: active ? '#a43d64' : '#665c67',
  background: active ? '#fff1f6' : '#fff',
  opacity: disabled ? .5 : 1
})

function cropFromGesture(gesture: DrawingGesture): ModelSourceCrop {
  const x = Math.floor(Math.min(gesture.start.x, gesture.current.x))
  const y = Math.floor(Math.min(gesture.start.y, gesture.current.y))
  const right = Math.ceil(Math.max(gesture.start.x, gesture.current.x))
  const bottom = Math.ceil(Math.max(gesture.start.y, gesture.current.y))
  return { x, y, width: right - x, height: bottom - y }
}

async function cropImageToVisiblePixels(dataUrl: string): Promise<string> {
  const image = new Image()
  image.src = dataUrl
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Não foi possível preparar o PNG da cabeça.')
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  let left = canvas.width, top = canvas.height, right = -1, bottom = -1
  for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
    if (pixels[(y * canvas.width + x) * 4 + 3] === 0) continue
    left = Math.min(left, x); top = Math.min(top, y)
    right = Math.max(right, x); bottom = Math.max(bottom, y)
  }
  if (right < left || bottom < top) throw new Error('A peça da cabeça está totalmente transparente.')
  const cropped = document.createElement('canvas')
  cropped.width = right - left + 1
  cropped.height = bottom - top + 1
  const croppedContext = cropped.getContext('2d')
  if (!croppedContext) throw new Error('Não foi possível recortar o PNG da cabeça.')
  croppedContext.drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height)
  const png = cropped.toDataURL('image/png')
  canvas.width = canvas.height = cropped.width = cropped.height = 1
  return png
}

function orderAfterSplit(order: string[] | undefined, originalId: string, retainedId: string, newId: string): string[] | undefined {
  if (!order) return undefined
  const next = [...order]
  const index = next.indexOf(originalId)
  if (index < 0) return [...next, retainedId, newId]
  next.splice(index, 1, retainedId, newId)
  return next
}

function isThighPart(part: ModelPart): boolean {
  return /coxa|thigh/i.test(part.name)
}

export function ModelSourceEditor({ project, onClose, onPublish }: Props) {
  const [preview, setPreview] = useState('')
  const [previewParts, setPreviewParts] = useState<ModelPart[]>([])
  const [outlinePreview, setOutlinePreview] = useState<OutlinePreview | null>(null)
  const [preparingOutlinePreview, setPreparingOutlinePreview] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadWithMaleTorso, setDownloadWithMaleTorso] = useState(false)
  const [downloadInfo, setDownloadInfo] = useState('')
  const [mode, setMode] = useState<PreviewMode>('part')
  const [previewBackground, setPreviewBackground] = useState<PreviewBackground>('checker')
  const [tool, setTool] = useState<EditTool>('select')
  const [zoom, setZoom] = useState(1)
  const [brushSize, setBrushSize] = useState(18)
  const [warpRadius, setWarpRadius] = useState(28)
  const [warpStrength, setWarpStrength] = useState(70)
  const [skinRemovalOpen, setSkinRemovalOpen] = useState(false)
  const [outlineNormalizationOpen, setOutlineNormalizationOpen] = useState(false)
  const [outlineColor, setOutlineColor] = useState(project.modelOutlineColor ?? '#70342c')
  const [outlineThicknessPercent, setOutlineThicknessPercent] = useState(4)
  const [outlineLuminanceThreshold, setOutlineLuminanceThreshold] = useState(150)
  const [skinColor, setSkinColor] = useState<string | null>(null)
  const [skinColorTolerance, setSkinColorTolerance] = useState(58)
  const [samplingSkinColor, setSamplingSkinColor] = useState(false)
  const [gesture, setGesture] = useState<DrawingGesture | null>(null)
  const [warpSession, setWarpSession] = useState<ModelSourceWarpSession | null>(null)
  const [warpCursor, setWarpCursor] = useState<ModelSourcePoint | null>(null)
  const drag = useRef<{ id: string; originX: number; originY: number; clientX: number; clientY: number } | null>(null)
  const surface = useRef<HTMLDivElement>(null)
  const warpCanvas = useRef<HTMLCanvasElement>(null)
  const warpSessionRef = useRef<ModelSourceWarpSession | null>(null)
  const warpDrag = useRef<WarpDrag | null>(null)
  const warpDrawFrame = useRef<number | null>(null)
  const gestureRef = useRef<DrawingGesture | null>(null)
  const clearDrawingGesture = () => {
    gestureRef.current = null
    setGesture(null)
  }
  const {
    draft,
    setDraft,
    selectedId,
    setSelectedId,
    dimensions,
    setDimensions,
    chromaTolerance,
    setChromaTolerance,
    busy,
    setBusy,
    undoCount,
    edited,
    structureChanged,
    compile,
    saveUndoSnapshot,
    undo,
    runMutation,
    runPixelEdit
  } = useModelSourceDraft({
    project,
    downloading,
    clearGesture: clearDrawingGesture,
    setError,
    setStatus,
    clearDownloadInfo: () => setDownloadInfo('')
  })

  const selected = draft.parts.find(part => part.id === selectedId)
  const selectedRect = selected ? sourceRect(selected, dimensions[selected.id]) : null
  const baseline = selected ? sourceRect(selected) : null
  const isHead = Boolean(selected && isHeadPart(selected))
  const isThigh = Boolean(selected && isThighPart(selected))
  const modelSkinPartCount = draft.parts.filter(isModelSkinPart).length
  const jointSplitReady = Boolean(selected && draft.bodyJointBridgeEnabled === true
    && canArticulateJoinedLimbSplit(selected, draft.parts, draft.joints))
  const limbReplacementTarget = selected ? findLimbReplacementTarget(draft.parts, selected) : null
  const logicalWidth = mode === 'part' ? selectedRect?.width ?? 1 : draft.width
  const logicalHeight = mode === 'part' ? selectedRect?.height ?? 1 : draft.height
  const fitScale = Math.min(1, 620 / Math.max(1, logicalWidth), 430 / Math.max(1, logicalHeight))
  const previewScale = fitScale * zoom
  const surfaceWidth = Math.max(1, logicalWidth * previewScale)
  const surfaceHeight = Math.max(1, logicalHeight * previewScale)
  const outlinePreviewIsCurrent = Boolean(outlinePreview?.part.id === selectedId
    && outlinePreview.sourceDraft === draft
    && outlinePreview.dimensions === dimensions
    && outlinePreview.color === outlineColor
    && outlinePreview.thicknessPercent === outlineThicknessPercent
    && outlinePreview.luminanceThreshold === outlineLuminanceThreshold)
  const previewPart = outlinePreviewIsCurrent
    ? outlinePreview!.part
    : previewParts.find(part => part.id === selectedId) ?? selected
  const previewBackgroundStyle = previewBackground === 'checker'
    ? checker
    : { backgroundColor: previewBackgroundColors[previewBackground] }
  const pointerPoint = (event: Pick<ReactPointerEvent<HTMLElement>, 'clientX' | 'clientY'>): ModelSourcePoint | null => {
    const bounds = surface.current?.getBoundingClientRect()
    if (!bounds || !bounds.width || !bounds.height) return null
    return {
      x: clamp((event.clientX - bounds.left) * logicalWidth / bounds.width, 0, logicalWidth),
      y: clamp((event.clientY - bounds.top) * logicalHeight / bounds.height, 0, logicalHeight)
    }
  }
  const {
    setGuides,
    guideStroke,
    visibleGuideLines,
    startGuide,
    extendGuide,
    moveGuide,
    finishGuide,
    cancelGuide,
    clearGuideStroke
  } = useModelSourceGuides({
    selectedId,
    hasSelectedPart: Boolean(selected),
    toolActive: mode === 'part' && tool === 'guide',
    editingBlocked: busy || downloading,
    getPoint: pointerPoint,
    capturePointer: pointerId => surface.current?.setPointerCapture(pointerId),
    releasePointer: pointerId => surface.current?.releasePointerCapture(pointerId)
  })
  warpSessionRef.current = warpSession

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const handle = window.setTimeout(() => {
      void composeModelSource(draft, dimensions, chromaTolerance, controller.signal).then(result => {
        if (!active) return
        setPreview(result.previewDataUrl)
        setPreviewParts(result.parts)
        setError('')
      }).catch(reason => {
        if (!active || controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : 'Prévia inválida.')
        setPreview('')
        setPreviewParts([])
      })
    }, 180)
    return () => { active = false; window.clearTimeout(handle); controller.abort() }
  }, [draft, dimensions, chromaTolerance])

  useEffect(() => {
    if (outlinePreview && !outlinePreviewIsCurrent) setOutlinePreview(null)
  }, [outlinePreview, outlinePreviewIsCurrent])

  useEffect(() => {
    if (mode !== 'part' || tool !== 'deform' || !selected || !isThighPart(selected) || !previewPart) {
      warpSessionRef.current = null
      setWarpSession(null)
      warpDrag.current = null
      setWarpCursor(null)
      return
    }
    let active = true
    warpSessionRef.current = null
    setWarpSession(null)
    void createModelSourceWarpSession(selected.id, previewPart.dataUrl, previewPart.chromaBaseDataUrl).then(session => {
      if (!active) return
      warpSessionRef.current = session
      setWarpSession(session)
      setError('')
    }).catch(reason => {
      if (!active) return
      setError(reason instanceof Error ? reason.message : 'Não foi possível preparar a coxa para deformar.')
    })
    return () => {
      active = false
      if (warpSessionRef.current?.sourceUrl === previewPart.dataUrl) warpSessionRef.current = null
      warpDrag.current = null
    }
  }, [mode, tool, selected?.id, previewPart?.dataUrl, previewPart?.chromaBaseDataUrl])

  useEffect(() => {
    if (mode !== 'part' || tool !== 'deform' || !warpSession || warpSession.partId !== selectedId || warpSession.sourceUrl !== previewPart?.dataUrl) return
    const canvas = warpCanvas.current
    if (!canvas) return
    try {
      drawModelSourceWarp(canvas, warpSession.image, warpSession.mesh)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar a prévia deformada.')
    }
  }, [mode, tool, selectedId, previewPart?.dataUrl, warpSession, logicalWidth, logicalHeight])

  useEffect(() => () => {
    if (warpDrawFrame.current !== null) cancelAnimationFrame(warpDrawFrame.current)
  }, [])

  const setRect = (part: ModelPart, next: { x: number; y: number; width: number; height: number }) => {
    const original = sourceRect(part)
    setDimensions(current => {
      const state = { ...current }
      if (next.x === original.x && next.y === original.y && next.width === original.width && next.height === original.height) delete state[part.id]
      else state[part.id] = { ...next }
      return state
    })
    setDownloadInfo('')
  }
  const setNumber = (axis: 'width' | 'height' | 'x' | 'y', value: number) => {
    if (!selected || !selectedRect || !Number.isFinite(value) || busy || downloading) return
    if ((axis === 'x' || axis === 'y') && !isHead) return
    setRect(selected, { ...selectedRect, [axis]: Math.round(value) })
  }
  const startHeadDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!selected || !selectedRect || mode !== 'sheet' || !isHead || busy || downloading || event.button !== 0) return
    drag.current = { id: selected.id, originX: selectedRect.x, originY: selectedRect.y, clientX: event.clientX, clientY: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const moveHeadDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || !selected || selected.id !== drag.current.id || !isHead || busy) return
    const origin = drag.current
    const nextX = Math.max(0, Math.min(draft.width - (selectedRect?.width ?? selected.width), Math.round(origin.originX + (event.clientX - origin.clientX) / previewScale)))
    const nextY = Math.max(0, Math.min(draft.height - (selectedRect?.height ?? selected.height), Math.round(origin.originY + (event.clientY - origin.clientY) / previewScale)))
    setRect(selected, { ...sourceRect(selected, dimensions[selected.id]), x: nextX, y: nextY })
  }
  const stopHeadDrag = () => { drag.current = null }
  const restoreSelected = () => {
    if (!selected) return
    setDimensions(current => { const state = { ...current }; delete state[selected.id]; return state })
    setDownloadInfo('')
    setStatus('Dimensões e posição desta peça restauradas.')
  }
  const rotateSelectedPart = (degrees: ModelSourceQuarterTurn) => {
    if (!selected || busy || downloading) return
    setTool('select')
    cancelDrawing()
    setGuides({ partId: selected.id, lines: [] })
    void runMutation(async (materialized) => {
      const part = materialized.parts.find((item) => item.id === selected.id)
      if (!part) throw new Error('A peça selecionada não está mais no modelo.')
      const rotatedPart = await rotateModelSourcePart(part, degrees)
      return {
        project: applyRotatedModelSourcePart(materialized, part.id, rotatedPart, degrees),
        selectedId: part.id,
        status: `Imagem da peça girada ${degrees > 0 ? '90° à direita' : '90° à esquerda'}. A edição pode ser desfeita e só vai ao modelo original ao salvar.`
      }
    })
  }
  const mirrorSelectedPart = () => {
    if (!selected || busy || downloading) return
    setTool('select')
    cancelDrawing()
    setGuides({ partId: selected.id, lines: [] })
    void runMutation(async (materialized) => {
      const part = materialized.parts.find((item) => item.id === selected.id)
      if (!part) throw new Error('A peça selecionada não está mais no modelo.')
      const mirroredPart = await mirrorModelSourcePart(part)
      return {
        project: applyMirroredModelSourcePart(materialized, part.id, mirroredPart),
        selectedId: part.id,
        status: `A imagem de ${part.name} foi espelhada horizontalmente. O quadro da peça foi mantido e os encaixes acompanharam a inversão; use Desfazer para voltar.`
      }
    })
  }
  const scalePointToPart = (point: ModelSourcePoint, part: ModelPart, width: number, height: number): ModelSourcePoint => ({
    x: point.x * part.width / Math.max(1, width),
    y: point.y * part.height / Math.max(1, height)
  })
  const pointsForPart = (points: ModelSourcePoint[], part: ModelPart, width: number, height: number) =>
    points.map(point => scalePointToPart(point, part, width, height))
  const sampleSkinColor = async (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!samplingSkinColor || mode !== 'part' || !previewPart || busy || downloading) return
    const point = pointerPoint(event)
    if (!point) return
    event.preventDefault()
    event.stopPropagation()
    setSamplingSkinColor(false)
    setBusy(true)
    try {
      const color = await sampleModelSourceColor(previewPart, point, logicalWidth, logicalHeight)
      if (!color) {
        setError('Clique em uma área opaca da pele para selecionar a cor original.')
        return
      }
      setSkinColor(color)
      setError('')
      setStatus('Cor original selecionada: ' + color + '.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível selecionar a cor da prévia.')
    } finally {
      setBusy(false)
    }
  }
  const drawWarpPreview = () => {
    const session = warpSessionRef.current
    const canvas = warpCanvas.current
    if (!session || !canvas || session.partId !== selectedId) return
    drawModelSourceWarp(canvas, session.image, session.mesh)
  }
  const scheduleWarpPreview = () => {
    if (warpDrawFrame.current !== null) return
    warpDrawFrame.current = requestAnimationFrame(() => {
      warpDrawFrame.current = null
      try { drawWarpPreview() } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Não foi possível atualizar a prévia deformada.')
      }
    })
  }
  const startWarp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = warpSessionRef.current
    if (mode !== 'part' || tool !== 'deform' || !selected || !isThighPart(selected) || !session || session.partId !== selected.id || busy || downloading || event.button !== 0) return
    const point = pointerPoint(event)
    if (!point) return
    setError('')
    warpDrag.current = {
      pointerId: event.pointerId,
      partId: selected.id,
      last: point,
      originalX: new Float32Array(session.mesh.offsetX),
      originalY: new Float32Array(session.mesh.offsetY),
      changed: false
    }
    setWarpCursor(point)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const moveWarp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointerPoint(event)
    setWarpCursor(point)
    const drag = warpDrag.current
    const session = warpSessionRef.current
    if (!point || !drag || drag.pointerId !== event.pointerId || !session || drag.partId !== session.partId || busy) return
    const delta = { x: point.x - drag.last.x, y: point.y - drag.last.y }
    const distance = Math.hypot(delta.x, delta.y)
    if (distance <= 0.001) return
    const bounds = { x: 0, y: 0, width: logicalWidth, height: logicalHeight, rotation: 0 }
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, warpRadius * 0.2)))
    for (let step = 1; step <= steps; step += 1) {
      const previous = { x: drag.last.x + delta.x * ((step - 1) / steps), y: drag.last.y + delta.y * ((step - 1) / steps) }
      const next = { x: drag.last.x + delta.x * (step / steps), y: drag.last.y + delta.y * (step / steps) }
      applyImageWarpBrush(session.mesh, session.image, bounds, next, { x: next.x - previous.x, y: next.y - previous.y }, warpRadius, warpStrength / 100)
    }
    drag.last = point
    drag.changed = true
    event.preventDefault()
    scheduleWarpPreview()
  }
  const finishWarp = async (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.type === 'pointerup') moveWarp(event)
    const drag = warpDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    warpDrag.current = null
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* A captura pode já ter sido liberada pelo navegador. */ }
    const session = warpSessionRef.current
    if (!session || session.partId !== drag.partId) return
    if (event.type === 'pointercancel') {
      session.mesh.offsetX.set(drag.originalX)
      session.mesh.offsetY.set(drag.originalY)
      drawWarpPreview()
      setWarpCursor(null)
      return
    }
    if (!drag.changed) {
      setWarpCursor(null)
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await compile()
      const part = result.parts.find(item => item.id === drag.partId)
      if (!part) throw new Error('A coxa selecionada não está mais no modelo.')
      const updatedPart: ModelPart = {
        ...part,
        dataUrl: modelSourceWarpDataUrl(session.image, session.mesh),
        chromaBaseDataUrl: modelSourceWarpDataUrl(session.baseImage, session.mesh),
        fakeSkinContours: warpModelSkinContours(part.fakeSkinContours, session.image, session.mesh),
        chromaBaseSaved: true
      }
      const materialized: FabricatorProject = {
        ...draft,
        sourceDataUrl: result.sourceDataUrl,
        parts: result.parts.map(item => item.id === part.id ? updatedPart : item),
        tolerance: result.tolerance,
        joints: result.joints,
        layerOrder: result.layerOrder,
        hiddenPartIds: result.hiddenPartIds
      }
      saveUndoSnapshot()
      setDraft(materialized)
      setDimensions({})
      setChromaTolerance(result.tolerance)
      setSelectedId(part.id)
      setWarpSession(null)
      warpSessionRef.current = null
      setWarpCursor(null)
      setStatus('Deformação aplicada à coxa no rascunho. Use “Salvar no original” para publicar ou Desfazer para voltar.')
      setDownloadInfo('')
    } catch (reason) {
      session.mesh.offsetX.set(drag.originalX)
      session.mesh.offsetY.set(drag.originalY)
      drawWarpPreview()
      setError(reason instanceof Error ? reason.message : 'Não foi possível aplicar a deformação.')
    } finally {
      setBusy(false)
    }
  }
  const startDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mode !== 'part' || tool === 'select' || tool === 'deform' || tool === 'guide' || !selected || busy || downloading || event.button !== 0) return
    const point = pointerPoint(event)
    if (!point) return
    setError('')
    const next: DrawingGesture = { tool, start: point, current: point, points: [point] }
    gestureRef.current = next
    setGesture(next)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }
  const moveDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gestureRef.current
    if (!current) return
    const point = pointerPoint(event)
    if (!point) return
    let points = current.points
    if (current.tool === 'erase' || current.tool === 'outline') {
      const last = points[points.length - 1]
      if (Math.hypot(point.x - last.x, point.y - last.y) >= 1) points = [...points.slice(-2999), point]
    } else points = [current.start, point]
    const next = { ...current, current: point, points }
    gestureRef.current = next
    setGesture(next)
  }
  const finishDrawing = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gestureRef.current
    if (!current) return
    const point = pointerPoint(event) ?? current.current
    const points = current.tool === 'erase' || current.tool === 'outline'
      ? [...current.points, point]
      : [current.start, point]
    const finished = { ...current, current: point, points }
    gestureRef.current = null
    setGesture(finished)
  }
  const cancelDrawing = () => {
    gestureRef.current = null
    setGesture(null)
    clearGuideStroke()
    setWarpCursor(null)
  }
  const setEditTool = (next: EditTool) => {
    if (next === 'deform' && (!selected || !isThighPart(selected))) return
    setSamplingSkinColor(false)
    setTool(next)
    cancelDrawing()
  }
  const handlePreviewPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (samplingSkinColor) { void sampleSkinColor(event); return }
    if (tool === 'guide') { startGuide(event); return }
    if (tool === 'deform') { startWarp(event); return }
    startDrawing(event)
  }
  const applyCrop = () => {
    if (!selected || !selectedRect || gesture?.tool !== 'crop') return
    const drawnCrop = cropFromGesture(gesture)
    if (drawnCrop.width < 2 || drawnCrop.height < 2) {
      setError('Arraste uma área maior para cortar a peça.')
      return
    }
    void runMutation(async materialized => {
      const part = materialized.parts.find(item => item.id === selected.id)
      if (!part) throw new Error('A peça selecionada não está mais no modelo.')
      const crop = {
        x: drawnCrop.x * part.width / Math.max(1, selectedRect.width),
        y: drawnCrop.y * part.height / Math.max(1, selectedRect.height),
        width: drawnCrop.width * part.width / Math.max(1, selectedRect.width),
        height: drawnCrop.height * part.height / Math.max(1, selectedRect.height)
      }
      const nextPart = await cropModelSourcePart(part, crop)
      const attachedJoint = materialized.joints.find(joint => joint.parentPartId === part.id || joint.childPartId === part.id)
      const attachedAnchor = attachedJoint
        ? attachedJoint.parentPartId === part.id ? attachedJoint.parentAnchor : attachedJoint.childAnchor
        : undefined
      const previousAnchor = part.jointAnchor ?? attachedAnchor
      const anchorKept = previousAnchor ? worldPointInsideCrop(part, previousAnchor, crop) : true
      const center = { x: nextPart.x + nextPart.width / 2, y: nextPart.y + nextPart.height / 2 }
      const croppedPart = previousAnchor
        ? { ...nextPart, jointAnchor: anchorKept ? previousAnchor : center }
        : nextPart
      const updatedParts = materialized.parts.map(item => item.id === part.id ? croppedPart : item)
      const rig = normalizePartAnchors(updatedParts, materialized.joints)
      return {
        project: { ...materialized, parts: rig.parts, joints: rig.joints },
        selectedId: part.id,
        status: attachedJoint && !anchorKept
          ? 'Corte aplicado. A conexão foi mantida e o pivô reposicionado dentro da peça.'
          : attachedJoint
            ? 'Corte aplicado; a conexão e o pivô foram preservados.'
          : 'Corte aplicado à peça selecionada.'
      }
    })
  }
  const applySplit = (jointAware: boolean) => {
    const expectedTool = jointAware ? 'joint-split' : 'split'
    if (!selected || !selectedRect || gesture?.tool !== expectedTool) return
    void runMutation(async materialized => {
      const part = materialized.parts.find(item => item.id === selected.id)
      if (!part) throw new Error('A peça selecionada não está mais no modelo.')
      const points = pointsForPart(gesture.points, part, selectedRect.width, selectedRect.height)
      const start = points[0]
      const end = points[points.length - 1]
      const connectedJoint = materialized.joints.find(joint => joint.parentPartId === part.id || joint.childPartId === part.id)
      const attachedAnchor = connectedJoint
        ? connectedJoint.parentPartId === part.id ? connectedJoint.parentAnchor : connectedJoint.childAnchor
        : undefined
      const reference = part.jointAnchor
        ? worldPointToPart(part, part.jointAnchor)
        : attachedAnchor ? worldPointToPart(part, attachedAnchor) : { x: part.width / 2, y: part.height / 2 }
      const split = await splitModelSourcePart(part, start, end, reference)
      const retained = split.parts[split.retainedSide]
      const created = { ...split.parts[1 - split.retainedSide], splitOriginPartId: part.id, splitOriginPartName: part.name }
      const articulation = jointAware && materialized.bodyJointBridgeEnabled === true
        ? articulateJoinedLimbSplit({
          original: part,
          splitParts: [retained, created],
          parts: materialized.parts,
          joints: materialized.joints,
          start,
          end
        })
        : null
      if (jointAware && !articulation) throw new Error('O divisor de juntas só funciona em um braço ou perna unidos ainda sem divisão articulada.')
      const hidden = new Set(materialized.hiddenPartIds ?? [])
      if (hidden.has(part.id)) hidden.add(created.id)
      const initialRig = articulation ?? normalizePartAnchors(
        materialized.parts.flatMap(item => item.id === part.id ? [retained, created] : [item]),
        materialized.joints
      )
      let nextParts = initialRig.parts
      let nextJoints = initialRig.joints
      let nextLayerOrder = orderAfterSplit(materialized.layerOrder, part.id,
        articulation?.upper.id ?? retained.id, articulation?.lower.id ?? created.id)
      let pairedNames = ''
      if (articulation) {
        const counterpart = findOppositeJoinedLimbCounterpart(part, materialized.parts, materialized.joints)
        if (counterpart) {
          const counterpartLine = mapJoinedLimbSplitLine(part, counterpart, start, end)
          const counterpartJoint = nextJoints.find(joint => joint.parentPartId === counterpart.id || joint.childPartId === counterpart.id)
          const counterpartAnchor = counterpartJoint
            ? counterpartJoint.parentPartId === counterpart.id ? counterpartJoint.parentAnchor : counterpartJoint.childAnchor
            : undefined
          const counterpartReference = counterpart.jointAnchor
            ? worldPointToPart(counterpart, counterpart.jointAnchor)
            : counterpartAnchor ? worldPointToPart(counterpart, counterpartAnchor) : { x: counterpart.width / 2, y: counterpart.height / 2 }
          const counterpartSplit = await splitModelSourcePart(counterpart, counterpartLine.start, counterpartLine.end, counterpartReference)
          const counterpartRetained = counterpartSplit.parts[counterpartSplit.retainedSide]
          const counterpartCreated = {
            ...counterpartSplit.parts[1 - counterpartSplit.retainedSide],
            splitOriginPartId: counterpart.id,
            splitOriginPartName: counterpart.name
          }
          const counterpartArticulation = articulateJoinedLimbSplit({
            original: counterpart,
            splitParts: [counterpartRetained, counterpartCreated],
            parts: nextParts,
            joints: nextJoints,
            start: counterpartLine.start,
            end: counterpartLine.end
          })
          if (!counterpartArticulation) {
            throw new Error(`Não foi possível aplicar a mesma divisão em ${counterpart.name}. A divisão original também não foi alterada.`)
          }
          nextParts = counterpartArticulation.parts
          nextJoints = counterpartArticulation.joints
          nextLayerOrder = orderAfterSplit(nextLayerOrder, counterpart.id,
            counterpartArticulation.upper.id, counterpartArticulation.lower.id)
          if (hidden.has(counterpart.id)) hidden.add(counterpartCreated.id)
          pairedNames = ` A mesma divisão foi aplicada também em ${counterpartArticulation.upper.name} e ${counterpartArticulation.lower.name}.`
        }
      }
      const validIds = new Set(nextParts.map(item => item.id))
      return {
        project: {
          ...materialized,
          parts: nextParts,
          joints: nextJoints,
          layerOrder: nextLayerOrder,
          hiddenPartIds: [...hidden].filter(id => validIds.has(id))
        },
        selectedId: retained.id,
        status: articulation
          ? `Peça dividida em ${articulation.upper.name} e ${articulation.lower.name}. As juntas e pontes do corpo foram ativadas para esse modelo.${pairedNames || ' Não encontrei uma peça inteira correspondente no lado oposto; apenas esta peça foi dividida.'}`
          : connectedJoint
            ? 'Peça dividida. A conexão foi mantida no lado que conserva o ID original; o novo lado ficou sem conexão.'
            : 'Peça dividida em duas. Selecione e exclua o lado que não deseja manter.'
      }
    })
  }
  const applyBrush = (outlineOnly: boolean) => {
    if (!selected || !selectedRect || !gesture || gesture.tool !== (outlineOnly ? 'outline' : 'erase')) return
    void runMutation(async materialized => {
      const part = materialized.parts.find(item => item.id === selected.id)
      if (!part) throw new Error('A peça selecionada não está mais no modelo.')
      const points = pointsForPart(gesture.points, part, selectedRect.width, selectedRect.height)
      const result = await runPixelEdit(signal => eraseModelSourceBrush(part, points, brushSize * part.width / Math.max(1, selectedRect.width), outlineOnly, signal))
      if (!result.removedPixels) {
        setStatus(outlineOnly ? 'O pincel não encontrou contorno escuro/contrastado neste traço.' : 'O pincel não alcançou pixels visíveis.')
        return null
      }
      return {
        project: { ...materialized, parts: materialized.parts.map(item => item.id === part.id ? result.part : item) },
        selectedId: part.id,
        status: outlineOnly
          ? 'Contorno contrastado removido sob o pincel; a base do Chroma também foi atualizada.'
          : 'Área apagada; a base do Chroma também foi atualizada.'
      }
    })
  }
  const removeOriginalSkinColor = () => {
    if (!skinColor || busy || downloading) return
    void runMutation(async materialized => {
      const bodyParts = materialized.parts.filter(isModelSkinPart)
      if (!bodyParts.length) throw new Error('Não encontrei peças anatômicas para remover a cor da pele.')
      const replacements = new Map<string, ModelPart>()
      let removedPixels = 0
      for (const part of bodyParts) {
        const result = await runPixelEdit(signal => removeModelSourceColor(part, skinColor, skinColorTolerance, signal))
        replacements.set(part.id, result.part)
        removedPixels += result.removedPixels
      }
      if (!removedPixels) {
        setStatus('A cor selecionada não foi encontrada dentro da semelhança atual. Selecione outra cor ou aumente a semelhança.')
        return null
      }
      return {
        project: {
          ...materialized,
          modelSkinTone: materialized.modelSkinTone ?? MODEL_SKIN_BASE_TONE,
          parts: materialized.parts.map(part => replacements.get(part.id) ?? part)
        },
        selectedId,
        status: `${removedPixels.toLocaleString('pt-BR')} pixels da pele removidos nas peças do corpo; os contornos escuros foram preservados. A edição pode ser desfeita.`
      }
    })
  }
  const normalizeModelOutline = () => {
    if (!/^#[0-9a-f]{6}$/i.test(outlineColor) || busy || downloading) return
    void runMutation(async materialized => {
      const bodyParts = materialized.parts.filter(isModelSkinPart)
      if (!bodyParts.length) throw new Error('Não encontrei peças anatômicas para normalizar o contorno.')
      const replacements = new Map<string, ModelPart>()
      let normalizedPixels = 0
      for (const part of bodyParts) {
        const result = await runPixelEdit(signal => normalizeModelSourceOutline(part, outlineColor, signal, {
          thicknessPercent: outlineThicknessPercent,
          luminanceThreshold: outlineLuminanceThreshold
        }))
        replacements.set(part.id, result.part)
        normalizedPixels += result.removedPixels
      }
      if (!normalizedPixels) {
        setStatus('Não encontrei contorno escuro junto à borda transparente das peças do corpo.')
        return null
      }
      return {
        project: {
          ...materialized,
          modelOutlineColor: outlineColor,
          parts: materialized.parts.map(part => replacements.get(part.id) ?? part)
        },
        selectedId,
        status: `${normalizedPixels.toLocaleString('pt-BR')} pixels de contorno normalizados em ${bodyParts.length} peças do corpo. A cor padrão do contorno também foi atualizada; a alteração pode ser desfeita.`
      }
    })
  }
  const previewSelectedOutline = async () => {
    if (!selected || !isModelSkinPart(selected) || busy || downloading) return
    setMode('part')
    setTool('select')
    cancelDrawing()
    setBusy(true)
    setPreparingOutlinePreview(true)
    setError('')
    setStatus('Preparando a prévia do contorno…')
    try {
      const composed = await compile()
      const part = composed.parts.find(item => item.id === selected.id)
      if (!part) throw new Error('A peça selecionada não está mais no modelo.')
      const result = await runPixelEdit(signal => normalizeModelSourceOutline(part, outlineColor, signal, {
        thicknessPercent: outlineThicknessPercent,
        luminanceThreshold: outlineLuminanceThreshold
      }))
      if (!result.removedPixels) {
        setOutlinePreview(null)
        setStatus('Não encontrei contorno nessa peça com estes ajustes. Aumente a faixa ou a sensibilidade e tente outra vez.')
        return
      }
      setOutlinePreview({
        part: result.part,
        sourceDraft: draft,
        dimensions,
        color: outlineColor,
        thicknessPercent: outlineThicknessPercent,
        luminanceThreshold: outlineLuminanceThreshold
      })
      setStatus(`Prévia temporária: ${result.removedPixels.toLocaleString('pt-BR')} pixels serão ajustados nesta peça. Aplique ao corpo para gravar no rascunho.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível preparar a prévia do contorno.')
      setStatus('')
    } finally {
      setPreparingOutlinePreview(false)
      setBusy(false)
    }
  }
  const replaceOppositeLimb = () => {
    if (!selected || !limbReplacementTarget || busy || downloading) return
    void runMutation(async materialized => {
      const source = materialized.parts.find(part => part.id === selected.id)
      if (!source) throw new Error('A peça de origem não está mais no modelo.')
      const target = findLimbReplacementTarget(materialized.parts, source)
      if (!target) throw new Error('Não encontrei uma única peça correspondente do lado oposto para substituir.')
      const replacement = await replaceLimbPixelsFromOpposite(source, target)
      return {
        project: { ...materialized, parts: materialized.parts.map(part => part.id === target.id ? replacement : part) },
        selectedId: source.id,
        status: `${target.name} recebeu uma cópia espelhada de ${source.name}. A posição, o pivô e as juntas existentes foram preservados; use Desfazer para voltar.`
      }
    })
  }
  const deleteSelected = () => {
    if (!selected || draft.parts.length <= 1) return
    void runMutation(async materialized => {
      const index = materialized.parts.findIndex(part => part.id === selected.id)
      if (index < 0) throw new Error('A peça selecionada não está mais no modelo.')
      const original = materialized.parts[index]
      const survivors = materialized.parts.filter(part => part.splitOriginPartId === original.id
        && !project.parts.some(saved => saved.id === part.id))
      if (survivors.length === 1) {
        const survivor = survivors[0]
        const parts = materialized.parts.filter(part => part.id !== original.id).map(part => part.id === survivor.id
          ? { ...part, id: original.id, name: part.splitOriginPartName ?? original.name,
            splitOriginPartId: original.splitOriginPartId, splitOriginPartName: original.splitOriginPartName } : part)
        const order = materialized.layerOrder?.filter(id => id !== survivor.id)
        return {
          project: { ...materialized, parts, layerOrder: order,
            hiddenPartIds: materialized.hiddenPartIds?.filter(id => id !== survivor.id) },
          selectedId: original.id,
          status: 'Segmento excluído. O segmento restante preservou a identidade e os vínculos da peça original.'
        }
      }
      const parts = materialized.parts.filter(part => part.id !== selected.id)
      const layerOrder = materialized.layerOrder?.filter(id => id !== selected.id)
      const hiddenPartIds = materialized.hiddenPartIds?.filter(id => id !== selected.id)
      return {
        project: {
          ...materialized,
          parts,
          joints: materialized.joints.filter(joint => joint.parentPartId !== selected.id && joint.childPartId !== selected.id),
          layerOrder,
          hiddenPartIds
        },
        selectedId: parts[Math.min(index, parts.length - 1)]?.id ?? '',
        status: 'Peça excluída. A ação pode ser desfeita pelo botão Desfazer.'
      }
    })
  }
  const restoreChroma = () => {
    setChromaTolerance(project.tolerance)
    setDownloadInfo('')
    setStatus('Tolerância original do Chroma restaurada.')
  }
  const save = async () => {
    if (!edited || busy || downloading) return
    setBusy(true)
    try {
      const result = await compile()
      let message = 'Salvar estas edições no modelo original? A folha, as peças editadas e o Chroma Key serão atualizados. O histórico anterior será encerrado e um backup interno será mantido.'
      message += '\n\nPoses e roupas já salvas podem manter imagens ou vínculos anteriores; revise as que usam as peças editadas.'
      if (structureChanged) message += '\n\nA estrutura mudou. Uma divisão conserva o ID original e mantém as juntas nesse lado; o lado novo começa sem conexões. Uma exclusão limpa suas juntas e camadas deste modelo.'
      if (!window.confirm(message)) return
      await onPublish(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao salvar as edições no modelo original.')
    } finally {
      setBusy(false)
    }
  }
  const download = async () => {
    if (busy || downloading) return
    setDownloading(true)
    setDownloadInfo('')
    try {
      const result = await compile()
      let pngDataUrl = result.previewDataUrl
      if (downloadWithMaleTorso) {
        const torso = result.parts.find(part => /tronco|corpo/i.test(part.name))
        const maleTorso = draft.maleTorso
        if (!torso || !maleTorso) throw new Error('Salve um tronco masculino em Modelos DEV antes de usar esta opção.')
        const canvas = document.createElement('canvas')
        canvas.width = draft.width
        canvas.height = draft.height
        const context = canvas.getContext('2d')
        if (!context) throw new Error('Não foi possível preparar a folha PNG.')
        const loadImage = (dataUrl: string) => new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image()
          image.onload = () => resolve(image)
          image.onerror = () => reject(new Error('Não foi possível carregar uma peça para o PNG.'))
          image.src = dataUrl
        })
        for (const part of result.parts) {
          const image = await loadImage(part.id === torso.id ? maleTorso.dataUrl : part.dataUrl)
          const rect = sourceRect(part, dimensions[part.id])
          context.drawImage(image, rect.x, rect.y, rect.width, rect.height)
        }
        pngDataUrl = canvas.toDataURL('image/png')
      }
      const path = await window.desktop.fabricator.downloadFabricatorModelSource(draft.slot, pngDataUrl)
      setDownloadInfo('PNG salvo em Downloads: ' + path)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível baixar a imagem.')
    } finally {
      setDownloading(false)
    }
  }
  const downloadHead = async () => {
    if (busy || downloading) return
    setDownloading(true)
    setDownloadInfo('')
    try {
      const result = await compile()
      const head = result.parts.find(isHeadPart)
      if (!head) throw new Error('Este modelo não tem uma peça identificada como cabeça.')
      const pngDataUrl = await cropImageToVisiblePixels(head.dataUrl)
      const path = await window.desktop.fabricator.downloadFabricatorModelSource(draft.slot, pngDataUrl, 'head')
      setDownloadInfo('PNG transparente da cabeça salvo em Downloads: ' + path)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível baixar o PNG da cabeça.')
    } finally {
      setDownloading(false)
    }
  }
  const changeZoom = (value: number) => setZoom(clamp(value, .5, 4))
  const handlePreviewWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    changeZoom(zoom * (event.deltaY < 0 ? 1.12 : .89))
  }

  return (
    <div role="presentation" className="model-source-backdrop">
      <section role="dialog" aria-modal="true" aria-label="Editar imagem original — Model Source" className="model-source-dialog">
        <header className="model-source-header">
          <div className="model-source-header-copy">
            <span className="model-source-header-mark"><Icon name="edit" /></span>
            <span><small className="model-source-eyebrow">Fabricador · modelo base</small><h1>Editar imagem original</h1><p>As mudanças ficam no rascunho até você salvar no modelo.</p></span>
          </div>
          <button type="button" disabled={busy || downloading} onClick={onClose} aria-label="Fechar editor" className="model-source-close"><Icon name="close" /></button>
        </header>
        <div className="model-source-layout">
          <aside className="model-source-parts-rail" aria-label="Peças do modelo">
            <header className="model-source-rail-heading"><span><small>Catálogo do modelo</small><strong>Peças</strong></span><span className="model-source-count">{draft.parts.length}</span></header>
            <div className="model-source-part-list">
            {draft.parts.map(part => {
              const rect = sourceRect(part, dimensions[part.id])
              return (
              <button key={part.id} type="button" className={`model-source-part-card${part.id === selectedId ? ' selected' : ''}`} aria-pressed={part.id === selectedId} disabled={busy || downloading} onClick={() => { setSamplingSkinColor(false); setSelectedId(part.id); setMode('part'); setTool('select'); cancelDrawing(); setError('') }}>
                  <span className="model-source-part-thumb"><img src={part.dataUrl} alt="" /></span>
                  <span className="model-source-part-details"><strong>{part.name}</strong><small>{dimensions[part.id] ? 'Modificada · ' : ''}{Math.round(rect.width)} × {Math.round(rect.height)} px</small></span>
                </button>
              )
            })}
            </div>
          </aside>
          <main className="model-source-workspace">
            <label className="model-source-joint-setting" style={{ cursor: busy || downloading ? 'not-allowed' : 'pointer' }}>
              <input
                aria-label="Modelo com partes unidas"
                type="checkbox"
                checked={draft.bodyJointBridgeEnabled === true}
                disabled={busy || downloading}
                onChange={(event) => {
                  saveUndoSnapshot()
                  const enabled = event.target.checked
                  setDraft((current) => ({ ...current, bodyJointBridgeEnabled: enabled }))
                  if (!enabled && tool === 'joint-split') {
                    setTool('select')
                    cancelDrawing()
                  }
                  setStatus(enabled
                    ? 'Partes unidas ativado. O botão Divisor de juntas poderá separar braços e pernas inteiros; Dividir com linha continua sendo um corte genérico.'
                    : 'Partes unidas desativado. Dividir com linha continua disponível para cortes genéricos.')
                }}
              />
              <span><strong>Partes unidas</strong><small>Ativa o Divisor de juntas para braços e pernas inteiros; não altera o corte genérico.</small></span>
            </label>
            <div className="model-source-view-toolbar">
              <span className="model-source-toolbar-label">Visualização</span>
              <div className="model-source-view-mode">
              <button type="button" style={toolButton(mode === 'part', busy || downloading)} disabled={busy || downloading} onClick={() => { setMode('part'); cancelDrawing() }}>Peça selecionada</button>
              <button type="button" style={toolButton(mode === 'sheet', busy || downloading)} disabled={busy || downloading} onClick={() => { setSamplingSkinColor(false); setMode('sheet'); setTool('select'); cancelDrawing() }}>Folha completa</button>
              </div>
              <label className="model-source-view-background">Fundo
                <select aria-label="Fundo da prévia" value={previewBackground} disabled={busy || downloading} onChange={event => setPreviewBackground(event.target.value as PreviewBackground)} style={{ ...field, width: 'auto', padding: '7px 8px' }}>
                  <option value="checker">Xadrez / transparência</option>
                  <option value="white">Branco</option>
                  <option value="dark">Escuro</option>
                  <option value="green">Verde</option>
                  <option value="magenta">Magenta</option>
                </select>
              </label>
              <div className="model-source-view-tools" aria-label="Ferramentas de cor e contorno">
              <button type="button" title="Escolha uma cor da pele original e remova esse tom das peças anatômicas" style={toolButton(skinRemovalOpen, busy || downloading || draft.parts.length === 0)} disabled={busy || downloading || draft.parts.length === 0} onClick={() => {
                const open = !skinRemovalOpen
                setSkinRemovalOpen(open)
                setSamplingSkinColor(false)
                if (open) {
                  setMode('part')
                  setTool('select')
                  cancelDrawing()
                  setStatus('Escolha a cor manualmente ou use “Selecionar na prévia” para amostrar a pele original.')
                }
              }}>Remover pele original</button>
              <button type="button" title="Detecta deterministicamente o contorno externo das peças do corpo e aplica uma única cor" style={toolButton(outlineNormalizationOpen, busy || downloading || draft.parts.length === 0)} disabled={busy || downloading || draft.parts.length === 0} onClick={() => {
                const open = !outlineNormalizationOpen
                setOutlineNormalizationOpen(open)
                setSamplingSkinColor(false)
                if (open) {
                  setMode('part')
                  setTool('select')
                  cancelDrawing()
                  setStatus('Escolha a cor e normalize o contorno externo detectado nas peças do corpo.')
                }
              }}>Normalizar contorno</button>
              </div>
              <div className="model-source-zoom-group"><span className="model-source-toolbar-label">Zoom</span>
              <button type="button" aria-label="Diminuir zoom" style={toolButton(false, busy || downloading)} disabled={busy || downloading} onClick={() => changeZoom(zoom - .25)}>−</button>
              <input aria-label="Zoom da prévia" type="range" min={.5} max={4} step={.1} value={zoom} disabled={busy || downloading} onChange={event => changeZoom(Number(event.target.value))} style={{ width: 110 }} />
              <button type="button" aria-label="Aumentar zoom" style={toolButton(false, busy || downloading)} disabled={busy || downloading} onClick={() => changeZoom(zoom + .25)}>+</button>
              <button type="button" style={toolButton(false, busy || downloading)} disabled={busy || downloading} onClick={() => changeZoom(1)}>{Math.round(zoom * 100)}% · Ajustar</button>
              </div>
            </div>
            {mode === 'part' && <div className="model-source-tool-groups" aria-label="Ferramentas da peça">
              <div className="model-source-tool-group">
                <small>Transformar</small>
                <button type="button" style={toolButton(tool === 'select', busy || downloading || !selected)} disabled={busy || downloading || !selected} onClick={() => setEditTool('select')}>Selecionar</button>
                <button type="button" aria-label="Girar a imagem da peça 90 graus à esquerda" title="Girar a imagem da peça 90° à esquerda; o pivô da junta acompanha" style={toolButton(false, busy || downloading || !selected)} disabled={busy || downloading || !selected} onClick={() => rotateSelectedPart(-90)}>↶ 90°</button>
                <button type="button" aria-label="Girar a imagem da peça 90 graus à direita" title="Girar a imagem da peça 90° à direita; o pivô da junta acompanha" style={toolButton(false, busy || downloading || !selected)} disabled={busy || downloading || !selected} onClick={() => rotateSelectedPart(90)}>↷ 90°</button>
                <button type="button" className="model-source-mirror-button" aria-label="Espelhar peça horizontalmente" title="Inverte a imagem da peça da esquerda para a direita sem mover seu encaixe ou suas juntas" style={toolButton(false, busy || downloading || !selected)} disabled={busy || downloading || !selected} onClick={mirrorSelectedPart}><Icon name="flipHorizontal" />Espelhar peça</button>
              </div>
              <div className="model-source-tool-group">
                <small>Recortar e dividir</small>
                <button type="button" style={toolButton(tool === 'erase', busy || downloading || !selected)} disabled={busy || downloading || !selected} onClick={() => setEditTool('erase')}>Apagar</button>
                <button type="button" style={toolButton(tool === 'crop', busy || downloading || !selected)} disabled={busy || downloading || !selected} onClick={() => setEditTool('crop')}>Cortar</button>
                <button type="button" title="Corte genérico para separar e excluir a parte da imagem que não deseja" style={toolButton(tool === 'split', busy || downloading || !selected)} disabled={busy || downloading || !selected} onClick={() => setEditTool('split')}>Dividir com linha</button>
                <button type="button" title={!draft.bodyJointBridgeEnabled ? 'Ative “Partes unidas” para usar o divisor de juntas' : !jointSplitReady ? 'Selecione um braço ou uma perna inteira ainda não dividida' : 'Divide o membro e aplica a mesma linha proporcional ao membro inteiro do lado oposto'} style={toolButton(tool === 'joint-split', busy || downloading || !jointSplitReady)} disabled={busy || downloading || !jointSplitReady} onClick={() => setEditTool('joint-split')}>Divisor de juntas</button>
              </div>
              <div className="model-source-tool-group">
                <small>Acabamento</small>
                <button type="button" style={toolButton(tool === 'outline', busy || downloading || !selected)} disabled={busy || downloading || !selected} onClick={() => setEditTool('outline')}>Apagar contorno</button>
                <button type="button" title={isThigh ? 'Arraste sobre a coxa para deformar' : 'A ferramenta está disponível somente nas coxas'} style={toolButton(tool === 'deform', busy || downloading || !isThigh)} disabled={busy || downloading || !isThigh} onClick={() => setEditTool('deform')}>〰 Deformar coxa</button>
                <button type="button" title="Desenhe guias temporárias e estenda-as pelas bolinhas das pontas" style={toolButton(tool === 'guide', busy || downloading || !selected)} disabled={busy || downloading || !selected} onClick={() => setEditTool(tool === 'guide' ? 'select' : 'guide')}>／ Linha temporária</button>
                {tool === 'guide' && visibleGuideLines.length > 0 && <button type="button" style={toolButton(false, busy || downloading)} disabled={busy || downloading} onClick={() => setGuides({ partId: selectedId, lines: [] })}>Limpar guias</button>}
              </div>
              {(tool === 'erase' || tool === 'outline' || tool === 'deform' && isThigh) && <div className="model-source-tool-sliders">
                {(tool === 'erase' || tool === 'outline') && <label>Pincel {brushSize}px<input aria-label="Tamanho do pincel" type="range" min={4} max={80} step={1} value={brushSize} onChange={event => setBrushSize(Number(event.target.value))} disabled={busy || downloading} /></label>}
                {tool === 'deform' && isThigh && <>
                  <label>Raio {warpRadius}px<input aria-label="Raio do pincel de deformação" type="range" min={6} max={120} step={1} value={warpRadius} onChange={event => setWarpRadius(Number(event.target.value))} disabled={busy || downloading} /></label>
                  <label>Força {warpStrength}%<input aria-label="Força do pincel de deformação" type="range" min={10} max={100} step={1} value={warpStrength} onChange={event => setWarpStrength(Number(event.target.value))} disabled={busy || downloading} /></label>
                </>}
              </div>}
            </div>}
            {skinRemovalOpen && <section className="model-source-panel" aria-label="Remover a cor da pele original">
              <strong style={{ fontSize: 12 }}>Remover a cor original da pele</strong>
              <small>A cor escolhida será removida das peças anatômicas; os contornos escuros ficam preservados. A alteração continua no rascunho até “Salvar no original”.</small>
              <div className="model-source-panel-row">
                <label>
                  Cor da pele
                  <input aria-label="Selecionar cor original da pele" type="color" value={skinColor ?? '#f3d9c1'} disabled={busy || downloading} onChange={event => { setSkinColor(event.target.value); setSamplingSkinColor(false); setError('') }} />
                </label>
                <button type="button" style={toolButton(samplingSkinColor, busy || downloading || mode !== 'part' || !previewPart)} disabled={busy || downloading || mode !== 'part' || !previewPart} onClick={() => {
                  const sampling = !samplingSkinColor
                  setSamplingSkinColor(sampling)
                  setTool('select')
                  cancelDrawing()
                  setStatus(sampling ? 'Clique em uma área da pele na prévia da peça para selecionar a cor original.' : 'Seleção de cor cancelada.')
                }}>{samplingSkinColor ? 'Cancelar seleção' : 'Selecionar na prévia'}</button>
                <small className="model-source-panel-color-value">{skinColor ? skinColor.toUpperCase() : 'Nenhuma cor selecionada'}</small>
              </div>
              <label className="model-source-panel-range">
                Semelhança {skinColorTolerance}
                <input aria-label="Semelhança da cor da pele" type="range" min={0} max={180} step={1} value={skinColorTolerance} disabled={busy || downloading} onChange={event => setSkinColorTolerance(Number(event.target.value))} style={{ flex: '1 1 160px' }} />
              </label>
              <button type="button" style={{ ...toolButton(false, busy || downloading || !skinColor || samplingSkinColor), width: '100%' }} disabled={busy || downloading || !skinColor || samplingSkinColor} onClick={removeOriginalSkinColor}>Remover cor e manter contornos</button>
            </section>}
            {outlineNormalizationOpen && <section className="model-source-panel" aria-label="Normalizar o contorno do modelo">
              <strong style={{ fontSize: 12 }}>Normalizar o contorno externo</strong>
              <small>Detecta tinta junto às bordas transparentes. Ajuste a faixa e os tons que entram na seleção, confira uma peça e depois aplique às {modelSkinPartCount} peças do corpo.</small>
              <label>
                Cor única do contorno
                <input aria-label="Cor única do contorno do modelo" type="color" value={outlineColor} disabled={busy || downloading} onChange={event => { setOutlineColor(event.target.value); setOutlinePreview(null); setError('') }} />
                <small className="model-source-panel-color-value">{outlineColor.toUpperCase()}</small>
              </label>
              <label className="model-source-outline-setting">
                Faixa analisada · {outlineThicknessPercent}% da peça
                <input aria-label="Espessura da faixa de contorno" type="range" min={1} max={8} step={1} value={outlineThicknessPercent} disabled={busy || downloading} onChange={event => { setOutlineThicknessPercent(Number(event.target.value)); setOutlinePreview(null) }} />
              </label>
              <label className="model-source-outline-setting">
                Luminância incluída · até {outlineLuminanceThreshold}/255
                <input aria-label="Sensibilidade da detecção do contorno" type="range" min={70} max={220} step={1} value={outlineLuminanceThreshold} disabled={busy || downloading} onChange={event => { setOutlineLuminanceThreshold(Number(event.target.value)); setOutlinePreview(null) }} />
              </label>
              <small className="model-source-outline-help">Aumente a faixa para alcançar contornos grossos. Aumente a sensibilidade para incluir traços mais claros; se pegar linhas internas, reduza os valores.</small>
              {outlinePreviewIsCurrent && <small className="model-source-outline-preview-note">Prévia temporária nesta peça. Ela ainda não foi aplicada ao rascunho.</small>}
              <div className="model-source-outline-actions">
                <button type="button" style={{ ...toolButton(outlinePreviewIsCurrent, busy || downloading || !selected || !isModelSkinPart(selected)), width: '100%' }} disabled={busy || downloading || !selected || !isModelSkinPart(selected)} onClick={() => void previewSelectedOutline}>{preparingOutlinePreview ? 'Analisando…' : outlinePreviewIsCurrent ? 'Atualizar prévia da peça' : 'Pré-visualizar nesta peça'}</button>
                {outlinePreview && <button type="button" className="model-source-outline-discard" disabled={busy || downloading} onClick={() => { setOutlinePreview(null); setStatus('Prévia do contorno descartada; o rascunho não foi alterado.') }}>Descartar prévia</button>}
              </div>
              <button type="button" className="model-source-outline-apply" disabled={busy || downloading || modelSkinPartCount === 0} onClick={normalizeModelOutline}>Aplicar às {modelSkinPartCount} peças do corpo</button>
            </section>}
            <div className="model-source-preview-heading">
              <small>
                {mode === 'sheet'
                  ? 'Folha PNG transparente · selecione a cabeça para mover'
                  : tool === 'crop' ? 'Arraste um retângulo sobre a peça e aplique o corte.'
                    : tool === 'split' ? 'Trace uma linha para dividir a peça e excluir depois o lado que não deseja.'
                    : tool === 'joint-split' ? 'Trace a articulação; a mesma divisão proporcional será aplicada ao membro inteiro do lado oposto.'
                      : tool === 'erase' ? 'Pinte a área que deseja apagar.'
                        : tool === 'outline' ? 'Pinte sobre o contorno escuro para removê-lo automaticamente.'
                      : tool === 'deform' ? warpSession ? 'Arraste sobre a coxa para deformar. Cada traço fica no rascunho; “Salvar no original” publica.' : 'Preparando a coxa para deformar…'
                        : tool === 'guide' ? 'Segure e arraste para criar uma linha. Arraste uma bolinha para continuar a linha; outras ferramentas travam as guias.'
                          : 'Prévia isolada · Ctrl + roda do mouse também altera o zoom'}
              </small>
              {mode === 'part' && visibleGuideLines.length > 0 && tool !== 'guide' && <small className="model-source-guide-status">Guias travadas</small>}
              {mode === 'part' && gesture && <div className="model-source-preview-actions">
                {gesture.tool === 'crop' && <button type="button" style={toolButton(false, busy || downloading)} disabled={busy || downloading} onClick={applyCrop}>Aplicar corte</button>}
                {gesture.tool === 'split' && <button type="button" style={toolButton(false, busy || downloading)} disabled={busy || downloading} onClick={() => applySplit(false)}>Dividir peça</button>}
                {gesture.tool === 'joint-split' && <button type="button" style={toolButton(false, busy || downloading)} disabled={busy || downloading} onClick={() => applySplit(true)}>Criar segmentos e junta</button>}
                {gesture.tool === 'erase' && <button type="button" style={toolButton(false, busy || downloading)} disabled={busy || downloading} onClick={() => applyBrush(false)}>Aplicar borracha</button>}
                {gesture.tool === 'outline' && <button type="button" style={toolButton(false, busy || downloading)} disabled={busy || downloading} onClick={() => applyBrush(true)}>Remover contorno</button>}
                <button type="button" style={toolButton(false, busy || downloading)} disabled={busy || downloading} onClick={cancelDrawing}>Cancelar traço</button>
              </div>}
            </div>
            <div onWheel={handlePreviewWheel} className="model-source-preview-stage">
              <div className="model-source-artboard">
                <div
                  ref={surface}
                  onPointerDown={handlePreviewPointerDown}
                  onPointerMove={tool === 'guide' ? moveGuide : tool === 'deform' ? moveWarp : moveDrawing}
                  onPointerUp={tool === 'guide' ? finishGuide : tool === 'deform' ? event => { void finishWarp(event) } : finishDrawing}
                  onPointerCancel={tool === 'guide' ? cancelGuide : tool === 'deform' ? event => { void finishWarp(event) } : cancelDrawing}
                  onPointerLeave={() => { if (!warpDrag.current) setWarpCursor(null) }}
                  className="model-source-preview-surface"
                  style={{ width: surfaceWidth, height: surfaceHeight, ...previewBackgroundStyle, cursor: samplingSkinColor ? 'copy' : mode === 'part' && tool !== 'select' ? 'crosshair' : 'default' }}
                >
                  {mode === 'sheet'
                    ? preview && <img src={preview} alt="Prévia da imagem original editada" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none' }} />
                    : tool === 'deform' && warpSession?.partId === selectedId
                      ? <canvas ref={warpCanvas} aria-label={'Prévia deformável: ' + (selected?.name ?? 'coxa')} style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none' }} />
                      : previewPart && <img src={previewPart.dataUrl} alt={'Prévia isolada: ' + previewPart.name} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block', pointerEvents: 'none' }} />}
                  {mode === 'sheet' && selectedRect && <div aria-label={isHead ? 'Arraste a cabeça para mover na folha original' : 'Peça selecionada'} onPointerDown={startHeadDrag} onPointerMove={moveHeadDrag} onPointerUp={stopHeadDrag} onPointerCancel={stopHeadDrag} style={{ position: 'absolute', left: selectedRect.x * previewScale, top: selectedRect.y * previewScale, width: selectedRect.width * previewScale, height: selectedRect.height * previewScale, border: '2px dashed #e76391', boxSizing: 'border-box', cursor: isHead ? 'grab' : 'default', touchAction: 'none', userSelect: 'none' }} />}
                  {mode === 'part' && (visibleGuideLines.length > 0 || guideStroke?.partId === selectedId) && <svg aria-label="Linhas temporárias de referência" width="100%" height="100%" viewBox={'0 0 ' + logicalWidth + ' ' + logicalHeight} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
                    {visibleGuideLines.map(line => <g key={line.id}>
                      <line x1={line.start.x} y1={line.start.y} x2={line.end.x} y2={line.end.y} stroke="#70d6d0" strokeWidth="2" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                      {[line.start, line.end].map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={6 / previewScale} fill="#fff" stroke="#4faaa3" strokeWidth="2" vectorEffect="non-scaling-stroke" pointerEvents={tool === 'guide' ? 'all' : 'none'} aria-label={tool === 'guide' ? 'Arraste para criar uma linha conectada' : 'Guia temporária travada'} onPointerDown={event => extendGuide(event, point)} style={{ cursor: tool === 'guide' ? 'crosshair' : 'default' }} />)}
                    </g>)}
                    {guideStroke?.partId === selectedId && <line x1={guideStroke.start.x} y1={guideStroke.start.y} x2={guideStroke.end.x} y2={guideStroke.end.y} stroke="#4faaa3" strokeWidth="2" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
                  </svg>}
                  {mode === 'part' && gesture && <svg aria-hidden="true" width="100%" height="100%" viewBox={'0 0 ' + logicalWidth + ' ' + logicalHeight} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}>
                    {gesture.tool === 'crop' && <rect x={Math.min(gesture.start.x, gesture.current.x)} y={Math.min(gesture.start.y, gesture.current.y)} width={Math.abs(gesture.current.x - gesture.start.x)} height={Math.abs(gesture.current.y - gesture.start.y)} fill="rgba(231,99,145,.16)" stroke="#c74677" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
                    {(gesture.tool === 'split' || gesture.tool === 'joint-split') && <line x1={gesture.start.x} y1={gesture.start.y} x2={gesture.current.x} y2={gesture.current.y} stroke={gesture.tool === 'joint-split' ? '#54d6c5' : '#ff6677'} strokeWidth="3" vectorEffect="non-scaling-stroke" />}
                    {(gesture.tool === 'erase' || gesture.tool === 'outline') && <polyline points={gesture.points.map(point => point.x + ',' + point.y).join(' ')} fill="none" stroke={gesture.tool === 'outline' ? '#ffc857' : '#ff6677'} strokeWidth={brushSize} strokeLinecap="round" strokeLinejoin="round" opacity=".75" vectorEffect="non-scaling-stroke" />}
                  </svg>}
                  {mode === 'part' && tool === 'deform' && warpCursor && <div aria-hidden="true" style={{ position: 'absolute', left: warpCursor.x * previewScale - warpRadius * previewScale, top: warpCursor.y * previewScale - warpRadius * previewScale, width: warpRadius * 2 * previewScale, height: warpRadius * 2 * previewScale, border: '1px solid #c74677', borderRadius: '50%', background: 'rgba(231,99,145,.10)', boxSizing: 'border-box', pointerEvents: 'none' }} />}
                </div>
              </div>
            </div>
            {status && <small role="status" className="model-source-status">{status}</small>}
          </main>
          <aside className="model-source-inspector">
            <header className="model-source-inspector-heading"><small className="model-source-inspector-kicker">Propriedades e operações</small><h2>{selected?.name ?? 'Nenhuma peça'}</h2></header>
            {selected && limbReplacementTarget && <section className="model-source-panel model-source-replacement" aria-label="Substituição experimental de membro">
              <strong style={{ fontSize: 12 }}>Substituição experimental</strong>
              <small>Copia e espelha os pixels de {selected.name} para o lado oposto. Mantém a posição, o pivô, o ID e as juntas atuais desse lado.</small>
              <button type="button" title={`Substituir ${limbReplacementTarget.name} pela cópia espelhada de ${selected.name}; mantém os vínculos e a posição do lado substituído.`} aria-label={`Substituir ${limbReplacementTarget.name} pela cópia espelhada de ${selected.name}`} className="model-source-replacement-button" disabled={busy || downloading} onClick={replaceOppositeLimb}>Substituir {modelRigSide(limbReplacementTarget.name) === 'left' ? 'esquerda' : 'direita'} pela cópia espelhada de {modelRigSide(selected.name) === 'left' ? 'esquerda' : 'direita'}</button>
            </section>}
            {selected && selectedRect && baseline && <>
              <label className="model-source-inspector-field">Largura (pixels)
                <input style={field} type="number" min={1} max={8192} step={1} value={selectedRect.width} disabled={busy || downloading} onChange={event => setNumber('width', Number(event.target.value))} />
              </label>
              <label className="model-source-inspector-field">Altura (pixels)
                <input style={field} type="number" min={1} max={8192} step={1} value={selectedRect.height} disabled={busy || downloading} onChange={event => setNumber('height', Number(event.target.value))} />
              </label>
              {isHead && <>
                <strong className="model-source-inspector-subheading">Posição da cabeça na imagem</strong>
                <label className="model-source-inspector-field">X (pixels)
                  <input style={field} type="number" min={0} max={draft.width} step={1} value={selectedRect.x} disabled={busy || downloading} onChange={event => setNumber('x', Number(event.target.value))} />
                </label>
                <label className="model-source-inspector-field">Y (pixels)
                  <input style={field} type="number" min={0} max={draft.height} step={1} value={selectedRect.y} disabled={busy || downloading} onChange={event => setNumber('y', Number(event.target.value))} />
                </label>
              </>}
              <small className="model-source-inspector-note">Original desta peça: {Math.round(baseline.width)} × {Math.round(baseline.height)} px</small>
              <button className="model-source-inspector-button" style={field} type="button" disabled={busy || downloading} onClick={restoreSelected}>Restaurar dimensões</button>
            </>}
            {draft.parts.length > 1 && <button className="model-source-inspector-button model-source-danger-button" type="button" disabled={!selected || busy || downloading} onClick={deleteSelected}>Excluir peça selecionada</button>}
            <button className="model-source-inspector-button" type="button" disabled={undoCount === 0 || busy || downloading} onClick={undo}>Desfazer edição ({undoCount})</button>
            <div className="model-source-inspector-section">
              <strong>Remoção do fundo</strong>
              <label htmlFor="model-source-chroma">Chroma Key · tolerância: {chromaTolerance}</label>
              <input id="model-source-chroma" type="range" min={0} max={MAX_CHROMA_TOLERANCE} value={chromaTolerance} disabled={busy || downloading} onChange={event => { setChromaTolerance(Number(event.target.value)); setDownloadInfo('') }} />
              <button className="model-source-inspector-button" type="button" disabled={busy || downloading} onClick={restoreChroma}>Restaurar chroma</button>
              <small>A borracha de contorno também atualiza a base usada para recalcular o Chroma.</small>
            </div>
          </aside>
        </div>
        {error && <p role="alert" className="model-source-content-alert">{error}</p>}
        {downloadInfo && <p role="status" className="model-source-content-alert success">{downloadInfo}</p>}
        <footer className="model-source-footer">
          <small className="model-source-footer-note">Edições no rascunho · use Desfazer para revisar</small>
          <div className="model-source-footer-actions">
          <button type="button" onClick={onClose} disabled={busy || downloading} className="model-source-footer-button">Cancelar</button>
          <select aria-label="Tronco incluído no PNG" value={downloadWithMaleTorso ? 'male' : 'original'} onChange={event => setDownloadWithMaleTorso(event.target.value === 'male')} disabled={busy || downloading || Boolean(error) || !draft.maleTorso} className="model-source-footer-button" title={draft.maleTorso ? 'Escolha qual versão do tronco incluir no PNG' : 'Crie e salve um tronco masculino para habilitar esta opção'}>
            <option value="original">Tronco original</option>
            <option value="male">Tronco masculino</option>
          </select>
          <button type="button" onClick={() => void downloadHead()} disabled={busy || downloading || Boolean(error) || !draft.parts.some(isHeadPart)} className="model-source-footer-button" title="Exporta somente a peça Cabeça, recortada e com transparência">{downloading ? 'Exportando…' : 'Baixar cabeça PNG transparente'}</button>
          <button type="button" onClick={() => void download()} disabled={busy || downloading || Boolean(error)} className="model-source-footer-button">{downloading ? 'Exportando…' : 'Baixar PNG em Downloads'}</button>
          <button type="button" onClick={() => void save()} disabled={!edited || busy || downloading || Boolean(error)} className="model-source-footer-button model-source-save">{busy ? 'Publicando…' : 'Salvar no original'}</button>
          </div>
        </footer>
      </section>
    </div>
  )
}
