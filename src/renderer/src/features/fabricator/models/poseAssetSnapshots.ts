import type { FabricatorAssetSave, PosePart } from '../../../../../shared/fabricator'

type PoseImageSource = Pick<PosePart, 'id' | 'dataUrl'>

/** Sends the complete in-memory image set so persistence can recreate missing draft files. */
export function poseAssetsForPersistence(parts: readonly PoseImageSource[]): FabricatorAssetSave[] {
  return parts.map(({ id, dataUrl }) => ({ id, dataUrl }))
}
