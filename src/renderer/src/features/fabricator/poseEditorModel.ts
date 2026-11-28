import type { FabricatorPose, JointLink } from '../../../../shared/fabricator'
import { isModelRigConnectionCompatible, isTorsoPart, modelRigSegmentKind, partJointAnchor } from '../../../../shared/modelRig.ts'
import { rotatePointAroundOrigin } from './models/geometry.ts'

export type PoseEditorProject = Omit<FabricatorPose, 'slot'>

export function isMovablePosePart(project: PoseEditorProject, partId: string, torsoId?: string): boolean {
  const part = project.parts.find((item) => item.id === partId)
  return Boolean(part && part.id !== torsoId && !isTorsoPart(part) && modelRigSegmentKind(part.name) !== 'head')
}

function fixedPoseBranch(project: PoseEditorProject, rootId: string, torsoId?: string): Set<string> {
  const movingIds = new Set([rootId])
  const parts = new Map(project.parts.map((part) => [part.id, part]))
  let changed = true
  while (changed) {
    changed = false
    for (const joint of project.joints) if (joint.fixed && movingIds.has(joint.parentPartId) && !movingIds.has(joint.childPartId)) {
      const parent = parts.get(joint.parentPartId)
      const child = parts.get(joint.childPartId)
      if (!parent || !child || (child.id === torsoId || isTorsoPart(child)) || !isModelRigConnectionCompatible(parent, child)) continue
      movingIds.add(joint.childPartId)
      changed = true
    }
  }
  return movingIds
}

function translateParts(project: PoseEditorProject, partIds: Set<string>, dx: number, dy: number): PoseEditorProject {
  return {
    ...project,
    parts: project.parts.map((part) => partIds.has(part.id) ? {
      ...part,
      x: part.x + dx,
      y: part.y + dy,
      ...(part.jointAnchor ? { jointAnchor: { x: part.jointAnchor.x + dx, y: part.jointAnchor.y + dy } } : {})
    } : part),
    joints: project.joints.map((joint) => {
      const parentAnchor = partIds.has(joint.parentPartId) ? { x: joint.parentAnchor.x + dx, y: joint.parentAnchor.y + dy } : joint.parentAnchor
      const childAnchor = partIds.has(joint.childPartId) ? { x: joint.childAnchor.x + dx, y: joint.childAnchor.y + dy } : joint.childAnchor
      return { ...joint, parentAnchor, childAnchor, pivot: { x: (parentAnchor.x + childAnchor.x) / 2, y: (parentAnchor.y + childAnchor.y) / 2 } }
    })
  }
}

export function translatePoseBranch(project: PoseEditorProject, rootId: string, dx: number, dy: number, torsoId?: string): PoseEditorProject {
  if (!isMovablePosePart(project, rootId, torsoId) || !Number.isFinite(dx) || !Number.isFinite(dy) || (!dx && !dy)) return project
  return translateParts(project, fixedPoseBranch(project, rootId, torsoId), dx, dy)
}

export function poseRotationOrigin(part: PoseEditorProject['parts'][number], joints: JointLink[], torsoId?: string) {
  const center = { x: part.x + part.width / 2, y: part.y + part.height / 2 }
  return part.id === torsoId || isTorsoPart(part) ? center : partJointAnchor(part, joints) ?? center
}

export function rotatePosePart(
  project: PoseEditorProject,
  partId: string,
  targetAngle: number,
  includeConnectedChildren: boolean,
  torsoId?: string
): PoseEditorProject {
  const selected = project.parts.find((part) => part.id === partId)
  if (!selected) return project
  const amount = targetAngle - selected.rotation
  if (!Number.isFinite(amount) || !amount) return project

  const torso = selected.id === torsoId || isTorsoPart(selected)
  const origin = poseRotationOrigin(selected, project.joints, torsoId)
  const affected = includeConnectedChildren ? fixedPoseBranch(project, selected.id, torsoId) : new Set([selected.id])

  const parts = project.parts.map((part) => {
    if (!affected.has(part.id)) return part
    const center = rotatePointAroundOrigin({ x: part.x + part.width / 2, y: part.y + part.height / 2 }, origin, amount)
    const anchor = partJointAnchor(part, project.joints)
    return {
      ...part,
      x: torso && part.id === selected.id ? part.x : center.x - part.width / 2,
      y: torso && part.id === selected.id ? part.y : center.y - part.height / 2,
      rotation: part.rotation + amount,
      ...(anchor ? { jointAnchor: rotatePointAroundOrigin(anchor, origin, amount) } : {})
    }
  })
  const partById = new Map(parts.map((part) => [part.id, part]))
  const joints: JointLink[] = project.joints.map((joint) => {
    const parent = partById.get(joint.parentPartId)
    const child = partById.get(joint.childPartId)
    const parentAnchor = parent ? partJointAnchor(parent, project.joints) ?? joint.parentAnchor : joint.parentAnchor
    const childAnchor = child ? partJointAnchor(child, project.joints) ?? joint.childAnchor : joint.childAnchor
    return { ...joint, parentAnchor, childAnchor, pivot: { x: (parentAnchor.x + childAnchor.x) / 2, y: (parentAnchor.y + childAnchor.y) / 2 } }
  })
  return { ...project, parts, joints }
}
