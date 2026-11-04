import type { CustomizerCharacter } from '../../../../../shared/customizer'
import type { CharacterRenderAssetProvider } from '../../../../../shared/characterRenderAssets'

/**
 * Resolve immutable Fabricator *source* models and poses once for all
 * character/pose groups in THIS hair export. The source resolver still applies
 * each character's own skin, proportions, torso and body shape individually.
 *
 * The model and pose data may be shared safely; a shaped *renderer* may not.
 * Every fresh export creates a fresh batch. No storage or persistent cache.
 */
export function createEditorV6HairSourceBatch(provider: CharacterRenderAssetProvider) {
  type Model = Awaited<ReturnType<typeof provider.loadFabricatorSlot>>
  type Pose = Awaited<ReturnType<typeof provider.loadFabricatorPose>>
  const models = new Map<number, Promise<Model>>()
  const poses = new Map<string, Promise<Pose>>()
  let modelReads = 0, poseReads = 0, modelReuses = 0, poseReuses = 0

  const loadModel = (slot: number): Promise<Model> => {
    const previous = models.get(slot)
    if (previous) { modelReuses++; return previous }
    modelReads++
    const result = Promise.resolve().then(() => provider.loadFabricatorSlot(slot))
    models.set(slot, result)
    void result.catch(() => { if (models.get(slot) === result) models.delete(slot) })
    return result
  }
  const loadPose = (slot: number, poseSlot: NonNullable<CustomizerCharacter['customization']['poseSlot']>): Promise<Pose> => {
    const key = JSON.stringify([slot, poseSlot])
    const previous = poses.get(key)
    if (previous) { poseReuses++; return previous }
    poseReads++
    const result = Promise.resolve().then(() => provider.loadFabricatorPose(slot, poseSlot))
    poses.set(key, result)
    void result.catch(() => { if (poses.get(key) === result) poses.delete(key) })
    return result
  }
  return {
    async sourceFor(character: CustomizerCharacter) {
      const modelSlot = character.customization.modelSlot ?? 1
      const source = await loadModel(modelSlot)
      if (!source) throw Error(`O modelo de ${character.name} não está disponível.`)
      const poseSlot = character.customization.poseSlot
      // Null denotes the base model; undefined follows the normal Fabricator
      // default pose lookup. Preserve both source resolver semantics.
      const artwork = poseSlot === null ? source : (await loadPose(modelSlot, poseSlot)) ?? source
      return { source, artwork, assetProvider: provider }
    },
    stats() { return { modelReads, poseReads, modelReuses, poseReuses } },
    clear() { models.clear(); poses.clear() }
  }
}
