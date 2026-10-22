/** Histórico de composição puro. Não importa React nem grava biblioteca alguma.
 * Os snapshots guardam só o estado da cena; timestamps são renovados no replay.
 */
import type { StudioDocument } from './studio'
import { snapshotStudioScene, withStudioSnapshot, type StudioSceneSnapshot } from './studioSceneModel.ts'

export type StudioHistory = { undo: StudioSceneSnapshot[]; redo: StudioSceneSnapshot[] }
export const STUDIO_HISTORY_LIMIT = 30

export function recordStudioHistory(history: StudioHistory, current: StudioDocument): StudioHistory {
  return { undo: [...history.undo.slice(-(STUDIO_HISTORY_LIMIT - 1)), snapshotStudioScene(current)], redo: [] }
}
export function undoStudioHistory(history: StudioHistory, current: StudioDocument): { history: StudioHistory; document: StudioDocument } | null {
  if (!history.undo.length) return null
  const previous = history.undo.at(-1)!
  return {
    history: {
      undo: history.undo.slice(0, -1),
      redo: [...history.redo.slice(-(STUDIO_HISTORY_LIMIT - 1)), snapshotStudioScene(current)]
    },
    document: withStudioSnapshot(current, previous)
  }
}
export function redoStudioHistory(history: StudioHistory, current: StudioDocument): { history: StudioHistory; document: StudioDocument } | null {
  if (!history.redo.length) return null
  const next = history.redo.at(-1)!
  return {
    history: {
      undo: [...history.undo.slice(-(STUDIO_HISTORY_LIMIT - 1)), snapshotStudioScene(current)],
      redo: history.redo.slice(0, -1)
    },
    document: withStudioSnapshot(current, next)
  }
}
