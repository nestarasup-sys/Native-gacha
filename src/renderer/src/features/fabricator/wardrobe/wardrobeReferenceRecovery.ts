import type { FabricatorHistoryState, FabricatorProject } from '../../../../../shared/fabricator'
import { partJointAnchor, sourcePointFromCanvas } from '../models/rig'

/** Rebuilds original-sheet references for this session without publishing a model update. */
export function recoverWardrobeReferenceModel(
  reference: FabricatorProject,
  history: FabricatorHistoryState
): FabricatorProject {
  const original = history.undo[0]?.project
  const originalParts = new Map((original?.parts ?? []).map((part) => [part.id, part]))
  const recoveredParts = reference.parts.map((part) => {
    const sourcePart = originalParts.get(part.id)
    const baseTransform = part.sourceTransform ?? (sourcePart
      ? { x: sourcePart.x, y: sourcePart.y, width: sourcePart.width, height: sourcePart.height, rotation: sourcePart.rotation }
      : undefined)
    if (!baseTransform) return part

    const completeTransform = {
      ...baseTransform,
      width: baseTransform.width ?? sourcePart?.width ?? part.width,
      height: baseTransform.height ?? sourcePart?.height ?? part.height
    }
    if (part.sourceTransform?.anchorVersion === 1 && part.sourceTransform.width && part.sourceTransform.height) return part

    // Preserve the current rig pivot while expressing it in original-sheet coordinates.
    const currentAnchor = partJointAnchor(part, reference.joints)
    const sourcePoint = currentAnchor
      ? sourcePointFromCanvas({ ...part, sourceTransform: completeTransform }, currentAnchor)
      : null
    const fallbackAnchor = sourcePart ? partJointAnchor(sourcePart, original?.joints ?? []) : completeTransform.jointAnchor
    const jointAnchor = sourcePoint ?? fallbackAnchor
    return {
      ...part,
      sourceTransform: {
        ...completeTransform,
        anchorVersion: 1 as const,
        ...(jointAnchor ? { jointAnchor: { ...jointAnchor } } : {})
      }
    }
  })

  return recoveredParts.some((part, index) => part !== reference.parts[index])
    ? { ...reference, parts: recoveredParts }
    : reference
}
