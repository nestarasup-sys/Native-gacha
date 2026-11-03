import type { FabricatorProject, JointLink, ModelPart, WardrobeComponent } from '../../../../../shared/fabricator'
import { autoConnectParts, modelRigSegmentKind, modelRigSide } from '../../../../../shared/modelRig.ts'
import { wardrobeJointAssemblyOffset } from '../../../../../shared/wardrobeJointAssembly'
import type { WardrobeJointCutAdjustment } from './wardrobeJointCutSettings'

export type WardrobePoint = { x: number; y: number }
export type WardrobeJointOffsets = Readonly<Record<string, WardrobePoint>>

export type WardrobeJointCut = {
  upperPartId: string
  lowerPartId: string
  /** Automatic distal edge before a user's manual adjustment. */
  basePoint: WardrobePoint
  point: WardrobePoint
  /** Length of the upper asset projected along the cut direction. */
  adjustmentSpan: number
  /** Unit vector from the upper limb segment toward the lower segment. */
  axis: WardrobePoint
  /** Original limb axis used to move the cut without changing its angle. */
  positionAxis: WardrobePoint
  /** Unit vector along the cut line. */
  tangent: WardrobePoint
  rotationDegrees: number
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
 * Build view-only offsets for lower legs and forearms from the mounted model's
 * actual segment spacing. Upper parts stay at their original-sheet positions;
 * each lower part keeps the same relative placement it has in Modelos DEV.
 */
export function createWardrobeJointAssemblyOffsets(sourceProject: JointProject, mountedProject: JointProject): Record<string, WardrobePoint> {
  const sourcePartsById = new Map(sourceProject.parts.map((part) => [part.id, part]))
  const mountedPartsById = new Map(mountedProject.parts.map((part) => [part.id, part]))
  const candidatesByLowerPart = new Map<string, Array<{ offset: WardrobePoint; sideMatch: boolean; distance: number }>>()
  for (const joint of jointsForPreview(mountedProject)) {
    const parent = mountedPartsById.get(joint.parentPartId)
    const child = mountedPartsById.get(joint.childPartId)
    if (!parent || !child) continue
    if (![joint.parentAnchor.x, joint.parentAnchor.y, joint.childAnchor.x, joint.childAnchor.y].every(Number.isFinite)) continue
    const parentKind = modelRigSegmentKind(parent.name)
    const childKind = modelRigSegmentKind(child.name)
    const isLegPair = parentKind === 'thigh' && childKind === 'lower-leg'
      || parentKind === 'lower-leg' && childKind === 'thigh'
    const isArmPair = parentKind === 'upper-arm' && childKind === 'forearm'
      || parentKind === 'forearm' && childKind === 'upper-arm'
    if (!isLegPair && !isArmPair) continue

    const parentIsUpper = parentKind === 'thigh' || parentKind === 'upper-arm'
    const upper = parentIsUpper ? parent : child
    const lower = parentIsUpper ? child : parent
    const sourceUpper = sourcePartsById.get(upper.id)
    const sourceLower = sourcePartsById.get(lower.id)
    if (!sourceUpper || !sourceLower) continue
    const upperSide = modelRigSide(upper.name)
    const lowerSide = modelRigSide(lower.name)
    if (upperSide && lowerSide && upperSide !== lowerSide) continue
    const mountedUpperCenter = center(upper)
    const mountedLowerCenter = center(lower)
    const candidates = candidatesByLowerPart.get(lower.id) ?? []
    candidates.push({
      offset: wardrobeJointAssemblyOffset(sourceUpper, sourceLower, upper, lower),
      sideMatch: Boolean(upperSide && lowerSide && upperSide === lowerSide),
      distance: Math.hypot(mountedUpperCenter.x - mountedLowerCenter.x, mountedUpperCenter.y - mountedLowerCenter.y)
    })
    candidatesByLowerPart.set(lower.id, candidates)
  }

  return Object.fromEntries(sourceProject.parts.map((part) => {
    const candidates = candidatesByLowerPart.get(part.id) ?? []
    candidates.sort((first, second) => Number(second.sideMatch) - Number(first.sideMatch) || first.distance - second.distance)
    return [part.id, candidates[0]?.offset ?? { x: 0, y: 0 }]
  }))
}

/** Follow the selected body part in the assembled preview, including loose pieces. */
export function wardrobeComponentPreviewOffset(component: WardrobeComponent, offsets: WardrobeJointOffsets): WardrobePoint {
  return offsets[component.attachedPartId] ?? { x: 0, y: 0 }
}

function splitKinds(category: WardrobeComponent['category']): { upper: 'thigh' | 'upper-arm'; lower: 'lower-leg' | 'forearm' } | null {
  if (category === 'calca-coxa') return { upper: 'thigh', lower: 'lower-leg' }
  if (category === 'manga-superior') return { upper: 'upper-arm', lower: 'forearm' }
  return null
}

function directionBetweenSegments(upper: ModelPart, lower: ModelPart, offsets: WardrobeJointOffsets): WardrobePoint | null {
  const upperOffset = offsets[upper.id] ?? { x: 0, y: 0 }
  const lowerOffset = offsets[lower.id] ?? { x: 0, y: 0 }
  const upperCenter = center(upper)
  const lowerCenter = center(lower)
  const dx = lowerCenter.x + lowerOffset.x - upperCenter.x - upperOffset.x
  const dy = lowerCenter.y + lowerOffset.y - upperCenter.y - upperOffset.y
  const length = Math.hypot(dx, dy)
  return length < 0.000001 ? null : { x: dx / length, y: dy / length }
}

/** Return the end and projected length of the upper asset facing the lower segment. */
function distalAssetEdge(part: ModelPart, axis: WardrobePoint, offset: WardrobePoint): { point: WardrobePoint; span: number } {
  const radians = (part.sourceTransform?.rotation ?? part.rotation) * Math.PI / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const halfWidth = part.width / 2
  const halfHeight = part.height / 2
  let furthestProjection = Number.NEGATIVE_INFINITY
  let nearestProjection = Number.POSITIVE_INFINITY
  for (const localX of [-halfWidth, halfWidth]) for (const localY of [-halfHeight, halfHeight]) {
    const rotatedX = localX * cosine - localY * sine
    const rotatedY = localX * sine + localY * cosine
    const projection = rotatedX * axis.x + rotatedY * axis.y
    furthestProjection = Math.max(furthestProjection, projection)
    nearestProjection = Math.min(nearestProjection, projection)
  }
  const partCenter = center(part)
  return {
    point: {
      x: partCenter.x + offset.x + axis.x * furthestProjection,
      y: partCenter.y + offset.y + axis.y * furthestProjection
    },
    span: furthestProjection - nearestProjection
  }
}

/** Find connected upper/lower segments and apply the active global cut adjustment. */
export function findWardrobeJointCut(
  component: WardrobeComponent,
  project: JointProject,
  offsets: WardrobeJointOffsets,
  adjustment?: Partial<WardrobeJointCutAdjustment>
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
    const upperAssetEnd = ({ upper, lower }: typeof matching[number]) => {
      const axis = directionBetweenSegments(upper, lower, offsets)
      if (!axis) return center(upper)
      const offset = offsets[upper.id] ?? { x: 0, y: 0 }
      return distalAssetEdge(upper, axis, offset).point
    }
    const aIsAttachedBone = a.upper.id === component.attachedPartId
    const bIsAttachedBone = b.upper.id === component.attachedPartId
    if (aIsAttachedBone !== bIsAttachedBone) return aIsAttachedBone ? -1 : 1
    const pointA = upperAssetEnd(a), pointB = upperAssetEnd(b)
    return Math.hypot(pointA.x - componentCenter.x, pointA.y - componentCenter.y)
      - Math.hypot(pointB.x - componentCenter.x, pointB.y - componentCenter.y)
  })

  const { upper, lower } = matching[0]
  const upperOffset = offsets[upper.id] ?? { x: 0, y: 0 }
  const positionAxis = directionBetweenSegments(upper, lower, offsets)
  if (!positionAxis) return null
  const distalEdge = distalAssetEdge(upper, positionAxis, upperOffset)
  const ratioSource = adjustment?.offsetRatio ?? component.jointCutOffsetRatio
  const ratio = typeof ratioSource === 'number' && Number.isFinite(ratioSource)
    ? Math.max(-1, Math.min(1, ratioSource))
    : 0
  const rotationSource = adjustment?.rotationDegrees ?? 0
  const rotationDegrees = Number.isFinite(rotationSource) ? Math.max(-45, Math.min(45, rotationSource)) : 0
  const point = {
    x: distalEdge.point.x + positionAxis.x * distalEdge.span * ratio,
    y: distalEdge.point.y + positionAxis.y * distalEdge.span * ratio
  }
  const radians = rotationDegrees * Math.PI / 180
  const axis = {
    x: positionAxis.x * Math.cos(radians) - positionAxis.y * Math.sin(radians),
    y: positionAxis.x * Math.sin(radians) + positionAxis.y * Math.cos(radians)
  }
  return {
    upperPartId: upper.id, lowerPartId: lower.id,
    basePoint: distalEdge.point, point, adjustmentSpan: distalEdge.span,
    axis, positionAxis, tangent: { x: -axis.y, y: axis.x }, rotationDegrees
  }
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
