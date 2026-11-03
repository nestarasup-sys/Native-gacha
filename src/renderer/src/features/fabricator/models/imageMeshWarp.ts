export const IMAGE_WARP_COLUMNS = 13
export const IMAGE_WARP_ROWS = 15

const MAX_WARP_PADDING = 512
const MAX_WARP_PIXELS = 32_000_000

export type ImageWarpMesh = {
  columns: number
  rows: number
  offsetX: Float32Array
  offsetY: Float32Array
}

export type ImageWarpBounds = {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export type ImageWarpPoint = { x: number; y: number }

export function createImageWarpMesh(columns = IMAGE_WARP_COLUMNS, rows = IMAGE_WARP_ROWS): ImageWarpMesh {
  const safeColumns = Math.max(2, Math.min(64, Math.round(columns)))
  const safeRows = Math.max(2, Math.min(64, Math.round(rows)))
  const pointCount = (safeColumns + 1) * (safeRows + 1)
  return { columns: safeColumns, rows: safeRows, offsetX: new Float32Array(pointCount), offsetY: new Float32Array(pointCount) }
}

function meshIndex(column: number, row: number, columns: number): number {
  return row * (columns + 1) + column
}

function meshPoint(image: HTMLImageElement, column: number, row: number, columns: number, rows: number): ImageWarpPoint {
  return { x: column * image.naturalWidth / columns, y: row * image.naturalHeight / rows }
}

/** Maps a source pixel through the same two triangles used to render the warp mesh. */
export function mapImageWarpPoint(image: HTMLImageElement, mesh: ImageWarpMesh, point: ImageWarpPoint): ImageWarpPoint {
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (width <= 0 || height <= 0) return point
  const columns = mesh.columns
  const rows = mesh.rows
  const gridX = Math.max(0, Math.min(columns, point.x * columns / width))
  const gridY = Math.max(0, Math.min(rows, point.y * rows / height))
  const column = Math.min(columns - 1, Math.floor(gridX))
  const row = Math.min(rows - 1, Math.floor(gridY))
  const x = gridX - column
  const y = gridY - row
  const topLeft = meshIndex(column, row, columns)
  const topRight = meshIndex(column + 1, row, columns)
  const bottomRight = meshIndex(column + 1, row + 1, columns)
  const bottomLeft = meshIndex(column, row + 1, columns)
  let offsetX: number
  let offsetY: number
  if (x >= y) {
    const topLeftWeight = 1 - x
    const topRightWeight = x - y
    const bottomRightWeight = y
    offsetX = mesh.offsetX[topLeft] * topLeftWeight + mesh.offsetX[topRight] * topRightWeight + mesh.offsetX[bottomRight] * bottomRightWeight
    offsetY = mesh.offsetY[topLeft] * topLeftWeight + mesh.offsetY[topRight] * topRightWeight + mesh.offsetY[bottomRight] * bottomRightWeight
  } else {
    const topLeftWeight = 1 - y
    const bottomRightWeight = x
    const bottomLeftWeight = y - x
    offsetX = mesh.offsetX[topLeft] * topLeftWeight + mesh.offsetX[bottomRight] * bottomRightWeight + mesh.offsetX[bottomLeft] * bottomLeftWeight
    offsetY = mesh.offsetY[topLeft] * topLeftWeight + mesh.offsetY[bottomRight] * bottomRightWeight + mesh.offsetY[bottomLeft] * bottomLeftWeight
  }
  return { x: point.x + offsetX, y: point.y + offsetY }
}

function pointToWorld(point: ImageWarpPoint, image: HTMLImageElement, bounds: ImageWarpBounds): ImageWarpPoint {
  const radians = bounds.rotation * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const localX = (point.x - image.naturalWidth / 2) * bounds.width / image.naturalWidth
  const localY = (point.y - image.naturalHeight / 2) * bounds.height / image.naturalHeight
  return {
    x: bounds.x + bounds.width / 2 + localX * cos - localY * sin,
    y: bounds.y + bounds.height / 2 + localX * sin + localY * cos
  }
}

function maxAllowedPadding(width: number, height: number): number {
  let low = 0
  let high = MAX_WARP_PADDING
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if ((width + middle * 2) * (height + middle * 2) <= MAX_WARP_PIXELS) low = middle
    else high = middle - 1
  }
  return low
}

