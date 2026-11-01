export type AlphaContourPoint = { x: number; y: number }

/** Returns opaque edge pixels from RGBA image data for direct contour grabbing. */
export function extractAlphaContourPoints(rgba: ArrayLike<number>, width: number, height: number, threshold = 16): AlphaContourPoint[] {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length < width * height * 4) return []
  const points: AlphaContourPoint[] = []
  const alphaAt = (x: number, y: number) => x < 0 || y < 0 || x >= width || y >= height ? 0 : rgba[(y * width + x) * 4 + 3]
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(x, y) <= threshold) continue
      if (alphaAt(x - 1, y) <= threshold || alphaAt(x + 1, y) <= threshold || alphaAt(x, y - 1) <= threshold || alphaAt(x, y + 1) <= threshold) {
        points.push({ x: x + 0.5, y: y + 0.5 })
      }
    }
  }
  return points
}

export function nearestAlphaContourPoint(points: AlphaContourPoint[], target: AlphaContourPoint): { point: AlphaContourPoint; distance: number } | null {
  let nearest: AlphaContourPoint | null = null
  let distanceSquared = Number.POSITIVE_INFINITY
  for (const point of points) {
    const dx = point.x - target.x
    const dy = point.y - target.y
    const nextDistanceSquared = dx * dx + dy * dy
    if (nextDistanceSquared < distanceSquared) {
      distanceSquared = nextDistanceSquared
      nearest = point
    }
  }
  return nearest ? { point: nearest, distance: Math.sqrt(distanceSquared) } : null
}
