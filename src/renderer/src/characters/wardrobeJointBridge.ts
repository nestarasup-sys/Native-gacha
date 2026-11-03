import type { CustomizerWardrobeGroup } from '../../../shared/customizer'
import type { ModelPart, WardrobeComponent } from '../../../shared/fabricator'
import { wardrobeAdjustmentMatrix } from '../../../shared/wardrobeAdjustment'
import type { WardrobePoseTransform } from '../../../shared/wardrobePose'

export type WardrobeJointBridgePoint = { x: number; y: number }
export type WardrobeJointBridgeCompositeOperation = 'copy' | 'source-over'
export type WardrobeJointBridgeRasterProcessor = (pixels: ImageData, rasterScale: number) => void
type Point = WardrobeJointBridgePoint
type Affine = [number, number, number, number, number, number]

export type WardrobeJointBridgeSegment = {
  component: WardrobeComponent
  group: CustomizerWardrobeGroup
  image: HTMLImageElement
  sourceBone: ModelPart
  targetBone: ModelPart
  transform: WardrobePoseTransform
  /** Reconstructs the assembled source-sheet position of a lower split half. */
  sourceOffset?: Point
}

type SourceBounds = { x: number; y: number; width: number; height: number }
type Seam = { center: Point; tangent: Point; normal: Point; minTangent: number; maxTangent: number }
type SeamGapSample = { tangent: number; upperNormal: number; lowerNormal: number }
type SeamWithGap = Seam & { gapSamples?: SeamGapSample[] }
export type WardrobeJointBridgeTriangle = { source: [Point, Point, Point]; target: [Point, Point, Point] }
export type WardrobeJointBridgeMask = { width: number; height: number; data: Uint8Array }
type AlphaMask = WardrobeJointBridgeMask

const identity: Affine = [1, 0, 0, 1, 0, 0]
const multiply = (first: Affine, second: Affine): Affine => [
  first[0] * second[0] + first[2] * second[1],
  first[1] * second[0] + first[3] * second[1],
  first[0] * second[2] + first[2] * second[3],
  first[1] * second[2] + first[3] * second[3],
  first[0] * second[4] + first[2] * second[5] + first[4],
  first[1] * second[4] + first[3] * second[5] + first[5]
]
const translate = (x: number, y: number): Affine => [1, 0, 0, 1, x, y]
const rotate = (degrees: number): Affine => {
  const angle = degrees * Math.PI / 180
  return [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0]
}
const scale = (x: number, y: number): Affine => [x, 0, 0, y, 0, 0]

function invert(matrix: Affine): Affine | null {
  const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2]
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-9) return null
  return [matrix[3] / determinant, -matrix[1] / determinant, -matrix[2] / determinant, matrix[0] / determinant,
    (matrix[2] * matrix[5] - matrix[3] * matrix[4]) / determinant,
    (matrix[1] * matrix[4] - matrix[0] * matrix[5]) / determinant]
}

function transformPoint(matrix: Affine, point: Point): Point {
  return { x: matrix[0] * point.x + matrix[2] * point.y + matrix[4], y: matrix[1] * point.x + matrix[3] * point.y + matrix[5] }
}

function imageToSourceMatrix(segment: WardrobeJointBridgeSegment): Affine {
  const { component, image } = segment
  const offset = segment.sourceOffset ?? { x: 0, y: 0 }
  let matrix = identity
  matrix = multiply(matrix, translate(component.x + offset.x + component.width / 2, component.y + offset.y + component.height / 2))
  matrix = multiply(matrix, rotate(component.rotation))
  matrix = multiply(matrix, scale(component.width / image.naturalWidth, component.height / image.naturalHeight))
  return multiply(matrix, translate(-image.naturalWidth / 2, -image.naturalHeight / 2))
}

function imageToPoseMatrix(segment: WardrobeJointBridgeSegment): Affine | null {
  const { group, targetBone, transform, image } = segment
  const boneMatrix = /^matrix\(([^)]+)\)$/.exec(transform.matrix)?.[1].split(',').map(Number)
  if (!boneMatrix || boneMatrix.length !== 6 || !boneMatrix.every(Number.isFinite)) return null
  let matrix = identity
  matrix = multiply(matrix, wardrobeAdjustmentMatrix(group, targetBone, transform.origin))
  matrix = multiply(matrix, translate(transform.origin.x, transform.origin.y))
  matrix = multiply(matrix, boneMatrix as Affine)
  matrix = multiply(matrix, translate(transform.localLeft + transform.renderWidth / 2, transform.localTop + transform.renderHeight / 2))
  matrix = multiply(matrix, rotate(transform.localRotation))
  matrix = multiply(matrix, scale(transform.renderWidth / image.naturalWidth, transform.renderHeight / image.naturalHeight))
  matrix = multiply(matrix, translate(-image.naturalWidth / 2, -image.naturalHeight / 2))
  return matrix
}

