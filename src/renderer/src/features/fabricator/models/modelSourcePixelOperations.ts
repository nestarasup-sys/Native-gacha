export type ModelSourcePixelPoint = { x: number; y: number }
export type ModelSourcePixelRegion = { x: number; y: number; width: number; height: number }
export type ModelSourcePixelImage = { width: number; height: number; data: Uint8ClampedArray }
export type ModelSourceOutlineOptions = { thicknessPercent?: number; luminanceThreshold?: number }

/** Horizontally mirror an RGBA image without changing its dimensions or alpha. */
export function mirrorModelSourcePixelImage(image: ModelSourcePixelImage): ModelSourcePixelImage {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1
    || image.data.length !== image.width * image.height * 4) {
    throw new Error('A imagem não pode ser espelhada porque seus pixels estão inválidos.')
  }
  const data = new Uint8ClampedArray(image.data.length)
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    const source = (y * image.width + x) * 4
    const target = (y * image.width + image.width - 1 - x) * 4
    data.set(image.data.subarray(source, source + 4), target)
  }
  return { width: image.width, height: image.height, data }
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

/** Find dark, high-contrast ink close to transparent edges using tunable band width and tone sensitivity. */
export function detectModelSourceOutlineMask(image: ModelSourcePixelImage, options: ModelSourceOutlineOptions = {}): Uint8Array {
  const { width, height, data } = image
  const thicknessPercent = options.thicknessPercent ?? 4
  const luminanceThreshold = options.luminanceThreshold ?? 150
  if (!Number.isFinite(thicknessPercent) || thicknessPercent < 1 || thicknessPercent > 8) {
    throw new Error('A espessura do contorno deve ficar entre 1 e 8 por cento.')
  }
  if (!Number.isFinite(luminanceThreshold) || luminanceThreshold < 70 || luminanceThreshold > 220) {
    throw new Error('A sensibilidade do contorno deve ficar entre 70 e 220.')
  }
  const count = width * height
  const thickness = Math.max(1, Math.min(24, Math.round(Math.min(width, height) * thicknessPercent / 100)))
  const unreachable = thickness + 1
  const distance = new Uint8Array(count)
  distance.fill(unreachable)
  for (let pixel = 0; pixel < count; pixel += 1) if (data[pixel * 4 + 3] < 32) distance[pixel] = 0

  const advance = (value: number) => Math.min(unreachable, value + 1)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const pixel = y * width + x
    if (distance[pixel] === 0) continue
    let nearest = distance[pixel]
    if (x > 0) nearest = Math.min(nearest, advance(distance[pixel - 1]))
    if (y > 0) {
      nearest = Math.min(nearest, advance(distance[pixel - width]))
      if (x > 0) nearest = Math.min(nearest, advance(distance[pixel - width - 1]))
      if (x + 1 < width) nearest = Math.min(nearest, advance(distance[pixel - width + 1]))
    }
    distance[pixel] = nearest
  }
  for (let y = height - 1; y >= 0; y -= 1) for (let x = width - 1; x >= 0; x -= 1) {
    const pixel = y * width + x
    if (distance[pixel] === 0) continue
    let nearest = distance[pixel]
    if (x + 1 < width) nearest = Math.min(nearest, advance(distance[pixel + 1]))
    if (y + 1 < height) {
      nearest = Math.min(nearest, advance(distance[pixel + width]))
      if (x > 0) nearest = Math.min(nearest, advance(distance[pixel + width - 1]))
      if (x + 1 < width) nearest = Math.min(nearest, advance(distance[pixel + width + 1]))
    }
    distance[pixel] = nearest
  }

  const luminanceAt = (pixel: number) => {
    const offset = pixel * 4
    return brightness(data[offset], data[offset + 1], data[offset + 2])
  }
  const mask = new Uint8Array(count)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const pixel = y * width + x
    const offset = pixel * 4
    if (data[offset + 3] < 32 || distance[pixel] > thickness) continue
    const luminance = luminanceAt(pixel)
    if (luminance <= luminanceThreshold) {
      mask[pixel] = 1
      continue
    }
    if (luminance > Math.min(255, luminanceThreshold + 60)) continue
    let touchesLighterInterior = false
    for (let dy = -2; dy <= 2 && !touchesLighterInterior; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const neighbor = ny * width + nx
      if (data[neighbor * 4 + 3] >= 96 && luminanceAt(neighbor) - luminance >= 30) {
        touchesLighterInterior = true
        break
      }
    }
    if (touchesLighterInterior) mask[pixel] = 1
  }
  return mask
}

