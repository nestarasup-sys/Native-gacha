import type { FabricatorPose, JointLink } from '../../../../shared/fabricator'
import { isModelRigConnectionCompatible, partJointAnchor } from '../../../../shared/modelRig.ts'
import { rotatePointAroundOrigin } from './models/geometry.ts'

export type PoseEditorProject = Omit<FabricatorPose, 'slot'>

export function isMovablePosePart(project: PoseEditorProject, partId: string): boolean {
  const part = project.parts.find((item) => item.id === partId)
  return Boolean(part && !/tronco|corpo|cabeça|cabeca/i.test(part.name))
}

function fixedPoseBranch(project: PoseEditorProject, rootId: string): Set<string> {
  const movingIds = new Set([rootId])
  const parts = new Map(project.parts.map((part) => [part.id, part]))
  let changed = true
  while (changed) {
    changed = false
    for (const joint of project.joints) if (joint.fixed && movingIds.has(joint.parentPartId) && !movingIds.has(joint.childPartId)) {
      const parent = parts.get(joint.parentPartId)
      const child = parts.get(joint.childPartId)
      if (!parent || !child || !isModelRigConnectionCompatible(parent, child)) continue
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

export function translatePoseBranch(project: PoseEditorProject, rootId: string, dx: number, dy: number): PoseEditorProject {
  return translateParts(project, fixedPoseBranch(project, rootId), dx, dy)
}

export function rotatePosePart(
  project: PoseEditorProject,
  partId: string,
  targetAngle: number,
  includeConnectedChildren: boolean
): PoseEditorProject {
  const selected = project.parts.find((part) => part.id === partId)
  if (!selected) return project
  const amount = targetAngle - selected.rotation
  if (!amount) return project

  const origin = partJointAnchor(selected, project.joints) ?? { x: selected.x + selected.width / 2, y: selected.y + selected.height / 2 }
  const affected = new Set<string>([selected.id])
  if (includeConnectedChildren) {
    let changed = true
    while (changed) {
      changed = false
      for (const joint of project.joints) {
        if (!joint.fixed || !affected.has(joint.parentPartId) || affected.has(joint.childPartId)) continue
        const parent = project.parts.find((part) => part.id === joint.parentPartId)
        const child = project.parts.find((part) => part.id === joint.childPartId)
        if (!parent || !child || !isModelRigConnectionCompatible(parent, child)) continue
        affected.add(joint.childPartId)
        changed = true
      }
    }
  }

  const parts = project.parts.map((part) => {
    if (!affected.has(part.id)) return part
    const center = rotatePointAroundOrigin({ x: part.x + part.width / 2, y: part.y + part.height / 2 }, origin, amount)
    const anchor = partJointAnchor(part, project.joints)
    return {
      ...part,
      x: center.x - part.width / 2,
      y: center.y - part.height / 2,
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