function sourceBounds(upper: WardrobeJointBridgeSegment, lower: WardrobeJointBridgeSegment): SourceBounds {
  const points: Point[] = []
  for (const segment of [upper, lower]) {
    const { component } = segment
    const offset = segment.sourceOffset ?? { x: 0, y: 0 }
    const radians = component.rotation * Math.PI / 180
    const cosine = Math.cos(radians), sine = Math.sin(radians)
    const center = { x: component.x + offset.x + component.width / 2, y: component.y + offset.y + component.height / 2 }
    for (const x of [-component.width / 2, component.width / 2]) for (const y of [-component.height / 2, component.height / 2]) {
      points.push({ x: center.x + x * cosine - y * sine, y: center.y + x * sine + y * cosine })
    }
  }
  const padding = 3
  const left = Math.floor(Math.min(...points.map((point) => point.x)) - padding)
  const top = Math.floor(Math.min(...points.map((point) => point.y)) - padding)
  const right = Math.ceil(Math.max(...points.map((point) => point.x)) + padding)
  const bottom = Math.ceil(Math.max(...points.map((point) => point.y)) + padding)
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }
}

function maximumJointGap(upper: WardrobeJointBridgeSegment, lower: WardrobeJointBridgeSegment): number {
  const lengths = [upper.sourceBone, lower.sourceBone]
    .map((bone) => Math.max(bone.width, bone.height))
    .filter((length) => Number.isFinite(length) && length > 0)
  return Math.max(2, Math.min(8, (lengths.length ? Math.min(...lengths) : 40) * .05))
}

/** Search the full cut span; wide legs and diagonal joints can exceed the old fixed 64px window. */
export function wardrobeJointBridgeAnchorSearchRadius(
  upper: Pick<ModelPart, 'width' | 'height'>,
  lower: Pick<ModelPart, 'width' | 'height'>
): number {
  const crossSections = [upper, lower]
    .flatMap((part) => [part.width, part.height])
    .filter((length) => Number.isFinite(length) && length > 0)
  const narrowest = crossSections.length ? Math.min(...crossSections) : 8
  return Math.max(12, Math.min(512, narrowest * 1.25))
}

function drawSourceSegment(context: CanvasRenderingContext2D, segment: WardrobeJointBridgeSegment, bounds: SourceBounds, applyOpacity = true) {
  const { component, group, image } = segment
  const offset = segment.sourceOffset ?? { x: 0, y: 0 }
  context.save()
  context.globalAlpha = applyOpacity ? Math.max(0, Math.min(1, group.opacity ?? 1)) : 1
  context.translate(component.x + offset.x + component.width / 2 - bounds.x, component.y + offset.y + component.height / 2 - bounds.y)
  context.rotate(component.rotation * Math.PI / 180)
  context.drawImage(image, -component.width / 2, -component.height / 2, component.width, component.height)
  context.restore()
}

function drawAlphaMask(context: CanvasRenderingContext2D, segment: WardrobeJointBridgeSegment, bounds: SourceBounds): AlphaMask {
  context.clearRect(0, 0, bounds.width, bounds.height)
  drawSourceSegment(context, segment, bounds, false)
  const pixels = context.getImageData(0, 0, bounds.width, bounds.height).data
  const data = new Uint8Array(bounds.width * bounds.height)
  for (let index = 0; index < data.length; index += 1) data[index] = pixels[index * 4 + 3]
  return { width: bounds.width, height: bounds.height, data }
}

function isNearAnchor(point: Point, anchor: Point | undefined, radius: number): boolean {
  return !anchor || Math.hypot(point.x - anchor.x, point.y - anchor.y) <= radius
}

