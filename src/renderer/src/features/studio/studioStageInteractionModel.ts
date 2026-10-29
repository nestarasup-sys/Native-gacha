import type { StudioDocument } from '../../../../shared/studio'

export type StudioStageDrag = {
  id: string
  pointerId: number
  startX: number
  startY: number
  originalX: number
  originalY: number
  width: number
  height: number
}

export type StudioStagePosition = { x: number; y: number }

/** Converts canvas pointer movement into the Studio document's percentage coordinates. */
export function studioStageDragPosition(
  drag: StudioStageDrag,
  clientX: number,
  clientY: number
): StudioStagePosition | null {
  if (!Number.isFinite(drag.width) || !Number.isFinite(drag.height) || !(drag.width > 0) || !(drag.height > 0)) return null
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null
  const position = {
    x: drag.originalX + (clientX - drag.startX) / drag.width * 100,
    y: drag.originalY + (clientY - drag.startY) / drag.height * 100
  }
  return Number.isFinite(position.x) && Number.isFinite(position.y) ? position : null
}

/** Applies a drag to the active Studio document without changing the start snapshot. */
export function moveStudioStageDrag(
  studio: StudioDocument,
  drag: StudioStageDrag,
  position: StudioStagePosition,
  updatedAt: string
): StudioDocument {
  if (drag.id === 'background') return { ...studio, backgroundX: position.x, backgroundY: position.y, updatedAt }
  return {
    ...studio,
    elements: studio.elements.map((element) => element.id === drag.id ? { ...element, x: position.x, y: position.y } : element),
    updatedAt
  }
}
