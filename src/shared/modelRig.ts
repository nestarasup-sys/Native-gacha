import type { JointLink, ModelPart } from './fabricator'

type Point = { x: number; y: number }

/** Shared anatomy predicate used by both rig editing and canvas interaction. */
export function isTorsoPart(part: Pick<ModelPart, 'name'> | null | undefined): boolean {
  return Boolean(part && /tronco|corpo/i.test(part.name))
}

export type ModelRigSegmentKind = 'head' | 'upper-arm' | 'forearm' | 'thigh' | 'lower-leg' | 'hand' | 'foot'
export type ModelRigPair = { parent: ModelPart; child: ModelPart }

const center = (part: ModelPart): Point => ({ x: part.x + part.width / 2, y: part.y + part.height / 2 })

function normalizedPartName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_-]+/g, ' ')
}

export function modelRigSegmentKind(name: string): ModelRigSegmentKind | null {
  const value = normalizedPartName(name)
  if (/head|cabeca/.test(value)) return 'head'
  if (/ante\s*braco|forearm|lower\s+arm|braco.*(?:inferior|lower)/.test(value)) return 'forearm'
  if (/canela|panturrilha|shin|calf|lower\s+leg|perna.*(?:inferior|lower)/.test(value)) return 'lower-leg'
  if (/coxa|thigh|upper\s+leg|perna.*(?:superior|upper)/.test(value)) return 'thigh'
  if (/braco|arm/.test(value)) return 'upper-arm'
  if (/mao|hand/.test(value)) return 'hand'
  if (/(?:^|\s)(?:pe|pes|foot|feet)(?:$|\s)/.test(value)) return 'foot'
  return null
}

export function modelRigSide(name: string): 'left' | 'right' | null {
  const value = normalizedPartName(name)
  if (/esquerd[oa]|left/.test(value)) return 'left'
  if (/direit[oa]|right/.test(value)) return 'right'
  return null
}

function rigFamily(kind: ModelRigSegmentKind | null): 'arm' | 'leg' | null {
  if (kind === 'upper-arm' || kind === 'forearm' || kind === 'hand') return 'arm'
  if (kind === 'thigh' || kind === 'lower-leg' || kind === 'foot') return 'leg'
  return null
}

export function isModelRigConnectionCompatible(parent: ModelPart, child: ModelPart): boolean {
  if (parent.id === child.id) return false
  const parentFamily = rigFamily(modelRigSegmentKind(parent.name))
  const childFamily = rigFamily(modelRigSegmentKind(child.name))
  if (!parentFamily || !childFamily) return true
  if (parentFamily !== childFamily) return false
  const parentSide = modelRigSide(parent.name)
  const childSide = modelRigSide(child.name)
  return !parentSide || !childSide || parentSide === childSide
}

/** Infer named body links before using image coordinates as a fallback. */
export function inferAnatomicalJointPairs(parts: ModelPart[]): ModelRigPair[] {
  const torso = parts.find((part) => /tronco|corpo|torso|body/i.test(normalizedPartName(part.name)))
  const byKind = (kind: ModelRigSegmentKind) => parts.filter((part) => modelRigSegmentKind(part.name) === kind)
  const pairs: ModelRigPair[] = []
  const linkedChildren = new Set<string>()
  const add = (parent: ModelPart | undefined, child: ModelPart) => {
    if (!parent || linkedChildren.has(child.id) || !isModelRigConnectionCompatible(parent, child)) return
    pairs.push({ parent, child })
    linkedChildren.add(child.id)
  }
  const nearest = (child: ModelPart, candidates: ModelPart[]) => candidates
    .filter((part) => part.id !== child.id && isModelRigConnectionCompatible(part, child))
    .sort((a, b) => {
      const distance = (part: ModelPart) => Math.hypot(
        (center(part).x - center(child).x) / Math.max(1, part.width + child.width),
        (center(part).y - center(child).y) / Math.max(1, part.height + child.height)
      )
      return distance(a) - distance(b)
    })[0]
  const sameSide = (child: ModelPart, candidates: ModelPart[]) => {
    const side = modelRigSide(child.name)
    return candidates.filter((part) => !side || !modelRigSide(part.name) || modelRigSide(part.name) === side)
  }

  if (torso) {
    for (const kind of ['head', 'upper-arm', 'thigh'] as const) {
      for (const child of byKind(kind)) if (child.id !== torso.id) add(torso, child)
    }
  }
  const upperArms = byKind('upper-arm')
  const forearms = byKind('forearm')
  for (const child of forearms) add(nearest(child, sameSide(child, upperArms)) ?? torso, child)
  const thighs = byKind('thigh')
  const lowerLegs = byKind('lower-leg')
  for (const child of lowerLegs) add(nearest(child, sameSide(child, thighs)) ?? torso, child)
  const hands = byKind('hand')
  for (const child of hands) add(nearest(child, sameSide(child, forearms)) ?? nearest(child, sameSide(child, upperArms)) ?? torso, child)
  const feet = byKind('foot')
  for (const child of feet) add(nearest(child, sameSide(child, lowerLegs)) ?? nearest(child, sameSide(child, thighs)) ?? torso, child)
  return pairs
}

