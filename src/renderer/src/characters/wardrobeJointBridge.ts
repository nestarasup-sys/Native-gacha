import type { CustomizerWardrobeGroup } from '../../../shared/customizer'
import type { ModelPart, WardrobeComponent } from '../../../shared/fabricator'
import { wardrobeAdjustmentMatrix } from '../../../shared/wardrobeAdjustment'
import type { WardrobePoseTransform } from '../../../shared/wardrobePose'

type Point = { x: number; y: number }
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
type AlphaMask = { width: number; height: number; data: Uint8Array }

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

function findSeam(upper: AlphaMask, lower: AlphaMask): Seam | null {
  const points: Point[] = []
  const { width, height } = upper
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    const index = y * width + x
    if (upper.data[index] < 24) continue
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue
      const neighbor = (y + dy) * width + x + dx
      if (lower.data[neighbor] >= 24) points.push({ x: x + dx / 2, y: y + dy / 2 })
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

  const upperCenter = alphaCenter(upper)
  const lowerCenter = alphaCenter(lower)
  if (!upperCenter || !lowerCenter) return null
  if ((upperCenter.x - lowerCenter.x) * normal.x + (upperCenter.y - lowerCenter.y) * normal.y < 0) {
    normal = { x: -normal.x, y: -normal.y }
  }
  let minTangent = Number.POSITIVE_INFINITY
  let maxTangent = Number.NEGATIVE_INFINITY
  for (const point of points) {
    const projection = (point.x - center.x) * tangent.x + (point.y - center.y) * tangent.y
    minTangent = Math.min(minTangent, projection)
    maxTangent = Math.max(maxTangent, projection)
  }
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

function drawTriangle(context: CanvasRenderingContext2D, image: HTMLCanvasElement, source: [Point, Point, Point], target: [Point, Point, Point]) {
  const matrix = triangleAffine(source, target)
  if (!matrix) return
  context.save()
  context.beginPath()
  context.moveTo(target[0].x, target[0].y)
  context.lineTo(target[1].x, target[1].y)
  context.lineTo(target[2].x, target[2].y)
  context.closePath()
  context.clip()
  context.transform(...matrix)
  context.drawImage(image, 0, 0)
  context.restore()
}

/**
 * Rejoins the complementary saved halves and deforms only a narrow elbow/knee
 * band between the two bone transforms. Existing split assets can use this at
 * render time; no source PNG or saved character customization is changed.
 */
export function drawWardrobeJointBridge(
  context: CanvasRenderingContext2D,
  upper: WardrobeJointBridgeSegment,
  lower: WardrobeJointBridgeSegment
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
  if (!transformsDifferOverBounds(bounds, upperWarp, lowerWarp)) return false

  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = bounds.width
  sourceCanvas.height = bounds.height
  try {
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
    if (!sourceContext) throw new Error('Não foi possível preparar a junção da roupa na pose.')

    const seam = findSeam(drawAlphaMask(sourceContext, upper, bounds), drawAlphaMask(sourceContext, lower, bounds))
    if (!seam) return false
    sourceContext.clearRect(0, 0, bounds.width, bounds.height)
    drawSourceSegment(sourceContext, upper, bounds)
    drawSourceSegment(sourceContext, lower, bounds)

    const upperLength = Math.max(upper.sourceBone.width, upper.sourceBone.height)
    const lowerLength = Math.max(lower.sourceBone.width, lower.sourceBone.height)
    const halfWidth = Math.max(7, Math.min(36, Math.min(upperLength, lowerLength) * 0.12))
    // With the same pose on both bones, the source pixels already join exactly.
    // Avoid painting them a second time, which would darken antialiased edges.
    if (!transformsDifferAcrossSeam(seam, halfWidth, upperWarp, lowerWarp)) return false
    const tangentPadding = Math.min(halfWidth, Math.max(2, (seam.maxTangent - seam.minTangent) * 0.04))
    const start = seam.minTangent - tangentPadding
    const end = seam.maxTangent + tangentPadding
    const columns = Math.max(1, Math.ceil((end - start) / Math.max(5, Math.min(18, halfWidth / 2))))
    const rows = Math.max(2, Math.ceil((2 * halfWidth) / Math.max(3, Math.min(8, halfWidth / 2))))
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

    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      const sourceTopLeft = pointInSeam(seam, start + ((end - start) * column) / columns, -halfWidth + (2 * halfWidth * row) / rows)
      const sourceTopRight = pointInSeam(seam, start + ((end - start) * (column + 1)) / columns, -halfWidth + (2 * halfWidth * row) / rows)
      const sourceBottomLeft = pointInSeam(seam, start + ((end - start) * column) / columns, -halfWidth + (2 * halfWidth * (row + 1)) / rows)
      const sourceBottomRight = pointInSeam(seam, start + ((end - start) * (column + 1)) / columns, -halfWidth + (2 * halfWidth * (row + 1)) / rows)
      drawTriangle(context, sourceCanvas,
        [sourceTopLeft, sourceTopRight, sourceBottomRight],
        [vertices[row][column], vertices[row][column + 1], vertices[row + 1][column + 1]])
      drawTriangle(context, sourceCanvas,
        [sourceTopLeft, sourceBottomRight, sourceBottomLeft],
        [vertices[row][column], vertices[row + 1][column + 1], vertices[row + 1][column]])
    }
    return true
  } finally {
    sourceCanvas.width = 0
    sourceCanvas.height = 0
  }
}
