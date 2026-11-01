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
  onPreview: (componentId: string, ratio: number, rotationDegrees: number) => void
  onCommit: (componentId: string, ratio: number, rotationDegrees: number) => void
}

type CutPointerDrag = { pointerId: number; componentId: string; ratio: number; pointerStart: { x: number; y: number } }

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

  const pointAtPointer = (event: ReactPointerEvent<SVGLineElement>): { x: number; y: number } | null => {
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return null
    const bounds = svg.getBoundingClientRect()
    if (!bounds.width || !bounds.height) return null
    return {
      x: (event.clientX - bounds.left) * projectWidth / bounds.width,
      y: (event.clientY - bounds.top) * projectHeight / bounds.height
    }
  }

  const beginDrag = (event: ReactPointerEvent<SVGLineElement>) => {
    if (disabled) return
    event.preventDefault()
    event.stopPropagation()
    const pointerStart = pointAtPointer(event)
    if (!pointerStart || cut.adjustmentSpan <= 0) return
    const distance = (cut.point.x - cut.basePoint.x) * cut.positionAxis.x + (cut.point.y - cut.basePoint.y) * cut.positionAxis.y
    const ratio = cut.adjustmentSpan > 0 ? clampRatio(distance / cut.adjustmentSpan) : 0
    dragRef.current = { pointerId: event.pointerId, componentId, ratio, pointerStart }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: ReactPointerEvent<SVGLineElement>) => {
    if (disabled) return
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const pointer = pointAtPointer(event)
    if (!pointer || cut.adjustmentSpan <= 0) return
    const normalMovement = (pointer.x - drag.pointerStart.x) * cut.axis.x + (pointer.y - drag.pointerStart.y) * cut.axis.y
    const movementAlongPositionAxis = cut.axis.x * cut.positionAxis.x + cut.axis.y * cut.positionAxis.y
    if (Math.abs(movementAlongPositionAxis) < .001) return
    const ratio = clampRatio(drag.ratio + normalMovement / (movementAlongPositionAxis * cut.adjustmentSpan))
    drag.ratio = ratio
    drag.pointerStart = pointer
    onPreview(componentId, ratio, cut.rotationDegrees)
  }

  const finishDrag = (event: ReactPointerEvent<SVGLineElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = null
    onCommit(drag.componentId, drag.ratio, cut.rotationDegrees)
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
  rotationDegrees: number
  scope: 'manga esquerda' | 'manga direita' | 'calça esquerda' | 'calça direita'
  disabled?: boolean
  onPreview: (ratio: number, rotationDegrees: number) => void
  onCommit: (ratio: number, rotationDegrees: number) => void
}

export function WardrobeJointCutPositionControl({
  ratio, rotationDegrees, scope, disabled = false, onPreview, onCommit
}: WardrobeJointCutPositionControlProps) {
  const pendingAdjustmentRef = useRef<{ ratio: number; rotationDegrees: number } | null>(null)
  const preview = (next: { ratio: number; rotationDegrees: number }) => {
    const normalized = { ratio: clampRatio(next.ratio), rotationDegrees: Math.max(-45, Math.min(45, next.rotationDegrees)) }
    pendingAdjustmentRef.current = normalized
    onPreview(normalized.ratio, normalized.rotationDegrees)
  }
  const commit = () => {
    const pending = pendingAdjustmentRef.current
    if (pending === null) return
    pendingAdjustmentRef.current = null
    onCommit(pending.ratio, pending.rotationDegrees)
  }
  const value = Math.round(clampRatio(ratio) * 100)
  const angle = Math.round(Math.max(-45, Math.min(45, rotationDegrees)))

  return <div className="wardrobe-joint-cut-position">
    <span><b>Posição global da linha · {scope}</b><output>{value > 0 ? '+' : ''}{value}%</output></span>
    <input
      aria-label={`Ajuste global da posição da linha de corte para ${scope}`}
      type="range" min="-100" max="100" step="1" value={value} disabled={disabled}
      onChange={(event) => preview({ ratio: Number(event.currentTarget.value) / 100, rotationDegrees: angle })}
      onPointerUp={commit} onPointerCancel={commit} onKeyUp={commit} onBlur={commit}
    />
    <span><b>Rotação global da linha · {scope}</b><output>{angle > 0 ? '+' : ''}{angle}°</output></span>
    <input
      aria-label={`Rotação global da linha de corte para ${scope}`}
      type="range" min="-45" max="45" step="1" value={angle} disabled={disabled}
      onChange={(event) => preview({ ratio: value / 100, rotationDegrees: Number(event.currentTarget.value) })}
      onPointerUp={commit} onPointerCancel={commit} onKeyUp={commit} onBlur={commit}
    />
    <button className="pose-button secondary wardrobe-joint-cut-reset" disabled={disabled || value === 0 && angle === 0} onClick={() => { pendingAdjustmentRef.current = null; onPreview(0, 0); onCommit(0, 0) }} type="button">Voltar ao automático</button>
    <small>Salvo automaticamente e aplicado a todas as {scope === 'manga esquerda' || scope === 'manga direita' ? 'mangas longas' : 'calças longas'} deste lado, atuais e futuras. 0% e 0° usam a junta automática.</small>
  </div>
}
