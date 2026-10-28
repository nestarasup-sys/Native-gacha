import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'

type PreviewExtent = { width: number; height: number; density: number }
type PreviewPan = { x: number; y: number }
type PanDrag = { pointerId: number; startX: number; startY: number; originX: number; originY: number }

const initialZoom = 1.15

/** Owns the shared viewport used by both Customizer previews. */
export function useCustomizerPreviewViewport(activeTab: string) {
  const [zoom, setZoom] = useState(initialZoom)
  const [pan, setPan] = useState<PreviewPan>({ x: 0, y: 0 })
  const [extent, setExtent] = useState<PreviewExtent>({ width: 0, height: 0, density: window.devicePixelRatio || 1 })
  const customizerPreviewStageRef = useRef<HTMLDivElement>(null)
  const mainPreviewStageRef = useRef<HTMLDivElement>(null)
  const panDragRef = useRef<PanDrag | null>(null)

  useEffect(() => {
    const update = () => {
      const stages = document.querySelectorAll<HTMLElement>('.customizer-preview-stage-wrap')
      const bounds = Array.from(stages, (stage) => stage.getBoundingClientRect())
      const width = Math.ceil(Math.max(0, ...bounds.map((rect) => rect.width - 136)))
      const height = Math.ceil(Math.max(0, ...bounds.map((rect) => rect.height - 130)))
      const density = window.devicePixelRatio || 1
      setExtent((current) => current.width === width && current.height === height && current.density === density ? current : { width, height, density })
    }
    const observer = new ResizeObserver(update)
    document.querySelectorAll('.customizer-preview-stage-wrap').forEach((stage) => observer.observe(stage))
    window.addEventListener('resize', update)
    update()
    return () => { observer.disconnect(); window.removeEventListener('resize', update) }
  }, [activeTab])

  function resetPan() {
    setPan({ x: 0, y: 0 })
    panDragRef.current = null
  }

  function beginPan(event: PointerEvent<HTMLDivElement>, hasArtwork: boolean) {
    if (event.button !== 0 || !hasArtwork) return
    const target = event.target
    if (target instanceof Element && target.closest('.customizer-preview-controls, .customizer-preview-identity, .customizer-preview-back')) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    panDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y
    }
  }

  function movePan(event: PointerEvent<HTMLDivElement>) {
    const drag = panDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPan({ x: drag.originX + event.clientX - drag.startX, y: drag.originY + event.clientY - drag.startY })
  }

  function finishPan(event: PointerEvent<HTMLDivElement>) {
    if (panDragRef.current?.pointerId !== event.pointerId) return
    panDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const zoomOut = () => setZoom((current) => Math.max(.75, Number((current - .1).toFixed(2))))
  const zoomIn = () => setZoom((current) => Math.min(4, Number((current + .1).toFixed(2))))
  const resetZoom = () => setZoom(initialZoom)

  return {
    zoom,
    pan,
    extent,
    customizerPreviewStageRef,
    mainPreviewStageRef,
    resetPan,
    beginPan,
    movePan,
    finishPan,
    zoomOut,
    zoomIn,
    resetZoom
  }
}
