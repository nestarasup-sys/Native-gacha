import {
  clampEditorV6TimelineZoom,
  getEditorV6TimelineCenterSeconds,
  getEditorV6TimelineFitZoom,
  getEditorV6TimelineScrollForZoom
} from './editorV6TimelineViewport'

export type EditorV6TimelineZoomNode = {
  scrollLeft: number
  clientWidth: number
}

export type EditorV6TimelineZoomDependencies = {
  getScrollNode: () => EditorV6TimelineZoomNode | null
  getPixelsPerSecond: () => number
  setPixelsPerSecond: (pixelsPerSecond: number) => void
  getHeading: () => number
  getDurationFrames: () => number
  requestFrame: (callback: () => void) => void
}

export function createEditorV6TimelineZoomCommands(dependencies: EditorV6TimelineZoomDependencies) {
  let previousZoom = 72
  let fitActive = false

  const zoomTo = (next: number) => {
    const node = dependencies.getScrollNode()
    const old = dependencies.getPixelsPerSecond()
    const viewport = node ? { scrollLeft: node.scrollLeft, clientWidth: node.clientWidth, heading: dependencies.getHeading() } : null
    const center = viewport ? getEditorV6TimelineCenterSeconds(viewport, old) : 0
    const value = clampEditorV6TimelineZoom(next)
    dependencies.setPixelsPerSecond(value)
    dependencies.requestFrame(() => {
      if (!node || !viewport) return
      node.scrollLeft = getEditorV6TimelineScrollForZoom({ ...viewport, clientWidth: node.clientWidth, heading: dependencies.getHeading() }, center, value)
    })
  }

  const zoomBy = (factor: number) => {
    fitActive = false
    zoomTo(dependencies.getPixelsPerSecond() * factor)
  }

  const fit = () => {
    if (fitActive) {
      zoomTo(previousZoom)
      fitActive = false
      return
    }
    previousZoom = dependencies.getPixelsPerSecond()
    fitActive = true
    const node = dependencies.getScrollNode()
    zoomTo(getEditorV6TimelineFitZoom(node?.clientWidth ?? 800, dependencies.getHeading(), dependencies.getDurationFrames()))
    dependencies.requestFrame(() => {
      const currentNode = dependencies.getScrollNode()
      if (currentNode) currentNode.scrollLeft = 0
    })
  }

  return {
    zoomIn: () => zoomBy(1.25),
    zoomOut: () => zoomBy(1 / 1.25),
    fit
  }
}
