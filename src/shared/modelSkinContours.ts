import type { ModelPart, ModelSkinContourPoint, ModelSkinContourStroke } from './fabricator'

export const MAX_MODEL_SKIN_CONTOUR_STROKES = 64
export const MAX_MODEL_SKIN_CONTOUR_POINTS = 8192
export const MAX_MODEL_SKIN_CONTOUR_PROJECT_POINTS = 100_000

type Crop = { x: number; y: number; width: number; height: number }
type Segment = [ModelSkinContourPoint, ModelSkinContourPoint]

export function countModelSkinContourPoints(strokes: ModelSkinContourStroke[] | undefined): number {
  return (strokes ?? []).reduce((total, stroke) => total + stroke.points.length, 0)
}

export function limitModelSkinContours(strokes: ModelSkinContourStroke[]): ModelSkinContourStroke[] | undefined {
  const result: ModelSkinContourStroke[] = []
  let pointCount = 0
  for (const stroke of strokes) {
    if (result.length >= MAX_MODEL_SKIN_CONTOUR_STROKES || pointCount >= MAX_MODEL_SKIN_CONTOUR_POINTS) break
    if (!Number.isFinite(stroke.width) || !Array.isArray(stroke.points)) continue
    const availablePoints = MAX_MODEL_SKIN_CONTOUR_POINTS - pointCount
    const points = stroke.points.slice(0, availablePoints)
    if (points.length < 2) continue
    result.push({ width: Math.max(0.001, Math.min(0.12, stroke.width)), points })
    pointCount += points.length
  }
  return result.length ? result : undefined
}

export function isValidModelSkinContours(value: unknown): value is ModelSkinContourStroke[] {
  if (!Array.isArray(value) || value.length > MAX_MODEL_SKIN_CONTOUR_STROKES) return false
  let pointCount = 0
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
    const stroke = entry as Record<string, unknown>
    if (typeof stroke.width !== 'number' || !Number.isFinite(stroke.width) || stroke.width < 0.001 || stroke.width > 0.12) return false
    if (!Array.isArray(stroke.points) || stroke.points.length < 2 || stroke.points.length > 4096) return false
    pointCount += stroke.points.length
    if (pointCount > MAX_MODEL_SKIN_CONTOUR_POINTS) return false
    for (const pointValue of stroke.points) {
      if (!pointValue || typeof pointValue !== 'object' || Array.isArray(pointValue)) return false
      const point = pointValue as Record<string, unknown>
      if (typeof point.x !== 'number' || !Number.isFinite(point.x) || point.x < 0 || point.x > 1
        || typeof point.y !== 'number' || !Number.isFinite(point.y) || point.y < 0 || point.y > 1) return false
    }
  }
  return true
}

export function areModelPartSkinContoursValid(parts: readonly Pick<ModelPart, 'fakeSkinContours'>[]): boolean {
  let pointCount = 0
  for (const part of parts) {
    if (part.fakeSkinContours === undefined) continue
    if (!isValidModelSkinContours(part.fakeSkinContours)) return false
    pointCount += countModelSkinContourPoints(part.fakeSkinContours)
    if (pointCount > MAX_MODEL_SKIN_CONTOUR_PROJECT_POINTS) return false
  }
  return true
}

function clipSegmentToRectangle(start: ModelSkinContourPoint, end: ModelSkinContourPoint, crop: Crop): Segment | null {
  const dx = end.x - start.x
  const dy = end.y - start.y
  let from = 0
  let to = 1
  const edges: Array<[number, number]> = [
    [-dx, start.x - crop.x],
    [dx, crop.x + crop.width - start.x],
    [-dy, start.y - crop.y],
    [dy, crop.y + crop.height - start.y]
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null
      continue
    }
    const amount = q / p
    if (p < 0) from = Math.max(from, amount)
    else to = Math.min(to, amount)
    if (from > to) return null
  }
  return [
    { x: start.x + dx * from, y: start.y + dy * from },
    { x: start.x + dx * to, y: start.y + dy * to }
  ]
}

function cross(a: ModelSkinContourPoint, b: ModelSkinContourPoint, point: ModelSkinContourPoint): number {
  return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)
}

function clipSegmentToPolygon(start: ModelSkinContourPoint, end: ModelSkinContourPoint, polygon: ModelSkinContourPoint[]): Segment | null {
  let area = 0
  for (let index = 0; index < polygon.length; index++) {
    const next = polygon[(index + 1) % polygon.length]
    area += polygon[index].x * next.y - next.x * polygon[index].y
  }
  const orientation = area >= 0 ? 1 : -1
  let from = 0
  let to = 1
  for (let index = 0; index < polygon.length; index++) {
    const edgeStart = polygon[index]
    const edgeEnd = polygon[(index + 1) % polygon.length]
    const startSide = cross(edgeStart, edgeEnd, start) * orientation
    const endSide = cross(edgeStart, edgeEnd, end) * orientation
    if (startSide < 0 && endSide < 0) return null
    if (startSide < 0 || endSide < 0) {
      const amount = startSide / (startSide - endSide)
      if (startSide < 0) from = Math.max(from, amount)
      else to = Math.min(to, amount)
      if (from > to) return null
    }
  }
  const dx = end.x - start.x
  const dy = end.y - start.y
  return [
    { x: start.x + dx * from, y: start.y + dy * from },
    { x: start.x + dx * to, y: start.y + dy * to }
  ]
}

function samePoint(a: ModelSkinContourPoint, b: ModelSkinContourPoint): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < 0.01
}

/** Clips local guide strokes to a crop and remaps them to the cropped image. */
export function cropModelSkinContours(
  strokes: ModelSkinContourStroke[] | undefined,
  imageWidth: number,
  imageHeight: number,
  crop: Crop,
  polygon?: ModelSkinContourPoint[]
): ModelSkinContourStroke[] | undefined {
  if (!strokes?.length || imageWidth <= 0 || imageHeight <= 0 || crop.width <= 0 || crop.height <= 0) return undefined
  const result: ModelSkinContourStroke[] = []
  for (const stroke of strokes) {
    const sourcePoints = stroke.points.map(point => ({ x: point.x * imageWidth, y: point.y * imageHeight }))
    const clippedPaths: ModelSkinContourPoint[][] = []
    let currentPath: ModelSkinContourPoint[] = []
    const finishPath = () => {
      if (currentPath.length >= 2) clippedPaths.push(currentPath)
      currentPath = []
    }
    for (let index = 0; index < sourcePoints.length - 1; index++) {
      let segment = clipSegmentToRectangle(sourcePoints[index], sourcePoints[index + 1], crop)
      if (segment && polygon) segment = clipSegmentToPolygon(segment[0], segment[1], polygon)
      if (!segment) { finishPath(); continue }
      const [start, end] = segment
      if (currentPath.length && samePoint(currentPath[currentPath.length - 1], start)) currentPath.push(end)
      else { finishPath(); currentPath = [start, end] }
    }
    finishPath()
    const minCropEdge = Math.min(crop.width, crop.height)
    const width = Math.max(0.001, Math.min(0.12, stroke.width * Math.min(imageWidth, imageHeight) / minCropEdge))
    for (const path of clippedPaths) {
      const points = path.map(point => ({
        x: Math.max(0, Math.min(1, (point.x - crop.x) / crop.width)),
        y: Math.max(0, Math.min(1, (point.y - crop.y) / crop.height))
      }))
      result.push({ points, width })
    }
  }
  return limitModelSkinContours(result)
}
