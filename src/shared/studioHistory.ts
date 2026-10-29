/** Histórico de composição puro. Não importa React nem grava biblioteca alguma.
 * Os snapshots guardam só o estado da cena; timestamps são renovados no replay.
 */
import type { StudioDocument } from './studio'
import { snapshotStudioScene, withStudioSnapshot, type StudioSceneSnapshot } from './studioSceneModel.ts'
import { recordSceneHistory, redoSceneHistory, SCENE_HISTORY_LIMIT, undoSceneHistory, type SceneHistory, type SceneHistoryAdapter, type SceneHistoryResult } from './sceneHistory.ts'

export type StudioHistory = SceneHistory<StudioSceneSnapshot>
export const STUDIO_HISTORY_LIMIT = SCENE_HISTORY_LIMIT

const studioHistoryAdapter = {
  limit: STUDIO_HISTORY_LIMIT,
  snapshot: snapshotStudioScene,
  restore: withStudioSnapshot
} satisfies SceneHistoryAdapter<StudioDocument, StudioSceneSnapshot>

export function recordStudioHistory(history: StudioHistory, current: StudioDocument): StudioHistory {
  return recordSceneHistory(history, current, studioHistoryAdapter)
}

export function undoStudioHistory(history: StudioHistory, current: StudioDocument): SceneHistoryResult<StudioDocument, StudioSceneSnapshot> | null {
  return undoSceneHistory(history, current, studioHistoryAdapter)
}

export function redoStudioHistory(history: StudioHistory, current: StudioDocument): SceneHistoryResult<StudioDocument, StudioSceneSnapshot> | null {
  return redoSceneHistory(history, current, studioHistoryAdapter)
}