function findSeam(upper: AlphaMask, lower: AlphaMask, anchor?: Point, anchorRadius = Number.POSITIVE_INFINITY): Seam | null {
  const points: Point[] = []
  let towardUpper = { x: 0, y: 0 }
  const { width, height } = upper
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    const index = y * width + x
    if (upper.data[index] < 24) continue
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue
      const neighbor = (y + dy) * width + x + dx
      if (lower.data[neighbor] < 24) continue
      const contact = { x: x + dx / 2, y: y + dy / 2 }
      if (!isNearAnchor(contact, anchor, anchorRadius)) continue
      points.push(contact)
      // For each touching pair, this points from the lower pixels toward the
      // upper pixels and provides a local normal even when whole-part centers
      // are skewed by bent or asymmetric silhouettes.
      towardUpper.x -= dx
      towardUpper.y -= dy
    }
  }
  if (points.length < 2) return null

  const center = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 })
  const covariance = points.reduce((sum, point) => {
    const x = point.x - center.x, y = point.y - center.y
    return { xx: sum.xx + x * x, xy: sum.xy + x * y, yy: sum.yy + y * y }
  }, { xx: 0, xy: 0, yy: 0 })
  const angle = Math.atan2(2 * covariance.xy, covariance.xx - covariance.yy) / 2
  const tangent = { x: Math.cos(angle), y: Math.sin(angle) }
  let normal = { x: -tangent.y, y: tangent.x }

  let orientation: Point | null = Math.hypot(towardUpper.x, towardUpper.y) > 0.01 ? towardUpper : null
  if (!orientation) {
    const upperCenter = alphaCenter(upper)
    const lowerCenter = alphaCenter(lower)
    if (upperCenter && lowerCenter) orientation = { x: upperCenter.x - lowerCenter.x, y: upperCenter.y - lowerCenter.y }
  }
  if (!orientation) return null
  if (orientation.x * normal.x + orientation.y * normal.y < 0) {
    normal = { x: -normal.x, y: -normal.y }
  }
  let minTangent = Number.POSITIVE_INFINITY
  let maxTangent = Number.NEGATIVE_INFINITY
  for (const point of points) {
    const projection = (point.x - center.x) * tangent.x + (point.y - center.y) * tangent.y
    minTangent = Math.min(minTangent, projection)
    maxTangent = Math.max(maxTangent, projection)
  }
  if (maxTangent - minTangent < 2) return null
  return { center, tangent, normal, minTangent, maxTangent }
}

function alphaCenter(image: AlphaMask): Point | null {
  let x = 0, y = 0, weight = 0
  for (let row = 0; row < image.height; row += 1) for (let column = 0; column < image.width; column += 1) {
    const alpha = image.data[row * image.width + column]
    if (alpha < 24) continue
    x += (column + 0.5) * alpha
    y += (row + 0.5) * alpha
    weight += alpha
  }
  return weight ? { x: x / weight, y: y / weight } : null
}

function pointInSeam(seam: Seam, tangent: number, normal: number): Point {
  return { x: seam.center.x + seam.tangent.x * tangent + seam.normal.x * normal,
    y: seam.center.y + seam.tangent.y * tangent + seam.normal.y * normal }
}

