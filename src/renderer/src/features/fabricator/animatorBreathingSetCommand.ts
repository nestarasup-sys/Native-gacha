import { resolvePoseCategory } from '../../../../shared/fabricator'
import type {
  AnimatorAnimation,
  AnimatorAnimationAsset,
  AnimatorAnimationSave,
  AnimatorAnimationSummary,
  FabricatorPose,
  FabricatorPoseSummary,
  FabricatorProject
} from '../../../../shared/fabricator'
import type { BreathingVariation } from './models/animatorBreathingModel'

export type AnimatorBreathingSetCommandDependencies = {
  source: FabricatorProject | null
  modelSlot: number | null
  characterId: string
  saving: boolean
  breathingSaving: boolean
  summaries: AnimatorAnimationSummary[]
  slotCount: number
  variations: readonly BreathingVariation[]
  listPoseSlots: (modelSlot: number) => Promise<FabricatorPoseSummary[]>
  listAnimations: (modelSlot: number) => Promise<AnimatorAnimationSummary[]>
  loadAnimation: (modelSlot: number, slot: number) => Promise<AnimatorAnimation | null>
  loadPose: (modelSlot: number, slot: number) => Promise<FabricatorPose | null>
  createAnimation: (
    source: FabricatorProject,
    pose: FabricatorPose,
    slot: number,
    characterId: string | null,
    variation: BreathingVariation
  ) => Promise<AnimatorAnimation>
  serializeAnimation: (animation: AnimatorAnimation) => AnimatorAnimationSave
  saveAnimation: (
    modelSlot: number,
    slot: number,
    animation: AnimatorAnimationSave,
    assets: AnimatorAnimationAsset[]
  ) => Promise<void>
  deleteAnimation: (modelSlot: number, slot: number) => Promise<void>
  setBreathingSaving: (saving: boolean) => void
  setSummaries: (summaries: AnimatorAnimationSummary[]) => void
  setSaveMessage: (message: string) => void
  setBreathingDialog: (open: boolean) => void
  setError: (error: string) => void
}

export function createAnimatorBreathingSetCommand(dependencies: AnimatorBreathingSetCommandDependencies) {
  return async (): Promise<void> => {
    const { source, modelSlot, saving, breathingSaving } = dependencies
    if (!source || modelSlot === null || breathingSaving || saving) return

    dependencies.setBreathingSaving(true)
    dependencies.setError('')
    const replacementSlots: number[] = []
    let previousBreathing: AnimatorAnimation[] = []
    let replacementStarted = false
    try {
      const [poseSummaries, summariesBefore] = await Promise.all([
        dependencies.listPoseSlots(modelSlot),
        dependencies.listAnimations(modelSlot)
      ])
      const oldBreathing = await Promise.all(summariesBefore
        .filter((item) => item.name.startsWith('Respiração ·'))
        .map(async (item) => {
          const animation = await dependencies.loadAnimation(modelSlot, item.slot)
          if (!animation) throw new Error(`Não consegui ler a animação de respiração no slot ${item.slot}; não alterei nenhum slot.`)
          return animation
        }))
      previousBreathing = oldBreathing

      const poses = await Promise.all(poseSummaries.map(async (summary) => {
        if (!summary) return null
        const pose = await dependencies.loadPose(modelSlot, summary.slot)
        return pose ? { pose, category: resolvePoseCategory(pose) } : null
      }))
      const standing = poses.find((entry) => entry?.category.toLocaleLowerCase('pt-BR').includes('parad'))
      const sitting = poses.find((entry) => entry?.category.toLocaleLowerCase('pt-BR').includes('sentad'))
      if (!standing || !sitting) throw new Error('Salve pelo menos uma pose “Parado” e uma “Sentado” em Poses Dev para criar as variações.')

      const replaceable = new Set(oldBreathing.map((item) => item.slot))
      const occupied = new Set(summariesBefore.filter((item) => !replaceable.has(item.slot)).map((item) => item.slot))
      const freeSlots = Array.from({ length: dependencies.slotCount }, (_, index) => index + 1).filter((slot) => !occupied.has(slot))
      const needed = dependencies.variations.length * 2
      if (freeSlots.length < needed) throw new Error(`São necessários ${needed} slots livres; este modelo tem ${freeSlots.length}. Libere slots sem animação para continuar.`)

      const plans = [
        ...dependencies.variations.map((variation) => ({ pose: standing.pose, variation })),
        ...dependencies.variations.map((variation) => ({ pose: sitting.pose, variation }))
      ]
      const newAnimations = await Promise.all(plans.map((plan, index) => dependencies.createAnimation(
        source,
        plan.pose,
        freeSlots[index],
        dependencies.characterId || null,
        plan.variation
      )))

      replacementStarted = true
      for (const old of oldBreathing) await dependencies.deleteAnimation(modelSlot, old.slot)
      for (const animation of newAnimations) {
        const assets: AnimatorAnimationAsset[] = animation.parts.map((part) => ({ id: part.id, dataUrl: part.dataUrl }))
        replacementSlots.push(animation.slot)
        await dependencies.saveAnimation(modelSlot, animation.slot, dependencies.serializeAnimation(animation), assets)
      }

      dependencies.setSummaries(await dependencies.listAnimations(modelSlot))
      dependencies.setSaveMessage(`${needed} variações de respiração salvas`)
      dependencies.setBreathingDialog(false)
    } catch (reason) {
      // This batch owns only the empty slots reserved above; roll back its partial writes.
      await Promise.all(replacementSlots.map((slot) => dependencies.deleteAnimation(modelSlot, slot).catch(() => undefined)))
      // If a write failed after replacement began, restore the old breathing set.
      if (replacementStarted) for (const old of previousBreathing) {
        const assets: AnimatorAnimationAsset[] = old.parts.map((part) => ({ id: part.id, dataUrl: part.dataUrl }))
        await dependencies.saveAnimation(modelSlot, old.slot, dependencies.serializeAnimation(old), assets).catch(() => undefined)
      }
      if (replacementStarted) dependencies.setSummaries(await dependencies.listAnimations(modelSlot).catch(() => dependencies.summaries))
      dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível criar as animações de respiração.')
    } finally {
      dependencies.setBreathingSaving(false)
    }
  }
}
