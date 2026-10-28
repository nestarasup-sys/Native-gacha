import { selectCharacterArtwork } from '../../../../shared/characterSourceContinuity'
import type { FabricatorPose, FabricatorProject } from '../../../../shared/fabricator'
import type { CatalogArtwork } from '../../characters/characterRenderer'

export type ArtworkSourceLoaders = {
  loadModel: (modelSlot: number) => Promise<FabricatorProject | null>
  loadPose: (modelSlot: number, poseSlot: number) => Promise<FabricatorPose | null>
}

export type CustomizerArtworkSource =
  | { status: 'missing-model' }
  | { status: 'invalid-pose' }
  | { status: 'ready'; sourceProject: FabricatorProject; artwork: CatalogArtwork }

/** Loads and validates the model/pose pair used by the Customizer and its wardrobe. */
export async function loadCustomizerArtworkSource(
  modelSlot: number,
  poseSlot: number | null,
  loaders: ArtworkSourceLoaders,
  cachedModel?: FabricatorProject | null
): Promise<CustomizerArtworkSource> {
  const sourceProject = cachedModel?.slot === modelSlot ? cachedModel : await loaders.loadModel(modelSlot)
  if (!sourceProject) return { status: 'missing-model' }

  const pose = poseSlot === null ? null : await loaders.loadPose(modelSlot, poseSlot)
  const artwork = selectCharacterArtwork(sourceProject, pose, poseSlot)
  if (!artwork) return { status: 'invalid-pose' }

  return { status: 'ready', sourceProject, artwork }
}