function findNearbySeam(
  upper: AlphaMask,
  lower: AlphaMask,
  maximumGap: number,
  reference?: Seam,
  anchor?: Point,
  anchorRadius = Number.POSITIVE_INFINITY
): SeamWithGap | null {
  // The normal points from the lower piece toward the upper piece.
  let normal = reference?.normal
  let tangent = reference?.tangent
  if (!normal || !tangent) {
    const upperCenter = alphaCenter(upper), lowerCenter = alphaCenter(lower)
    if (!upperCenter || !lowerCenter) return null
    const axisX = upperCenter.x - lowerCenter.x, axisY = upperCenter.y - lowerCenter.y
    const axisLength = Math.hypot(axisX, axisY)
    if (axisLength < 1) return null
    normal = { x: axisX / axisLength, y: axisY / axisLength }
    tangent = { x: -normal.y, y: normal.x }
  }
  type Edge = { tangent: number; normal: number; point: Point }
  const upperEdges = new Map<number, Edge>(), lowerEdges = new Map<number, Edge>()
  const collectFacingEdges = (mask: AlphaMask, edges: Map<number, Edge>, upperSide: boolean) => {
    for (let y = 0; y < mask.height; y += 1) for (let x = 0; x < mask.width; x += 1) {
      if (mask.data[y * mask.width + x] < 24) continue
      const point = { x: x + .5, y: y + .5 }
      const projectedTangent = point.x * tangent.x + point.y * tangent.y
      const projectedNormal = point.x * normal.x + point.y * normal.y
      const key = Math.round(projectedTangent)
      const previous = edges.get(key)
      // The upper edge facing the lower piece is its minimum normal value;
      // the lower edge facing the upper piece is its maximum normal value.
      if (!previous || (upperSide ? projectedNormal < previous.normal : projectedNormal > previous.normal)) {
        edges.set(key, { tangent: projectedTangent, normal: projectedNormal, point })
      }
    }
  }
  collectFacingEdges(upper, upperEdges, true)
  collectFacingEdges(lower, lowerEdges, false)

  const profiles: Array<{ tangent: number; upper: Edge; lower: Edge; gap: number }> = []
  for (const [key, upperEdge] of upperEdges) {
    const lowerEdge = lowerEdges.get(key)
    if (!lowerEdge) continue
    // Alpha pixels represent square texels. Subtract their combined projected
    // half-width so touching edges count as zero gap instead of a one-pixel gap.
    const gap = upperEdge.normal - lowerEdge.normal - Math.abs(normal.x) - Math.abs(normal.y)
    if (gap > .25 && gap <= maximumGap) {
      const contact = {
        x: (upperEdge.point.x + lowerEdge.point.x) / 2,
        y: (upperEdge.point.y + lowerEdge.point.y) / 2
      }
      if (isNearAnchor(contact, anchor, anchorRadius)) {
        profiles.push({ tangent: (upperEdge.tangent + lowerEdge.tangent) / 2, upper: upperEdge, lower: lowerEdge, gap })
      }
    }
  }
  if (profiles.length < 3) return null

  const midpoints = profiles.map(({ upper, lower }) => ({
    x: (upper.point.x + lower.point.x) / 2,
    y: (upper.point.y + lower.point.y) / 2
  }))
  const center = midpoints.reduce((sum, point) => ({
    x: sum.x + point.x / midpoints.length,
    y: sum.y + point.y / midpoints.length
  }), { x: 0, y: 0 })
  const centerTangent = center.x * tangent.x + center.y * tangent.y
  const centerNormal = center.x * normal.x + center.y * normal.y
  const gapSamples = profiles.map(({ tangent: projectedTangent, upper, lower }) => ({
    tangent: projectedTangent - centerTangent,
    upperNormal: upper.normal - centerNormal,
    lowerNormal: lower.normal - centerNormal
  }))
  const minTangent = Math.min(...gapSamples.map((sample) => sample.tangent))
  const maxTangent = Math.max(...gapSamples.map((sample) => sample.tangent))
  if (maxTangent - minTangent < 2) return null
  return { center, tangent, normal, minTangent, maxTangent, gapSamples }
}

/** Finds a seam, optionally resolving touching/gapped edges only around a saved joint anchor. */
export function detectWardrobeJointSeam(
  upper: WardrobeJointBridgeMask,
  lower: WardrobeJointBridgeMask,
  maximumGap: number,
  preferredAnchor?: Point,
  anchorRadius = Number.POSITIVE_INFINITY
): SeamWithGap | null {
  const touching = findSeam(upper, lower, preferredAnchor, anchorRadius)
  const nearby = findNearbySeam(upper, lower, maximumGap, touching ?? undefined, preferredAnchor, anchorRadius)
  if (!nearby) return touching
  if (!touching) return nearby

  const alignment = touching.normal.x * nearby.normal.x + touching.normal.y * nearby.normal.y
  if (alignment < .75) return touching
  const gapSamples: SeamGapSample[] = []
  for (const sample of nearby.gapSamples ?? []) {
    const upperPoint = pointInSeam(nearby, sample.tangent, sample.upperNormal)
    const lowerPoint = pointInSeam(nearby, sample.tangent, sample.lowerNormal)
    const relative = (point: Point) => ({ x: point.x - touching.center.x, y: point.y - touching.center.y })
    const upperRelative = relative(upperPoint), lowerRelative = relative(lowerPoint)
    const upperNormal = upperRelative.x * touching.normal.x + upperRelative.y * touching.normal.y
    const lowerNormal = lowerRelative.x * touching.normal.x + lowerRelative.y * touching.normal.y
    if (upperNormal <= lowerNormal) continue
    const middle = { x: (upperPoint.x + lowerPoint.x) / 2, y: (upperPoint.y + lowerPoint.y) / 2 }
    const middleRelative = relative(middle)
    gapSamples.push({
      tangent: middleRelative.x * touching.tangent.x + middleRelative.y * touching.tangent.y,
      upperNormal,
      lowerNormal
    })
  }
  if (!gapSamples.length) return touching
  return {
    ...touching,
    minTangent: Math.min(touching.minTangent, ...gapSamples.map((sample) => sample.tangent)),
    maxTangent: Math.max(touching.maxTangent, ...gapSamples.map((sample) => sample.tangent)),
    gapSamples
  }
}