/** Replace detected outer contour ink with one exact color while preserving alpha. */
export function normalizeModelSourceOutlinePixels(image: ModelSourcePixelImage, color: string, mask = detectModelSourceOutlineMask(image)): number {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Escolha uma cor válida para normalizar o contorno.')
  if (mask.length !== image.width * image.height) throw new Error('A máscara do contorno não corresponde ao tamanho da imagem.')
  const target = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16))
  let changedPixels = 0
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (!mask[pixel]) continue
    const offset = pixel * 4
    if (image.data[offset + 3] < 32) continue
    if (image.data[offset] === target[0] && image.data[offset + 1] === target[1] && image.data[offset + 2] === target[2]) continue
    image.data[offset] = target[0]
    image.data[offset + 1] = target[1]
    image.data[offset + 2] = target[2]
    changedPixels += 1
  }
  return changedPixels
}

/** Finds the smallest source rectangle that includes every brush point and the outline test margin. */
export function modelSourceBrushRegion(
  width: number,
  height: number,
  points: readonly ModelSourcePixelPoint[],
  size: number,
  outlineOnly: boolean
): ModelSourcePixelRegion | null {
  if (!points.length) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  const radius = Math.max(1, Math.min(128, size / 2))
  const padding = outlineOnly ? Math.ceil(radius + 5) : Math.ceil(radius)
  const x = Math.max(0, Math.floor(minX - padding))
  const y = Math.max(0, Math.floor(minY - padding))
  const right = Math.min(width, Math.ceil(maxX + padding))
  const bottom = Math.min(height, Math.ceil(maxY + padding))
  if (right <= x || bottom <= y) return null
  return { x, y, width: right - x, height: bottom - y }
}

/** Applies the existing erase/outline brush rules to a cropped RGBA buffer. */
export function applyModelSourceBrushPixels(
  image: ModelSourcePixelImage,
  points: readonly ModelSourcePixelPoint[],
  size: number,
  outlineOnly: boolean,
  origin: Pick<ModelSourcePixelPoint, 'x' | 'y'>
): number {
  if (!points.length) return 0
  const { width, height, data } = image
  const radius = Math.max(1, Math.min(128, size / 2))
  const mask = new Uint8Array(width * height)
  const markCircle = (point: ModelSourcePixelPoint) => {
    const cx = point.x - origin.x
    const cy = point.y - origin.y
    const left = Math.max(0, Math.floor(cx - radius))
    const right = Math.min(width - 1, Math.ceil(cx + radius))
    const top = Math.max(0, Math.floor(cy - radius))
    const bottom = Math.min(height - 1, Math.ceil(cy + radius))
    for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) mask[y * width + x] = 1
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
  const indexAt = (x: number, y: number) => (y * width + x) * 4
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const pixelIndex = y * width + x
    if (!mask[pixelIndex]) continue
    const offset = pixelIndex * 4
    if (data[offset + 3] < 32) continue
    if (!outlineOnly) {
      data[offset + 3] = 0
      removedPixels += 1
      continue
    }
    let nearTransparent = false
    for (let dy = -4; dy <= 4 && !nearTransparent; dy += 1) for (let dx = -4; dx <= 4; dx += 1) {
      if (Math.hypot(dx, dy) > 4 || (dx === 0 && dy === 0)) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || data[indexAt(nx, ny) + 3] < 32) {
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
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const insideIndex = indexAt(nx, ny)
        if (data[insideIndex + 3] < 160) continue
        const contrast = colorDistance(data, offset, insideIndex)
        const darkerInside = brightness(data[insideIndex], data[insideIndex + 1], data[insideIndex + 2])
          - brightness(data[offset], data[offset + 1], data[offset + 2])
        if (contrast >= 42 && darkerInside >= 18) {
          outlineLike = true
          break
        }
      }
    }
    if (outlineLike) {
      data[offset + 3] = 0
      removedPixels += 1
    }
  }
  return removedPixels
}

/** Removes a selected light skin tone while retaining dark contour ink. */
export function removeModelSourceColorPixels(image: ModelSourcePixelImage, color: string, tolerance: number): number {
  const data = image.data
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)
  const targetBrightness = brightness(red, green, blue)
  const preserveDarkInkBelow = Math.max(32, Math.min(72, targetBrightness * 0.35))
  const maxDistance = Math.max(0, Math.min(180, tolerance))
  let removedPixels = 0

  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] < 32) continue
    const pixelBrightness = brightness(data[offset], data[offset + 1], data[offset + 2])
    if (pixelBrightness < preserveDarkInkBelow) continue
    const distance = Math.hypot(data[offset] - red, data[offset + 1] - green, data[offset + 2] - blue)
    if (distance > maxDistance) continue
    data[offset + 3] = 0
    removedPixels += 1
  }
  return removedPixels
}
