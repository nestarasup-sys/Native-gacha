import type { FabricatorProject } from '../../../../../shared/fabricator'
import { partJointAnchor } from '../models/rig'

/** Maps a clicked joint anchor back into the original source-sheet coordinate frame. */
export function calibrateWardrobeSourceParts(
  model: FabricatorProject,
  partId: string,
  x: number,
  y: number
): FabricatorProject['parts'] | null {
  const selectedPart = model.parts.find((part) => part.id === partId)
  if (!selectedPart) return null
  const currentAnchor = partJointAnchor(selectedPart, model.joints) ?? { x: selectedPart.x + selectedPart.width / 2, y: selectedPart.y + selectedPart.height / 2 }
  const currentCenter = { x: selectedPart.x + selectedPart.width / 2, y: selectedPart.y + selectedPart.height / 2 }
  const radians = -selectedPart.rotation * Math.PI / 180
  const dx = currentAnchor.x - currentCenter.x
  const dy = currentAnchor.y - currentCenter.y
  const localX = dx * Math.cos(radians) - dy * Math.sin(radians)
  const localY = dx * Math.sin(radians) + dy * Math.cos(radians)
  const sourceCenter = { x: x - localX, y: y - localY }
  return model.parts.map((part) => part.id === partId
    ? { ...part, sourceTransform: { x: sourceCenter.x - part.width / 2, y: sourceCenter.y - part.height / 2, width: part.width, height: part.height, rotation: 0, anchorVersion: 1 as const, jointAnchor: { x, y } } }
    : part)
}