/** Reparents only anatomically incompatible links, preserving IDs and fixed state. */
export function repairIncompatibleModelRigJoints(parts: ModelPart[], joints: JointLink[]): JointLink[] {
  const partsById = new Map(parts.map((part) => [part.id, part]))
  const expectedByChild = new Map(inferAnatomicalJointPairs(parts).map((pair) => [pair.child.id, pair]))
  return joints.flatMap((joint) => {
    const parent = partsById.get(joint.parentPartId)
    const child = partsById.get(joint.childPartId)
    if (!parent || !child || isModelRigConnectionCompatible(parent, child)) return [joint]
    const expected = expectedByChild.get(child.id)
    if (!expected) return []
    const replacement = createJoint(expected.parent, child, true, () => joint.id)
    return [{ ...joint, parentPartId: replacement.parentPartId, parentAnchor: replacement.parentAnchor, childAnchor: replacement.childAnchor, pivot: replacement.pivot, suggested: true }]
  })
}

function edgePoint(part: ModelPart, target: ModelPart): Point {
  const origin = center(part)
  const destination = center(target)
  const dx = destination.x - origin.x
  const dy = destination.y - origin.y
  const horizontal = Math.abs(dx / Math.max(1, part.width)) > Math.abs(dy / Math.max(1, part.height))
  return horizontal
    ? { x: origin.x + Math.sign(dx || 1) * part.width / 2, y: origin.y + dy * part.width / (2 * Math.max(1, Math.abs(dx))) }
    : { x: origin.x + dx * part.height / (2 * Math.max(1, Math.abs(dy))), y: origin.y + Math.sign(dy || 1) * part.height / 2 }
}

export function createJoint(parent: ModelPart, child: ModelPart, suggested = false, createId: () => string = () => crypto.randomUUID()): JointLink {
  const parentAnchor = parent.jointAnchor ?? edgePoint(parent, child)
  const childAnchor = child.jointAnchor ?? edgePoint(child, parent)
  return {
    id: createId(), parentPartId: parent.id, childPartId: child.id,
    parentAnchor, childAnchor,
    pivot: { x: (parentAnchor.x + childAnchor.x) / 2, y: (parentAnchor.y + childAnchor.y) / 2 },
    suggested
  }
}

export function jointPivot(joint: JointLink): Point {
  return joint.pivot ?? { x: (joint.parentAnchor.x + joint.childAnchor.x) / 2, y: (joint.parentAnchor.y + joint.childAnchor.y) / 2 }
}

