import type { PointerEvent as ReactPointerEvent } from 'react'
import type { EditorV6Document, EditorV6Timeline as Timeline, EditorV6TimelineBlock as Block } from '../../../../shared/editorV6'
import { createEditorV6TimelineDragSnapshot, previewEditorV6TimelineDrag, type EditorV6TimelineDragSnapshot } from './editorV6TimelineDrag'
import type { EditorV6TimelineRowsProps } from './EditorV6TimelineRows'

type Drag = EditorV6TimelineDragSnapshot & { pointerId: number; x: number }
type Ref<T> = { current: T }
type Dependencies = {
  scrollNode: () => HTMLElement | null
  document: () => EditorV6Document
  frame: () => number
  settings: () => { pps: number; snap: boolean; heading: number }
  didDrag: Ref<boolean>
  seek: (frame: number) => void
  select: (block: Block) => void
  changeTimeline: (update: (timeline: Timeline) => Timeline) => void
  closeMenu: () => void
  setDraft: (timeline: Timeline | null) => void
  setGuide: (frame: number | undefined) => void
  setReadout: (block: Block | null) => void
}

/** Owns pointer capture and transient drag/scrub state for the timeline surface. */
export function createEditorV6TimelinePointerCommands(dependencies: Dependencies) {
  const drag: Ref<Drag | null> = { current: null }
  const scrub: Ref<number | null> = { current: null }
  const draft: Ref<Timeline | null> = { current: null }

  const onPointer: EditorV6TimelineRowsProps['onPointer'] = (event, track, block, mode) => {
    event.stopPropagation()
    if (event.button !== 0 || track.locked) return
    dependencies.seek(block.startFrame)
    dependencies.select(block)
    dependencies.closeMenu()
    dependencies.didDrag.current = false
    const snapshot = createEditorV6TimelineDragSnapshot({ initial: dependencies.document().timeline, track, block, mode })
    drag.current = { ...snapshot, pointerId: event.pointerId, x: event.clientX }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onScrub = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.type === 'pointerdown' && event.button !== 0) return
    scrub.current = event.pointerId
    if (event.type === 'pointerdown') event.currentTarget.setPointerCapture(event.pointerId)
    const node = dependencies.scrollNode()
    if (!node) return
    const { pps, heading } = dependencies.settings()
    dependencies.seek(Math.min(dependencies.document().timeline.durationFrames, Math.max(0, Math.round(
      (event.clientX - node.getBoundingClientRect().left + node.scrollLeft - heading) / pps * 30
    ))))
  }

  const cancel = () => {
    drag.current = null
    scrub.current = null
    draft.current = null
    dependencies.setDraft(null)
    dependencies.setGuide(undefined)
    dependencies.setReadout(null)
  }

  const movePointer = (event: ReactPointerEvent<HTMLElement>) => {
    if (scrub.current === event.pointerId) { onScrub(event); return }
    const operation = drag.current
    if (!operation || operation.pointerId !== event.pointerId) return
    const { pps, snap } = dependencies.settings()
    const deltaFrames = Math.round((event.clientX - operation.x) / pps * 30)
    if (!deltaFrames && !dependencies.didDrag.current) return
    dependencies.didDrag.current = true
    const preview = previewEditorV6TimelineDrag({
      snapshot: operation,
      deltaFrames,
      playheadFrame: dependencies.frame(),
      pixelsPerSecond: pps,
      snap,
      altKey: event.altKey,
      media: dependencies.document().media
    })
    draft.current = preview.timeline
    dependencies.setDraft(preview.timeline)
    dependencies.setGuide(preview.guide)
    dependencies.setReadout(preview.block)
  }

  const endPointer = (event: ReactPointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId === event.pointerId && draft.current) {
      const finalTimeline = draft.current
      dependencies.changeTimeline(() => finalTimeline)
    }
    cancel()
  }

  return { onPointer, onScrub, cancel, movePointer, endPointer }
}
