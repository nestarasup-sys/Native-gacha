import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../../../ui/components/Icon'
import type { WardrobeComponent } from '../../../../../shared/fabricator'

type GarmentFrame = Pick<WardrobeComponent, 'x' | 'y' | 'width' | 'height' | 'rotation'>
type BodyReference = GarmentFrame & { name: string; dataUrl: string }
type Props = {
  component: WardrobeComponent
  bodyReference?: BodyReference
  onClose: () => void
  onApply: (dataUrl: string) => void
}
type Tool = 'erase' | 'restore' | 'sample'
type Adjustments = { brightness: number; contrast: number; saturation: number }
type Snapshot = { image: string; adjustments: Adjustments }
type Point = { x: number; y: number }
type StagePoint = Point & { screenX: number; screenY: number }
type Stroke = { pointerId: number; last: Point; before: Snapshot; changed: boolean }
type StageSize = { width: number; height: number }
type Color = { r: number; g: number; b: number }

const DEFAULT_ADJUSTMENTS: Adjustments = { brightness: 0, contrast: 0, saturation: 100 }
const MAX_UNDO_STEPS = 8
const MAX_COLOR_EDIT_PIXELS = 6_000_000

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível carregar a imagem da roupa.'))
    image.src = dataUrl
    if (image.complete && image.naturalWidth > 0) resolve(image)
  })
}

function rotateBounds(frame: GarmentFrame) {
  const radians = frame.rotation * Math.PI / 180
  const width = Math.abs(frame.width * Math.cos(radians)) + Math.abs(frame.height * Math.sin(radians))
  const height = Math.abs(frame.width * Math.sin(radians)) + Math.abs(frame.height * Math.cos(radians))
  const centerX = frame.x + frame.width / 2
  const centerY = frame.y + frame.height / 2
  return { left: centerX - width / 2, top: centerY - height / 2, right: centerX + width / 2, bottom: centerY + height / 2 }
}

function parseColor(hex: string): Color | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!match) return null
  const value = match[1]
  return { r: Number.parseInt(value.slice(0, 2), 16), g: Number.parseInt(value.slice(2, 4), 16), b: Number.parseInt(value.slice(4, 6), 16) }
}

