import { FABRICATOR_POSE_SLOT_COUNT, type FabricatorProject, type FabricatorPose } from '../../../../../shared/fabricator.ts'
import type { CharacterRenderAssetProvider } from '../../../../../shared/characterRenderAssets'

/** Missing saved slots use the first surviving pose of this model; an empty
 * library uses the mounted model. Explicit model-only states stay model-only. */
export function createMotionPoseResolver(
  source: FabricatorProject,
  provider: Pick<CharacterRenderAssetProvider, 'loadFabricatorPose'>
): (slot: number | null | undefined) => Promise<FabricatorProject | FabricatorPose> {
  let fallback: Promise<FabricatorProject | FabricatorPose> | undefined
  return async slot => {
    if (slot === null || slot === undefined) return source
    const requested = await provider.loadFabricatorPose(source.slot, slot)
    if (requested) return requested
    fallback ??= (async () => {
      for (let candidate = 1; candidate <= FABRICATOR_POSE_SLOT_COUNT; candidate++) {
        if (candidate === slot) continue
        const pose = await provider.loadFabricatorPose(source.slot, candidate)
        if (pose) return pose
      }
      return source
    })()
    return fallback
  }
}
