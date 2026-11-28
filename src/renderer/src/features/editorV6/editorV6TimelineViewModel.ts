export type EditorV6TimelineViewportRangeInput = {
  scrollLeft: number
  viewportWidth: number
  heading: number
  pixelsPerSecond: number
  durationFrames: number
  overscanPixels?: number
}

export function getEditorV6TimelineContentWidth(input: Pick<EditorV6TimelineViewportRangeInput, 'viewportWidth' | 'heading' | 'pixelsPerSecond' | 'durationFrames'>) {
  return Math.max(input.viewportWidth - input.heading, input.durationFrames / EDITOR_V6_TIMELINE_FPS * input.pixelsPerSecond)
}

export function getEditorV6TimelineVisibleFrameRange(input: EditorV6TimelineViewportRangeInput): [number, number] {
  const overscan = input.overscanPixels ?? 160
  return [
    Math.max(0, (input.scrollLeft - input.heading - overscan) / input.pixelsPerSecond * EDITOR_V6_TIMELINE_FPS),
    (input.scrollLeft + input.viewportWidth + overscan) / input.pixelsPerSecond * EDITOR_V6_TIMELINE_FPS
  ]
}

export function getEditorV6TimelineTickSeconds(pixelsPerSecond: number) {
  return pixelsPerSecond >= 120 ? 0.5 : pixelsPerSecond >= 35 ? 1 : pixelsPerSecond >= 8 ? 5 : pixelsPerSecond >= 2 ? 30 : 120
}

export function getEditorV6TimelineRulerTicks(range: [number, number], durationFrames: number, tickSeconds: number) {
  const durationSeconds = durationFrames / EDITOR_V6_TIMELINE_FPS
  const firstTick = Math.max(0, Math.floor(range[0] / EDITOR_V6_TIMELINE_FPS / tickSeconds) * tickSeconds)
  const lastTick = Math.min(durationSeconds, range[1] / EDITOR_V6_TIMELINE_FPS)
  const ticks: number[] = []
  for (let second = firstTick; second <= lastTick; second += tickSeconds) ticks.push(second)
  return ticks
}
import { EDITOR_V6_TIMELINE_FPS } from '../../../../shared/editorV6Timing'
