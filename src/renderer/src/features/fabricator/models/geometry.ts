export type Point2D = { x: number; y: number }

/** Rotates a canvas point around an origin by a degree angle. */
export function rotatePointAroundOrigin(point: Point2D, origin: Point2D, degrees: number): Point2D {
  const radians = degrees * Math.PI / 180
  const x = point.x - origin.x
  const y = point.y - origin.y
  return {
    x: origin.x + x * Math.cos(radians) - y * Math.sin(radians),
    y: origin.y + x * Math.sin(radians) + y * Math.cos(radians)
  }
}
