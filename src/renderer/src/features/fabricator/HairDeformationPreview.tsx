import { useEffect, useRef, useState, type PointerEvent, type CSSProperties } from 'react'
import type { HairTransform, ModelPart } from '../../../../shared/fabricator'
import type { HairAssetSide } from '../../../../shared/hairCategories'
import { applyImageWarpBrush, createImageWarpMesh, drawImageWarp, imageWarpPadding, type ImageWarpMesh, type ImageWarpPoint } from './models/imageMeshWarp'
import type { HairWorkspace } from '../../../../shared/fabricator'

type HairAsset = NonNullable<HairWorkspace['front']>
type HairWarpSession = { sourceUrl: string; committedUrl: string; image: HTMLImageElement; mesh: ImageWarpMesh }
type HairWarpDrag = { pointerId: number; last: ImageWarpPoint; originalX: Float32Array; originalY: Float32Array; changed: boolean }

type Props = {
  side: HairAssetSide
  asset: HairAsset
  transform: HairTransform
  head: ModelPart
  active: boolean
  radius: number
  strength: number
  disabled: boolean
  onReadyChange: (ready: boolean) => void
  onCommit: (result: { dataUrl: string; width: number; height: number }) => void
  onError: (message: string) => void
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Não foi possível preparar o cabelo para deformação.'))
    image.src = source
    if (image.complete && image.naturalWidth > 0) resolve(image)
  })
}

function reflectedPoint(point: ImageWarpPoint, center: ImageWarpPoint, rotation: number, flipX: boolean): ImageWarpPoint {
  if (!flipX) return point
  const radians = rotation * Math.PI / 180
  const cos = Math.cos(radians), sin = Math.sin(radians)
  const dx = point.x - center.x, dy = point.y - center.y
  const localX = -(dx * cos + dy * sin)
  const localY = -dx * sin + dy * cos
  return { x: center.x + localX * cos - localY * sin, y: center.y + localX * sin + localY * cos }
}

function reflectedDelta(delta: ImageWarpPoint, rotation: number, flipX: boolean): ImageWarpPoint {
  if (!flipX) return delta
  const radians = rotation * Math.PI / 180
  const cos = Math.cos(radians), sin = Math.sin(radians)
  const localX = -(delta.x * cos + delta.y * sin)
  const localY = -delta.x * sin + delta.y * cos
  return { x: localX * cos - localY * sin, y: localX * sin + localY * cos }
}

