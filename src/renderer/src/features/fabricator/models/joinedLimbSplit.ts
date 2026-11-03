import type { JointLink, ModelPart } from '../../../../../shared/fabricator'
import { modelRigSegmentKind, modelRigSide, sourcePointFromCanvas } from '../../../../../shared/modelRig'

export type JoinedLimbSplit = {
  family: 'arm' | 'leg'
  upper: ModelPart
  lower: ModelPart
  parts: ModelPart[]
  joints: JointLink[]
}

type Point = { x: number; y: number }

function normalizedName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_-]+/g, ' ')
}

function center(part: ModelPart): Point {
  return { x: part.x + part.width / 2, y: part.y + part.height / 2 }
}

function combinedLimbFamily(name: string, originalId: string, parts: ModelPart[], joints: JointLink[]): 'arm' | 'leg' | null {
  const value = normalizedName(name)
  const kind = modelRigSegmentKind(name)
  const family = kind === 'upper-arm' || kind === 'forearm' || /\b(braco|arm)\b/.test(value)
    ? 'arm'
    : kind === 'thigh' || kind === 'lower-leg' || /\b(perna|leg)\b/.test(value) ? 'leg' : null
  if (!family || kind === 'hand' || kind === 'foot') return null
  const counterpartKinds = family === 'arm'
    ? new Set(['upper-arm', 'forearm'])
    : new Set(['thigh', 'lower-leg'])
  const hasConnectedCounterpart = joints.some((joint) => {
    const otherId = joint.parentPartId === originalId ? joint.childPartId
      : joint.childPartId === originalId ? joint.parentPartId : null
    if (!otherId) return false
    const other = parts.find((part) => part.id === otherId)
    const otherKind = other ? modelRigSegmentKind(other.name) : null
    return Boolean(otherKind && counterpartKinds.has(otherKind) && otherKind !== kind
      && (!modelRigSide(name) || !modelRigSide(other!.name) || modelRigSide(name) === modelRigSide(other!.name)))
  })
  return hasConnectedCounterpart ? null : family
}

export function canArticulateJoinedLimbSplit(original: ModelPart, parts: ModelPart[], joints: JointLink[]): boolean {
  if (original.splitOriginPartId || parts.some((part) => part.splitOriginPartId === original.id)) return false
  return combinedLimbFamily(original.name, original.id, parts, joints) !== null
}

function resolvedSide(part: ModelPart, parts: ModelPart[]): 'left' | 'right' | null {
  const explicit = modelRigSide(part.name)
  if (explicit) return explicit
  const torso = parts.find((item) => item.id !== part.id && isTorso(item))
  if (!torso) return null
  const delta = center(part).x - center(torso).x
  return Math.abs(delta) < 1 ? null : delta < 0 ? 'left' : 'right'
}

/** Finds one still-whole counterpart of the same segment kind on the opposite side. */
export function findOppositeJoinedLimbCounterpart(original: ModelPart, parts: ModelPart[], joints: JointLink[]): ModelPart | null {
  if (!canArticulateJoinedLimbSplit(original, parts, joints)) return null
  const family = combinedLimbFamily(original.name, original.id, parts, joints)
  const side = resolvedSide(original, parts)
  if (!family || !side) return null
  const oppositeSide = side === 'left' ? 'right' : 'left'
  const kind = modelRigSegmentKind(original.name)
  const candidates = parts.filter((candidate) => {
    if (candidate.id === original.id || !canArticulateJoinedLimbSplit(candidate, parts, joints)) return false
    if (modelRigSegmentKind(candidate.name) !== kind || resolvedSide(candidate, parts) !== oppositeSide) return false
    return combinedLimbFamily(candidate.name, candidate.id, parts, joints) === family
  })
  return candidates.length === 1 ? candidates[0] : null
}

/** Maps a drawn joint line proportionally and mirrors it across the opposite limb's local X axis. */
export function mapJoinedLimbSplitLine(
  source: ModelPart,
  target: ModelPart,
  start: Point,
  end: Point
): { start: Point; end: Point } {
  if (source.width < 1 || source.height < 1 || target.width < 1 || target.height < 1) {
    throw new Error('Não foi possível aplicar a divisão proporcional: dimensões de membro inválidas.')
  }
  const mapPoint = (point: Point): Point => ({
    x: (1 - point.x / source.width) * target.width,
    y: point.y / source.height * target.height
  })
  return { start: mapPoint(start), end: mapPoint(end) }
}

