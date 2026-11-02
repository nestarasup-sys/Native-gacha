import type { FabricatorProject, FabricatorSlotSummary } from '../../../../shared/fabricator'
import type { FabricatorSlotEditingSnapshot } from './models/loadFabricatorSlotForEditing'

type Dependencies = {
  slot: number
  summary: NonNullable<FabricatorSlotSummary> | null
  nextGeneration: () => number
  isCurrent: (generation: number) => boolean
  setSwitching: (switching: boolean) => void
  invalidatePendingWork: () => void
  getCurrentProject: () => FabricatorProject | null
  persistCurrentProject: (project: FabricatorProject) => Promise<void>
  onSaveFailure: (reason: unknown) => void
  resetSlotSession: (slot: number) => void
  onRecoveryRequired: (slot: number) => void
  loadSnapshot: (slot: number, isCurrent: () => boolean) => Promise<FabricatorSlotEditingSnapshot | null>
  applySnapshot: (snapshot: FabricatorSlotEditingSnapshot) => void
  onLoadFailure: (reason: unknown) => void
}

/** Coordinates save-before-switch and guards every asynchronous slot-load result by generation. */
export async function selectFabricatorSlotCommand(deps: Dependencies): Promise<void> {
  const generation = deps.nextGeneration()
  deps.setSwitching(true)
  deps.invalidatePendingWork()

  const currentProject = deps.getCurrentProject()
  if (currentProject) {
    try {
      await deps.persistCurrentProject(currentProject)
    } catch (reason) {
      if (deps.isCurrent(generation)) {
        deps.onSaveFailure(reason)
        deps.setSwitching(false)
      }
      return
    }
  }

  if (!deps.isCurrent(generation)) return
  deps.resetSlotSession(deps.slot)

  if (!deps.summary) {
    deps.setSwitching(false)
    return
  }
  if (deps.summary.recoveryRequired) {
    deps.onRecoveryRequired(deps.slot)
    deps.setSwitching(false)
    return
  }

  try {
    const snapshot = await deps.loadSnapshot(deps.slot, () => deps.isCurrent(generation))
    if (!snapshot || !deps.isCurrent(generation)) return
    deps.applySnapshot(snapshot)
    deps.setSwitching(false)
  } catch (reason) {
    if (!deps.isCurrent(generation)) return
    deps.onLoadFailure(reason)
    deps.setSwitching(false)
  }
}