export function HairDeformationPreview({ side, asset, transform, head, active, radius, strength, disabled, onReadyChange, onCommit, onError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<HairWarpSession | null>(null)
  const dragRef = useRef<HairWarpDrag | null>(null)
  const drawFrameRef = useRef<number | null>(null)
  const propsRef = useRef({ asset, transform, head, radius, strength, onReadyChange, onCommit, onError })
  propsRef.current = { asset, transform, head, radius, strength, onReadyChange, onCommit, onError }
  const [ready, setReady] = useState(false)

  function setCursor(point: ImageWarpPoint | null) {
    const cursor = cursorRef.current
    if (!cursor || !point || !active || disabled) {
      if (cursor) cursor.style.display = 'none'
      return
    }
    const current = propsRef.current
    cursor.style.display = 'block'
    cursor.style.left = `${point.x / current.head.width * 100}%`
    cursor.style.top = `${point.y / current.head.height * 100}%`
    cursor.style.width = `${current.radius * 2 / current.head.width * 100}%`
    cursor.style.height = `${current.radius * 2 / current.head.height * 100}%`
  }

  function drawPreview(): { width: number; height: number } | null {
    const canvas = canvasRef.current
    const session = sessionRef.current
    if (!canvas || !session) return null
    let moved = false
    for (let index = 0; index < session.mesh.offsetX.length; index += 1) {
      if (Math.abs(session.mesh.offsetX[index]) > 0.001 || Math.abs(session.mesh.offsetY[index]) > 0.001) { moved = true; break }
    }
    const result = drawImageWarp(canvas, session.image, session.mesh, moved ? imageWarpPadding(session.mesh) : 0)
    const current = propsRef.current
    canvas.style.width = `${result.width * current.transform.scaleX / current.head.width * 100}%`
    canvas.style.height = `${result.height * current.transform.scaleY / current.head.height * 100}%`
    return { width: result.width, height: result.height }
  }

  useEffect(() => {
    if (!active || disabled) {
      sessionRef.current = null
      dragRef.current = null
      setReady(false)
      onReadyChange(false)
      setCursor(null)
      return
    }
    const cached = sessionRef.current
    if (cached && (cached.sourceUrl === asset.dataUrl || cached.committedUrl === asset.dataUrl)) {
      setReady(true)
      onReadyChange(true)
      return
    }
    let cancelled = false
    setReady(false)
    onReadyChange(false)
    void loadImage(asset.dataUrl).then((image) => {
      if (cancelled) return
      sessionRef.current = { sourceUrl: asset.dataUrl, committedUrl: asset.dataUrl, image, mesh: createImageWarpMesh() }
      const output = drawPreview()
      if (!output) throw new Error('Não foi possível desenhar a prévia deformável do cabelo.')
      setReady(true)
      onReadyChange(true)
    }).catch((reason: unknown) => {
      if (!cancelled) {
        setReady(false)
        onReadyChange(false)
        onError(reason instanceof Error ? reason.message : 'Não foi possível preparar o cabelo para deformação.')
      }
    })
    return () => { cancelled = true }
  }, [active, asset.dataUrl, disabled])

  useEffect(() => {
    setCursor(null)
  }, [radius, active, disabled])

  useEffect(() => () => {
    if (drawFrameRef.current !== null) cancelAnimationFrame(drawFrameRef.current)
    drawFrameRef.current = null
    dragRef.current = null
    sessionRef.current = null
  }, [])

  function pointFromEvent(event: PointerEvent<HTMLCanvasElement>): ImageWarpPoint | null {
    const stage = event.currentTarget.closest<HTMLElement>('.hair-dev-head-stage')
    const bounds = stage?.getBoundingClientRect()
    const currentHead = propsRef.current.head
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null
    return { x: (event.clientX - bounds.left) / bounds.width * currentHead.width, y: (event.clientY - bounds.top) / bounds.height * currentHead.height }
  }

  function scheduleDraw() {
    if (drawFrameRef.current !== null) return
    drawFrameRef.current = requestAnimationFrame(() => {
      drawFrameRef.current = null
      try { drawPreview() } catch (reason) {
        const message = reason instanceof Error ? reason.message : 'Não foi possível atualizar a deformação do cabelo.'
        propsRef.current.onError(message)
      }
    })
  }

  function begin(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled || !ready || event.button !== 0) return
    const session = sessionRef.current
    const point = pointFromEvent(event)
    if (!session || !point) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, last: point, originalX: new Float32Array(session.mesh.offsetX), originalY: new Float32Array(session.mesh.offsetY), changed: false }
    setCursor(point)
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    const point = pointFromEvent(event)
    if (!point) return
    setCursor(point)
    const drag = dragRef.current
    const session = sessionRef.current
    if (!drag || drag.pointerId !== event.pointerId || !session || disabled) return
    event.preventDefault()
    event.stopPropagation()
    const current = propsRef.current
    const center = { x: current.transform.x, y: current.transform.y }
    const sourceBounds = {
      x: center.x - session.image.naturalWidth * current.transform.scaleX / 2,
      y: center.y - session.image.naturalHeight * current.transform.scaleY / 2,
      width: session.image.naturalWidth * current.transform.scaleX,
      height: session.image.naturalHeight * current.transform.scaleY,
      rotation: current.transform.rotation
    }
    const delta = { x: point.x - drag.last.x, y: point.y - drag.last.y }
    const distance = Math.hypot(delta.x, delta.y)
    if (distance <= 0.001) return
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, current.radius * 0.2)))
    for (let step = 1; step <= steps; step += 1) {
      const from = { x: drag.last.x + delta.x * ((step - 1) / steps), y: drag.last.y + delta.y * ((step - 1) / steps) }
      const to = { x: drag.last.x + delta.x * (step / steps), y: drag.last.y + delta.y * (step / steps) }
      const brushPoint = reflectedPoint(to, center, current.transform.rotation, Boolean(current.transform.flipX))
      const brushDelta = reflectedDelta({ x: to.x - from.x, y: to.y - from.y }, current.transform.rotation, Boolean(current.transform.flipX))
      applyImageWarpBrush(session.mesh, session.image, sourceBounds, brushPoint, brushDelta, current.radius, current.strength / 100)
    }
    drag.last = point
    drag.changed = true
    scheduleDraw()
  }

  function finish(event: PointerEvent<HTMLCanvasElement>, cancel = false) {
    if (!cancel && event.type === 'pointerup') move(event)
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (drawFrameRef.current !== null) cancelAnimationFrame(drawFrameRef.current)
    drawFrameRef.current = null
    const session = sessionRef.current
    try { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* Chromium can release capture before pointerup. */ }
    if (!session) return
    if (cancel) {
      session.mesh.offsetX.set(drag.originalX)
      session.mesh.offsetY.set(drag.originalY)
      drawPreview()
      return
    }
    if (!drag.changed) { drawPreview(); return }
    try {
      const output = drawPreview()
      const canvas = canvasRef.current
      if (!output || !canvas) return
      const dataUrl = canvas.toDataURL('image/png')
      session.committedUrl = dataUrl
      propsRef.current.onCommit({ dataUrl, width: output.width, height: output.height })
    } catch (reason) {
      session.mesh.offsetX.set(drag.originalX)
      session.mesh.offsetY.set(drag.originalY)
      drawPreview()
      propsRef.current.onError(reason instanceof Error ? `Não foi possível salvar a deformação: ${reason.message}` : 'Não foi possível salvar a deformação do cabelo.')
    }
  }

  const style: CSSProperties = {
    left: `${transform.x / head.width * 100}%`, top: `${transform.y / head.height * 100}%`,
    width: `${asset.width * transform.scaleX / head.width * 100}%`, height: `${asset.height * transform.scaleY / head.height * 100}%`,
    transform: `translate(-50%, -50%) rotate(${transform.rotation}deg) scaleX(${transform.flipX ? -1 : 1})`,
    pointerEvents: active ? 'auto' : 'none', touchAction: 'none', cursor: active ? 'none' : 'default'
  }

  return <>
    <canvas ref={canvasRef} className={`hair-dev-piece hair-dev-piece-${side} hair-dev-warp-canvas`} width={1} height={1}
      style={style} aria-label={`Deformar cabelo ${side}`} title={ready ? 'Arraste para deformar o cabelo' : 'Preparando a deformação…'}
      onPointerDown={begin} onPointerMove={move} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)}
      onLostPointerCapture={(event) => finish(event, true)} onPointerLeave={() => { if (!dragRef.current) setCursor(null) }} />
    <div ref={cursorRef} className="hair-dev-warp-cursor" aria-hidden="true" />
  </>
}
