import type { FabricatorProject, JointLink, ModelPart } from '../../../../../shared/fabricator'
import { createJoint, jointPivot } from './rig'
import { rotatePointAroundOrigin } from './geometry'

export function isTorsoPart(part: ModelPart | null | undefined): boolean {
  return Boolean(part && /tronco|corpo/i.test(part.name))
}

export function connectFabricatorParts(project: FabricatorProject, parentPartId: string, childPartId: string, createId: () => string): FabricatorProject {
  const parent = project.parts.find((part) => part.id === parentPartId)
  const child = project.parts.find((part) => part.id === childPartId)
  if (!parent || !child || parent.id === child.id || project.joints.some((joint) => joint.parentPartId === parent.id && joint.childPartId === child.id)) return project

  const created = createJoint(parent, child, false, createId)
  const parentAnchor = parent.jointAnchor ?? created.parentAnchor
  const childAnchor = child.jointAnchor ?? created.childAnchor
  const joint: JointLink = {
    ...created,
    parentAnchor,
    childAnchor,
    pivot: { x: (parentAnchor.x + childAnchor.x) / 2, y: (parentAnchor.y + childAnchor.y) / 2 }
  }

  return {
    ...project,
    parts: project.parts.map((part) => part.id === parent.id
      ? { ...part, jointAnchor: parentAnchor }
      : part.id === child.id ? { ...part, jointAnchor: childAnchor } : part),
    joints: [...project.joints, joint]
  }
}

export function moveFabricatorPartBranch(project: FabricatorProject, partId: string, dx: number, dy: number): FabricatorProject {
  const torso = project.parts.find(isTorsoPart)
  const source = project.parts.find((part) => part.id === partId)
  if (!source || isTorsoPart(source)) return project

  const movingIds = new Set<string>([partId])
  let addedPart = true
  while (addedPart) {
    addedPart = false
    for (const joint of project.joints) {
      if (joint.fixed && movingIds.has(joint.parentPartId) && !movingIds.has(joint.childPartId)) {
        movingIds.add(joint.childPartId)
        addedPart = true
      }
    }
  }
  if (torso) movingIds.delete(torso.id)

  return {
    ...project,
    parts: project.parts.map((part) => movingIds.has(part.id)
      ? { ...part, x: part.x + dx, y: part.y + dy, ...(part.jointAnchor ? { jointAnchor: { x: part.jointAnchor.x + dx, y: part.jointAnchor.y + dy } } : {}) }
      : part),
    joints: project.joints.map((joint) => {
      const parentMoved = movingIds.has(joint.parentPartId)
      const childMoved = movingIds.has(joint.childPartId)
      if (!parentMoved && !childMoved) return joint
      const parentAnchor = parentMoved
        ? { x: joint.parentAnchor.x + dx, y: joint.parentAnchor.y + dy }
        : joint.parentAnchor
      const childAnchor = childMoved
        ? { x: joint.childAnchor.x + dx, y: joint.childAnchor.y + dy }
        : joint.childAnchor
      const torsoAnchor = torso && (joint.parentPartId === torso.id || joint.childPartId === torso.id)
      const pivot = torsoAnchor
        ? { x: (parentAnchor.x + childAnchor.x) / 2, y: (parentAnchor.y + childAnchor.y) / 2 }
        : { x: jointPivot(joint).x + dx, y: jointPivot(joint).y + dy }
      return {
        ...joint,
        ...(parentMoved ? { parentAnchor } : {}),
        ...(childMoved ? { childAnchor } : {}),
        pivot
      }
    })
  }
}

export function toggleFabricatorJointFixed(project: FabricatorProject, childPartId: string): FabricatorProject {
  const incoming = project.joints.find((joint) => joint.childPartId === childPartId)
  if (!incoming) return project
  return { ...project, joints: project.joints.map((joint) => joint.id === incoming.id ? { ...joint, fixed: !joint.fixed } : joint) }
}

export function rotateFabricatorPartBranch(project: FabricatorProject, jointId: string, amount: number): FabricatorProject {
  const joint = project.joints.find((item) => item.id === jointId)
  if (!joint) return project
  const child = project.parts.find((part) => part.id === joint.childPartId)
  if (isTorsoPart(child)) return project

  const affected = new Set<string>([joint.childPartId])
  let changed = true
  while (changed) {
    changed = false
    for (const item of project.joints) {
      if (affected.has(item.parentPartId) && !affected.has(item.childPartId)) {
        affected.add(item.childPartId)
        changed = true
      }
    }
  }

  const origin = jointPivot(joint)
  return {
    ...project,
    parts: project.parts.map((part) => {
      if (!affected.has(part.id)) return part
      const center = rotatePointAroundOrigin({ x: part.x + part.width / 2, y: part.y + part.height / 2 }, origin, amount)
      return {
        ...part,
        x: center.x - part.width / 2,
        y: center.y - part.height / 2,
        rotation: (part.rotation + amount) % 360,
        ...(part.jointAnchor ? { jointAnchor: rotatePointAroundOrigin(part.jointAnchor, origin, amount) } : {})
      }
    }),
    joints: project.joints.map((item) => ({
      ...item,
      ...((affected.has(item.parentPartId) || affected.has(item.childPartId)) ? { pivot: rotatePointAroundOrigin(jointPivot(item), origin, amount) } : {}),
      ...(affected.has(item.parentPartId) ? { parentAnchor: rotatePointAroundOrigin(item.parentAnchor, origin, amount) } : {}),
      ...(affected.has(item.childPartId) ? { childAnchor: rotatePointAroundOrigin(item.childAnchor, origin, amount) } : {})
    }))
  }
}
