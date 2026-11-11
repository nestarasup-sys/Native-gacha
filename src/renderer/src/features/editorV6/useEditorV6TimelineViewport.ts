import { useCallback, useEffect, useState } from 'react'
import type { RefObject, UIEvent } from 'react'
import { getEditorV6TimelineFollowScroll } from './editorV6TimelineViewport'

export type EditorV6TimelineViewportMetrics = {
  left: number
  width: number
}

export function readEditorV6TimelineViewport(node: Pick<HTMLElement, 'scrollLeft' | 'clientWidth'>): EditorV6TimelineViewportMetrics {
  return { left: node.scrollLeft, width: node.clientWidth }
}

export type UseEditorV6TimelineViewportOptions = {
  playing: boolean
  playbackFrame: number
  pixelsPerSecond: number
  heading: number
}

export function useEditorV6TimelineViewport(scrollRef: RefObject<HTMLDivElement | null>, { playing, playbackFrame, pixelsPerSecond, heading }: UseEditorV6TimelineViewportOptions) {
  const [viewport, setViewport] = useState<EditorV6TimelineViewportMetrics>({ left: 0, width: 800 })
  const measure = useCallback((node: HTMLDivElement) => setViewport(readEditorV6TimelineViewport(node)), [])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const observer = new ResizeObserver(() => measure(node))
    observer.observe(node)
    return () => observer.disconnect()
  }, [measure, scrollRef])

  useEffect(() => {
    const node = scrollRef.current
    if (!playing || !node) return
    const nextScroll = getEditorV6TimelineFollowScroll({ scrollLeft: node.scrollLeft, clientWidth: node.clientWidth, heading }, pixelsPerSecond, playbackFrame)
    if (nextScroll !== null) node.scrollLeft = nextScroll
  }, [heading, pixelsPerSecond, playbackFrame, playing, scrollRef])

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => measure(event.currentTarget), [measure])
  return { scrollRef, viewport, onScroll }
}