function constrainOffsets(mesh: ImageWarpMesh, image: HTMLImageElement): void {
  const paddingLimit = maxAllowedPadding(image.naturalWidth, image.naturalHeight)
  const maxOffset = paddingLimit >= 2
    ? Math.min(MAX_WARP_PADDING - 2, paddingLimit - 2)
    : Math.min(MAX_WARP_PADDING - 2, Math.max(1, Math.min(image.naturalWidth / IMAGE_WARP_COLUMNS, image.naturalHeight / IMAGE_WARP_ROWS) * 0.72))
  for (let index = 0; index < mesh.offsetX.length; index += 1) {
    const column = index % (mesh.columns + 1)
    const row = Math.floor(index / (mesh.columns + 1))
    if (paddingLimit < 2 && (column === 0 || column === mesh.columns || row === 0 || row === mesh.rows)) {
      mesh.offsetX[index] = 0
      mesh.offsetY[index] = 0
      continue
    }
    mesh.offsetX[index] = Math.max(-maxOffset, Math.min(maxOffset, mesh.offsetX[index]))
    mesh.offsetY[index] = Math.max(-maxOffset, Math.min(maxOffset, mesh.offsetY[index]))
  }
}

export function applyImageWarpBrush(
  mesh: ImageWarpMesh,
  image: HTMLImageElement,
  bounds: ImageWarpBounds,
  pointer: ImageWarpPoint,
  delta: ImageWarpPoint,
  radius: number,
  strength: number
): void {
  if (image.naturalWidth <= 0 || image.naturalHeight <= 0 || bounds.width <= 0 || bounds.height <= 0) return
  const radians = bounds.rotation * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const pixelScaleX = bounds.width / image.naturalWidth
  const pixelScaleY = bounds.height / image.naturalHeight
  const localDeltaX = (delta.x * cos + delta.y * sin) / pixelScaleX
  const localDeltaY = (-delta.x * sin + delta.y * cos) / pixelScaleY
  const safeRadius = Math.max(1, radius)
  const safeStrength = Math.max(0, Math.min(1, strength))

  for (let row = 0; row <= mesh.rows; row += 1) {
    for (let column = 0; column <= mesh.columns; column += 1) {
      const index = meshIndex(column, row, mesh.columns)
      const base = meshPoint(image, column, row, mesh.columns, mesh.rows)
      const world = pointToWorld({ x: base.x + mesh.offsetX[index], y: base.y + mesh.offsetY[index] }, image, bounds)
      const distance = Math.hypot(world.x - pointer.x, world.y - pointer.y)
      const influence = Math.exp(-Math.pow(distance / (safeRadius * 0.78), 2) * 1.4)
      if (influence < 0.005) continue
      mesh.offsetX[index] += localDeltaX * influence * safeStrength
      mesh.offsetY[index] += localDeltaY * influence * safeStrength
    }
  }

  constrainOffsets(mesh, image)
}

/** Interpolates pointer movement so sparse mouse events deform along the complete stroke. */
export function applyImageWarpBrushStroke(
  mesh: ImageWarpMesh,
  image: HTMLImageElement,
  bounds: ImageWarpBounds,
  from: ImageWarpPoint,
  to: ImageWarpPoint,
  radius: number,
  strength: number
): void {
  const delta = { x: to.x - from.x, y: to.y - from.y }
  const distance = Math.hypot(delta.x, delta.y)
  if (distance <= 0.001) return
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.2)))
  for (let step = 1; step <= steps; step += 1) {
    const previous = { x: from.x + delta.x * ((step - 1) / steps), y: from.y + delta.y * ((step - 1) / steps) }
    const point = { x: from.x + delta.x * (step / steps), y: from.y + delta.y * (step / steps) }
    applyImageWarpBrush(mesh, image, bounds, point, { x: point.x - previous.x, y: point.y - previous.y }, radius, strength)
  }
}

function expandedTriangle(points: [ImageWarpPoint, ImageWarpPoint, ImageWarpPoint], amount = 0.65): [ImageWarpPoint, ImageWarpPoint, ImageWarpPoint] {
  const center = {
    x: (points[0].x + points[1].x + points[2].x) / 3,
    y: (points[0].y + points[1].y + points[2].y) / 3
  }
  return points.map((point) => {
    const dx = point.x - center.x
    const dy = point.y - center.y
    const length = Math.hypot(dx, dy) || 1
    return { x: point.x + dx / length * amount, y: point.y + dy / length * amount }
  }) as [ImageWarpPoint, ImageWarpPoint, ImageWarpPoint]
}

