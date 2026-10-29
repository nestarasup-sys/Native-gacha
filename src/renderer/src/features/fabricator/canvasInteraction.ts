import type { PointerEvent as ReactPointerEvent } from 'react'
import type { FabricatorHistoryAction, FabricatorProject, ModelPart } from '../../../../shared/fabricator'
import { isTorsoPart, partJointAnchor, sourcePointFromCanvas } from '../../../../shared/modelRig.ts'

export type DragState = { partId: string; pointerId: number; x: number; y: number }
export type AnchorDragState = { partId: string; pointerId: number; x: number; y: number; offsetX: number }
export type PanState = { pointerId: number; x: number; y: number; originX: number; originY: number }
export type MixerStrokeState = { pointerId: number; x: number; y: number }

type MutableValue<T> = { current: T }
type PanOffset = { x: number; y: number }

function targetMatches(event: ReactPointerEvent<Element>, selector: string): boolean {
  const target = event.target as Element | null
  return typeof target?.closest === 'function' && Boolean(target.closest(selector))
}

export type FabricatorCanvasInteractionDependencies = {
  project: FabricatorProject | null
  dragRef: MutableValue<DragState | null>
  anchorDragRef: MutableValue<AnchorDragState | null>
  panRef: MutableValue<PanState | null>
  mixerStrokeRef: MutableValue<MixerStrokeState | null>
  setSelectedIds: (update: string[] | ((current: string[]) => string[])) => void
  connectMode: boolean
  mixerActive: boolean
  thighDeformationActive: boolean
  pan: PanOffset
  setPan: (pan: PanOffset) => void
  setPanning: (panning: boolean) => void
  setMixerPainting: (painting: boolean) => void
  scale: number
  mixerQueueRef: MutableValue<Promise<void>>
  startHistoryGesture: (action: FabricatorHistoryAction) => void
  finishHistoryGesture: () => void
  updateProject: (updater: (current: FabricatorProject) => FabricatorProject, action?: FabricatorHistoryAction) => void
  updatePartPosition: (partId: string, dx: number, dy: number) => void
  startMixerStroke: <T extends Element>(event: ReactPointerEvent<T>) => void
  moveMixerStroke: (event: ReactPointerEvent<HTMLDivElement>) => void
}

/** Owns pointer gestures for moving parts, adjusting joints and panning the model canvas. */
export function createFabricatorCanvasInteraction(deps: FabricatorCanvasInteractionDependencies) {
  function beginPartDrag(event: ReactPointerEvent<HTMLElement>, part: ModelPart): void {
    if (deps.thighDeformationActive) return
    if (deps.mixerActive) { deps.startMixerStroke(event); return }
    if (deps.connectMode || !deps.project) return
    if (isTorsoPart(part)) {
      event.preventDefault(); event.stopPropagation()
      deps.setSelectedIds([part.id])
      return
    }
    event.preventDefault(); event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    deps.startHistoryGesture('edit')
    deps.setSelectedIds((current) => current.includes(part.id) ? current : [part.id])
    deps.dragRef.current = { partId: part.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY }
  }

  function beginPan(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!deps.project || targetMatches(event, '.model-stage-tools')) return
    if (deps.thighDeformationActive) return
    if (deps.mixerActive) { deps.startMixerStroke(event); return }
    if (targetMatches(event, '.model-canvas-part, .model-joint-anchor')) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    deps.panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: deps.pan.x, originY: deps.pan.y }
    deps.setPanning(true)
  }

  function movePan(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = deps.panRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    deps.setPan({ x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y })
  }

  function movePartDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = deps.dragRef.current
    if (!drag || !deps.project || drag.pointerId !== event.pointerId || !deps.scale) return
    const dx = (event.clientX - drag.x) / deps.scale
    const dy = (event.clientY - drag.y) / deps.scale
    if (Math.abs(dx) + Math.abs(dy) > 0) deps.updatePartPosition(drag.partId, dx, dy)
    drag.x = event.clientX
    drag.y = event.clientY
  }

  function moveAnchorDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = deps.anchorDragRef.current
    if (!drag || !deps.project || drag.pointerId !== event.pointerId || !deps.scale) return
    const dx = (event.clientX - drag.x) / deps.scale + drag.offsetX
    const dy = (event.clientY - drag.y) / deps.scale
    deps.updateProject((current) => {
      const part = current.parts.find((item) => item.id === drag.partId)
      if (!part) return current
      const anchor = partJointAnchor(part, current.joints)
      if (!anchor) return current
      const movedAnchor = { x: anchor.x + dx, y: anchor.y + dy }
      const sourceAnchor = sourcePointFromCanvas(part, movedAnchor)
      return {
        ...current,
        parts: current.parts.map((item) => item.id === drag.partId
          ? { ...item, jointAnchor: movedAnchor, ...(sourceAnchor && item.sourceTransform ? { sourceTransform: { ...item.sourceTransform, jointAnchor: sourceAnchor, anchorVersion: 1 as const } } : {}) }
          : item),
        joints: current.joints.map((joint) => {
          const parentAnchor = joint.parentPartId === drag.partId ? movedAnchor : joint.parentAnchor
          const childAnchor = joint.childPartId === drag.partId ? movedAnchor : joint.childAnchor
          return { ...joint, parentAnchor, childAnchor, pivot: { x: (parentAnchor.x + childAnchor.x) / 2, y: (parentAnchor.y + childAnchor.y) / 2 } }
        })
      }
    })
    drag.x = event.clientX
    drag.y = event.clientY
    drag.offsetX = 0
  }

  function beginAnchorDrag(event: ReactPointerEvent<SVGCircleElement>, partId: string, displayOffset: number): void {
    if (deps.thighDeformationActive) return
    if (deps.mixerActive) { deps.startMixerStroke(event); return }
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    deps.startHistoryGesture('edit')
    deps.anchorDragRef.current = { partId, pointerId: event.pointerId, x: event.clientX, y: event.clientY, offsetX: displayOffset / deps.scale }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    deps.moveMixerStroke(event)
    movePan(event)
    movePartDrag(event)
    moveAnchorDrag(event)
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    if (deps.dragRef.current?.pointerId === event.pointerId) deps.dragRef.current = null
    if (deps.anchorDragRef.current?.pointerId === event.pointerId) deps.anchorDragRef.current = null
    if (deps.panRef.current?.pointerId === event.pointerId) {
      deps.panRef.current = null
      deps.setPanning(false)
    }
    if (deps.mixerStrokeRef.current?.pointerId === event.pointerId) {
      deps.mixerStrokeRef.current = null
      deps.setMixerPainting(false)
    }
    void deps.mixerQueueRef.current.then(() => deps.finishHistoryGesture())
  }

  function onPointerCancel(): void {
    deps.dragRef.current = null
    deps.anchorDragRef.current = null
    deps.panRef.current = null
    deps.mixerStrokeRef.current = null
    deps.setPanning(false)
    deps.setMixerPainting(false)
    void deps.mixerQueueRef.current.then(() => deps.finishHistoryGesture())
  }

  return { beginPartDrag, beginPan, beginAnchorDrag, onPointerMove, onPointerUp, onPointerCancel }
}
