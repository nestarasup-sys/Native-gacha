export type GridContentBounds = { minX: number; minY: number; maxX: number; maxY: number }

export function removeGridFlatBackground(image: ImageData): void {
  const { width, height, data } = image
  const corners = [0, (width - 1) * 4, ((height - 1) * width) * 4, (height * width - 1) * 4]
  if (corners.some((at) => data[at + 3] <= 24)) return
  const background = [0, 1, 2].map((channel) => corners.reduce((sum, at) => sum + data[at + channel], 0) / corners.length)
  const greenScreen = background[1] > background[0] * 1.2 && background[1] > background[2] * 1.08 && background[1] > 55
  if (!greenScreen && corners.some((at) => Math.hypot(data[at] - background[0], data[at + 1] - background[1], data[at + 2] - background[2]) > 90)) return
  for (let index = 0; index < width * height; index += 1) {
    const at = index * 4
    if (data[at + 3] <= 24) continue
    if (greenScreen) {
      const red = data[at]; const green = data[at + 1]; const blue = data[at + 2]
      const dominance = green - Math.max(red * 1.18, blue * 1.08)
      if (dominance >= 28) data[at + 3] = 0
      else if (dominance > 8) data[at + 3] = Math.round(data[at + 3] * (28 - dominance) / 20)
      continue
    }
    const distance = Math.hypot(data[at] - background[0], data[at + 1] - background[1], data[at + 2] - background[2])
    if (distance < 65) data[at + 3] = 0
    else if (distance < 112) data[at + 3] = Math.round(data[at + 3] * (distance - 65) / 47)
  }
}

export function findGridRowBoundaries(image: ImageData, rowCount: number): number[] {
  const { width, height, data } = image
  const rowInk = new Uint32Array(height)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (data[(y * width + x) * 4 + 3] > 56) rowInk[y] += 1
  }
  const minimumRowHeight = Math.floor(height * 0.22)
  const boundaries = [0]
  for (let row = 1; row < rowCount; row += 1) {
    const target = Math.round(row * height / rowCount)
    const remainingRows = rowCount - row
    const low = Math.max(boundaries[row - 1] + minimumRowHeight, target - Math.round(height * 0.14))
    const high = Math.min(height - remainingRows * minimumRowHeight, target + Math.round(height * 0.14))
    let bestY = target; let bestInk = Number.POSITIVE_INFINITY
    for (let y = low; y <= high; y += 1) {
      const ink = rowInk[y - 1] + rowInk[y] + rowInk[y + 1]
      if (ink < bestInk || (ink === bestInk && Math.abs(y - target) < Math.abs(bestY - target))) { bestY = y; bestInk = ink }
    }
    boundaries.push(bestY)
  }
  boundaries.push(height)
  return boundaries
}

export function findVisibleGridContentBounds(image: ImageData): GridContentBounds | null {
  let minX = image.width; let minY = image.height; let maxX = -1; let maxY = -1
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    if (image.data[(y * image.width + x) * 4 + 3] <= 56) continue
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  return maxX < minX || maxY < minY ? null : { minX, minY, maxX, maxY }
}