function drawTriangle(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  source: [ImageWarpPoint, ImageWarpPoint, ImageWarpPoint],
  destination: [ImageWarpPoint, ImageWarpPoint, ImageWarpPoint]
): void {
  const [s0, s1, s2] = source
  const [d0, d1, d2] = destination
  const sourceX1 = s1.x - s0.x
  const sourceY1 = s1.y - s0.y
  const sourceX2 = s2.x - s0.x
  const sourceY2 = s2.y - s0.y
  const determinant = sourceX1 * sourceY2 - sourceX2 * sourceY1
  if (Math.abs(determinant) < 0.000001) return

  const destinationX1 = d1.x - d0.x
  const destinationY1 = d1.y - d0.y
  const destinationX2 = d2.x - d0.x
  const destinationY2 = d2.y - d0.y
  const a = (destinationX1 * sourceY2 - destinationX2 * sourceY1) / determinant
  const c = (sourceX1 * destinationX2 - sourceX2 * destinationX1) / determinant
  const b = (destinationY1 * sourceY2 - destinationY2 * sourceY1) / determinant
  const d = (sourceX1 * destinationY2 - sourceX2 * destinationY1) / determinant
  const e = d0.x - a * s0.x - c * s0.y
  const f = d0.y - b * s0.x - d * s0.y

  const clip = expandedTriangle(destination)
  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.beginPath()
  context.moveTo(clip[0].x, clip[0].y)
  context.lineTo(clip[1].x, clip[1].y)
  context.lineTo(clip[2].x, clip[2].y)
  context.closePath()
  context.clip()
  context.setTransform(a, b, c, d, e, f)
  context.drawImage(image, 0, 0)
  context.restore()
}

export function imageWarpPadding(mesh: ImageWarpMesh): number {
  let maximum = 0
  for (let index = 0; index < mesh.offsetX.length; index += 1) {
    maximum = Math.max(maximum, Math.abs(mesh.offsetX[index]), Math.abs(mesh.offsetY[index]))
  }
  return Math.min(MAX_WARP_PADDING, Math.ceil(maximum) + 2)
}

export function drawImageWarp(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  mesh: ImageWarpMesh,
  padding = imageWarpPadding(mesh)
): { padding: number; width: number; height: number } {
  const safePadding = Math.min(padding, maxAllowedPadding(image.naturalWidth, image.naturalHeight))
  const width = image.naturalWidth + safePadding * 2
  const height = image.naturalHeight + safePadding * 2
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Não foi possível desenhar a malha da imagem.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.clearRect(0, 0, width, height)

  const hasDeformation = mesh.offsetX.some((offset, index) => Math.abs(offset) > 0.0001 || Math.abs(mesh.offsetY[index]) > 0.0001)
  if (!hasDeformation) {
    context.drawImage(image, safePadding, safePadding)
    return { padding: safePadding, width, height }
  }

  const node = (column: number, row: number): ImageWarpPoint => {
    const index = meshIndex(column, row, mesh.columns)
    const base = meshPoint(image, column, row, mesh.columns, mesh.rows)
    return { x: base.x + mesh.offsetX[index] + safePadding, y: base.y + mesh.offsetY[index] + safePadding }
  }

  context.save()
  try {
    // Each overlapping patch replaces its pixels instead of darkening translucent outlines.
    context.globalCompositeOperation = 'copy'
    for (let row = 0; row < mesh.rows; row += 1) {
      for (let column = 0; column < mesh.columns; column += 1) {
        const sourceTopLeft = meshPoint(image, column, row, mesh.columns, mesh.rows)
        const sourceTopRight = meshPoint(image, column + 1, row, mesh.columns, mesh.rows)
        const sourceBottomRight = meshPoint(image, column + 1, row + 1, mesh.columns, mesh.rows)
        const sourceBottomLeft = meshPoint(image, column, row + 1, mesh.columns, mesh.rows)
        const destinationTopLeft = node(column, row)
        const destinationTopRight = node(column + 1, row)
        const destinationBottomRight = node(column + 1, row + 1)
        const destinationBottomLeft = node(column, row + 1)
        drawTriangle(context, image, [sourceTopLeft, sourceTopRight, sourceBottomRight], [destinationTopLeft, destinationTopRight, destinationBottomRight])
        drawTriangle(context, image, [sourceTopLeft, sourceBottomRight, sourceBottomLeft], [destinationTopLeft, destinationBottomRight, destinationBottomLeft])
      }
    }
  } finally {
    context.restore()
  }

  return { padding: safePadding, width, height }
}
