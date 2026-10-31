import type { FabricatorProject, JointLink, ModelPart, WardrobeComponent } from '../../../../../shared/fabricator'
import { autoConnectParts, modelRigSegmentKind, modelRigSide } from '../../../../../shared/modelRig.ts'

export type WardrobePoint = { x: number; y: number }
export type WardrobeJointOffsets = Readonly<Record<string, WardrobePoint>>

export type WardrobeJointCut = {
  upperPartId: string
  lowerPartId: string
  point: WardrobePoint
  /** Unit vector from the upper limb segment toward the lower segment. */
  axis: WardrobePoint
  /** Unit vector along the cut line. */
  tangent: WardrobePoint
}

export type WardrobePixelImage = {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type WardrobeSplitSegment = {
  key: 'upper' | 'lower'
  width: number
  height: number
  pixels: Uint8ClampedArray
  /** Top-left in the currently displayed preview coordinate system. */
  x: number
  y: number
}

type JointProject = Pick<FabricatorProject, 'parts' | 'joints' | 'width' | 'height'>
type ComponentFrame = Pick<WardrobeComponent, 'x' | 'y' | 'width' | 'height' | 'rotation'>

const center = (part: ModelPart): WardrobePoint => ({ x: part.x + part.width / 2, y: part.y + part.height / 2 })

export function wardrobeJointSplitForSheetCell(kind: 'sleeves' | 'pants', row: number): WardrobeComponent['sleeveJointSplit'] {
  if (!Number.isInteger(row) || row < 2) return undefined
  return kind === 'pants' ? 'leg' : 'arm'
}

function jointsForPreview(project: JointProject): JointLink[] {
  // Model Dev and body-shape previews use the same inference for older models
  // that do not yet contain saved joints. A partial saved rig remains authoritative.
  return project.joints.length ? project.joints : autoConnectParts(project.parts)
}

/**
 * Build view-only offsets by traversing the saved model rig and bringing each
 * child anchor onto its parent anchor. The source part frames and rig are never
 * changed; callers use these offsets only while painting the Roupas DEV preview.
 */
export function createWardrobeJointAssemblyOffsets(project: JointProject): Record<string, WardrobePoint> {
  const partsById = new Map(project.parts.map((part) => [part.id, part]))
  const children = new Map<string, JointLink[]>()
  const childIds = new Set<string>()
  for (const joint of jointsForPreview(project)) {
    if (!partsById.has(joint.parentPartId) || !partsById.has(joint.childPartId)) continue
    if (![joint.parentAnchor.x, joint.parentAnchor.y, joint.childAnchor.x, joint.childAnchor.y].every(Number.isFinite)) continue
    const list = children.get(joint.parentPartId) ?? []
    list.push(joint)
    children.set(joint.parentPartId, list)
    childIds.add(joint.childPartId)
  }

  const offsets: Record<string, WardrobePoint> = {}
  const visit = (root: ModelPart) => {
    if (offsets[root.id]) return
    offsets[root.id] = { x: 0, y: 0 }
    const queue = [root]
    while (queue.length) {
      const parent = queue.shift()!
      const parentOffset = offsets[parent.id]
      for (const joint of children.get(parent.id) ?? []) {
        if (offsets[joint.childPartId]) continue
        offsets[joint.childPartId] = {
          x: parentOffset.x + joint.parentAnchor.x - joint.childAnchor.x,
          y: parentOffset.y + joint.parentAnchor.y - joint.childAnchor.y
        }
        const child = partsById.get(joint.childPartId)
        if (child) queue.push(child)
      }
    }
  }

  for (const part of project.parts) if (!childIds.has(part.id)) visit(part)
  // Also cover malformed/cyclic legacy rigs deterministically without looping.
  for (const part of project.parts) visit(part)
  return offsets
}

/** Keep the same attachment-following rule as the existing preview renderer. */
export function wardrobeComponentPreviewOffset(component: WardrobeComponent, offsets: WardrobeJointOffsets): WardrobePoint {
  return component.binding?.boneId === component.attachedPartId
    ? offsets[component.attachedPartId] ?? { x: 0, y: 0 }
    : { x: 0, y: 0 }
}

function splitKinds(category: WardrobeComponent['category']): { upper: 'thigh' | 'upper-arm'; lower: 'lower-leg' | 'forearm' } | null {
  if (category === 'calca-coxa') return { upper: 'thigh', lower: 'lower-leg' }
  if (category === 'manga-superior') return { upper: 'upper-arm', lower: 'forearm' }
  return null
}

/** Find the exact authored joint that divides this long garment. */
export function findWardrobeJointCut(
  component: WardrobeComponent,
  project: JointProject,
  offsets: WardrobeJointOffsets
): WardrobeJointCut | null {
  const kinds = splitKinds(component.category)
  if (!kinds) return null
  const partsById = new Map(project.parts.map((part) => [part.id, part]))
  const candidates = jointsForPreview(project).flatMap((joint) => {
    const parent = partsById.get(joint.parentPartId)
    const child = partsById.get(joint.childPartId)
    if (!parent || !child) return []
    const parentKind = modelRigSegmentKind(parent.name)
    const childKind = modelRigSegmentKind(child.name)
    const upper = parentKind === kinds.upper ? parent : childKind === kinds.upper ? child : null
    const lower = parentKind === kinds.lower ? parent : childKind === kinds.lower ? child : null
    return upper && lower ? [{ joint, upper, lower }] : []
  })
  if (!candidates.length) return null

  const exact = candidates.filter(({ upper }) => upper.id === component.attachedPartId)
  let matching = exact
  if (!matching.length && component.sleeveSide) {
    matching = candidates.filter(({ upper }) => {
      const namedSide = modelRigSide(upper.name)
      if (namedSide) return namedSide === component.sleeveSide
      const upperCenter = center(upper)
      return (upperCenter.x < project.width / 2 ? 'left' : 'right') === component.sleeveSide
    })
    if (!matching.length) return null
  }
  if (!matching.length) matching = candidates
  const componentCenter = { x: component.x + component.width / 2, y: component.y + component.height / 2 }
  matching.sort((a, b) => {
    const jointCenter = ({ joint }: typeof matching[number]) => {
      return {
        x: (joint.parentAnchor.x + (offsets[joint.parentPartId]?.x ?? 0) + joint.childAnchor.x + (offsets[joint.childPartId]?.x ?? 0)) / 2,
        y: (joint.parentAnchor.y + (offsets[joint.parentPartId]?.y ?? 0) + joint.childAnchor.y + (offsets[joint.childPartId]?.y ?? 0)) / 2
      }
    }
    const aIsAttachedBone = a.upper.id === component.attachedPartId
    const bIsAttachedBone = b.upper.id === component.attachedPartId
    if (aIsAttachedBone !== bIsAttachedBone) return aIsAttachedBone ? -1 : 1
    const pointA = jointCenter(a), pointB = jointCenter(b)
    return Math.hypot(pointA.x - componentCenter.x, pointA.y - componentCenter.y)
      - Math.hypot(pointB.x - componentCenter.x, pointB.y - componentCenter.y)
  })

  const { joint, upper, lower } = matching[0]
  const parentOffset = offsets[joint.parentPartId] ?? { x: 0, y: 0 }
  const childOffset = offsets[joint.childPartId] ?? { x: 0, y: 0 }
  const point = {
    x: (joint.parentAnchor.x + parentOffset.x + joint.childAnchor.x + childOffset.x) / 2,
    y: (joint.parentAnchor.y + parentOffset.y + joint.childAnchor.y + childOffset.y) / 2
  }
  const upperOffset = offsets[upper.id] ?? { x: 0, y: 0 }
  const lowerOffset = offsets[lower.id] ?? { x: 0, y: 0 }
  const upperCenter = center(upper)
  const lowerCenter = center(lower)
  const dx = lowerCenter.x + lowerOffset.x - upperCenter.x - upperOffset.x
  const dy = lowerCenter.y + lowerOffset.y - upperCenter.y - upperOffset.y
  const length = Math.hypot(dx, dy)
  if (length < 0.000001) return null
  const axis = { x: dx / length, y: dy / length }
  return { upperPartId: upper.id, lowerPartId: lower.id, point, axis, tangent: { x: -axis.y, y: axis.x } }
}

/** Split exact source pixels by the projected model joint, including rotated garments. */
export function splitWardrobePixelsAtJoint(
  image: WardrobePixelImage,
  frame: ComponentFrame,
  cut: WardrobeJointCut
): [WardrobeSplitSegment, WardrobeSplitSegment] {
  if (image.width < 1 || image.height < 1 || image.data.length !== image.width * image.height * 4) {
    throw new Error('A imagem da peça está inválida; nenhum pixel foi alterado.')
  }
  const upper = { data: new Uint8ClampedArray(image.data.length), minX: image.width, minY: image.height, maxX: -1, maxY: -1 }
  const lower = { data: new Uint8ClampedArray(image.data.length), minX: image.width, minY: image.height, maxX: -1, maxY: -1 }
  const radians = frame.rotation * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const worldCenter = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 }

  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    const sourceOffset = (y * image.width + x) * 4
    const alpha = image.data[sourceOffset + 3]
    if (!alpha) continue
    const localX = (x + 0.5 - image.width / 2) * frame.width / image.width
    const localY = (y + 0.5 - image.height / 2) * frame.height / image.height
    const worldX = worldCenter.x + localX * cosine - localY * sine
    const worldY = worldCenter.y + localX * sine + localY * cosine
    const signedDistance = (worldX - cut.point.x) * cut.axis.x + (worldY - cut.point.y) * cut.axis.y
    const target = signedDistance <= 0 ? upper : lower
    target.data.set(image.data.subarray(sourceOffset, sourceOffset + 4), sourceOffset)
    target.minX = Math.min(target.minX, x); target.minY = Math.min(target.minY, y)
    target.maxX = Math.max(target.maxX, x); target.maxY = Math.max(target.maxY, y)
  }

  const crop = (source: typeof upper, key: 'upper' | 'lower'): WardrobeSplitSegment => {
    if (source.maxX < source.minX || source.maxY < source.minY) {
      throw new Error('A junta calculada não cruza a peça. Posicione a roupa cobrindo os dois segmentos e tente novamente.')
    }
    const width = source.maxX - source.minX + 1
    const height = source.maxY - source.minY + 1
    const pixels = new Uint8ClampedArray(width * height * 4)
    for (let row = 0; row < height; row += 1) {
      const sourceStart = ((source.minY + row) * image.width + source.minX) * 4
      pixels.set(source.data.subarray(sourceStart, sourceStart + width * 4), row * width * 4)
    }
    const segmentWidth = width * frame.width / image.width
    const segmentHeight = height * frame.height / image.height
    const localCenterX = (source.minX + width / 2 - image.width / 2) * frame.width / image.width
    const localCenterY = (source.minY + height / 2 - image.height / 2) * frame.height / image.height
    const segmentCenterX = worldCenter.x + localCenterX * cosine - localCenterY * sine
    const segmentCenterY = worldCenter.y + localCenterX * sine + localCenterY * cosine
    return { key, width, height, pixels, x: segmentCenterX - segmentWidth / 2, y: segmentCenterY - segmentHeight / 2 }
  }
  return [crop(upper, 'upper'), crop(lower, 'lower')]
}
