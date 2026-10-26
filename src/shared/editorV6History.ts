/** Histórico de composição puro. Não importa React nem grava biblioteca alguma.
 * Os snapshots guardam só o estado da cena; timestamps são renovados no replay.
 */
import type { EditorV6Document } from './editorV6'
import { snapshotEditorV6Scene, withEditorV6Snapshot, type EditorV6SceneSnapshot } from './editorV6SceneModel.ts'

export type EditorV6History = { undo: EditorV6SceneSnapshot[]; redo: EditorV6SceneSnapshot[] }
export const STUDIO_HISTORY_LIMIT = 30

export function recordEditorV6History(history: EditorV6History, current: EditorV6Document): EditorV6History {
  return { undo: [...history.undo.slice(-(STUDIO_HISTORY_LIMIT - 1)), snapshotEditorV6Scene(current)], redo: [] }
}
export function undoEditorV6History(history: EditorV6History, current: EditorV6Document): { history: EditorV6History; document: EditorV6Document } | null {
  if (!history.undo.length) return null
  const previous = history.undo.at(-1)!
  return {
    history: {
      undo: history.undo.slice(0, -1),
      redo: [...history.redo.slice(-(STUDIO_HISTORY_LIMIT - 1)), snapshotEditorV6Scene(current)]
    },
    document: withEditorV6Snapshot(current, previous)
  }
}
export function redoEditorV6History(history: EditorV6History, current: EditorV6Document): { history: EditorV6History; document: EditorV6Document } | null {
  if (!history.redo.length) return null
  const next = history.redo.at(-1)!
  return {
    history: {
      undo: [...history.undo.slice(-(STUDIO_HISTORY_LIMIT - 1)), snapshotEditorV6Scene(current)],
      redo: history.redo.slice(0, -1)
    },
    document: withEditorV6Snapshot(current, next)
  }
}
