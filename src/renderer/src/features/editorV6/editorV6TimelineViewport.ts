export type EditorV6TimelineViewport = {
  scrollLeft: number
  clientWidth: number
  heading: number
}

export function clampEditorV6TimelineZoom(zoom: number) {
  return Math.min(960, Math.max(0.25, zoom))
}

export function getEditorV6TimelineCenterSeconds(viewport: EditorV6TimelineViewport, pixelsPerSecond: number) {
  return (viewport.scrollLeft + Math.max(0, viewport.clientWidth - viewport.heading) / 2) / pixelsPerSecond
}

export function getEditorV6TimelineScrollForZoom(viewport: EditorV6TimelineViewport, centerSeconds: number, pixelsPerSecond: number) {
  return Math.max(0, centerSeconds * pixelsPerSecond - (viewport.clientWidth - viewport.heading) / 2)
}

export function getEditorV6TimelineFitZoom(clientWidth: number, heading: number, durationFrames: number) {
  return Math.max(1, clientWidth - heading - 12) / (durationFrames / 30)
}

export function getEditorV6TimelineFollowScroll(viewport: EditorV6TimelineViewport, pixelsPerSecond: number, frame: number) {
  const playheadX = viewport.heading + frame / 30 * pixelsPerSecond
  if (playheadX > viewport.scrollLeft + viewport.clientWidth * 0.8 || playheadX < viewport.scrollLeft + viewport.heading) {
    return Math.max(0, playheadX - viewport.clientWidth * 0.5)
  }
  return null
}
