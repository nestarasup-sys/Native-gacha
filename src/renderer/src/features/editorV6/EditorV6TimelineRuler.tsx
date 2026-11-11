import { useMemo, type PointerEvent as ReactPointerEvent } from 'react'
import type { EditorV6Timeline as Timeline } from '../../../../shared/editorV6'
import { getEditorV6TimelineRulerTicks, getEditorV6TimelineTickSeconds } from './editorV6TimelineViewModel'

type Props = {
  timeline: Timeline
  pixelsPerSecond: number
  width: number
  heading: number
  range: [number, number]
  onScrub: (event: ReactPointerEvent<HTMLElement>) => void
}

export function EditorV6TimelineRuler({ timeline, pixelsPerSecond, width, heading, range, onScrub }: Props) {
  const tickSeconds = getEditorV6TimelineTickSeconds(pixelsPerSecond)
  const ticks = useMemo(() => getEditorV6TimelineRulerTicks(range, timeline.durationFrames, tickSeconds), [range, timeline.durationFrames, tickSeconds])

  return <div className="editor-v6-timeline-ruler-row" style={{ gridTemplateColumns: `${heading}px ${width}px` }}>
    <div className="editor-v6-timeline-track-heading">FAIXAS <span>{timeline.tracks.length + 1}</span></div>
    <div className="editor-v6-timeline-ruler" style={{ width, backgroundSize: `${pixelsPerSecond}px 100%` }} onPointerDown={onScrub}>{ticks.map((second) => <span key={second} style={{ left: second * pixelsPerSecond }}>{second}s</span>)}</div>
  </div>
}
