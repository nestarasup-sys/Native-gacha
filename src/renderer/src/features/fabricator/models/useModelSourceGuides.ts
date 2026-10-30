import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ModelSourcePoint } from './modelSourceEditing'
import { appendModelSourceGuideLine, createModelSourceGuideLine, emptyModelSourceGuideSet, modelSourceGuideLinesForPart } from './modelSourceGuides'
import type { ModelSourceGuideSet } from './modelSourceGuides'

type GuideStroke = { pointerId: number; partId: string; start: ModelSourcePoint; end: ModelSourcePoint }
type GuideDrag = Pick<GuideStroke, 'pointerId' | 'partId' | 'start'>
type PointerCoordinates = Pick<ReactPointerEvent<HTMLElement>, 'clientX' | 'clientY'>

export function useModelSourceGuides({
  selectedId,
  hasSelectedPart,
  toolActive,
  editingBlocked,
  getPoint,
  capturePointer,
  releasePointer
}: {
  selectedId: string
  hasSelectedPart: boolean
  toolActive: boolean
  editingBlocked: boolean
  getPoint: (event: PointerCoordinates) => ModelSourcePoint | null
  capturePointer: (pointerId: number) => void
  releasePointer: (pointerId: number) => void
}) {
  const [guides, setGuides] = useState<ModelSourceGuideSet>(() => emptyModelSourceGuideSet(selectedId))
  const [guideStroke, setGuideStroke] = useState<GuideStroke | null>(null)
  const guideDrag = useRef<GuideDrag | null>(null)

  useEffect(() => {
    if (guides.partId === selectedId) return
    guideDrag.current = null
    setGuideStroke(null)
    setGuides(emptyModelSourceGuideSet(selectedId))
  }, [selectedId, guides.partId])

  function beginGuideStroke(pointerId: number, start: ModelSourcePoint) {
    if (!hasSelectedPart || !toolActive || editingBlocked) return
    guideDrag.current = { pointerId, partId: selectedId, start }
    setGuideStroke({ pointerId, partId: selectedId, start, end: start })
    capturePointer(pointerId)
  }

  function startGuide(event: ReactPointerEvent<HTMLDivElement>) {
    if (!toolActive || editingBlocked || event.button !== 0) return
    const point = getPoint(event)
    if (!point) return
    event.preventDefault()
    beginGuideStroke(event.pointerId, point)
  }

  function extendGuide(event: ReactPointerEvent<SVGCircleElement>, start: ModelSourcePoint) {
    if (!toolActive || editingBlocked || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    beginGuideStroke(event.pointerId, start)
  }

  function moveGuide(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = guideDrag.current
    if (!drag || drag.pointerId !== event.pointerId || drag.partId !== selectedId || !toolActive) return
    const point = getPoint(event)
    if (!point) return
    setGuideStroke({ pointerId: drag.pointerId, partId: drag.partId, start: drag.start, end: point })
  }

  function finishGuide(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = guideDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const end = event.type === 'pointerup' ? getPoint(event) : null
    guideDrag.current = null
    setGuideStroke(null)
    try { releasePointer(event.pointerId) } catch { /* A captura pode já ter sido liberada pelo navegador. */ }
    if (!end || drag.partId !== selectedId) return
    const line = createModelSourceGuideLine(drag.start, end, crypto.randomUUID())
    if (!line) return
    setGuides(current => appendModelSourceGuideLine(current, drag.partId, line))
  }

  function cancelGuide(event: ReactPointerEvent<HTMLDivElement>) {
    if (guideDrag.current?.pointerId !== event.pointerId) return
    guideDrag.current = null
    setGuideStroke(null)
    try { releasePointer(event.pointerId) } catch { /* A captura pode já ter sido liberada pelo navegador. */ }
  }

  function clearGuideStroke() {
    guideDrag.current = null
    setGuideStroke(null)
  }

  return {
    guides,
    setGuides,
    guideStroke,
    visibleGuideLines: modelSourceGuideLinesForPart(guides, selectedId),
    startGuide,
    extendGuide,
    moveGuide,
    finishGuide,
    cancelGuide,
    clearGuideStroke
  }
}
