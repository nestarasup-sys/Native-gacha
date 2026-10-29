/** Histórico de composição puro. Não importa React nem grava biblioteca alguma.
 * Os snapshots guardam só o estado da cena; timestamps são renovados no replay.
 */
import type { EditorV6Document } from './editorV6'
import { snapshotEditorV6Scene, withEditorV6Snapshot, type EditorV6SceneSnapshot } from './editorV6SceneModel.ts'
import { recordSceneHistory, redoSceneHistory, SCENE_HISTORY_LIMIT, undoSceneHistory, type SceneHistory, type SceneHistoryAdapter, type SceneHistoryResult } from './sceneHistory.ts'

export type EditorV6History = SceneHistory<EditorV6SceneSnapshot>
export const EDITOR_V6_HISTORY_LIMIT = SCENE_HISTORY_LIMIT
/** @deprecated Use EDITOR_V6_HISTORY_LIMIT. Kept as an alias for existing imports. */
export const STUDIO_HISTORY_LIMIT = EDITOR_V6_HISTORY_LIMIT

const editorV6HistoryAdapter = {
  limit: EDITOR_V6_HISTORY_LIMIT,
  snapshot: snapshotEditorV6Scene,
  restore: withEditorV6Snapshot
} satisfies SceneHistoryAdapter<EditorV6Document, EditorV6SceneSnapshot>

export function recordEditorV6History(history: EditorV6History, current: EditorV6Document): EditorV6History {
  return recordSceneHistory(history, current, editorV6HistoryAdapter)
}

export function undoEditorV6History(history: EditorV6History, current: EditorV6Document): SceneHistoryResult<EditorV6Document, EditorV6SceneSnapshot> | null {
  return undoSceneHistory(history, current, editorV6HistoryAdapter)
}

export function redoEditorV6History(history: EditorV6History, current: EditorV6Document): SceneHistoryResult<EditorV6Document, EditorV6SceneSnapshot> | null {
  return redoSceneHistory(history, current, editorV6HistoryAdapter)
}
