import type { FabricatorProject, ModelPart } from '../../../../../shared/fabricator'
import { normalizePartAnchors } from '../../../../../shared/modelRig'
import { sourceRect } from './modelSource'
import type { ModelSourceQuarterTurn } from './modelSourceEditing'

function overlapArea(a: ReturnType<typeof sourceRect>, b: ReturnType<typeof sourceRect>): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
}

function rotateAround(point: { x: number; y: number }, center: { x: number; y: number }, degrees: ModelSourceQuarterTurn) {
  const radians = degrees * Math.PI / 180
  const dx = point.x - center.x
  const dy = point.y - center.y
  return {
    x: center.x + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: center.y + dx * Math.sin(radians) + dy * Math.cos(radians)
  }
}

/** Applies a pixel-rotated part to its model while preserving source bounds and joint pivots. */
export function applyRotatedModelSourcePart(
  project: FabricatorProject,
  partId: string,
  rotatedPart: ModelPart,
  degrees: ModelSourceQuarterTurn
): FabricatorProject {
  const originalPart = project.parts.find((part) => part.id === partId)
  if (!originalPart) throw new Error('A peça selecionada não está mais no modelo.')
  if (rotatedPart.id !== partId) throw new Error('A rotação retornou uma peça diferente da selecionada.')

  const rotatedRect = sourceRect(rotatedPart)
  if (![rotatedRect.x, rotatedRect.y, rotatedRect.width, rotatedRect.height].every(Number.isFinite)
    || rotatedRect.width < 1 || rotatedRect.height < 1
    || rotatedRect.x < 0 || rotatedRect.y < 0
    || rotatedRect.x + rotatedRect.width > project.width
    || rotatedRect.y + rotatedRect.height > project.height) {
    throw new Error('A rotação ultrapassaria os limites da folha original. Reduza o tamanho da peça ou escolha outra peça.')
  }

  const previousRect = sourceRect(originalPart)
  for (const other of project.parts) {
    if (other.id === partId) continue
    if (overlapArea(rotatedRect, sourceRect(other)) > overlapArea(previousRect, sourceRect(other)) + 1) {
      throw new Error(`A rotação invadiria a área de ${other.name}. A peça não foi alterada.`)
    }
  }

  const center = { x: originalPart.x + originalPart.width / 2, y: originalPart.y + originalPart.height / 2 }
  const parts = project.parts.map((part) => part.id === partId ? rotatedPart : part)
  const joints = project.joints.map((joint) => {
    const parentAnchor = joint.parentPartId === partId ? rotateAround(joint.parentAnchor, center, degrees) : joint.parentAnchor
    const childAnchor = joint.childPartId === partId ? rotateAround(joint.childAnchor, center, degrees) : joint.childAnchor
    return {
      ...joint,
      parentAnchor,
      childAnchor,
      pivot: { x: (parentAnchor.x + childAnchor.x) / 2, y: (parentAnchor.y + childAnchor.y) / 2 }
    }
  })
  const rig = normalizePartAnchors(parts, joints)
  return { ...project, parts: rig.parts, joints: rig.joints }
}
