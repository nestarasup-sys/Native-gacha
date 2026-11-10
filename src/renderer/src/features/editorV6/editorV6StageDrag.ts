import type { EditorV6Document, EditorV6VideoLayout } from '../../../../shared/editorV6'
import { EDITOR_V6_DEFAULT_VIDEO_LAYOUT } from '../../../../shared/editorV6'
import { normalizeEditorV6Timeline } from '../../../../shared/editorV6TimelineCore'
import { moveEditorV6ElementInPeriod } from '../../../../shared/editorV6TimelineEdits'
import { editEditorV6BackgroundAtFrame } from '../../../../shared/editorV6TimelineScene'

type StageDragTarget = 'element' | 'background' | 'video'

export type EditorV6StageDrag = {
  id: string
  target: StageDragTarget
  videoLayout?: EditorV6VideoLayout
  pointerId: number
  startX: number
  startY: number
  originalX: number
  originalY: number
  width: number
  height: number
  before: EditorV6Document
  prepared: EditorV6Document
  blockId: string
  frame: number
  moved: boolean
}

/** Converts pointer movement in stage pixels to percentage-based scene coordinates. */
export function editorV6StageDragPosition(
  drag: EditorV6StageDrag,
  clientX: number,
  clientY: number
): { x: number; y: number } | null {
  if (!drag.moved && Math.hypot(clientX - drag.startX, clientY - drag.startY) < 2) return null
  return {
    x: drag.originalX + (clientX - drag.startX) / drag.width * 100,
    y: drag.originalY + (clientY - drag.startY) / drag.height * 100
  }
}

/** Applies a drag destination to the document prepared for the active frame. */
export function moveEditorV6StageDrag(drag: EditorV6StageDrag, x: number, y: number): EditorV6Document {
  if (drag.target === 'background') {
    return editEditorV6BackgroundAtFrame(drag.prepared, drag.frame, { backgroundX: x, backgroundY: y }, drag.blockId)
  }
  if (drag.target === 'video') {
    return {
      ...drag.prepared,
      timeline: normalizeEditorV6Timeline({
        ...drag.prepared.timeline,
        tracks: drag.prepared.timeline.tracks.map((track) => ({
          ...track,
          blocks: track.blocks.map((block) => block.id === drag.blockId
            ? { ...block, mediaLayout: { ...(block.mediaLayout ?? drag.videoLayout ?? EDITOR_V6_DEFAULT_VIDEO_LAYOUT), x, y } }
            : block)
        }))
      })
    }
  }
  return moveEditorV6ElementInPeriod(drag.prepared, drag.blockId, x, y)
}