/**
 * Keeps the detected seam orientation and width while placing its center on
 * the saved source-space joint anchor. The anchor is authored by the model's
 * joint cutter and is more reliable than an asymmetric alpha contour.
 */
export function anchorWardrobeJointSeam(seam: SeamWithGap, anchor: Point): SeamWithGap {
  if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) return seam
  const deltaX = anchor.x - seam.center.x
  const deltaY = anchor.y - seam.center.y
  const tangentShift = deltaX * seam.tangent.x + deltaY * seam.tangent.y
  const normalShift = deltaX * seam.normal.x + deltaY * seam.normal.y
  return {
    ...seam,
    center: { ...anchor },
    minTangent: seam.minTangent - tangentShift,
    maxTangent: seam.maxTangent - tangentShift,
    ...(seam.gapSamples ? { gapSamples: seam.gapSamples.map((sample) => ({
      tangent: sample.tangent - tangentShift,
      upperNormal: sample.upperNormal - normalShift,
      lowerNormal: sample.lowerNormal - normalShift
    })) } : {})
  }
}

function sampleOpaquePixel(data: Uint8ClampedArray, width: number, height: number, seam: Seam,
  tangent: number, normal: number, direction: number): [number, number, number, number] | null {
  for (let distance = 0; distance <= 3; distance += .5) for (const tangentOffset of [0, -.5, .5]) {
    const point = pointInSeam(seam, tangent + tangentOffset, normal + direction * distance)
    const x = Math.floor(point.x), y = Math.floor(point.y)
    if (x < 0 || x >= width || y < 0 || y >= height) continue
    const index = (y * width + x) * 4
    if (data[index + 3] >= 24) return [data[index], data[index + 1], data[index + 2], data[index + 3]]
  }
  return null
}

/** Fills only the narrow gap pixels, returning a transparent overlay for direct posing. */
export function fillWardrobeJointGapPixels(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  seam: SeamWithGap
): Uint8ClampedArray | null {
  if (!seam.gapSamples?.length || data.length !== width * height * 4) return null
  const source = new Uint8ClampedArray(data)
  const patch = new Uint8ClampedArray(data.length)
  let changed = false
  for (const sample of seam.gapSamples) {
    const gap = sample.upperNormal - sample.lowerNormal
    if (gap <= .25) continue
    const lowerColor = sampleOpaquePixel(source, width, height, seam, sample.tangent, sample.lowerNormal, -1)
    const upperColor = sampleOpaquePixel(source, width, height, seam, sample.tangent, sample.upperNormal, 1)
    if (!lowerColor || !upperColor) continue
    const steps = Math.max(1, Math.ceil(gap * 2))
    for (let step = 0; step <= steps; step += 1) {
      const amount = step / steps
      const point = pointInSeam(seam, sample.tangent, sample.lowerNormal + gap * amount)
      const x = Math.floor(point.x), y = Math.floor(point.y)
      if (x < 0 || x >= width || y < 0 || y >= height) continue
      const index = (y * width + x) * 4
      if (source[index + 3] >= 250 || patch[index + 3] >= 250) continue
      const lowerAlpha = lowerColor[3] / 255, upperAlpha = upperColor[3] / 255
      const alpha = lowerAlpha + (upperAlpha - lowerAlpha) * amount
      if (alpha <= 0) continue
      const premultiplied = (channel: number) => {
        const lower = lowerColor[channel] * lowerAlpha
        const upper = upperColor[channel] * upperAlpha
        return Math.round((lower + (upper - lower) * amount) / alpha)
      }
      const pixel: [number, number, number, number] = [premultiplied(0), premultiplied(1), premultiplied(2), Math.round(alpha * 255)]
      patch.set(pixel, index)
      data.set(pixel, index)
      changed = true
    }
  }
  return changed ? patch : null
}

function smoothStep(value: number): number {
  const clamped = Math.max(0, Math.min(1, value))
  return clamped * clamped * (3 - 2 * clamped)
}

function transformSeamPoint(point: Point, distance: number, halfWidth: number, upper: Affine, lower: Affine): Point {
  const weight = smoothStep((distance + halfWidth) / (2 * halfWidth))
  const up = transformPoint(upper, point), down = transformPoint(lower, point)
  return { x: down.x + (up.x - down.x) * weight, y: down.y + (up.y - down.y) * weight }
}

