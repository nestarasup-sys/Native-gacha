import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { WardrobeJointCut } from './wardrobeJointAssembly'

type WardrobeJointCutGuideProps = {
  cut: WardrobeJointCut
  componentId: string
  projectWidth: number
  projectHeight: number
  scale: number
  lineLength: number
  disabled?: boolean
  onPreview: (componentId: string, ratio: number) => void
  onCommit: (componentId: string, ratio: number) => void
}

type CutPointerDrag = { pointerId: number; componentId: string; ratio: number }

function clampRatio(value: number): number {
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0
}

export function WardrobeJointCutGuide({
  cut, componentId, projectWidth, projectHeight, scale, lineLength, disabled = false, onPreview, onCommit
}: WardrobeJointCutGuideProps) {
  const dragRef = useRef<CutPointerDrag | null>(null)
  const x1 = (cut.point.x - cut.tangent.x * lineLength) * scale
  const y1 = (cut.point.y - cut.tangent.y * lineLength) * scale
  const x2 = (cut.point.x + cut.tangent.x * lineLength) * scale
  const y2 = (cut.point.y + cut.tangent.y * lineLength) * scale

  const ratioAtPointer = (event: ReactPointerEvent<SVGLineElement>): number | null => {
    const svg = event.currentTarget.ownerSVGElement
    if (!svg || cut.adjustmentSpan <= 0) return null
    const bounds = svg.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return null
    const point = {
      x: (event.clientX - bounds.left) * projectWidth / bounds.width,
      y: (event.clientY - bounds.top) * projectHeight / bounds.height
    }
    const distance = (point.x - cut.basePoint.x) * cut.axis.x + (point.y - cut.basePoint.y) * cut.axis.y
    return clampRatio(distance / cut.adjustmentSpan)
  }

  const beginDrag = (event: ReactPointerEvent<SVGLineElement>) => {
    if (disabled) return
    event.preventDefault()
    event.stopPropagation()
    const distance = (cut.point.x - cut.basePoint.x) * cut.axis.x + (cut.point.y - cut.basePoint.y) * cut.axis.y
    const ratio = cut.adjustmentSpan > 0 ? clampRatio(distance / cut.adjustmentSpan) : 0
    dragRef.current = { pointerId: event.pointerId, componentId, ratio }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: ReactPointerEvent<SVGLineElement>) => {
    if (disabled) return
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const ratio = ratioAtPointer(event)
    if (ratio === null) return
    drag.ratio = ratio
    onPreview(componentId, ratio)
  }

  const finishDrag = (event: ReactPointerEvent<SVGLineElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = null
    onCommit(drag.componentId, drag.ratio)
  }

  return <svg aria-label="Linha de corte ajustável" className="wardrobe-joint-cut-guide" width={projectWidth * scale} height={projectHeight * scale}>
    <line
      className={`wardrobe-joint-cut-hit-target${disabled ? ' disabled' : ''}`}
      x1={x1} y1={y1} x2={x2} y2={y2}
      onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag}
    />
    <line className="wardrobe-joint-cut-visible" x1={x1} y1={y1} x2={x2} y2={y2} />
    <circle className="wardrobe-joint-cut-handle" cx={cut.point.x * scale} cy={cut.point.y * scale} r="7" />
  </svg>
}

type WardrobeJointCutPositionControlProps = {
  ratio: number
  disabled?: boolean
  onPreview: (ratio: number) => void
  onCommit: (ratio: number) => void
}

export function WardrobeJointCutPositionControl({ ratio, disabled = false, onPreview, onCommit }: WardrobeJointCutPositionControlProps) {
  const pendingRatioRef = useRef<number | null>(null)
  const preview = (value: number) => {
    const next = clampRatio(value)
    pendingRatioRef.current = next
    onPreview(next)
  }
  const commit = () => {
    const pending = pendingRatioRef.current
    if (pending === null) return
    pendingRatioRef.current = null
    onCommit(pending)
  }
  const value = Math.round(clampRatio(ratio) * 100)

  return <div className="wardrobe-joint-cut-position">
    <span><b>Ajuste da linha</b><output>{value > 0 ? '+' : ''}{value}%</output></span>
    <input
      aria-label="Ajuste manual da posição da linha de corte"
      type="range" min="-100" max="100" step="1" value={value} disabled={disabled}
      onChange={(event) => preview(Number(event.currentTarget.value) / 100)}
      onPointerUp={commit} onPointerCancel={commit} onKeyUp={commit} onBlur={commit}
    />
    <button className="pose-button secondary wardrobe-joint-cut-reset" disabled={disabled || value === 0} onClick={() => { pendingRatioRef.current = null; onPreview(0); onCommit(0) }} type="button">Voltar ao automático</button>
    <small>0% marca o fim automático da peça superior. Arraste a linha ou use o controle; salve o conjunto para guardar o ajuste.</small>
  </div>
}