function worldPoint(part: ModelPart, local: Point): Point {
  const radians = part.rotation * Math.PI / 180
  const dx = local.x - part.width / 2
  const dy = local.y - part.height / 2
  return {
    x: part.x + part.width / 2 + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: part.y + part.height / 2 + dx * Math.sin(radians) + dy * Math.cos(radians)
  }
}

function isTorso(part: ModelPart): boolean {
  return /tronco|corpo|torso|body|chest/i.test(normalizedName(part.name))
}

function sideSuffix(part: ModelPart, parts: ModelPart[]): string {
  const explicit = modelRigSide(part.name)
  if (explicit) return explicit === 'left' ? ' esquerdo' : ' direito'
  const torso = parts.find((item) => item.id !== part.id && isTorso(item))
  if (!torso) return ''
  const delta = center(part).x - center(torso).x
  return Math.abs(delta) < 1 ? '' : delta < 0 ? ' esquerdo' : ' direito'
}

function closestToTorso(a: ModelPart, b: ModelPart, original: ModelPart, parts: ModelPart[]): ModelPart {
  const torso = parts.find((part) => part.id !== original.id && isTorso(part))
  if (!torso) return center(a).y <= center(b).y ? a : b
  const torsoCenter = center(torso)
  const distance = (part: ModelPart) => Math.hypot(center(part).x - torsoCenter.x, center(part).y - torsoCenter.y)
  return distance(a) <= distance(b) ? a : b
}

/**
 * Names and connects a split whole arm/leg when the model opted into joined
 * limbs. All other split operations keep their existing generic behavior.
 */
export function articulateJoinedLimbSplit(input: {
  original: ModelPart
  splitParts: [ModelPart, ModelPart]
  parts: ModelPart[]
  joints: JointLink[]
  start: Point
  end: Point
  createId?: () => string
}): JoinedLimbSplit | null {
  const family = combinedLimbFamily(input.original.name, input.original.id, input.parts, input.joints)
  if (!family) return null
  const upper = closestToTorso(input.splitParts[0], input.splitParts[1], input.original, input.parts)
  const lower = upper.id === input.splitParts[0].id ? input.splitParts[1] : input.splitParts[0]
  const suffix = sideSuffix(input.original, input.parts)
  const upperName = family === 'arm' ? `Braço${suffix}` : `Coxa${suffix}`
  const lowerName = family === 'arm' ? `Antebraço${suffix}` : `Canela${suffix}`
  const cut = worldPoint(input.original, {
    x: (input.start.x + input.end.x) / 2,
    y: (input.start.y + input.end.y) / 2
  })
  const incoming = input.joints.find((joint) => joint.childPartId === input.original.id)
  const upperPart: ModelPart = {
    ...upper,
    name: upperName,
    jointAnchor: incoming?.childAnchor ?? upper.jointAnchor ?? cut
  }
  const sourceCut = sourcePointFromCanvas(input.original, cut)
  const lowerPart: ModelPart = {
    ...lower,
    name: lowerName,
    jointAnchor: cut,
    ...(lower.sourceTransform && sourceCut
      ? { sourceTransform: { ...lower.sourceTransform, jointAnchor: sourceCut } }
      : {})
  }
  const remappedJoints = input.joints.flatMap((joint) => {
    if (joint.childPartId === input.original.id) return [{ ...joint, childPartId: upperPart.id }]
    if (joint.parentPartId === input.original.id) return [{ ...joint, parentPartId: lowerPart.id }]
    return [joint]
  })
  const createId = input.createId ?? (() => crypto.randomUUID())
  const bridgeJoint: JointLink = {
    id: createId(),
    parentPartId: upperPart.id,
    childPartId: lowerPart.id,
    parentAnchor: cut,
    childAnchor: cut,
    pivot: cut,
    fixed: true
  }
  return {
    family,
    upper: upperPart,
    lower: lowerPart,
    parts: input.parts.flatMap((part) => part.id === input.original.id ? [upperPart, lowerPart] : [part]),
    joints: [...remappedJoints, bridgeJoint]
  }
}