function transformsDifferAcrossSeam(seam: Seam, halfWidth: number, upper: Affine, lower: Affine): boolean {
  const start = seam.minTangent, end = seam.maxTangent
  const samples = [
    pointInSeam(seam, start, -halfWidth), pointInSeam(seam, start, 0), pointInSeam(seam, start, halfWidth),
    pointInSeam(seam, (start + end) / 2, -halfWidth), pointInSeam(seam, (start + end) / 2, 0), pointInSeam(seam, (start + end) / 2, halfWidth),
    pointInSeam(seam, end, -halfWidth), pointInSeam(seam, end, 0), pointInSeam(seam, end, halfWidth)
  ]
  return samples.some((sample) => {
    const upperPoint = transformPoint(upper, sample), lowerPoint = transformPoint(lower, sample)
    return Math.hypot(upperPoint.x - lowerPoint.x, upperPoint.y - lowerPoint.y) > 0.35
  })
}

function transformsDifferOverBounds(bounds: SourceBounds, upper: Affine, lower: Affine): boolean {
  const right = bounds.width, bottom = bounds.height
  const samples = [{ x: 0, y: 0 }, { x: right, y: 0 }, { x: 0, y: bottom }, { x: right, y: bottom }, { x: right / 2, y: bottom / 2 }]
  return samples.some((sample) => {
    const upperPoint = transformPoint(upper, sample), lowerPoint = transformPoint(lower, sample)
    return Math.hypot(upperPoint.x - lowerPoint.x, upperPoint.y - lowerPoint.y) > 0.35
  })
}

function triangleAffine(source: [Point, Point, Point], target: [Point, Point, Point]): Affine | null {
  const [s1, s2, s3] = source, [t1, t2, t3] = target
  const determinant = (s1.x - s3.x) * (s2.y - s3.y) - (s2.x - s3.x) * (s1.y - s3.y)
  if (Math.abs(determinant) < 1e-8) return null
  const a = ((t1.x - t3.x) * (s2.y - s3.y) - (t2.x - t3.x) * (s1.y - s3.y)) / determinant
  const c = ((s1.x - s3.x) * (t2.x - t3.x) - (s2.x - s3.x) * (t1.x - t3.x)) / determinant
  const e = t3.x - a * s3.x - c * s3.y
  const b = ((t1.y - t3.y) * (s2.y - s3.y) - (t2.y - t3.y) * (s1.y - s3.y)) / determinant
  const d = ((s1.x - s3.x) * (t2.y - t3.y) - (s2.x - s3.x) * (t1.y - t3.y)) / determinant
  const f = t3.y - b * s3.x - d * s3.y
  const matrix: Affine = [a, b, c, d, e, f]
  return matrix.every(Number.isFinite) ? matrix : null
}

/** Expands only the raster clip so antialiasing cannot expose the canvas between neighboring patches. */
export function expandWardrobeJointBridgeTriangle(
  points: [Point, Point, Point],
  amount = 1.25
): [Point, Point, Point] {
  const center = {
    x: (points[0].x + points[1].x + points[2].x) / 3,
    y: (points[0].y + points[1].y + points[2].y) / 3
  }
  return points.map((point) => {
    const dx = point.x - center.x
    const dy = point.y - center.y
    const length = Math.hypot(dx, dy) || 1
    return { x: point.x + dx / length * amount, y: point.y + dy / length * amount }
  }) as [Point, Point, Point]
}

function drawTriangle(
  context: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  source: [Point, Point, Point],
  target: [Point, Point, Point],
  clipOverlap: number
) {
  const matrix = triangleAffine(source, target)
  if (!matrix) return
  // Keep the affine mapping on the exact mesh. Only overlap the clipping edges;
  // clipping adjacent triangles independently otherwise leaves thin grid lines.
  const clip = expandWardrobeJointBridgeTriangle(target, clipOverlap)
  context.save()
  context.beginPath()
  context.moveTo(clip[0].x, clip[0].y)
  context.lineTo(clip[1].x, clip[1].y)
  context.lineTo(clip[2].x, clip[2].y)
  context.closePath()
  context.clip()
  context.transform(...matrix)
  context.drawImage(image, 0, 0)
  context.restore()
}

/**
 * Rasterizes the deformed band on its own surface. Neighboring mesh triangles
 * overlap just enough to hide antialiasing gaps; replacing pixels on that
 * surface prevents their translucent outline pixels from darkening each other.
 */
