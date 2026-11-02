import type { FabricatorHistoryState, FabricatorProject } from '../../../../../shared/fabricator'
import type { PreparedFabricatorProject } from './projectHydration'

type LoadFabricatorSlotDependencies = {
  loadProject: (slot: number) => Promise<FabricatorProject | null>
  loadHistory: (slot: number) => Promise<FabricatorHistoryState>
  isCurrent: () => boolean
  onHistoryLoadFailure: () => void
  replaceHistory: (history: FabricatorHistoryState) => void
  prepareProject: (
    project: FabricatorProject,
    history: FabricatorHistoryState,
    isCurrent: () => boolean
  ) => Promise<PreparedFabricatorProject | null>
}

export type FabricatorSlotEditingSnapshot = {
  loaded: FabricatorProject
  history: FabricatorHistoryState
  prepared: PreparedFabricatorProject
}

/** Loads history and hydrates one Fabricator slot while honoring stale-selection guards. */
export async function loadFabricatorSlotForEditing(
  slot: number,
  dependencies: LoadFabricatorSlotDependencies
): Promise<FabricatorSlotEditingSnapshot | null> {
  const loaded = await dependencies.loadProject(slot)
  if (!dependencies.isCurrent()) return null
  if (!loaded) throw new Error('O projeto salvo não pôde ser carregado.')

  let history: FabricatorHistoryState = { undo: [], redo: [] }
  try {
    history = await dependencies.loadHistory(slot)
  } catch {
    if (!dependencies.isCurrent()) return null
    dependencies.onHistoryLoadFailure()
  }
  if (!dependencies.isCurrent()) return null

  dependencies.replaceHistory(history)
  const prepared = await dependencies.prepareProject(loaded, history, dependencies.isCurrent)
  if (!prepared || !dependencies.isCurrent()) return null

  return { loaded, history, prepared }
}