export function normalizePartAnchors(parts: ModelPart[], joints: JointLink[]): { parts: ModelPart[]; joints: JointLink[] } {
  const anchors = new Map(parts.flatMap((part) => part.jointAnchor ? [[part.id, part.jointAnchor] as const] : []))
  for (const joint of joints) {
    if (!anchors.has(joint.parentPartId)) anchors.set(joint.parentPartId, joint.parentAnchor)
    if (!anchors.has(joint.childPartId)) anchors.set(joint.childPartId, joint.childAnchor)
  }
  for (const part of parts) if (!anchors.has(part.id)) anchors.set(part.id, center(part))
  const normalizedParts = parts.map((part) => ({ ...part, ...(anchors.has(part.id) ? { jointAnchor: anchors.get(part.id) } : {}) }))
  const normalizedJoints = joints.map((joint) => {
    const parentAnchor = anchors.get(joint.parentPartId) ?? joint.parentAnchor
    const childAnchor = anchors.get(joint.childPartId) ?? joint.childAnchor
    return { ...joint, parentAnchor, childAnchor, pivot: { x: (parentAnchor.x + childAnchor.x) / 2, y: (parentAnchor.y + childAnchor.y) / 2 } }
  })
  return { parts: normalizedParts, joints: normalizedJoints }
}

export function partJointAnchor(part: ModelPart, joints: JointLink[]): Point | null {
  if (part.jointAnchor) return part.jointAnchor
  const joint = joints.find((item) => item.parentPartId === part.id || item.childPartId === part.id)
  if (!joint) return center(part)
  return joint.parentPartId === part.id ? joint.parentAnchor : joint.childAnchor
}

/** Maps a pivot from the currently assembled canvas back into the imported sheet. */
export function sourcePointFromCanvas(part: ModelPart, point: Point): Point | null {
  const source = part.sourceTransform
  if (!source) return null
  const currentCenter = center(part)
  const toLocal = -part.rotation * Math.PI / 180
  const currentDx = point.x - currentCenter.x
  const currentDy = point.y - currentCenter.y
  const localX = currentDx * Math.cos(toLocal) - currentDy * Math.sin(toLocal)
  const localY = currentDx * Math.sin(toLocal) + currentDy * Math.cos(toLocal)
  const fromSource = source.rotation * Math.PI / 180
  const sourceWidth = source.width ?? part.width
  const sourceHeight = source.height ?? part.height
  const sourceCenter = { x: source.x + sourceWidth / 2, y: source.y + sourceHeight / 2 }
  const sourceLocalX = localX * sourceWidth / part.width
  const sourceLocalY = localY * sourceHeight / part.height
  return {
    x: sourceCenter.x + sourceLocalX * Math.cos(fromSource) - sourceLocalY * Math.sin(fromSource),
    y: sourceCenter.y + sourceLocalX * Math.sin(fromSource) + sourceLocalY * Math.cos(fromSource)
  }
}

export function normalizeLayerOrder(parts: ModelPart[], order?: string[]): string[] {
  const valid = new Set(parts.map((part) => part.id))
  const normalized = (order ?? []).filter((id, index, list) => valid.has(id) && list.indexOf(id) === index)
  for (const part of parts) if (!normalized.includes(part.id)) normalized.push(part.id)
  return normalized
}

export function orderedParts<T extends ModelPart>(parts: T[], order?: string[]): T[] {
  const byId = new Map(parts.map((part) => [part.id, part]))
  return normalizeLayerOrder(parts, order).flatMap((id) => {
    const part = byId.get(id)
    return part ? [part] : []
  })
}

