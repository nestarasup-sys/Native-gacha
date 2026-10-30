import type { ModelSourcePoint } from './modelSourceEditing'

export type ModelSourceGuideLine = { id: string; start: ModelSourcePoint; end: ModelSourcePoint }
export type ModelSourceGuideSet = { partId: string; lines: ModelSourceGuideLine[] }

export function emptyModelSourceGuideSet(partId: string): ModelSourceGuideSet {
  return { partId, lines: [] }
}

export function createModelSourceGuideLine(start: ModelSourcePoint, end: ModelSourcePoint, id: string): ModelSourceGuideLine | null {
  if (Math.hypot(end.x - start.x, end.y - start.y) < 2) return null
  return { id, start, end }
}

export function appendModelSourceGuideLine(current: ModelSourceGuideSet, partId: string, line: ModelSourceGuideLine): ModelSourceGuideSet {
  return { partId, lines: [...(current.partId === partId ? current.lines : []), line] }
}

export function modelSourceGuideLinesForPart(guides: ModelSourceGuideSet, partId: string): ModelSourceGuideLine[] {
  return guides.partId === partId ? guides.lines : []
}
