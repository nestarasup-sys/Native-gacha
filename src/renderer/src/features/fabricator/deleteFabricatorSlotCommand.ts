import type { FabricatorProject, FabricatorSlotSummary } from '../../../../shared/fabricator'

type Deps = {
  slot: number
  summary: NonNullable<FabricatorSlotSummary> | null
  activeSlot: number
  deletionInProgress: boolean
  confirm: (message: string) => boolean
  setDeletingSlot: (slot: number | null) => void
  invalidateActiveProject: () => void
  waitForProjectWrites: () => Promise<void>
  deleteSlot: (slot: number) => Promise<void>
  removeSlotSummary: () => void
  clearActiveProject: () => void
  setError: (message: string) => void
  getCurrentProject: () => FabricatorProject | null
  restoreActiveProject: (project: FabricatorProject) => void
  reloadActiveSlot: (slot: number) => Promise<void>
  now: () => string
}

export async function deleteFabricatorSlotCommand(deps: Deps) {
  const { slot, summary, activeSlot, deletionInProgress } = deps
  if (!summary || deletionInProgress) return false

  const confirmation = summary.recoveryRequired
    ? `Limpar permanentemente a recuperação pendente do slot ${slot}? Todos os backups, arquivos temporários e transações deste slot serão apagados sem possibilidade de restauração.`
    : `Excluir permanentemente “${summary.name}” do slot ${slot}? A imagem original, as peças salvas, os backups e as transações pendentes deste slot serão apagados sem possibilidade de restauração.`
  if (!deps.confirm(confirmation)) return false

  deps.setDeletingSlot(slot)
  const isActiveSlot = activeSlot === slot
  if (isActiveSlot) deps.invalidateActiveProject()

  try {
    await deps.waitForProjectWrites()
    await deps.deleteSlot(slot)
    deps.removeSlotSummary()
    if (isActiveSlot) deps.clearActiveProject()
    return true
  } catch (reason) {
    deps.setError(reason instanceof Error ? `Não foi possível excluir o modelo: ${reason.message}` : 'Não foi possível excluir o modelo.')
    if (isActiveSlot) {
      const currentProject = deps.getCurrentProject()
      if (currentProject) deps.restoreActiveProject({ ...currentProject, updatedAt: deps.now() })
      else await deps.reloadActiveSlot(slot)
    }
    return false
  } finally {
    deps.setDeletingSlot(null)
  }
}
