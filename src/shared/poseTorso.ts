import type { FabricatorPoseSave, ModelPart } from './fabricator'
import { isTorsoPart } from './modelRig.ts'

type Point = { x: number; y: number }
type TorsoPart = Pick<ModelPart, 'id' | 'name' | 'x' | 'y'>
type PoseRig = Pick<FabricatorPoseSave, 'parts' | 'joints'>
const translate = (point: Point, dx: number, dy: number): Point => ({ x: point.x + dx, y: point.y + dy })

/** Prefer the anatomy of the source model, matched by stable part ID. */
export function findPoseTorso(parts: readonly TorsoPart[], sourceParts?: readonly TorsoPart[]) {
  const reference = sourceParts?.find(isTorsoPart)
  if (reference) return parts.find(part => part.id === reference.id)
  return parts.find(isTorsoPart)
}

export function poseTorsoOffset(pose: PoseRig, sourceParts: readonly TorsoPart[]) {
  const reference = sourceParts.find(isTorsoPart)
  const torso = reference && findPoseTorso(pose.parts, sourceParts)
  if (!reference || !torso) return undefined
  const x = reference.x - torso.x, y = reference.y - torso.y
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw Error('Posição do tronco inválida.')
  return { x, y }
}

export function poseTorsoIsDisplaced(offset: Point | undefined): boolean {
  return Boolean(offset && (Math.abs(offset.x) > 1e-8 || Math.abs(offset.y) > 1e-8))
}

/** Translate the authored pose as one group, including already-authored joint and wardrobe anchors. */
export function alignPoseTorso<T extends PoseRig>(pose: T, sourceParts: readonly TorsoPart[]): T {
  const offset = poseTorsoOffset(pose, sourceParts)
  if (!offset || !poseTorsoIsDisplaced(offset)) return pose
  const { x: dx, y: dy } = offset
  return {
    ...pose,
    parts: pose.parts.map(part => ({
      ...part, x: part.x + dx, y: part.y + dy,
      ...(part.jointAnchor ? { jointAnchor: translate(part.jointAnchor, dx, dy) } : {}),
      ...(part.wardrobeAttachment ? { wardrobeAttachment: { ...part.wardrobeAttachment,
        referenceAnchor: translate(part.wardrobeAttachment.referenceAnchor, dx, dy) } } : {})
    })),
    joints: pose.joints.map(joint => ({
      ...joint, parentAnchor: translate(joint.parentAnchor, dx, dy), childAnchor: translate(joint.childAnchor, dx, dy),
      ...(joint.pivot ? { pivot: translate(joint.pivot, dx, dy) } : {})
    }))
  }
}
