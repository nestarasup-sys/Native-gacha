import type { FabricatorProject, JointLink, ModelPart } from '../../../../../shared/fabricator'
import { autoConnectParts, createJoint, jointPivot } from './rig'
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

function inferredParentPart(project: FabricatorProject, childPartId: string): ModelPart | undefined {
  const child = project.parts.find((part) => part.id === childPartId)
  if (!child) return undefined

  const descendants = new Set<string>([childPartId])
  let addedDescendant = true
  while (addedDescendant) {
    addedDescendant = false
    for (const joint of project.joints) {
      if (descendants.has(joint.parentPartId) && !descendants.has(joint.childPartId)) {
        descendants.add(joint.childPartId)
        addedDescendant = true
      }
    }
  }

  const childSide = bodySide(child.name)
  const sameSide = (part: ModelPart) => !childSide || !bodySide(part.name) || bodySide(part.name) === childSide
  const nearest = (parts: ModelPart[]) => parts.sort((a, b) => {
    const distance = (part: ModelPart) => Math.hypot(
      part.x + part.width / 2 - (child.x + child.width / 2),
      part.y + part.height / 2 - (child.y + child.height / 2)
    )
    return distance(a) - distance(b)
  })[0]
  const safeCandidate = (part: ModelPart | undefined) => part && !descendants.has(part.id) ? part : undefined
  const lowerArm = /antebra[cç]o|forearm|lower[\s_-]?arm|bra[cç]o.*(?:inferior|lower)/i.test(child.name)
  const lowerLeg = /canela|panturrilha|shin|calf|perna.*(?:inferior|lower)/i.test(child.name)
  const upperArm = /bra[cç]o|arm/i.test(child.name) && !lowerArm
  const thigh = /coxa|thigh|perna.*(?:superior|upper)/i.test(child.name)
  const head = /cabe[cç]a|head/i.test(child.name)
  const namedParent = lowerArm
    ? nearest(project.parts.filter((part) => part.id !== childPartId && /bra[cç]o|arm/i.test(part.name) && !/antebra[cç]o|forearm|lower[\s_-]?arm|bra[cç]o.*(?:inferior|lower)/i.test(part.name) && sameSide(part)))
    : lowerLeg
      ? nearest(project.parts.filter((part) => part.id !== childPartId && /coxa|thigh|perna.*(?:superior|upper)/i.test(part.name) && sameSide(part)))
      : upperArm || thigh || head
        ? project.parts.find((part) => isTorsoPart(part) && part.id !== childPartId)
        : undefined
  const safeNamedParent = safeCandidate(namedParent)
  if (safeNamedParent) return safeNamedParent

  const suggestedParentId = autoConnectParts(project.parts).find((joint) => joint.childPartId === childPartId)?.parentPartId
  const suggestedParent = project.parts.find((part) => part.id === suggestedParentId)
  if (suggestedParent && !descendants.has(suggestedParent.id)) return suggestedParent

  const candidates = project.parts.filter((part) => part.id !== childPartId && !descendants.has(part.id))
  return candidates.find(isTorsoPart) ?? nearest(candidates)
}

function bodySide(name: string): 'left' | 'right' | null {
  if (/esquerd[oa]|left/i.test(name)) return 'left'
  if (/direit[oa]|right/i.test(name)) return 'right'
  return null
}

export function toggleFabricatorJointFixed(project: FabricatorProject, childPartId: string, createId: () => string = () => crypto.randomUUID()): FabricatorProject {
  const incoming = project.joints.find((joint) => joint.childPartId === childPartId)
  if (!incoming) {
    const child = project.parts.find((part) => part.id === childPartId)
    if (!child || isTorsoPart(child)) return project

    const parent = inferredParentPart(project, childPartId)
    if (!parent) return project

    const connected = connectFabricatorParts(project, parent.id, childPartId, createId)
    const createdJoint = connected.joints.find((joint) => joint.childPartId === childPartId)
    if (!createdJoint) return project
    return { ...connected, joints: connected.joints.map((joint) => joint.id === createdJoint.id ? { ...joint, fixed: true } : joint) }
  }
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
