import { useCallback, useEffect, useState } from 'react'
import type { RefObject, UIEvent } from 'react'

export type EditorV6TimelineViewportMetrics = {
  left: number
  width: number
}

export function readEditorV6TimelineViewport(node: Pick<HTMLElement, 'scrollLeft' | 'clientWidth'>): EditorV6TimelineViewportMetrics {
  return { left: node.scrollLeft, width: node.clientWidth }
}

export function useEditorV6TimelineViewport(scrollRef: RefObject<HTMLDivElement | null>) {
  const [viewport, setViewport] = useState<EditorV6TimelineViewportMetrics>({ left: 0, width: 800 })
  const measure = useCallback((node: HTMLDivElement) => setViewport(readEditorV6TimelineViewport(node)), [])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const observer = new ResizeObserver(() => measure(node))
    observer.observe(node)
    return () => observer.disconnect()
  }, [measure, scrollRef])

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => measure(event.currentTarget), [measure])
  return { viewport, onScroll }
}
