import { useCallback, useMemo, useRef } from 'react'
import type { EditorV6Document } from '../../../../shared/editorV6'
import { editorV6ClipAtFrame, timelineClips } from '../../../../shared/editorV6TimelineCore'
import { resolveEditorV6SceneAtFrame } from '../../../../shared/editorV6TimelineScene'
import { editorV6StageDragPosition, moveEditorV6StageDrag, prepareEditorV6StageDrag, type EditorV6StageDrag } from './editorV6StageDrag'
import { commitEditorV6StageDrag, rollbackEditorV6StageDrag } from './editorV6StageDragLifecycle'
import { getEditorV6PlaybackFrame } from './editorV6PlaybackClock'
import type { ScenePointerEvent, SceneSurfaceInteraction } from './SceneSurface'

type StageDragTarget = 'element' | 'background' | 'video'
export { editorV6StageDragPosition, moveEditorV6StageDrag }
export type { EditorV6StageDrag } from './editorV6StageDrag'

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
    rollbackEditorV6StageDrag(drag, {
      updateActiveProject: dependenciesRef.current.updateActiveProject,
      setSelectedTimelineBlockId: dependenciesRef.current.setSelectedTimelineBlockId,
      markUnsaved: dependenciesRef.current.markUnsaved,
      now: () => new Date().toISOString()
    })
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
    const rect = stage.getBoundingClientRect()
    const drag = prepareEditorV6StageDrag({
      project,
      scene: currentScene,
      id,
      target,
      element,
      videoClip,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height
    })
    if (!drag) return
    dragRef.current = drag
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
    commitEditorV6StageDrag(drag, {
      updateActiveProject: dependenciesRef.current.updateActiveProject,
      markUnsaved: dependenciesRef.current.markUnsaved,
      recordHistory: dependenciesRef.current.recordHistory,
      now: () => new Date().toISOString()
    })
  }

  handlersRef.current = { start: startDrag, move: moveDrag, end: endDrag }
  return { interaction, cancelSceneDrag }
}
