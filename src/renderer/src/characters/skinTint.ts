import { MODEL_SKIN_BASE_TONE, isValidSkinTone } from '../../../shared/skinTones'

/** Fill transparent pockets enclosed by ink with a stable color before recoloring. */
export function fillEnclosedTransparentSkin(image: ImageData, baseTone = MODEL_SKIN_BASE_TONE): number {
  if (!isValidSkinTone(baseTone) || image.width < 1 || image.height < 1) return 0
  const { data, width, height } = image
  const count = width * height
  const outside = new Uint8Array(count)
  const queue = new Int32Array(count)
  let head = 0
  let tail = 0
  const enqueue = (pixel: number) => {
    if (outside[pixel] || data[pixel * 4 + 3] > 16) return
    outside[pixel] = 1
    queue[tail++] = pixel
  }
  for (let x = 0; x < width; x++) {
    enqueue(x)
    enqueue((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    enqueue(y * width)
    enqueue(y * width + width - 1)
  }
  while (head < tail) {
    const pixel = queue[head++]
    const x = pixel % width
    const y = Math.floor(pixel / width)
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = x + dx
      const ny = y + dy
      if (nx >= 0 && ny >= 0 && nx < width && ny < height) enqueue(ny * width + nx)
    }
  }
  const target = [1, 3, 5].map((index) => Number.parseInt(baseTone.slice(index, index + 2), 16))
  let filled = 0
  for (let pixel = 0; pixel < count; pixel++) {
    const offset = pixel * 4
    if (outside[pixel] || data[offset + 3] > 16) continue
    data[offset] = target[0]
    data[offset + 1] = target[1]
    data[offset + 2] = target[2]
    data[offset + 3] = 255
    filled++
  }
  return filled
}

/** Recolor body artwork while retaining dark ink contours and filling removed skin interiors. */
export function tintSkinPixels(image: ImageData, tone: string): void {
  if (!isValidSkinTone(tone)) return

  fillEnclosedTransparentSkin(image)

  const { data, width, height } = image
  const count = width * height
  const mask = new Uint8Array(count)
  const target = [1, 3, 5].map((index) => Number.parseInt(tone.slice(index, index + 2), 16))
  let visibleCount = 0
  let warmCount = 0
  let warmLuminance = 0

  const luminanceAt = (offset: number) => data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114
  for (let pixel = 0; pixel < count; pixel++) {
    const offset = pixel * 4
    if (data[offset + 3] <= 16) continue
    visibleCount++
    const red = data[offset]
    const green = data[offset + 1]
    const blue = data[offset + 2]
    if (red <= 108 || red <= green || green <= blue || red - green < 2 || green - blue < 2 || red - blue >= 105) continue
    mask[pixel] = 1
    warmCount++
    warmLuminance += luminanceAt(offset)
  }

  // Fabricador body pieces contain skin inside a dark outline. Their chroma
  // cleanup leaves some fully opaque, nearly white or green-tinted skin pixels
  // that hue detection cannot recognize. On skin-dominant pieces, recolor the
  // entire bright interior so those pixels cannot remain in the old color.
  const skinDominant = warmCount > 128 && warmCount / Math.max(1, visibleCount) > 0.7
  if (skinDominant) {
    for (let pixel = 0; pixel < count; pixel++) {
      const offset = pixel * 4
      mask[pixel] = data[offset + 3] > 0 && luminanceAt(offset) >= 95 ? 1 : 0
    }
  } else {
    // Mixed artwork keeps hue selection. Recover only its immediate blended edge.
    const seeds = mask.slice()
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = y * width + x
        if (mask[pixel]) continue
        const offset = pixel * 4
        const red = data[offset]
        const green = data[offset + 1]
        const blue = data[offset + 2]
        if (data[offset + 3] === 0 || red <= green || red - blue >= 150 || green < 45 || luminanceAt(offset) < 88) continue
        let touchesSkin = false
        for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1) && !touchesSkin; ny++) {
          for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
            if (seeds[ny * width + nx]) { touchesSkin = true; break }
          }
        }
        if (touchesSkin) mask[pixel] = 1
      }
    }
  }

  const baseLuminance = warmCount ? warmLuminance / warmCount : 244
  for (let pixel = 0; pixel < count; pixel++) {
    if (!mask[pixel]) continue
    const offset = pixel * 4
    const shade = Math.min(1.08, Math.max(0.42, luminanceAt(offset) / baseLuminance))
    data[offset] = Math.min(255, Math.round(target[0] * shade))
    data[offset + 1] = Math.min(255, Math.round(target[1] * shade))
    data[offset + 2] = Math.min(255, Math.round(target[2] * shade))
  }
}
