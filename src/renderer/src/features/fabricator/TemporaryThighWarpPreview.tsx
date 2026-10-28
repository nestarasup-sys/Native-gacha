import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react'
import type { ModelPart } from '../../../../shared/fabricator'
import { applyImageWarpBrush, type ImageWarpPoint } from './models/imageMeshWarp'
import { createModelSourceWarpSession, drawModelSourceWarp, type ModelSourceWarpSession } from './models/modelSourceWarp'

type WarpDrag = {
  pointerId: number
  last: ImageWarpPoint
  originalX: Float32Array
  originalY: Float32Array
  changed: boolean
}

type Props = {
  part: ModelPart
  sourceUrl: string
  className: string
  style: CSSProperties
  active: boolean
  radius: number
  strength: number
  resetToken: number
  toModelPoint: (clientX: number, clientY: number) => ImageWarpPoint | null
  onWarpStateChange: (partId: string, warped: boolean) => void
  onWarpStart: () => void
  onError: (message: string) => void
  onClick: (event: ReactMouseEvent<HTMLElement>) => void
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
}

function modelPointToImagePoint(part: ModelPart, image: HTMLImageElement, point: ImageWarpPoint): ImageWarpPoint {
  const radians = -part.rotation * Math.PI / 180
  const dx = point.x - (part.x + part.width / 2)
  const dy = point.y - (part.y + part.height / 2)
  const localX = dx * Math.cos(radians) - dy * Math.sin(radians) + part.width / 2
  const localY = dx * Math.sin(radians) + dy * Math.cos(radians) + part.height / 2
  return {
    x: localX * image.naturalWidth / Math.max(1, part.width),
    y: localY * image.naturalHeight / Math.max(1, part.height)
  }
}

