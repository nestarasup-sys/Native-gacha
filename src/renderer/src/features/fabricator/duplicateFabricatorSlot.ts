import type { FabricatorProject, FabricatorSlotSummary } from '../../../../shared/fabricator'

type DuplicateFabricatorSlotDependencies = {
  source: FabricatorProject | null
  targetSlot: number | null
  targetOccupied: boolean
  cancelScheduledSave: () => void
  persistProject: (project: FabricatorProject) => Promise<void>
  duplicateSlot: (sourceSlot: number, targetSlot: number) => Promise<void>
  setBusy: (busy: boolean) => void
  setError: (message: string) => void
  setSlotSummary: (summary: NonNullable<FabricatorSlotSummary>) => void
  broadcastAssetsUpdated: () => void
  closeDialog: () => void
  clearTargetSlot: () => void
  now: () => string
}

/** Saves the current project before asking the Fabricator owner to duplicate its slot. */
export async function duplicateFabricatorSlot(dependencies: DuplicateFabricatorSlotDependencies): Promise<void> {
  const { source, targetSlot } = dependencies
  if (!source || !targetSlot || targetSlot === source.slot || dependencies.targetOccupied) return

  dependencies.setBusy(true)
  dependencies.setError('')
  try {
    dependencies.cancelScheduledSave()
    await dependencies.persistProject(source)
    await dependencies.duplicateSlot(source.slot, targetSlot)
    dependencies.setSlotSummary({
      slot: targetSlot,
      name: source.name,
      sourceName: source.sourceName,
      partCount: source.parts.length,
      updatedAt: dependencies.now()
    })
    dependencies.broadcastAssetsUpdated()
    dependencies.closeDialog()
    dependencies.clearTargetSlot()
  } catch (reason) {
    dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível duplicar o modelo.')
  } finally {
    dependencies.setBusy(false)
  }
}
