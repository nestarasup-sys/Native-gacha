import type { ModelPart } from '../../../../../shared/fabricator'
import { loadImageFromDataUrl } from './imageData'
import { sourceRect } from './modelSource'

export type ModelSourcePoint = { x: number; y: number }
export type ModelSourceCrop = { x: number; y: number; width: number; height: number }
export type ModelSourceSplit = { parts: [ModelPart, ModelPart]; retainedSide: 0 | 1 }
export type BrushResult = { part: ModelPart; removedPixels: number }

function imageCanvas(image: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponível para editar a peça.')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)
  return canvas
}
async function normalizedImages(part: ModelPart): Promise<{ display: HTMLCanvasElement; base: HTMLCanvasElement }> {
  const [displayImage, baseImage] = await Promise.all([
    loadImageFromDataUrl(part.dataUrl, 'Não foi possível abrir a peça selecionada.'),
    loadImageFromDataUrl(part.chromaBaseDataUrl ?? part.dataUrl, 'Não foi possível abrir a base da peça.')
  ])
  return {
    display: imageCanvas(displayImage, part.width, part.height),
    base: imageCanvas(baseImage, part.width, part.height)
  }
}

function cropCanvas(source: HTMLCanvasElement, crop: ModelSourceCrop): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = crop.width
  canvas.height = crop.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponível para cortar a peça.')
  context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
  return canvas
}

function sourceTransformAfterCrop(part: ModelPart, crop: ModelSourceCrop) {
  const original = sourceRect(part)
  const sx = original.width / part.width
  const sy = original.height / part.height
  const x = original.x + crop.x * sx
  const y = original.y + crop.y * sy
  const width = Math.max(1, Math.round(crop.width * sx))
  const height = Math.max(1, Math.round(crop.height * sy))
  const anchor = part.sourceTransform?.jointAnchor
  const anchorX = anchor ? (anchor.x - original.x) / sx : crop.x + crop.width / 2
  const anchorY = anchor ? (anchor.y - original.y) / sy : crop.y + crop.height / 2
  const inside = anchorX >= crop.x && anchorX <= crop.x + crop.width
    && anchorY >= crop.y && anchorY <= crop.y + crop.height
  return {
    ...part.sourceTransform,
    x,
    y,
    width,
    height,
    rotation: part.sourceTransform?.rotation ?? 0,
    anchorVersion: 1 as const,
    jointAnchor: inside && anchor
      ? { ...anchor }
      : { x: x + width / 2, y: y + height / 2 }
  }
}

function partWorldCenterAfterCrop(part: ModelPart, crop: ModelSourceCrop) {
  const radians = (part.rotation ?? 0) * Math.PI / 180
  const localX = crop.x + crop.width / 2 - part.width / 2
  const localY = crop.y + crop.height / 2 - part.height / 2
  const centerX = part.x + part.width / 2 + localX * Math.cos(radians) - localY * Math.sin(radians)
  const centerY = part.y + part.height / 2 + localX * Math.sin(radians) + localY * Math.cos(radians)
  return { x: centerX, y: centerY }
}

export function worldPointToPart(part: ModelPart, point: ModelSourcePoint): ModelSourcePoint {
  const radians = (part.rotation ?? 0) * Math.PI / 180
  const dx = point.x - (part.x + part.width / 2)
  const dy = point.y - (part.y + part.height / 2)
  return {
    x: part.width / 2 + dx * Math.cos(radians) + dy * Math.sin(radians),
    y: part.height / 2 - dx * Math.sin(radians) + dy * Math.cos(radians)
  }
}

export function worldPointInsideCrop(part: ModelPart, point: ModelSourcePoint, crop: ModelSourceCrop): boolean {
  const local = worldPointToPart(part, point)
  return local.x >= crop.x && local.x <= crop.x + crop.width
    && local.y >= crop.y && local.y <= crop.y + crop.height
}

