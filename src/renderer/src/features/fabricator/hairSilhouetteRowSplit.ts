import type { HairGridPixels } from './hairGridLayout'

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))

/**
 * Separates the two hair rows with a smooth seam through low-alpha gaps.
 * The central row slider remains the target; the seam can route around
 * overhanging strands while keeping each source pixel in exactly one result.
 */
export function findHairGridSilhouetteBoundary(image: HairGridPixels, requestedRow: number): number[] {
  const { width, height, data } = image
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 2 || data.length < width * height * 4) {
    throw new Error('Não foi possível separar as fileiras pela silhueta do cabelo.')
  }

  const target = clamp(Math.round(requestedRow), 1, height - 1)
  const deviation = Math.min(192, Math.max(2, Math.round(height * .22)))
  const firstRow = Math.max(1, target - deviation)
  const lastRow = Math.min(height - 1, target + deviation)
  const stateCount = lastRow - firstRow + 1
  const maxStep = Math.max(4, Math.min(16, Math.ceil(height * .025)))
  const parent = new Int16Array(width * stateCount)
  parent.fill(-1)
  let previous = new Float64Array(stateCount)
  let current = new Float64Array(stateCount)
  const alpha = (x: number, y: number): number => y < 0 || y >= height ? 0 : data[(y * width + x) * 4 + 3]
  // Prefer a seam through transparent/low-alpha pixels. A modest distance
  // penalty keeps the result near the user-selected row when the silhouettes
  // overlap, while still allowing the seam to route around a long strand.
  const localCost = (x: number, row: number): number =>
    (alpha(x, row - 1) + alpha(x, row)) / 255
      + (alpha(x, row - 2) + alpha(x, row + 1)) / 255 * .18
      + Math.abs(row - target) * .025
  const smoothness = .025

  for (let state = 0; state < stateCount; state += 1) {
    const row = firstRow + state
    previous[state] = localCost(0, row) + Math.abs(row - target) * .025
  }

  for (let x = 1; x < width; x += 1) {
    current.fill(Number.POSITIVE_INFINITY)
    for (let state = 0; state < stateCount; state += 1) {
      const row = firstRow + state
      const from = Math.max(0, state - maxStep)
      const to = Math.min(stateCount - 1, state + maxStep)
      let best = Number.POSITIVE_INFINITY
      let bestPrevious = -1
      for (let previousState = from; previousState <= to; previousState += 1) {
        const delta = state - previousState
        const cost = previous[previousState] + delta * delta * smoothness
        if (cost < best) { best = cost; bestPrevious = previousState }
      }
      current[state] = best + localCost(x, row)
      parent[x * stateCount + state] = bestPrevious
    }
    const swap = previous
    previous = current
    current = swap
  }

  let state = 0
  let best = Number.POSITIVE_INFINITY
  for (let candidate = 0; candidate < stateCount; candidate += 1) {
    const row = firstRow + candidate
    const cost = previous[candidate] + Math.abs(row - target) * .025
    if (cost < best) { best = cost; state = candidate }
  }

  const boundary = new Array<number>(width)
  boundary[width - 1] = firstRow + state
  for (let x = width - 1; x > 0; x -= 1) {
    state = parent[x * stateCount + state]
    boundary[x - 1] = firstRow + state
  }

  return boundary
}

/** Copies one side at a time to keep peak worker memory low for large sheets. */
export function copyHairGridSideAtBoundary(
  image: HairGridPixels,
  boundary: number[],
  side: 'posterior' | 'traseiro'
): Uint8ClampedArray {
  const { width, height, data } = image
  if (boundary.length !== width || !Number.isInteger(width) || !Number.isInteger(height) || data.length < width * height * 4) {
    throw new Error('Não foi possível recortar a parte do cabelo pela silhueta.')
  }
  const output = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (side === 'posterior' ? y >= boundary[x] : y < boundary[x]) continue
    const sourceOffset = (y * width + x) * 4
    output[sourceOffset] = data[sourceOffset]
    output[sourceOffset + 1] = data[sourceOffset + 1]
    output[sourceOffset + 2] = data[sourceOffset + 2]
    output[sourceOffset + 3] = data[sourceOffset + 3]
  }
  return output
}
