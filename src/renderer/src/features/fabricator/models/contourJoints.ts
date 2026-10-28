import type { FabricatorProject, ModelPart } from '../../../../../shared/fabricator'
import { autoConnectParts, createJoint, modelRigSegmentKind, modelRigSide, normalizePartAnchors, repairIncompatibleModelRigJoints } from './rig'
import { moveFabricatorPartBranch } from './rigEditing'
import { loadImageFromDataUrl } from './imageData'

type SegmentKind = 'upper-arm' | 'forearm' | 'thigh' | 'lower-leg'
type Side = 'left' | 'right' | null
type Pair = { parent: ModelPart; child: ModelPart }
type Point = { x: number; y: number }
export type ContourJointResult = { project: FabricatorProject; alignedCount: number; pairCount: number }

function segmentKind(name: string): SegmentKind | null {
  const kind = modelRigSegmentKind(name)
  return kind === 'upper-arm' || kind === 'forearm' || kind === 'thigh' || kind === 'lower-leg' ? kind : null
}

function sideOf(part: ModelPart): Side {
  return modelRigSide(part.name)
}

function center(part: ModelPart): Point {
  return { x: part.x + part.width / 2, y: part.y + part.height / 2 }
}

function bodyPairs(parts: ModelPart[]): Pair[] {
  const pairs: Pair[] = []
  const usedChildren = new Set<string>()
  const connectKind = (parentKind: SegmentKind, childKind: SegmentKind) => {
    const parents = parts.filter((part) => segmentKind(part.name) === parentKind)
    const children = parts.filter((part) => segmentKind(part.name) === childKind)
    for (const parent of parents) {
      const side = sideOf(parent)
      const parentCenter = center(parent)
      const candidates = children.filter((child) => !usedChildren.has(child.id) && (!side || !sideOf(child) || sideOf(child) === side))
      const child = candidates.sort((a, b) => {
        const distance = (part: ModelPart) => {
          const point = center(part)
          const horizontal = (point.x - parentCenter.x) / Math.max(1, parent.width + part.width)
          const vertical = (point.y - parentCenter.y) / Math.max(1, parent.height + part.height)
          return Math.hypot(horizontal, vertical)
        }
        return distance(a) - distance(b)
      })[0]
      if (!child) continue
      usedChildren.add(child.id)
      pairs.push({ parent, child })
    }
  }
  connectKind('upper-arm', 'forearm')
  connectKind('thigh', 'lower-leg')
  return pairs
}

async function endpoint(part: ModelPart, edge: 'top' | 'bottom'): Promise<Point | null> {
  const image = await loadImageFromDataUrl(part.dataUrl, `Não foi possível ler o contorno de ${part.name}.`)
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  if (!width || !height) return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, width, height).data
  let row = edge === 'top' ? -1 : height
  let xTotal = 0
  let visible = 0
  for (let y = edge === 'top' ? 0 : height - 1; edge === 'top' ? y < height : y >= 0; y += edge === 'top' ? 1 : -1) {
    let rowCount = 0
    let rowXTotal = 0
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] <= 16) continue
      rowCount++
      rowXTotal += x + 0.5
    }
    if (!rowCount) continue
    row = y
    xTotal = rowXTotal
    visible = rowCount
    break
  }
  if (row < 0 || row >= height || !visible) return null
  const localX = xTotal / visible / width * part.width
  const localY = (row + 0.5) / height * part.height
  const radians = part.rotation * Math.PI / 180
  const dx = localX - part.width / 2
  const dy = localY - part.height / 2
  return {
    x: part.x + part.width / 2 + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: part.y + part.height / 2 + dx * Math.sin(radians) + dy * Math.cos(radians)
  }
}

/** Connects named limb segments and shifts only the downstream piece until their visible end contours meet. */
export async function connectBodyContourJoints(project: FabricatorProject): Promise<ContourJointResult> {
  const pairs = bodyPairs(project.parts)
  const fixedByChild = new Set(project.joints.filter((joint) => joint.fixed).map((joint) => joint.childPartId))
  const previousByChild = new Map(project.joints.map((joint) => [joint.childPartId, joint]))
  let joints = repairIncompatibleModelRigJoints(project.parts, project.joints.filter((joint) => !joint.suggested))
  for (const suggested of autoConnectParts(project.parts)) {
    if (joints.some((joint) => joint.childPartId === suggested.childPartId)) continue
    const previous = previousByChild.get(suggested.childPartId)
    joints.push({
      ...suggested,
      ...(previous ? { id: previous.id } : {}),
      ...(fixedByChild.has(suggested.childPartId) ? { fixed: true } : {})
    })
  }
  for (const { parent, child } of pairs) {
    const incomingIndex = joints.findIndex((joint) => joint.childPartId === child.id)
    const incoming = incomingIndex < 0 ? undefined : joints[incomingIndex]
    if (!incoming) joints.push(createJoint(parent, child, true))
    else if (incoming.parentPartId !== parent.id) {
      const replacement = createJoint(parent, child, true, () => incoming.id)
      joints = joints.filter((joint) => joint.childPartId !== child.id)
      joints.push({ ...replacement, fixed: incoming.fixed })
    }
  }
  const normalizedRig = normalizePartAnchors(project.parts, joints)
  let next: FabricatorProject = { ...project, parts: normalizedRig.parts, joints: normalizedRig.joints }
  let alignedCount = 0
  for (const { parent: originalParent, child: originalChild } of pairs) {
    const parent = next.parts.find((part) => part.id === originalParent.id)
    const child = next.parts.find((part) => part.id === originalChild.id)
    if (!parent || !child) continue
    const incoming = next.joints.find((joint) => joint.childPartId === child.id)
    if (incoming && !incoming.suggested && incoming.parentPartId !== parent.id) continue
    const [parentEnd, childStart] = await Promise.all([endpoint(parent, 'bottom'), endpoint(child, 'top')])
    if (!parentEnd || !childStart) continue
    const dx = parentEnd.x - childStart.x
    const dy = parentEnd.y - childStart.y
    const maxShift = Math.max(40, Math.max(parent.width, parent.height, child.width, child.height) * 0.9)
    if (Math.hypot(dx, dy) > maxShift) continue
    next = moveFabricatorPartBranch(next, child.id, dx, dy)
    alignedCount++
  }
  const normalized = normalizePartAnchors(next.parts, next.joints)
  return { project: { ...next, parts: normalized.parts, joints: normalized.joints }, alignedCount, pairCount: pairs.length }
}
