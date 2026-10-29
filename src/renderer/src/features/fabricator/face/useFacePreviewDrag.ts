import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { FaceTransform } from '../../../../../shared/fabricator'
import { pupilDeltaFromDrag } from '../../../../../shared/facePupilGeometry'
import { createPreviewFrameScheduler, type PreviewFrameScheduler } from './facePreviewFrame'

type PreviewHeadSize = { width: number; height: number }
type PreviewDrag = {
  pointerId: number
  key: string
  modelSlot: number
  target: HTMLImageElement
  clientX: number
  clientY: number
  startX: number
  startY: number
  modelPerPixelX: number
  modelPerPixelY: number
  invertX: boolean
  pupil: boolean
  rotation: number
}

export function useFacePreviewDrag({
  modelSlot,
  activeKey,
  head,
  transform,
  onTransformChange
}: {
  modelSlot: number
  activeKey: string | null
  head: PreviewHeadSize | null
  transform: FaceTransform | undefined
  onTransformChange: (patch: Partial<FaceTransform>) => void
}) {
  const drag = useRef<PreviewDrag | null>(null)
  const scheduler = useRef<PreviewFrameScheduler | null>(null)
  if (!scheduler.current) {
    scheduler.current = createPreviewFrameScheduler(
      (callback) => requestAnimationFrame(callback),
      (frameId) => cancelAnimationFrame(frameId)
    )
  }
  const activeKeyRef = useRef(activeKey)
  activeKeyRef.current = activeKey
  const [isDragging, setIsDragging] = useState(false)

  useEffect(() => {
    const current = drag.current
    if (!current || current.key === activeKey && current.modelSlot === modelSlot) return
    scheduler.current?.cancel()
    drag.current = null
    setIsDragging(false)
    releaseCapture(current)
  }, [activeKey, modelSlot])

  useEffect(() => () => {
    const current = drag.current
    scheduler.current?.cancel()
    drag.current = null
    if (current) releaseCapture(current)
  }, [])

  function begin(
    event: ReactPointerEvent<HTMLImageElement>,
    key: string,
    invertX = false,
    pupil = false,
    rotation = 0
  ) {
    if (event.button !== 0 || !event.isPrimary || !head || !transform || key !== activeKey) return
    const canvas = event.currentTarget.closest('.face-components-preview-canvas')
    if (!canvas) return
    const bounds = canvas.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return

    event.preventDefault()
    scheduler.current?.cancel()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointerId: event.pointerId,
      key,
      modelSlot,
      target: event.currentTarget,
      clientX: event.clientX,
      clientY: event.clientY,
      startX: transform.x,
      startY: transform.y,
      modelPerPixelX: head.width / bounds.width,
      modelPerPixelY: head.height / bounds.height,
      invertX,
      pupil,
      rotation
    }
    setIsDragging(true)
  }

  function move(event: ReactPointerEvent<HTMLImageElement>) {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId || current.key !== activeKey || !head) return
    const delta = pupilDeltaFromDrag(event.clientX - current.clientX, event.clientY - current.clientY, {
      rotationDegrees: current.pupil ? current.rotation : 0,
      mirrorSourceX: current.invertX,
      modelPerPixelX: current.modelPerPixelX,
      modelPerPixelY: current.modelPerPixelY
    })
    const x = current.startX + delta.x
    const y = current.startY + delta.y
    const patch = current.pupil ? { x, y } : {
      x: Math.max(0, Math.min(head.width, x)),
      y: Math.max(0, Math.min(head.height, y))
    }
    const expectedKey = current.key
    scheduler.current?.schedule(() => {
      const latestDrag = drag.current
      if (!latestDrag || latestDrag.key !== expectedKey || latestDrag.modelSlot !== modelSlot || activeKeyRef.current !== expectedKey) return
      onTransformChange(patch)
    })
  }

  function end(event: ReactPointerEvent<HTMLImageElement>) {
    if (drag.current?.pointerId !== event.pointerId) return
    scheduler.current?.flush()
    drag.current = null
    setIsDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return { isDragging, begin, move, end }
}

function releaseCapture(drag: PreviewDrag) {
  if (drag.target.hasPointerCapture(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId)
}
