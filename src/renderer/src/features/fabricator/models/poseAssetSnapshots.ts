import type { FabricatorAssetSave, PosePart } from '../../../../../shared/fabricator'

type PoseImageSource = Pick<PosePart, 'id' | 'dataUrl'>

/** Keeps the exact PNGs of a pose ready when its draft folder is recreated. */
export function poseAssetSnapshot(parts: readonly PoseImageSource[]): Map<string, string> {
  return new Map(parts.map(({ id, dataUrl }) => [id, dataUrl]))
}

/** Only sends PNGs that must be copied into the target draft or pose library. */
export function pendingPoseAssets(parts: readonly Pick<PosePart, 'id'>[], pending: ReadonlyMap<string, string>): FabricatorAssetSave[] {
  return parts.flatMap((part) => {
    const dataUrl = pending.get(part.id)
    return dataUrl ? [{ id: part.id, dataUrl }] : []
  })
}
