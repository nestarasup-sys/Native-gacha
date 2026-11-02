import type { AnimatorAnimation, AnimatorAnimationDraft } from '../../../../shared/fabricator'

export type AnimatorDeleteAnimationCommandDependencies = {
  saving: boolean
  animation: AnimatorAnimation | null
  confirm: (message: string) => boolean
  clearDraftTimer: () => void
  waitForWrites: () => Promise<unknown>
  deleteSavedAnimation: (modelSlot: number, animationSlot: number) => Promise<void>
  loadSavedDraft: (modelSlot: number) => Promise<AnimatorAnimationDraft | null>
  deleteSavedDraft: (modelSlot: number) => Promise<void>
  resetAfterSuccess: (animationSlot: number) => void
  setError: (error: string) => void
}

export function createAnimatorDeleteAnimationCommand(dependencies: AnimatorDeleteAnimationCommandDependencies) {
  return async (): Promise<void> => {
    const animation = dependencies.animation
    if (dependencies.saving || !animation || !dependencies.confirm(`Excluir a animação “${animation.name}” do slot ${animation.slot}?`)) return

    dependencies.clearDraftTimer()
    try {
      await dependencies.waitForWrites().catch(() => undefined)
      await dependencies.deleteSavedAnimation(animation.sourceModelSlot, animation.slot)
      const savedDraft = await dependencies.loadSavedDraft(animation.sourceModelSlot)
      if (savedDraft?.editingSlot === animation.slot) await dependencies.deleteSavedDraft(animation.sourceModelSlot)
      dependencies.resetAfterSuccess(animation.slot)
    } catch (reason) {
      dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível excluir a animação.')
    }
  }
}