export async function cropModelSourcePart(part: ModelPart, crop: ModelSourceCrop): Promise<ModelPart> {
  const left = Math.max(0, Math.min(part.width - 1, Math.floor(crop.x)))
  const top = Math.max(0, Math.min(part.height - 1, Math.floor(crop.y)))
  const right = Math.max(left + 1, Math.min(part.width, Math.ceil(crop.x + crop.width)))
  const bottom = Math.max(top + 1, Math.min(part.height, Math.ceil(crop.y + crop.height)))
  const bounds = { x: left, y: top, width: right - left, height: bottom - top }
  const images = await normalizedImages(part)
  const center = partWorldCenterAfterCrop(part, bounds)
  const sourceTransform = sourceTransformAfterCrop(part, bounds)
  const oldAnchor = part.jointAnchor
  const keepAnchor = oldAnchor && worldPointInsideCrop(part, oldAnchor, bounds)
  return {
    ...part,
    x: center.x - bounds.width / 2,
    y: center.y - bounds.height / 2,
    width: bounds.width,
    height: bounds.height,
    resizeBase: { width: bounds.width, height: bounds.height },
    ...(oldAnchor ? { jointAnchor: keepAnchor ? oldAnchor : center } : {}),
    ...(sourceTransform ? { sourceTransform } : {}),
    chromaBaseSaved: true,
    dataUrl: cropCanvas(images.display, bounds).toDataURL('image/png'),
    chromaBaseDataUrl: cropCanvas(images.base, bounds).toDataURL('image/png')
  }
}

function cross(a: ModelSourcePoint, b: ModelSourcePoint, p: ModelSourcePoint): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
}

function polygonArea(polygon: ModelSourcePoint[]): number {
  return Math.abs(polygon.reduce((area, point, index) => {
    const next = polygon[(index + 1) % polygon.length]
    return area + point.x * next.y - next.x * point.y
  }, 0) / 2)
}

function clipPolygon(rectangle: ModelSourcePoint[], start: ModelSourcePoint, end: ModelSourcePoint, positive: boolean): ModelSourcePoint[] {
  const output: ModelSourcePoint[] = []
  for (let index = 0; index < rectangle.length; index += 1) {
    const current = rectangle[index]
    const next = rectangle[(index + 1) % rectangle.length]
    const currentSide = cross(start, end, current) * (positive ? 1 : -1)
    const nextSide = cross(start, end, next) * (positive ? 1 : -1)
    const currentInside = currentSide >= -0.0001
    const nextInside = nextSide >= -0.0001
    if (currentInside) output.push(current)
    if (currentInside !== nextInside) {
      const amount = currentSide / (currentSide - nextSide)
      output.push({
        x: current.x + (next.x - current.x) * amount,
        y: current.y + (next.y - current.y) * amount
      })
    }
  }
  return output
}

function splitPolygons(width: number, height: number, start: ModelSourcePoint, end: ModelSourcePoint): [ModelSourcePoint[], ModelSourcePoint[]] {
  if (Math.hypot(end.x - start.x, end.y - start.y) < 2) throw new Error('Desenhe uma linha maior para dividir a peça.')
  const rectangle = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }]
  const sides: [ModelSourcePoint[], ModelSourcePoint[]] = [
    clipPolygon(rectangle, start, end, true),
    clipPolygon(rectangle, start, end, false)
  ]
  if (sides.some(side => side.length < 3 || polygonArea(side) < 2)) {
    throw new Error('A linha precisa atravessar a peça e formar dois recortes.')
  }
  return sides
}

function polygonBounds(polygon: ModelSourcePoint[], width: number, height: number): ModelSourceCrop {
  const left = Math.max(0, Math.floor(Math.min(...polygon.map(point => point.x))))
  const top = Math.max(0, Math.floor(Math.min(...polygon.map(point => point.y))))
  const right = Math.min(width, Math.ceil(Math.max(...polygon.map(point => point.x))))
  const bottom = Math.min(height, Math.ceil(Math.max(...polygon.map(point => point.y))))
  if (right <= left || bottom <= top) throw new Error('Um dos lados do corte ficou vazio.')
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function pointInPolygon(point: ModelSourcePoint, polygon: ModelSourcePoint[]): boolean {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index]
    const b = polygon[previous]
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x
    if (crosses) inside = !inside
  }
  return inside
}

