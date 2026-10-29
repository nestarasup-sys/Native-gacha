import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { FaceExpressionEffects, FaceExpressionTransforms, PtPupilOverrides } from '../../../../shared/fabricator'
import { pupilDeltaFromDrag } from '../../../../shared/facePupilGeometry.ts'

export type ExpressionLayerKey = keyof FaceExpressionTransforms
export type PreviewLayerMapping = { layer: ExpressionLayerKey; startX: number; startY: number; mirroredX: boolean; rotation: number }
export type PreviewLayerDrag = {
  pointerId: number
  clientX: number
  clientY: number
  modelPerPixelX: number
  modelPerPixelY: number
  mappings: PreviewLayerMapping[]
}
export type PreviewEffectDrag = { pointerId: number; clientX: number; clientY: number; offsetX: number; offsetY: number }

type MutableValue<T> = { current: T }
type StateSetter<T> = (update: T | ((current: T) => T)) => void

export type ExpressionPreviewInteractionDependencies = {
  layerDragRef: MutableValue<PreviewLayerDrag | null>
  effectDragRef: MutableValue<PreviewEffectDrag | null>
  previewCanvasRef: MutableValue<Pick<HTMLDivElement, 'getBoundingClientRect'> | null>
  selectedLayer: ExpressionLayerKey
  head: { width: number; height: number } | null
  previewGaze: 'left' | 'right'
  visibleTransforms: FaceExpressionTransforms
  effects: FaceExpressionEffects
  setTransforms: StateSetter<FaceExpressionTransforms>
  setPtPupils: StateSetter<PtPupilOverrides>
  setEffects: StateSetter<FaceExpressionEffects>
}

/** Owns pointer and keyboard input for the expression face preview. */
export function createExpressionPreviewInteraction(deps: ExpressionPreviewInteractionDependencies) {
  function beginLayerDrag(
    event: ReactPointerEvent<HTMLElement>,
    requestedMappings: Array<Omit<PreviewLayerMapping, 'startX' | 'startY'>>
  ): void {
    if (!requestedMappings.some(({ layer }) => layer === deps.selectedLayer) || !deps.head
      || (event.button !== 0 && event.pointerType === 'mouse')) return
    const bounds = deps.previewCanvasRef.current?.getBoundingClientRect()
    if (!bounds?.width || !bounds.height) return
    event.preventDefault()
    event.stopPropagation()
    if (deps.previewGaze === 'left' && requestedMappings.some((item) => !item.layer.startsWith('pupil'))) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const mappings: PreviewLayerMapping[] = requestedMappings.map((mapping) => ({
      ...mapping,
      startX: deps.visibleTransforms[mapping.layer].x,
      startY: deps.visibleTransforms[mapping.layer].y
    }))
    deps.layerDragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      modelPerPixelX: deps.head.width / bounds.width,
      modelPerPixelY: deps.head.height / bounds.height,
      mappings
    }
  }

  function moveLayerDrag(event: ReactPointerEvent<HTMLElement>): void {
    const drag = deps.layerDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const apply = (current: FaceExpressionTransforms): FaceExpressionTransforms => {
      const next = { ...current }
      for (const mapping of drag.mappings) {
        const rotatedPupil = mapping.layer === 'pupilLeft' || mapping.layer === 'pupilRight'
        const delta = pupilDeltaFromDrag(event.clientX - drag.clientX, event.clientY - drag.clientY, {
          rotationDegrees: rotatedPupil ? mapping.rotation : 0,
          mirrorSourceX: mapping.mirroredX,
          modelPerPixelX: drag.modelPerPixelX,
          modelPerPixelY: drag.modelPerPixelY
        })
        next[mapping.layer] = {
          ...current[mapping.layer],
          x: mapping.startX + delta.x,
          y: mapping.startY + delta.y
        }
      }
      return next
    }
    if (deps.previewGaze !== 'left') {
      deps.setTransforms(apply)
      return
    }
    const projected = apply(deps.visibleTransforms)
    deps.setPtPupils((current) => {
      const next = { ...current }
      for (const mapping of drag.mappings) {
        const side = mapping.layer === 'pupilLeft' ? 'left' : 'right'
        next[side] = {
          x: projected[mapping.layer].x,
          y: projected[mapping.layer].y,
          rotation: current[side]?.rotation ?? deps.visibleTransforms[mapping.layer].rotation
        }
      }
      return next
    })
  }

  function endLayerDrag(event: ReactPointerEvent<HTMLElement>): void {
    if (deps.layerDragRef.current?.pointerId !== event.pointerId) return
    deps.layerDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function updateBlush(patch: Partial<FaceExpressionEffects['blush']>): void {
    if (deps.previewGaze === 'left') return
    deps.setEffects((current) => ({ ...current, blush: { ...current.blush, ...patch } }))
  }

  function beginBlushDrag(event: ReactPointerEvent<HTMLSpanElement>): void {
    if (deps.previewGaze === 'left' || (event.button !== 0 && event.pointerType === 'mouse')) return
    const bounds = deps.previewCanvasRef.current?.getBoundingClientRect()
    if (!bounds?.width || !bounds.height) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    deps.effectDragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      offsetX: deps.effects.blush.offsetX ?? 0,
      offsetY: deps.effects.blush.offsetY
    }
  }

  function moveBlushDrag(event: ReactPointerEvent<HTMLSpanElement>): void {
    const drag = deps.effectDragRef.current
    const bounds = deps.previewCanvasRef.current?.getBoundingClientRect()
    if (!drag || drag.pointerId !== event.pointerId || !bounds?.width || !bounds.height) return
    event.preventDefault()
    event.stopPropagation()
    updateBlush({
      offsetX: Math.max(-.5, Math.min(.5, drag.offsetX + (event.clientX - drag.clientX) / bounds.width)),
      offsetY: Math.max(-.5, Math.min(.5, drag.offsetY + (event.clientY - drag.clientY) / bounds.height))
    })
  }

  function endBlushDrag(event: ReactPointerEvent<HTMLSpanElement>): void {
    if (deps.effectDragRef.current?.pointerId !== event.pointerId) return
    deps.effectDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function nudgeBlush(event: ReactKeyboardEvent<HTMLSpanElement>): void {
    if (deps.previewGaze === 'left') return
    const delta = event.shiftKey ? .05 : .01
    const movement = event.key === 'ArrowLeft' ? { offsetX: (deps.effects.blush.offsetX ?? 0) - delta }
      : event.key === 'ArrowRight' ? { offsetX: (deps.effects.blush.offsetX ?? 0) + delta }
        : event.key === 'ArrowUp' ? { offsetY: deps.effects.blush.offsetY - delta }
          : event.key === 'ArrowDown' ? { offsetY: deps.effects.blush.offsetY + delta } : null
    if (!movement) return
    event.preventDefault()
    updateBlush(movement.offsetX !== undefined
      ? { offsetX: Math.max(-.5, Math.min(.5, movement.offsetX)) }
      : { offsetY: Math.max(-.5, Math.min(.5, movement.offsetY!)) })
  }

  return { beginLayerDrag, moveLayerDrag, endLayerDrag, beginBlushDrag, moveBlushDrag, endBlushDrag, nudgeBlush }
}