/** Keeps deformations in an in-memory preview canvas and never writes to the model project. */
export function TemporaryThighWarpPreview({
  part,
  sourceUrl,
  className,
  style,
  active,
  radius,
  strength,
  resetToken,
  toModelPoint,
  onWarpStateChange,
  onWarpStart,
  onError,
  onClick,
  onPointerDown
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sessionRef = useRef<ModelSourceWarpSession | null>(null)
  const dragRef = useRef<WarpDrag | null>(null)
  const drawFrameRef = useRef<number | null>(null)
  const resetTokenRef = useRef(resetToken)
  const warpedRef = useRef(false)
  const [session, setSession] = useState<ModelSourceWarpSession | null>(null)
  const [warped, setWarped] = useState(false)

  useEffect(() => {
    sessionRef.current = null
    dragRef.current = null
    warpedRef.current = false
    setSession(null)
    setWarped(false)
    onWarpStateChange(part.id, false)
  }, [part.id, sourceUrl, onWarpStateChange])

  useEffect(() => {
    if (!active || !sourceUrl || sessionRef.current?.sourceUrl === sourceUrl) return
    let cancelled = false
    void createModelSourceWarpSession(part.id, sourceUrl).then((next) => {
      if (cancelled) return
      sessionRef.current = next
      setSession(next)
    }).catch((reason: unknown) => {
      if (!cancelled) onError(reason instanceof Error ? reason.message : `Não foi possível preparar a deformação de ${part.name}.`)
    })
    return () => { cancelled = true }
  }, [active, onError, part.id, part.name, sourceUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !session) return
    try { drawModelSourceWarp(canvas, session.image, session.mesh) } catch (reason) {
      onError(reason instanceof Error ? reason.message : 'Não foi possível desenhar a deformação temporária.')
    }
  }, [active, onError, session, warped])

  useEffect(() => {
    if (resetTokenRef.current === resetToken) return
    resetTokenRef.current = resetToken
    dragRef.current = null
    const current = sessionRef.current
    if (current) {
      current.mesh.offsetX.fill(0)
      current.mesh.offsetY.fill(0)
      const canvas = canvasRef.current
      if (canvas) {
        try { drawModelSourceWarp(canvas, current.image, current.mesh) } catch (reason) {
          onError(reason instanceof Error ? reason.message : 'Não foi possível restaurar a prévia da coxa.')
        }
      }
    }
    if (warpedRef.current) {
      warpedRef.current = false
      setWarped(false)
      onWarpStateChange(part.id, false)
    }
  }, [onWarpStateChange, part.id, resetToken])

  useEffect(() => () => {
    if (drawFrameRef.current !== null) cancelAnimationFrame(drawFrameRef.current)
    if (warpedRef.current) onWarpStateChange(part.id, false)
  }, [onWarpStateChange, part.id])

  const scheduleDraw = () => {
    if (drawFrameRef.current !== null) return
    drawFrameRef.current = requestAnimationFrame(() => {
      drawFrameRef.current = null
      const current = sessionRef.current
      const canvas = canvasRef.current
      if (current && canvas) {
        try { drawModelSourceWarp(canvas, current.image, current.mesh) } catch (reason) {
          onError(reason instanceof Error ? reason.message : 'Não foi possível desenhar a deformação temporária.')
        }
      }
    })
  }

  const imagePointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>, current: ModelSourceWarpSession) => {
    const modelPoint = toModelPoint(event.clientX, event.clientY)
    return modelPoint ? modelPointToImagePoint(part, current.image, modelPoint) : null
  }

  const beginWarp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const current = sessionRef.current
    if (!active || !current || current.partId !== part.id || event.button !== 0) return
    const point = imagePointFromEvent(event, current)
    if (!point) return
    dragRef.current = {
      pointerId: event.pointerId,
      last: point,
      originalX: new Float32Array(current.mesh.offsetX),
      originalY: new Float32Array(current.mesh.offsetY),
      changed: false
    }
    onWarpStart()
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    event.stopPropagation()
  }

  const moveWarp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    const current = sessionRef.current
    if (!active || !drag || drag.pointerId !== event.pointerId || !current) return
    const point = imagePointFromEvent(event, current)
    if (!point) return
    const delta = { x: point.x - drag.last.x, y: point.y - drag.last.y }
    const distance = Math.hypot(delta.x, delta.y)
    if (distance <= 0.001) return
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.2)))
    const bounds = { x: 0, y: 0, width: current.image.naturalWidth, height: current.image.naturalHeight, rotation: 0 }
    for (let step = 1; step <= steps; step += 1) {
      const previous = { x: drag.last.x + delta.x * ((step - 1) / steps), y: drag.last.y + delta.y * ((step - 1) / steps) }
      const next = { x: drag.last.x + delta.x * (step / steps), y: drag.last.y + delta.y * (step / steps) }
      applyImageWarpBrush(current.mesh, current.image, bounds, next, { x: next.x - previous.x, y: next.y - previous.y }, radius, strength / 100)
    }
    drag.last = point
    drag.changed = true
    event.preventDefault()
    event.stopPropagation()
    scheduleDraw()
  }

  const finishWarp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.type === 'pointerup') moveWarp(event)
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* A captura pode ter sido liberada pelo navegador. */ }
    const current = sessionRef.current
    if (!current) return
    if (event.type === 'pointercancel') {
      current.mesh.offsetX.set(drag.originalX)
      current.mesh.offsetY.set(drag.originalY)
      scheduleDraw()
      return
    }
    if (!drag.changed) return
    warpedRef.current = true
    setWarped(true)
    onWarpStateChange(part.id, true)
  }

  if ((active || warped) && session?.sourceUrl === sourceUrl) {
    return <canvas
      ref={canvasRef}
      className={`${className} temporary-thigh-warp${active ? ' editing' : ''}`}
      aria-label={active ? `Arraste para deformar temporariamente ${part.name}` : `Prévia temporária de ${part.name}`}
      title={active ? 'Arraste para deformar esta coxa. Use o botão ↶ para voltar ao normal.' : part.name}
      onClick={onClick}
      onPointerDown={beginWarp}
      onPointerMove={moveWarp}
      onPointerUp={finishWarp}
      onPointerCancel={finishWarp}
      style={style}
    />
  }

  return <img
    className={`${className}${active ? ' temporary-thigh-warp-loading' : ''}`}
    src={sourceUrl}
    alt={part.name}
    draggable={false}
    onClick={onClick}
    onPointerDown={onPointerDown}
    style={style}
  />
}
