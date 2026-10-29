import { useCallback, useMemo, useRef } from 'react'
import type { EditorV6Document, EditorV6VideoLayout } from '../../../../shared/editorV6'
import {
  EDITOR_V6_DEFAULT_VIDEO_LAYOUT, editorV6DefaultVideoLayout
} from '../../../../shared/editorV6'
import { editorV6ClipAtFrame, normalizeEditorV6Timeline, timelineClips } from '../../../../shared/editorV6TimelineCore'
import { moveEditorV6ElementInPeriod } from '../../../../shared/editorV6TimelineEdits'
import { editEditorV6BackgroundAtFrame, prepareEditorV6PositionAtFrame, resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6TimelineScene'
import { getEditorV6PlaybackFrame } from './editorV6PlaybackClock'
import type { ScenePointerEvent, SceneSurfaceInteraction } from './SceneSurface'

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

/** Converte movimento do ponteiro, em pixels da prévia, para as coordenadas percentuais da cena. */
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

/** Aplica o destino do arraste ao documento preparado para o quadro ativo. */
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

type Dependencies = {
  project: EditorV6Document | null
  sceneRef: { current: HTMLDivElement | null }
  faceBusy: boolean
  expressionBusy: boolean
  faceRenderRunningRef: { current: boolean }
  setSelectedElementId: (id: string | null) => void
  setActiveTool: (tool: 'background' | 'objects' | null) => void
  setInspectorOpen: (open: boolean) => void
  setInspectorTab: (tab: 'editor' | 'custom') => void
  setSelectedTimelineBlockId: (id: string | null) => void
  restoreCharacterInspectorView: () => void
  pausePlayback: () => void
  publishPlayheadFrame: (frame: number) => void
  updateActiveProject: (update: (project: EditorV6Document) => EditorV6Document) => void
  markUnsaved: () => void
  recordHistory: (document: EditorV6Document) => void
}

/** Owns pointer capture, drag rollback and scene movement for the Editor V6 stage. */
export function useEditorV6StageInteraction(
  dependencies: Dependencies,
  dragRef: { current: EditorV6StageDrag | null }
) {
  const dependenciesRef = useRef(dependencies)
  dependenciesRef.current = dependencies
  const handlersRef = useRef<SceneSurfaceInteraction>({ start: () => {}, move: () => {}, end: () => {} })
  const interaction = useMemo<SceneSurfaceInteraction>(() => ({
    start: (event, id) => handlersRef.current.start(event, id),
    move: (event) => handlersRef.current.move(event),
    end: (event) => handlersRef.current.end(event)
  }), [])

  const cancelSceneDrag = useCallback(() => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    if (drag.moved) {
      const current = dependenciesRef.current
      current.updateActiveProject((project) => project.id === drag.before.id
        ? { ...drag.before, updatedAt: new Date().toISOString() }
        : project)
      current.setSelectedTimelineBlockId(drag.target === 'background'
        ? null
        : drag.target === 'video'
          ? drag.blockId
          : editorV6ClipAtFrame(drag.before.timeline, drag.id, drag.frame)?.block.id ?? null)
      current.markUnsaved()
    }
  }, [])

  const startDrag = (event: ScenePointerEvent, id: string) => {
    const current = dependenciesRef.current
    const project = current.project
    const stage = current.sceneRef.current
    if (!project || !stage || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    current.pausePlayback()
    const currentScene = resolveEditorV6SceneAtFrame(project, getEditorV6PlaybackFrame(), { includeMotion: false })
    const currentBackground = currentScene.background
    const videoBlockId = id.startsWith('media-video:') ? id.slice('media-video:'.length) : null
    const target: StageDragTarget = videoBlockId ? 'video' : id === 'background' ? 'background' : 'element'
    current.setSelectedElementId(target === 'video' ? null : id)
    current.setActiveTool(target === 'background' ? 'background' : null)
    current.setInspectorOpen(true)
    const element = target === 'element' ? currentScene.elements.find((item) => item.id === id) : undefined
    const videoClip = videoBlockId ? timelineClips(project.timeline).find(({ track, block }) => track.kind === 'video' && block.id === videoBlockId) : undefined
    if (target === 'video' && (!videoClip || videoClip.track.locked)) return
    const currentClip = target === 'background' || target === 'video'
      ? null
      : editorV6ClipAtFrame(project.timeline, id, currentScene.frame)
    current.setSelectedTimelineBlockId(currentClip?.block.id ?? null)
    if (videoClip) current.setSelectedTimelineBlockId(videoClip.block.id)
    if (element?.kind === 'character') current.restoreCharacterInspectorView()
    else current.setInspectorTab('editor')
    if (current.faceBusy || current.expressionBusy || current.faceRenderRunningRef.current) return
    const frame = currentScene.frame
    let prepared: EditorV6Document, blockId: string
    if (target === 'video' && videoClip) {
      prepared = project
      blockId = videoClip.block.id
    } else if (target === 'background') {
      if (project.timeline.tracks.some((track) => track.kind === 'video' && track.locked)) return
      prepared = editEditorV6BackgroundAtFrame(project, frame, {})
      blockId = timelineClips(prepared.timeline).find(({ block }) => block.background && block.startFrame === frame)!.block.id
    } else {
      const operation = prepareEditorV6PositionAtFrame(project, id, frame)
      if (!operation || !element) return
      prepared = operation.document
      blockId = operation.blockId
    }
    const rect = stage.getBoundingClientRect()
    const videoAsset = videoClip?.block.mediaId ? project.media?.find((media) => media.id === videoClip.block.mediaId) : undefined
    const videoLayout = videoClip?.block.mediaLayout ?? editorV6DefaultVideoLayout(videoAsset?.width, videoAsset?.height)
    dragRef.current = {
      id, target, ...(target === 'video' ? { videoLayout } : {}),
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      originalX: target === 'background' ? currentBackground.backgroundX : target === 'video' ? videoLayout.x : element!.x,
      originalY: target === 'background' ? currentBackground.backgroundY : target === 'video' ? videoLayout.y : element!.y,
      width: rect.width, height: rect.height, before: project, prepared, blockId, frame, moved: false
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: ScenePointerEvent) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const position = editorV6StageDragPosition(drag, event.clientX, event.clientY)
    if (!position) return
    drag.moved = true
    const current = dependenciesRef.current
    current.publishPlayheadFrame(drag.frame)
    current.setSelectedTimelineBlockId(drag.blockId)
    const next = moveEditorV6StageDrag(drag, position.x, position.y)
    current.updateActiveProject((project) => project.id === drag.before.id
      ? { ...next, updatedAt: new Date().toISOString() }
      : project)
    current.markUnsaved()
  }

  const endDrag = (event: ScenePointerEvent) => {
    const drag = dragRef.current
    if (drag?.pointerId !== event.pointerId) return
    if (event.type === 'pointercancel') { cancelSceneDrag(); return }
    dragRef.current = null
    if (!drag.moved) return
    const current = dependenciesRef.current
    current.recordHistory(drag.before)
    current.updateActiveProject((project) => project.id === drag.before.id
      ? { ...project, updatedAt: new Date().toISOString() }
      : project)
    current.markUnsaved()
  }

  handlersRef.current = { start: startDrag, move: moveDrag, end: endDrag }
  return { interaction, cancelSceneDrag }
}