export function drawWardrobeJointBridgeMesh(
  context: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  triangles: WardrobeJointBridgeTriangle[],
  rasterScale = 1,
  compositeOperation: WardrobeJointBridgeCompositeOperation = 'copy',
  rasterProcessor?: WardrobeJointBridgeRasterProcessor
): boolean {
  if (!triangles.length) return false
  const scale = Number.isFinite(rasterScale) && rasterScale > 0 ? rasterScale : 1
  const clipOverlap = 1.25 / scale
  const targetPoints = triangles.flatMap((triangle) => triangle.target)
  const padding = clipOverlap + 1 / scale
  const left = Math.floor(Math.min(...targetPoints.map((point) => point.x)) - padding)
  const top = Math.floor(Math.min(...targetPoints.map((point) => point.y)) - padding)
  const right = Math.ceil(Math.max(...targetPoints.map((point) => point.x)) + padding)
  const bottom = Math.ceil(Math.max(...targetPoints.map((point) => point.y)) + padding)
  const worldWidth = Math.max(1, right - left)
  const worldHeight = Math.max(1, bottom - top)
  const pixelWidth = Math.max(1, Math.ceil(worldWidth * scale))
  const pixelHeight = Math.max(1, Math.ceil(worldHeight * scale))
  if (!Number.isSafeInteger(pixelWidth * pixelHeight) || pixelWidth * pixelHeight > 8_000_000) return false

  const surface = document.createElement('canvas')
  try {
    surface.width = pixelWidth
    surface.height = pixelHeight
    const surfaceContext = surface.getContext('2d')
    if (!surfaceContext) return false
    surfaceContext.imageSmoothingEnabled = true
    surfaceContext.imageSmoothingQuality = 'high'
    surfaceContext.globalCompositeOperation = compositeOperation
    const scaleX = pixelWidth / worldWidth
    const scaleY = pixelHeight / worldHeight
    surfaceContext.setTransform(scaleX, 0, 0, scaleY, -left * scaleX, -top * scaleY)
    for (const triangle of triangles) {
      drawTriangle(surfaceContext, image, triangle.source, triangle.target, clipOverlap)
    }
    if (rasterProcessor) {
      const pixels = surfaceContext.getImageData(0, 0, pixelWidth, pixelHeight)
      rasterProcessor(pixels, scale)
      surfaceContext.putImageData(pixels, 0, 0)
    }

    context.save()
    try { context.drawImage(surface, 0, 0, pixelWidth, pixelHeight, left, top, worldWidth, worldHeight) }
    finally { context.restore() }
    return true
  } finally {
    surface.width = 0
    surface.height = 0
  }
}

/**
 * Rejoins the complementary saved halves and deforms only a narrow elbow/knee
 * band between the two bone transforms. Existing split assets can use this at
 * render time; no source PNG or saved character customization is changed.
 */
