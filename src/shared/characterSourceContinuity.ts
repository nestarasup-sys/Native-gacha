/** Garantia entre Fabricador, Customizador e Studio.
 * A fonte pode receber novo PNG, mas uma pose já salva é um snapshot da
 * montagem anterior e não deve ser regravada por seleções de personagem.
 */
import type { FabricatorPose, FabricatorProject, WardrobeSet } from './fabricator'

export function isPoseSnapshotForModel(
  pose: FabricatorPose | null | undefined, modelSlot: number, poseSlot: number
): pose is FabricatorPose {
  return Boolean(pose && pose.schemaVersion === 1
    && pose.sourceModelSlot === modelSlot && pose.slot === poseSlot
    && Array.isArray(pose.parts) && Array.isArray(pose.joints))
}

export function selectCharacterArtwork(
  model: FabricatorProject | null,
  pose: FabricatorPose | null,
  requestedPoseSlot: number | null
): FabricatorProject | FabricatorPose | null {
  if (!model) return null
  if (requestedPoseSlot === null) return model
  return isPoseSnapshotForModel(pose, model.slot, requestedPoseSlot) ? pose : null
}

export type CharacterContinuityAudit = {
  compatible: boolean
  hasOlderPoseSnapshot: boolean
  missingAttachments: string[]
  missingPosePieces: string[]
}
export function auditCharacterContinuity(
  model: FabricatorProject,
  pose: FabricatorPose,
  outfits: readonly WardrobeSet[] = []
): CharacterContinuityAudit {
  const poseParts = new Set(pose.parts.map(part => part.id))
  const modelParts = new Set(model.parts.map(part => part.id))
  return {
    compatible: isPoseSnapshotForModel(pose, model.slot, pose.slot),
    // Uma pose antiga NÃO é uma corrupção; Customizador/Studio continuam usando seus PNGs.
    hasOlderPoseSnapshot: pose.sourceModelUpdatedAt !== model.updatedAt,
    missingAttachments: [...new Set(outfits.flatMap(set =>
      set.components.filter(part => !poseParts.has(part.attachedPartId)).map(part => part.id)))],
    missingPosePieces: [...modelParts].filter(id => !poseParts.has(id))
  }
}
