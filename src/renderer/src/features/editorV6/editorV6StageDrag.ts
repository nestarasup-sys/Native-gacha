import type { EditorV6Document, EditorV6SceneElement, EditorV6VideoLayout } from '../../../../shared/editorV6'
import { EDITOR_V6_DEFAULT_VIDEO_LAYOUT, editorV6DefaultVideoLayout } from '../../../../shared/editorV6'
import { normalizeEditorV6Timeline, timelineClips, type TimelineClip } from '../../../../shared/editorV6TimelineCore'
import { moveEditorV6ElementInPeriod } from '../../../../shared/editorV6TimelineEdits'
import { editEditorV6BackgroundAtFrame, prepareEditorV6PositionAtFrame, type EditorV6ResolvedScene } from '../../../../shared/editorV6TimelineScene'

export type StageDragTarget = 'element' | 'background' | 'video'

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

type PrepareEditorV6StageDragInput = {
  project: EditorV6Document
  scene: EditorV6ResolvedScene
  id: string
  target: StageDragTarget
  element?: EditorV6SceneElement
  videoClip?: TimelineClip
  pointerId: number
  startX: number
  startY: number
  width: number
  height: number
}

/** Builds the immutable baseline and target block for a pointer drag. */
export function prepareEditorV6StageDrag(input: PrepareEditorV6StageDragInput): EditorV6StageDrag | null {
  const { project, scene, id, target, element, videoClip } = input
  const frame = scene.frame
  let prepared: EditorV6Document
  let blockId: string

  if (target === 'video') {
    if (!videoClip || videoClip.track.locked) return null
    prepared = project
    blockId = videoClip.block.id
  } else if (target === 'background') {
    if (project.timeline.tracks.some((track) => track.kind === 'video' && track.locked)) return null
    prepared = editEditorV6BackgroundAtFrame(project, frame, {})
    const backgroundClip = timelineClips(prepared.timeline).find(({ block }) => block.background && block.startFrame === frame)
    if (!backgroundClip) return null
    blockId = backgroundClip.block.id
  } else {
    if (!element) return null
    const operation = prepareEditorV6PositionAtFrame(project, id, frame)
    if (!operation) return null
    prepared = operation.document
    blockId = operation.blockId
  }

  const videoAsset = videoClip?.block.mediaId
    ? project.media?.find((media) => media.id === videoClip.block.mediaId)
    : undefined
  const videoLayout = videoClip
    ? videoClip.block.mediaLayout ?? editorV6DefaultVideoLayout(videoAsset?.width, videoAsset?.height)
    : EDITOR_V6_DEFAULT_VIDEO_LAYOUT
  const origin = target === 'background'
    ? { x: scene.background.backgroundX, y: scene.background.backgroundY }
    : target === 'video'
      ? { x: videoLayout.x, y: videoLayout.y }
      : element ? { x: element.x, y: element.y } : null
  if (!origin) return null

  return {
    id,
    target,
    ...(target === 'video' && videoLayout ? { videoLayout } : {}),
    pointerId: input.pointerId,
    startX: input.startX,
    startY: input.startY,
    originalX: origin.x,
    originalY: origin.y,
    width: input.width,
    height: input.height,
    before: project,
    prepared,
    blockId,
    frame,
    moved: false
  }
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