export function drawWardrobeJointBridge(
  context: CanvasRenderingContext2D,
  upper: WardrobeJointBridgeSegment,
  lower: WardrobeJointBridgeSegment,
  rasterScale = 1,
  sourceJointAnchor?: Point,
  compositeOperation: WardrobeJointBridgeCompositeOperation = 'copy',
  rasterProcessor?: WardrobeJointBridgeRasterProcessor
): boolean {
  const bounds = sourceBounds(upper, lower)
  if (bounds.width * bounds.height > 8_000_000) return false

  const upperSource = imageToSourceMatrix(upper)
  const lowerSource = imageToSourceMatrix(lower)
  const upperPose = imageToPoseMatrix(upper)
  const lowerPose = imageToPoseMatrix(lower)
  const upperSourceInverse = invert(upperSource), lowerSourceInverse = invert(lowerSource)
  if (!upperPose || !lowerPose || !upperSourceInverse || !lowerSourceInverse) return false
  const translateBounds = translate(bounds.x, bounds.y)
  const upperWarp = multiply(multiply(upperPose, upperSourceInverse), translateBounds)
  const lowerWarp = multiply(multiply(lowerPose, lowerSourceInverse), translateBounds)
  const transformsDiffer = transformsDifferOverBounds(bounds, upperWarp, lowerWarp)

  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = bounds.width
  sourceCanvas.height = bounds.height
  let gapCanvas: HTMLCanvasElement | null = null
  try {
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
    if (!sourceContext) throw new Error('Não foi possível preparar a junção da roupa na pose.')

    const jointAnchor = sourceJointAnchor
      ? { x: sourceJointAnchor.x - bounds.x, y: sourceJointAnchor.y - bounds.y }
      : undefined
    const searchRadius = wardrobeJointBridgeAnchorSearchRadius(upper.sourceBone, lower.sourceBone)
    const detectedSeam = detectWardrobeJointSeam(
      drawAlphaMask(sourceContext, upper, bounds),
      drawAlphaMask(sourceContext, lower, bounds),
      maximumJointGap(upper, lower),
      jointAnchor,
      jointAnchor ? searchRadius : Number.POSITIVE_INFINITY
    )
    const seam = detectedSeam && sourceJointAnchor
      ? anchorWardrobeJointSeam(detectedSeam, jointAnchor!)
      : detectedSeam
    if (!seam) return false
    if (!transformsDiffer && !seam.gapSamples?.length) return false
    sourceContext.clearRect(0, 0, bounds.width, bounds.height)
    drawSourceSegment(sourceContext, upper, bounds)
    drawSourceSegment(sourceContext, lower, bounds)

    let gapOverlay: Uint8ClampedArray | null = null
    if (seam.gapSamples?.length) {
      const pixels = sourceContext.getImageData(0, 0, bounds.width, bounds.height)
      gapOverlay = fillWardrobeJointGapPixels(pixels.data, bounds.width, bounds.height, seam)
      if (gapOverlay) {
        sourceContext.putImageData(pixels, 0, 0)
        gapCanvas = document.createElement('canvas')
        gapCanvas.width = bounds.width
        gapCanvas.height = bounds.height
        const gapContext = gapCanvas.getContext('2d')
        if (gapContext) {
          const overlay = gapContext.createImageData(bounds.width, bounds.height)
          overlay.data.set(gapOverlay)
          gapContext.putImageData(overlay, 0, 0)
        } else gapCanvas = null
      }
    }

    const upperLength = Math.max(upper.sourceBone.width, upper.sourceBone.height)
    const lowerLength = Math.max(lower.sourceBone.width, lower.sourceBone.height)
    const halfWidth = Math.max(7, Math.min(36, Math.min(upperLength, lowerLength) * 0.12))
    // With the same pose on both bones, the source pixels already join exactly.
    // Avoid painting them a second time, but still render a detected source gap.
    if (!transformsDifferAcrossSeam(seam, halfWidth, upperWarp, lowerWarp)) {
      if (!gapCanvas) return false
      context.save()
      context.transform(...upperWarp)
      context.drawImage(gapCanvas, 0, 0)
      context.restore()
      return true
    }
    const tangentPadding = Math.min(halfWidth, Math.max(2, (seam.maxTangent - seam.minTangent) * 0.04))
    const start = seam.minTangent - tangentPadding
    const end = seam.maxTangent + tangentPadding
    const columns = Math.max(1, Math.ceil((end - start) / Math.max(5, Math.min(18, halfWidth / 2))))
    const rows = Math.max(2, Math.ceil((2 * halfWidth) / Math.max(3, Math.min(8, halfWidth / 2))))
    if (columns * rows > 10_000) return false
    const vertices: Point[][] = []
    for (let row = 0; row <= rows; row += 1) {
      const distance = -halfWidth + (2 * halfWidth * row) / rows
      const line: Point[] = []
      for (let column = 0; column <= columns; column += 1) {
        const tangent = start + ((end - start) * column) / columns
        const source = pointInSeam(seam, tangent, distance)
        line.push(transformSeamPoint(source, distance, halfWidth, upperWarp, lowerWarp))
      }
      vertices.push(line)
    }

    const triangles: WardrobeJointBridgeTriangle[] = []
    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      const sourceTopLeft = pointInSeam(seam, start + ((end - start) * column) / columns, -halfWidth + (2 * halfWidth * row) / rows)
      const sourceTopRight = pointInSeam(seam, start + ((end - start) * (column + 1)) / columns, -halfWidth + (2 * halfWidth * row) / rows)
      const sourceBottomLeft = pointInSeam(seam, start + ((end - start) * column) / columns, -halfWidth + (2 * halfWidth * (row + 1)) / rows)
      const sourceBottomRight = pointInSeam(seam, start + ((end - start) * (column + 1)) / columns, -halfWidth + (2 * halfWidth * (row + 1)) / rows)
      triangles.push({
        source: [sourceTopLeft, sourceTopRight, sourceBottomRight],
        target: [vertices[row][column], vertices[row][column + 1], vertices[row + 1][column + 1]]
      }, {
        source: [sourceTopLeft, sourceBottomRight, sourceBottomLeft],
        target: [vertices[row][column], vertices[row + 1][column + 1], vertices[row + 1][column]]
      })
    }
    return drawWardrobeJointBridgeMesh(context, sourceCanvas, triangles, rasterScale, compositeOperation, rasterProcessor)
  } finally {
    sourceCanvas.width = 0
    sourceCanvas.height = 0
    if (gapCanvas) { gapCanvas.width = 0; gapCanvas.height = 0 }
  }
}
