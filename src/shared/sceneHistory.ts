/** Reusable immutable undo/redo mechanics for scenes with domain-specific snapshots. */
export const SCENE_HISTORY_LIMIT = 30

export type SceneHistory<Snapshot> = { undo: Snapshot[]; redo: Snapshot[] }

export type SceneHistoryAdapter<Document, Snapshot> = {
  limit: number
  snapshot: (document: Document) => Snapshot
  restore: (document: Document, snapshot: Snapshot) => Document
}

export type SceneHistoryResult<Document, Snapshot> = {
  history: SceneHistory<Snapshot>
  document: Document
}

function appendWithinLimit<T>(items: T[], item: T, limit: number): T[] {
  const retainedCount = Math.max(0, limit - 1)
  const startIndex = Math.max(0, items.length - retainedCount)
  return [...items.slice(startIndex), item]
}

export function recordSceneHistory<Document, Snapshot>(
  history: SceneHistory<Snapshot>,
  current: Document,
  adapter: SceneHistoryAdapter<Document, Snapshot>
): SceneHistory<Snapshot> {
  return { undo: appendWithinLimit(history.undo, adapter.snapshot(current), adapter.limit), redo: [] }
}

export function undoSceneHistory<Document, Snapshot>(
  history: SceneHistory<Snapshot>,
  current: Document,
  adapter: SceneHistoryAdapter<Document, Snapshot>
): SceneHistoryResult<Document, Snapshot> | null {
  if (!history.undo.length) return null
  const previous = history.undo.at(-1)!
  return {
    history: {
      undo: history.undo.slice(0, -1),
      redo: appendWithinLimit(history.redo, adapter.snapshot(current), adapter.limit)
    },
    document: adapter.restore(current, previous)
  }
}

export function redoSceneHistory<Document, Snapshot>(
  history: SceneHistory<Snapshot>,
  current: Document,
  adapter: SceneHistoryAdapter<Document, Snapshot>
): SceneHistoryResult<Document, Snapshot> | null {
  if (!history.redo.length) return null
  const next = history.redo.at(-1)!
  return {
    history: {
      undo: appendWithinLimit(history.undo, adapter.snapshot(current), adapter.limit),
      redo: history.redo.slice(0, -1)
    },
    document: adapter.restore(current, next)
  }
}