async function maskedPart(part: ModelPart, polygon: ModelSourcePoint[], crop: ModelSourceCrop, keepId: boolean): Promise<ModelPart> {
  const images = await normalizedImages(part)
  const makeMasked = (source: HTMLCanvasElement) => {
    const canvas = document.createElement('canvas')
    canvas.width = crop.width
    canvas.height = crop.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas indisponível para dividir a peça.')
    context.beginPath()
    polygon.forEach((point, index) => {
      const x = point.x - crop.x
      const y = point.y - crop.y
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.closePath()
    context.clip()
    context.drawImage(source, -crop.x, -crop.y)
    return canvas.toDataURL('image/png')
  }
  const croppedGeometry = await cropModelSourcePart(part, crop)
  const id = keepId ? part.id : crypto.randomUUID()
  const anchor = part.jointAnchor ? worldPointToPart(part, part.jointAnchor) : { x: part.width / 2, y: part.height / 2 }
  const anchorInside = pointInPolygon(anchor, polygon)
  const center = { x: croppedGeometry.x + croppedGeometry.width / 2, y: croppedGeometry.y + croppedGeometry.height / 2 }
  const sourceTransform = croppedGeometry.sourceTransform
  if (sourceTransform && part.sourceTransform?.jointAnchor) {
    const original = sourceRect(part)
    const sx = original.width / part.width
    const sy = original.height / part.height
    const sourcePoint = {
      x: (part.sourceTransform.jointAnchor.x - original.x) / sx,
      y: (part.sourceTransform.jointAnchor.y - original.y) / sy
    }
    if (!pointInPolygon(sourcePoint, polygon)) {
      sourceTransform.jointAnchor = {
        x: sourceTransform.x + (sourceTransform.width ?? croppedGeometry.width) / 2,
        y: sourceTransform.y + (sourceTransform.height ?? croppedGeometry.height) / 2
      }
    }
  }
  return {
    ...croppedGeometry,
    id,
    name: keepId ? part.name : part.name + ' - parte',
    ...(sourceTransform ? { sourceTransform } : {}),
    dataUrl: makeMasked(images.display),
    chromaBaseDataUrl: makeMasked(images.base),
    ...(part.jointAnchor || !keepId ? { jointAnchor: anchorInside && part.jointAnchor ? part.jointAnchor : center } : {})
  }
}

export async function splitModelSourcePart(
  part: ModelPart,
  start: ModelSourcePoint,
  end: ModelSourcePoint,
  retainAt: ModelSourcePoint = { x: part.width / 2, y: part.height / 2 }
): Promise<ModelSourceSplit> {
  const polygons = splitPolygons(part.width, part.height, start, end)
  const retainedSide: 0 | 1 = pointInPolygon(retainAt, polygons[0])
    ? 0
    : pointInPolygon(retainAt, polygons[1])
      ? 1
      : polygonArea(polygons[0]) >= polygonArea(polygons[1]) ? 0 : 1
  const crops = polygons.map(polygon => polygonBounds(polygon, part.width, part.height))
  const pieces = await Promise.all(polygons.map((polygon, index) => maskedPart(part, polygon, crops[index], index === retainedSide)))
  return { parts: [pieces[0], pieces[1]], retainedSide }
}

function brightness(red: number, green: number, blue: number): number {
  return (red * 299 + green * 587 + blue * 114) / 1000
}

function colorDistance(data: Uint8ClampedArray, a: number, b: number): number {
  const red = data[a] - data[b]
  const green = data[a + 1] - data[b + 1]
  const blue = data[a + 2] - data[b + 2]
  return Math.sqrt(red * red + green * green + blue * blue)
}

function applyBrush(
  source: HTMLCanvasElement,
  points: ModelSourcePoint[],
  size: number,
  outlineOnly: boolean
): { canvas: HTMLCanvasElement; removedPixels: number } {
  const width = source.width
  const height = source.height
  const radius = Math.max(1, Math.min(128, size / 2))
  const padding = outlineOnly ? Math.ceil(radius + 5) : Math.ceil(radius)
  const minX = Math.max(0, Math.floor(Math.min(...points.map(point => point.x)) - padding))
  const minY = Math.max(0, Math.floor(Math.min(...points.map(point => point.y)) - padding))
  const maxX = Math.min(width, Math.ceil(Math.max(...points.map(point => point.x)) + padding))
  const maxY = Math.min(height, Math.ceil(Math.max(...points.map(point => point.y)) + padding))
  if (maxX <= minX || maxY <= minY) return { canvas: source, removedPixels: 0 }
  const context = source.getContext('2d')
  if (!context) throw new Error('Canvas indisponível para aplicar o pincel.')
  const image = context.getImageData(minX, minY, maxX - minX, maxY - minY)
  const localWidth = image.width
  const localHeight = image.height
  const mask = new Uint8Array(localWidth * localHeight)
  const markCircle = (point: ModelSourcePoint) => {
    const cx = point.x - minX
    const cy = point.y - minY
    const left = Math.max(0, Math.floor(cx - radius))
    const right = Math.min(localWidth - 1, Math.ceil(cx + radius))
    const top = Math.max(0, Math.floor(cy - radius))
    const bottom = Math.min(localHeight - 1, Math.ceil(cy + radius))
    for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) mask[y * localWidth + x] = 1
    }
  }
  if (points.length === 1) markCircle(points[0])
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    const distance = Math.hypot(to.x - from.x, to.y - from.y)
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 2)))
    for (let step = 0; step <= steps; step += 1) {
      const amount = step / steps
      markCircle({ x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount })
    }
  }
  let removedPixels = 0
  const indexAt = (x: number, y: number) => (y * localWidth + x) * 4
  for (let y = 0; y < localHeight; y += 1) for (let x = 0; x < localWidth; x += 1) {
    const pixelIndex = y * localWidth + x
    if (!mask[pixelIndex]) continue
    const offset = pixelIndex * 4
    if (image.data[offset + 3] < 32) continue
    if (!outlineOnly) {
      image.data[offset + 3] = 0
      removedPixels += 1
      continue
    }
    let nearTransparent = false
    for (let dy = -4; dy <= 4 && !nearTransparent; dy += 1) for (let dx = -4; dx <= 4; dx += 1) {
      if (Math.hypot(dx, dy) > 4 || (dx === 0 && dy === 0)) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= localWidth || ny >= localHeight || image.data[indexAt(nx, ny) + 3] < 32) {
        nearTransparent = true
        break
      }
    }
    if (!nearTransparent) continue
    let outlineLike = false
    for (let distance = 2; distance <= 5 && !outlineLike; distance += 1) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const nx = x + dx * distance
        const ny = y + dy * distance
        if (nx < 0 || ny < 0 || nx >= localWidth || ny >= localHeight) continue
        const insideIndex = indexAt(nx, ny)
        if (image.data[insideIndex + 3] < 160) continue
        const contrast = colorDistance(image.data, offset, insideIndex)
        const darkerInside = brightness(image.data[insideIndex], image.data[insideIndex + 1], image.data[insideIndex + 2])
          - brightness(image.data[offset], image.data[offset + 1], image.data[offset + 2])
        if (contrast >= 42 && darkerInside >= 18) {
          outlineLike = true
          break
        }
      }
    }
    if (outlineLike) {
      image.data[offset + 3] = 0
      removedPixels += 1
    }
  }
  context.putImageData(image, minX, minY)
  return { canvas: source, removedPixels }
}

export async function eraseModelSourceBrush(
  part: ModelPart,
  points: ModelSourcePoint[],
  size: number,
  outlineOnly: boolean
): Promise<BrushResult> {
  if (points.length === 0) return { part, removedPixels: 0 }
  const images = await normalizedImages(part)
  const display = applyBrush(images.display, points, size, outlineOnly)
  const base = applyBrush(images.base, points, size, outlineOnly)
  return {
    part: {
      ...part,
      chromaBaseSaved: true,
      dataUrl: display.canvas.toDataURL('image/png'),
      chromaBaseDataUrl: base.canvas.toDataURL('image/png')
    },
    removedPixels: display.removedPixels
  }
}