/** Connects named anatomy by type and side first; sheet position is the fallback for unnamed pieces. */
export function autoConnectParts(parts: ModelPart[]): JointLink[] {
  if (parts.length < 2) return []
  const sheetLeft = Math.min(...parts.map((part) => part.x))
  const sheetRight = Math.max(...parts.map((part) => part.x + part.width))
  const sheetTop = Math.min(...parts.map((part) => part.y))
  const sheetBottom = Math.max(...parts.map((part) => part.y + part.height))
  const sheetWidth = Math.max(1, sheetRight - sheetLeft)
  const sheetHeight = Math.max(1, sheetBottom - sheetTop)
  const sheetCenterX = (sheetLeft + sheetRight) / 2

  const torso = parts.find((part) => /tronco|corpo|torso|body/i.test(normalizedPartName(part.name)))
    ?? [...parts].sort((a, b) => {
      const score = (part: ModelPart) => {
        const point = center(part)
        const areaPenalty = part.width * part.height / (sheetWidth * sheetHeight)
        return Math.hypot((point.x - sheetCenterX) / sheetWidth, (point.y - (sheetTop + sheetHeight * 0.38)) / sheetHeight) - areaPenalty * 0.4
      }
      return score(a) - score(b)
    })[0]
  const torsoCenter = center(torso)
  const torsoBottom = torso.y + torso.height
  const head = parts.find((part) => modelRigSegmentKind(part.name) === 'head')
    ?? parts.filter((part) => part.id !== torso.id && center(part).y < torsoCenter.y)
      .sort((a, b) => Math.abs(center(a).x - torsoCenter.x) - Math.abs(center(b).x - torsoCenter.x))[0]

  const joints: JointLink[] = []
  const connected = new Set<string>([torso.id])
  const linkedChildren = new Set<string>()
  const add = (parent: ModelPart, child: ModelPart) => {
    if (parent.id === child.id || linkedChildren.has(child.id) || (parent.id !== torso.id && !isModelRigConnectionCompatible(parent, child))) return
    joints.push(createJoint(parent, child, true))
    linkedChildren.add(child.id)
    connected.add(child.id)
  }
  if (head) add(torso, head)
  for (const pair of inferAnatomicalJointPairs(parts)) add(pair.parent, pair.child)

  const excludes = new Set([torso.id, ...(head ? [head.id] : [])])
  const identifiedParts = new Set(parts.filter((part) => modelRigSegmentKind(part.name) !== null).map((part) => part.id))
  const limbs = parts.filter((part) => !excludes.has(part.id) && !identifiedParts.has(part.id) && Math.abs(center(part).x - torsoCenter.x) > Math.max(torso.width * 0.35, sheetWidth * 0.035))
  for (const side of ['left', 'right'] as const) {
    const onSide = limbs.filter((part) => side === 'left' ? center(part).x < torsoCenter.x : center(part).x >= torsoCenter.x)
    const armSegments = onSide.filter((part) => center(part).y < torsoBottom + sheetHeight * 0.015).sort((a, b) => center(a).y - center(b).y)
    const legSegments = onSide.filter((part) => center(part).y >= torsoBottom + sheetHeight * 0.015).sort((a, b) => center(a).y - center(b).y)
    if (armSegments[0]) add(torso, armSegments[0])
    for (let index = 1; index < armSegments.length; index += 1) add(armSegments[index - 1], armSegments[index])
    if (legSegments[0]) add(torso, legSegments[0])
    for (let index = 1; index < legSegments.length; index += 1) add(legSegments[index - 1], legSegments[index])
  }

  while (connected.size < parts.length) {
    let nearest: { parent: ModelPart; child: ModelPart; distance: number } | null = null
    for (const parent of parts) {
      if (!connected.has(parent.id)) continue
      const parentCenter = center(parent)
      for (const child of parts) {
        if (connected.has(child.id) || linkedChildren.has(child.id)) continue
        if (parent.id !== torso.id && !isModelRigConnectionCompatible(parent, child)) continue
        const childCenter = center(child)
        const distance = Math.hypot((childCenter.x - parentCenter.x) / sheetWidth, (childCenter.y - parentCenter.y) / sheetHeight)
        if (!nearest || distance < nearest.distance) nearest = { parent, child, distance }
      }
    }
    if (!nearest) break
    add(nearest.parent, nearest.child)
  }
  return joints
}

export function reorderLayer(order: string[], partId: string, targetId: string): string[] {
  if (partId === targetId) return order
  const next = order.slice()
  const from = next.indexOf(partId)
  const to = next.indexOf(targetId)
  if (from < 0 || to < 0) return order
  next.splice(to, 0, next.splice(from, 1)[0])
  return next
}