function colorDistance(data: Uint8ClampedArray, index: number, color: Color): number {
  const dr = data[index] - color.r
  const dg = data[index + 1] - color.g
  const db = data[index + 2] - color.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function cssFilter(adjustments: Adjustments): string {
  const brightness = Math.max(0, 1 + adjustments.brightness / 100)
  const contrast = Math.max(0, 1 + adjustments.contrast / 100)
  return `brightness(${brightness}) contrast(${contrast}) saturate(${Math.max(0, adjustments.saturation) / 100})`
}

export function WardrobeGarmentEditorModal({ component, bodyReference, onClose, onApply }: Props) {
  const [tool, setTool] = useState<Tool>('erase')
  const [brushSize, setBrushSize] = useState(34)
  const [brushStrength, setBrushStrength] = useState(100)
  const [tolerance, setTolerance] = useState(38)
  const [softness, setSoftness] = useState(18)
  const [sampledColor, setSampledColor] = useState<string | null>(null)
  const [onlyBorder, setOnlyBorder] = useState(true)
  const [showBodyReference, setShowBodyReference] = useState(false)
  const [bodyOpacity, setBodyOpacity] = useState(28)
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS)
  const [zoom, setZoom] = useState(1)
  const [stageSize, setStageSize] = useState<StageSize>({ width: 0, height: 0 })
  const [ready, setReady] = useState(false)
  const [bodyReferenceLoaded, setBodyReferenceLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('A roupa será editada sem alterar a parte corporal.')
  const [historyRevision, setHistoryRevision] = useState(0)
  const workingCanvasRef = useRef<HTMLCanvasElement>(null)
  const stageCanvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const originalImageRef = useRef<HTMLImageElement | null>(null)
  const bodyImageRef = useRef<HTMLImageElement | null>(null)
  const strokeRef = useRef<Stroke | null>(null)
  const hoverRef = useRef<StagePoint | null>(null)
  const historyRef = useRef<{ undo: Snapshot[]; redo: Snapshot[] }>({ undo: [], redo: [] })
  const adjustmentBeforeRef = useRef<Snapshot | null>(null)

  const sceneBounds = useMemo(() => {
    const garment = rotateBounds(component)
    const body = showBodyReference && bodyReference ? rotateBounds(bodyReference) : null
    if (!body) return garment
    return { left: Math.min(garment.left, body.left), top: Math.min(garment.top, body.top), right: Math.max(garment.right, body.right), bottom: Math.max(garment.bottom, body.bottom) }
  }, [component, bodyReference, showBodyReference])
  const view = useMemo(() => {
    const width = Math.max(1, sceneBounds.right - sceneBounds.left)
    const height = Math.max(1, sceneBounds.bottom - sceneBounds.top)
    const fitScale = Math.min(Math.max(1, stageSize.width - 72) / width, Math.max(1, stageSize.height - 72) / height)
    return { centerX: (sceneBounds.left + sceneBounds.right) / 2, centerY: (sceneBounds.top + sceneBounds.bottom) / 2, scale: fitScale * zoom }
  }, [sceneBounds, stageSize, zoom])

  const captureSnapshot = useCallback((): Snapshot | null => {
    const canvas = workingCanvasRef.current
    if (!canvas) return null
    return { image: canvas.toDataURL('image/png'), adjustments: { ...adjustments } }
  }, [adjustments])

  const recordEdit = useCallback((before: Snapshot | null, afterOverride?: Snapshot) => {
    const after = afterOverride ?? captureSnapshot()
    if (!before || !after || (before.image === after.image && before.adjustments.brightness === after.adjustments.brightness && before.adjustments.contrast === after.adjustments.contrast && before.adjustments.saturation === after.adjustments.saturation)) return
    historyRef.current.undo = [...historyRef.current.undo.slice(-(MAX_UNDO_STEPS - 1)), before]
    historyRef.current.redo = []
    setHistoryRevision((value) => value + 1)
  }, [captureSnapshot])

  const restoreSnapshot = useCallback(async (snapshot: Snapshot) => {
    setBusy(true)
    try {
      const image = await loadImage(snapshot.image)
      const canvas = workingCanvasRef.current
      const context = canvas?.getContext('2d')
      if (!canvas || !context) return
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      setAdjustments(snapshot.adjustments)
      setMessage('Edição restaurada.')
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Não foi possível restaurar a edição.')
    } finally { setBusy(false) }
  }, [])

  const drawStage = useCallback(() => {
    const canvas = stageCanvasRef.current
    const original = originalImageRef.current
    const working = workingCanvasRef.current
    if (!canvas || !working || !ready || !stageSize.width || !stageSize.height) return
    const ratio = Math.max(1, window.devicePixelRatio || 1)
    const pixelWidth = Math.max(1, Math.round(stageSize.width * ratio))
    const pixelHeight = Math.max(1, Math.round(stageSize.height * ratio))
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight }
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, stageSize.width, stageSize.height)

    const drawWorldImage = (image: CanvasImageSource, frame: GarmentFrame, opacity: number, filter = 'none') => {
      const centerX = stageSize.width / 2 + (frame.x + frame.width / 2 - view.centerX) * view.scale
      const centerY = stageSize.height / 2 + (frame.y + frame.height / 2 - view.centerY) * view.scale
      context.save()
      context.globalAlpha = opacity
      context.filter = filter
      context.translate(centerX, centerY)
      context.rotate(frame.rotation * Math.PI / 180)
      context.drawImage(image, -frame.width * view.scale / 2, -frame.height * view.scale / 2, frame.width * view.scale, frame.height * view.scale)
      context.restore()
    }

    if (showBodyReference && bodyReferenceLoaded && bodyReference && bodyImageRef.current) drawWorldImage(bodyImageRef.current, bodyReference, bodyOpacity / 100)
    if (original) drawWorldImage(working, component, 1, cssFilter(adjustments))

    const hover = hoverRef.current
    if (hover && hover.x >= 0 && hover.y >= 0 && hover.x < working.width && hover.y < working.height && (tool === 'erase' || tool === 'restore')) {
      const radiusX = brushSize / 2 * component.width / working.width * view.scale
      const radiusY = brushSize / 2 * component.height / working.height * view.scale
      context.save()
      context.translate(hover.screenX, hover.screenY)
      context.rotate(component.rotation * Math.PI / 180)
      context.beginPath()
      context.ellipse(0, 0, Math.max(1, radiusX), Math.max(1, radiusY), 0, 0, Math.PI * 2)
      context.fillStyle = tool === 'erase' ? '#df477b24' : '#4383d524'
      context.strokeStyle = tool === 'erase' ? '#c83d70' : '#3874be'
      context.lineWidth = 1.25
      context.fill()
      context.stroke()
      context.restore()
    }
  }, [ready, bodyReferenceLoaded, stageSize, view, showBodyReference, bodyReference, bodyOpacity, component, adjustments, tool, brushSize])

  useEffect(() => {
    let active = true
    setReady(false)
    originalImageRef.current = null
    historyRef.current = { undo: [], redo: [] }
    setHistoryRevision((value) => value + 1)
    void loadImage(component.dataUrl).then((image) => {
      if (!active) return
      const canvas = workingCanvasRef.current
      const context = canvas?.getContext('2d', { willReadFrequently: true })
      if (!canvas || !context) throw new Error('Não foi possível preparar a imagem para edição.')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0)
      originalImageRef.current = image
      setAdjustments(DEFAULT_ADJUSTMENTS)
      setSampledColor(null)
      setReady(true)
      setMessage('Use a borracha para apagar ou restaure partes da imagem original.')
    }).catch((reason: unknown) => { if (active) setMessage(reason instanceof Error ? reason.message : 'Não foi possível carregar a roupa.') })
    return () => { active = false }
  }, [component.id, component.dataUrl])

  useEffect(() => {
    let active = true
    bodyImageRef.current = null
    setBodyReferenceLoaded(false)
    if (!bodyReference) return
    void loadImage(bodyReference.dataUrl).then((image) => {
      if (active) { bodyImageRef.current = image; setBodyReferenceLoaded(true) }
    }).catch(() => { if (active) setMessage('A roupa está pronta; não foi possível carregar a referência corporal.') })
    return () => { active = false }
  }, [bodyReference?.dataUrl])

  useEffect(() => {
    const element = stageRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => { drawStage() }, [drawStage])

  const screenToImagePoint = (event: ReactPointerEvent<HTMLCanvasElement>): StagePoint | null => {
    const canvas = stageCanvasRef.current
    const working = workingCanvasRef.current
    if (!canvas || !working || view.scale <= 0) return null
    const rect = canvas.getBoundingClientRect()
    const screenX = event.clientX - rect.left
    const screenY = event.clientY - rect.top
    const worldX = (screenX - stageSize.width / 2) / view.scale + view.centerX
    const worldY = (screenY - stageSize.height / 2) / view.scale + view.centerY
    const dx = worldX - (component.x + component.width / 2)
    const dy = worldY - (component.y + component.height / 2)
    const radians = component.rotation * Math.PI / 180
    const localX = dx * Math.cos(radians) + dy * Math.sin(radians)
    const localY = -dx * Math.sin(radians) + dy * Math.cos(radians)
    return { x: (localX / component.width + 0.5) * working.width, y: (localY / component.height + 0.5) * working.height, screenX, screenY }
  }

  const snapshotStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault()
    if (!ready || busy || event.button !== 0) return
    const point = screenToImagePoint(event)
    const working = workingCanvasRef.current
    if (!point || !working || point.x < 0 || point.y < 0 || point.x >= working.width || point.y >= working.height) return
    if (tool === 'sample') {
      event.stopPropagation()
      const context = working.getContext('2d', { willReadFrequently: true })
      if (!context) return
      const sample = context.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data
      if (sample[3] < 24) { setMessage('Esse ponto é transparente. Escolha uma cor visível da borda ou do contorno.'); return }
      const hex = `#${[sample[0], sample[1], sample[2]].map((value) => value.toString(16).padStart(2, '0')).join('')}`
      setSampledColor(hex)
      setTool('erase')
      setMessage(`Cor ${hex.toUpperCase()} selecionada. Use “Remover cor” para limpar a borda.`)
      return
    }
    if (event.button !== 0) return
    const before = captureSnapshot()
    if (!before) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const stroke: Stroke = { pointerId: event.pointerId, last: point, before, changed: false }
    strokeRef.current = stroke
    hoverRef.current = point.x >= 0 && point.y >= 0 && point.x < working.width && point.y < working.height ? point : null
    const context = working.getContext('2d')
    if (context) { paintSegment(context, point, point, tool); stroke.changed = true }
    drawStage()
  }

  const paintSegment = (context: CanvasRenderingContext2D, from: Point, to: Point, mode: 'erase' | 'restore') => {
    const original = originalImageRef.current
    const working = workingCanvasRef.current
    if (!working || (mode === 'restore' && !original)) return
    const radius = Math.max(1, brushSize / 2)
    const distance = Math.hypot(to.x - from.x, to.y - from.y)
    if (mode === 'erase') {
      context.save()
      context.globalCompositeOperation = 'destination-out'
      context.globalAlpha = brushStrength / 100
      context.lineWidth = radius * 2
      context.lineCap = 'round'
      context.lineJoin = 'round'
      context.strokeStyle = '#000'
      context.beginPath()
      context.moveTo(from.x, from.y)
      context.lineTo(to.x, to.y)
      context.stroke()
      context.restore()
      return
    }
    const steps = Math.max(1, Math.min(2048, Math.ceil(distance / Math.max(1, radius * 0.2))))
    context.save()
    context.globalAlpha = brushStrength / 100
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps
      const x = from.x + (to.x - from.x) * t
      const y = from.y + (to.y - from.y) * t
      context.globalCompositeOperation = 'source-over'
      context.save()
      context.beginPath()
      context.arc(x, y, radius, 0, Math.PI * 2)
      context.clip()
      context.drawImage(original!, x - radius, y - radius, radius * 2, radius * 2, x - radius, y - radius, radius * 2, radius * 2)
      context.restore()
    }
    context.restore()
  }

  const moveStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = screenToImagePoint(event)
    const stroke = strokeRef.current
    if (!point) return
    const working = workingCanvasRef.current
    hoverRef.current = working && point.x >= 0 && point.y >= 0 && point.x < working.width && point.y < working.height ? point : null
    if (stroke && stroke.pointerId === event.pointerId) {
      event.preventDefault()
      event.stopPropagation()
      const working = workingCanvasRef.current
      const context = working?.getContext('2d')
      if (working && context) {
        paintSegment(context, stroke.last, point, tool === 'restore' ? 'restore' : 'erase')
        stroke.last = point
        stroke.changed = true
      }
    }
    drawStage()
  }

  const finishStroke = (event: ReactPointerEvent<HTMLCanvasElement>, cancel = false) => {
    const stroke = strokeRef.current
    if (!stroke || stroke.pointerId !== event.pointerId) return
    if (!cancel && event.type === 'pointerup') {
      const point = screenToImagePoint(event)
      const context = workingCanvasRef.current?.getContext('2d')
      if (point && context && Math.hypot(point.x - stroke.last.x, point.y - stroke.last.y) > 0.01) {
        paintSegment(context, stroke.last, point, tool === 'restore' ? 'restore' : 'erase')
        stroke.changed = true
      }
    }
    strokeRef.current = null
    try { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* Chromium may already have released capture. */ }
    if (cancel) {
      void restoreSnapshot(stroke.before)
      return
    }
    if (stroke.changed) recordEdit(stroke.before)
    drawStage()
  }

  const undo = useCallback(async () => {
    const snapshot = historyRef.current.undo.pop()
    if (!snapshot) return
    const current = captureSnapshot()
    if (current) historyRef.current.redo = [...historyRef.current.redo.slice(-(MAX_UNDO_STEPS - 1)), current]
    setHistoryRevision((value) => value + 1)
    await restoreSnapshot(snapshot)
  }, [captureSnapshot, restoreSnapshot])

  const redo = useCallback(async () => {
    const snapshot = historyRef.current.redo.pop()
    if (!snapshot) return
    const current = captureSnapshot()
    if (current) historyRef.current.undo = [...historyRef.current.undo.slice(-(MAX_UNDO_STEPS - 1)), current]
    setHistoryRevision((value) => value + 1)
    await restoreSnapshot(snapshot)
  }, [captureSnapshot, restoreSnapshot])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) { onClose(); return }
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || busy) return
      event.preventDefault()
      if (event.shiftKey) void redo()
      else void undo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose, redo, undo])

  const removeSampledColor = () => {
    const color = sampledColor ? parseColor(sampledColor) : null
    const canvas = workingCanvasRef.current
    const context = canvas?.getContext('2d', { willReadFrequently: true })
    if (!color || !canvas || !context || busy) return
    if (canvas.width * canvas.height > MAX_COLOR_EDIT_PIXELS) {
      setMessage('A remoção por cor está limitada a imagens de até 6 megapixels para evitar travamentos. Use a borracha nesta peça.')
      return
    }
    const before = captureSnapshot()
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    const { data } = image
    const count = canvas.width * canvas.height
    const threshold = tolerance
    const softBand = softness
    let changed = 0
    const removeAt = (pixel: number) => {
      const index = pixel * 4
      if (data[index + 3] === 0) return false
      const distance = colorDistance(data, index, color)
      if (distance > threshold + softBand) return false
      const coverage = distance <= threshold || softBand === 0 ? 1 : (threshold + softBand - distance) / softBand
      const nextAlpha = Math.round(data[index + 3] * (1 - coverage))
      if (nextAlpha !== data[index + 3]) { data[index + 3] = nextAlpha; changed += 1 }
      return true
    }

    if (onlyBorder) {
      const visited = new Uint8Array(count)
      const queue = new Uint32Array(count)
      let read = 0
      let write = 0
      const enqueue = (pixel: number) => {
        if (visited[pixel] || data[pixel * 4 + 3] === 0) return
        visited[pixel] = 1
        if (colorDistance(data, pixel * 4, color) <= threshold + softBand) queue[write++] = pixel
      }
      for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
        const pixel = y * canvas.width + x
        if (data[pixel * 4 + 3] === 0) continue
        const touchesTransparent = x === 0 || y === 0 || x === canvas.width - 1 || y === canvas.height - 1
          || data[(pixel - 1) * 4 + 3] === 0
          || data[(pixel + 1) * 4 + 3] === 0
          || data[(pixel - canvas.width) * 4 + 3] === 0
          || data[(pixel + canvas.width) * 4 + 3] === 0
        if (touchesTransparent) enqueue(pixel)
      }
      while (read < write) {
        const pixel = queue[read++]
        removeAt(pixel)
        const x = pixel % canvas.width
        const y = Math.floor(pixel / canvas.width)
        if (x > 0) enqueue(pixel - 1)
        if (x + 1 < canvas.width) enqueue(pixel + 1)
        if (y > 0) enqueue(pixel - canvas.width)
        if (y + 1 < canvas.height) enqueue(pixel + canvas.width)
      }
    } else {
      for (let pixel = 0; pixel < count; pixel += 1) removeAt(pixel)
    }

    if (!changed) { setMessage('Não encontrei essa cor nessa região. Ajuste a tolerância ou escolha outro ponto.'); return }
    context.putImageData(image, 0, 0)
    recordEdit(before)
    setMessage(`${changed.toLocaleString('pt-BR')} pixels suavizados. Desfaça se o resultado remover detalhes demais.`)
    drawStage()
  }

  const restoreOriginal = () => {
    const original = originalImageRef.current
    const canvas = workingCanvasRef.current
    const context = canvas?.getContext('2d')
    if (!original || !canvas || !context || busy) return
    const before = captureSnapshot()
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(original, 0, 0, canvas.width, canvas.height)
    setAdjustments(DEFAULT_ADJUSTMENTS)
    recordEdit(before, { image: canvas.toDataURL('image/png'), adjustments: DEFAULT_ADJUSTMENTS })
    setMessage('Imagem restaurada ao arquivo original. Você ainda precisa aplicar ou cancelar o modal.')
    drawStage()
  }

  const beginAdjustment = () => { if (!adjustmentBeforeRef.current) adjustmentBeforeRef.current = captureSnapshot() }
  const updateAdjustment = (field: keyof Adjustments, value: number) => {
    beginAdjustment()
    setAdjustments((current) => ({ ...current, [field]: value }))
  }
  const finishAdjustment = () => {
    const before = adjustmentBeforeRef.current
    adjustmentBeforeRef.current = null
    if (before) recordEdit(before)
  }

  const apply = () => {
    const working = workingCanvasRef.current
    if (!working || !ready || busy) return
    const unchanged = historyRef.current.undo.length === 0
      && adjustments.brightness === DEFAULT_ADJUSTMENTS.brightness
      && adjustments.contrast === DEFAULT_ADJUSTMENTS.contrast
      && adjustments.saturation === DEFAULT_ADJUSTMENTS.saturation
    if (unchanged) { onApply(component.dataUrl); return }
    setBusy(true)
    try {
      const output = document.createElement('canvas')
      output.width = working.width
      output.height = working.height
      const context = output.getContext('2d')
      if (!context) throw new Error('Não foi possível finalizar a imagem da roupa.')
      context.filter = cssFilter(adjustments)
      context.drawImage(working, 0, 0)
      context.filter = 'none'
      onApply(output.toDataURL('image/png'))
    } catch (reason) {
      setBusy(false)
      setMessage(reason instanceof Error ? reason.message : 'Não foi possível aplicar as alterações.')
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => moveStroke(event)
  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => snapshotStroke(event)
  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => finishStroke(event)
  const handlePointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => finishStroke(event, true)
  const hasUndo = historyRef.current.undo.length > 0
  const hasRedo = historyRef.current.redo.length > 0

  return createPortal(<div className="wardrobe-image-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="wardrobe-image-editor" data-history-version={historyRevision} role="dialog" aria-modal="true" aria-labelledby="wardrobe-image-editor-title">
      <header className="wardrobe-image-editor-header">
        <div className="wardrobe-image-editor-title"><span className="wardrobe-image-editor-icon"><Icon name="edit" /></span><span><small>EDIÇÃO DA PEÇA</small><strong id="wardrobe-image-editor-title">{component.name}</strong><em>Alterações só entram no conjunto ao clicar em Aplicar.</em></span></div>
        <button type="button" className="wardrobe-image-editor-close" aria-label="Fechar editor" disabled={busy} onClick={onClose}>×</button>
      </header>
      <div className="wardrobe-image-editor-toolbar">
        <div className="wardrobe-image-editor-tools" role="toolbar" aria-label="Ferramentas da roupa">
          <button type="button" className={tool === 'erase' ? 'active' : ''} aria-pressed={tool === 'erase'} disabled={!ready || busy} onClick={() => setTool('erase')}><Icon name="eraser" /> Borracha</button>
          <button type="button" className={tool === 'restore' ? 'active' : ''} aria-pressed={tool === 'restore'} disabled={!ready || busy} onClick={() => setTool('restore')}><Icon name="reset" /> Restaurar</button>
          <button type="button" className={tool === 'sample' ? 'active' : ''} aria-pressed={tool === 'sample'} disabled={!ready || busy} onClick={() => { setTool('sample'); setMessage('Clique na cor de contorno que deseja remover.') }}><Icon name="eye" /> Conta-gotas</button>
        </div>
        <div className="wardrobe-image-editor-history">
          <button type="button" title="Desfazer (Ctrl+Z)" aria-label="Desfazer" disabled={!hasUndo || busy} onClick={() => void undo()}><Icon name="undo" /></button>
          <button type="button" title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer" disabled={!hasRedo || busy} onClick={() => void redo()}><Icon name="redo" /></button>
          <button type="button" className="wardrobe-image-editor-reset" disabled={!ready || busy} onClick={restoreOriginal}><Icon name="reset" /> Original</button>
        </div>
      </div>
      <div className="wardrobe-image-editor-layout">
        <aside className="wardrobe-image-editor-sidebar">
          <section className="wardrobe-image-editor-section">
            <h3>Retoque</h3>
            <label className="wardrobe-image-editor-range"><span><b>Tamanho do pincel</b><output>{brushSize}px</output></span><input type="range" min="4" max="160" step="1" value={brushSize} disabled={!ready || busy} onChange={(event) => setBrushSize(Number(event.target.value))} /></label>
            <label className="wardrobe-image-editor-range"><span><b>Força</b><output>{brushStrength}%</output></span><input type="range" min="10" max="100" step="1" value={brushStrength} disabled={!ready || busy} onChange={(event) => setBrushStrength(Number(event.target.value))} /></label>
            <small className="wardrobe-image-editor-help">Apague a borda com a borracha ou pinte de volta a partir da imagem original.</small>
          </section>
          <section className="wardrobe-image-editor-section">
            <h3>Remover contorno por cor</h3>
            <div className="wardrobe-image-editor-color-row"><input type="color" aria-label="Cor do contorno a remover" value={sampledColor ?? '#1e1b20'} onChange={(event) => setSampledColor(event.target.value)} disabled={!ready || busy} /><span>{sampledColor ? sampledColor.toUpperCase() : 'Escolha uma cor com o conta-gotas'}</span></div>
            <label className="wardrobe-image-editor-check"><input type="checkbox" checked={onlyBorder} disabled={!ready || busy} onChange={(event) => setOnlyBorder(event.target.checked)} /><span>Só áreas ligadas à transparência</span></label>
            <label className="wardrobe-image-editor-range"><span><b>Tolerância</b><output>{tolerance}</output></span><input type="range" min="0" max="150" step="1" value={tolerance} disabled={!ready || busy} onChange={(event) => setTolerance(Number(event.target.value))} /></label>
            <label className="wardrobe-image-editor-range"><span><b>Suavização</b><output>{softness}</output></span><input type="range" min="0" max="100" step="1" value={softness} disabled={!ready || busy} onChange={(event) => setSoftness(Number(event.target.value))} /></label>
            <button className="wardrobe-image-editor-color-remove" type="button" disabled={!ready || busy || !sampledColor} onClick={removeSampledColor}><Icon name="eraser" /> Remover cor selecionada</button>
            <small className="wardrobe-image-editor-help">Essa opção mira bordas de fundo e contorno ao lado da transparência. Desmarque para tirar a cor também de dentro da peça.</small>
          </section>
          <section className="wardrobe-image-editor-section">
            <h3>Ajustes de imagem</h3>
            {([['brightness', 'Brilho', -100, 100], ['contrast', 'Contraste', -80, 100], ['saturation', 'Saturação', 0, 200]] as const).map(([field, label, min, max]) => <label className="wardrobe-image-editor-range" key={field}><span><b>{label}</b><output>{adjustments[field]}{field === 'saturation' ? '%' : ''}</output></span><input type="range" min={min} max={max} step="1" value={adjustments[field]} disabled={!ready || busy} onPointerDown={beginAdjustment} onPointerUp={finishAdjustment} onPointerCancel={finishAdjustment} onKeyDown={beginAdjustment} onKeyUp={finishAdjustment} onBlur={finishAdjustment} onChange={(event) => updateAdjustment(field, Number(event.target.value))} /></label>)}
          </section>
          <section className="wardrobe-image-editor-section wardrobe-image-editor-reference">
            <h3>Referência corporal</h3>
            <label className="wardrobe-image-editor-check"><input type="checkbox" checked={showBodyReference} disabled={!bodyReference || busy} onChange={(event) => setShowBodyReference(event.target.checked)} /><span>Mostrar “{bodyReference?.name ?? 'parte correspondente'}”</span></label>
            {showBodyReference && bodyReference && <label className="wardrobe-image-editor-range"><span><b>Opacidade da referência</b><output>{bodyOpacity}%</output></span><input type="range" min="8" max="60" step="1" value={bodyOpacity} onChange={(event) => setBodyOpacity(Number(event.target.value))} /></label>}
            {!bodyReference && <small className="wardrobe-image-editor-help">Selecione uma parte correspondente no painel da peça para poder mostrá-la aqui.</small>}
            <small className="wardrobe-image-editor-help">A parte corporal é apenas uma guia visual; ela nunca é editada nem incluída na imagem da roupa.</small>
          </section>
        </aside>
        <div className="wardrobe-image-editor-stage-column">
          <div ref={stageRef} className={`wardrobe-image-editor-stage${tool === 'sample' ? ' sampling' : ''}`}>
            <canvas ref={stageCanvasRef} aria-label="Prévia da roupa e área de edição" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerCancel} onLostPointerCapture={handlePointerCancel} onPointerLeave={() => { if (!strokeRef.current) { hoverRef.current = null; drawStage() } }} />
            {!ready && <div className="wardrobe-image-editor-loading"><span className="model-spinner" />Carregando a imagem…</div>}
          </div>
          <div className="wardrobe-image-editor-stage-footer"><span role="status">{message}</span><div><button type="button" title="Encaixar a roupa na prévia" onClick={() => setZoom(1)}>Encaixar</button><button type="button" aria-label="Diminuir zoom" disabled={zoom <= 0.35} onClick={() => setZoom((value) => Math.max(0.35, value - 0.15))}>−</button><output>{Math.round(zoom * 100)}%</output><button type="button" aria-label="Aumentar zoom" disabled={zoom >= 3.5} onClick={() => setZoom((value) => Math.min(3.5, value + 0.15))}>+</button></div></div>
        </div>
      </div>
      <footer className="wardrobe-image-editor-footer"><span>A parte corporal não será alterada. Salve o conjunto depois de aplicar.</span><div><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="primary" disabled={!ready || busy} onClick={apply}>{busy ? 'Aplicando…' : 'Aplicar alterações'}</button></div></footer>
      <canvas ref={workingCanvasRef} className="wardrobe-image-editor-working-canvas" aria-hidden="true" />
    </section>
  </div>, document.body)
}
