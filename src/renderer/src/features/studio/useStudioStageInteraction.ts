import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { StudioDocument } from '../../../../shared/studio'
import { moveStudioStageDrag, studioStageDragPosition, type StudioStageDrag } from './studioStageInteractionModel'

type StudioStageTool = 'background' | 'objects' | null

type Dependencies = {
  activeStudio: StudioDocument | null
  sceneRef: { current: HTMLDivElement | null }
  recordHistory: (document?: StudioDocument) => void
  setSelectedElementId: (id: string | null) => void
  setActiveTool: (tool: StudioStageTool) => void
  setInspectorOpen: (open: boolean) => void
  setInspectorTab: (tab: 'editor' | 'custom') => void
  restoreCharacterInspectorView: () => void
  patchStudio: (transform: (studio: StudioDocument) => StudioDocument) => void
}

/** Owns Studio pointer capture and keeps canvas movement out of the page composition. */
export function useStudioStageInteraction(dependencies: Dependencies) {
  const dragRef = useRef<StudioStageDrag | null>(null)

  const startDrag = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    const { activeStudio, sceneRef } = dependencies
    if (!activeStudio || !sceneRef.current) return
    event.preventDefault()
    event.stopPropagation()

    if (id !== 'background') {
      const element = activeStudio.elements.find((item) => item.id === id)
      if (!element) return
      if (element.kind === 'character' && element.positionLocked) {
        dependencies.setSelectedElementId(id)
        dependencies.setActiveTool(null)
        dependencies.setInspectorOpen(true)
        dependencies.restoreCharacterInspectorView()
        return
      }
    }

    const rect = sceneRef.current.getBoundingClientRect()
    dependencies.recordHistory()
    dependencies.setSelectedElementId(id)
    dependencies.setActiveTool(id === 'background' ? 'background' : null)
    dependencies.setInspectorOpen(true)

    const element = id === 'background' ? null : activeStudio.elements.find((item) => item.id === id) ?? null
    if (id === 'background' || element?.kind !== 'character') dependencies.setInspectorTab('editor')
    else dependencies.restoreCharacterInspectorView()

    dragRef.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originalX: id === 'background' ? activeStudio.backgroundX : element!.x,
      originalY: id === 'background' ? activeStudio.backgroundY : element!.y,
      width: rect.width,
      height: rect.height
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const position = studioStageDragPosition(drag, event.clientX, event.clientY)
    if (!position) return
    dependencies.patchStudio((studio) => moveStudioStageDrag(studio, drag, position, new Date().toISOString()))
  }

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
  }

  return { startDrag, moveDrag, endDrag }
}
