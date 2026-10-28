import { MODEL_SKIN_BASE_TONE, isValidSkinTone } from '../../../shared/skinTones'

const MODEL_BODY_PART_NAME = /cabe[çc]a|head|tronco|corpo|torso|body|bra[cç]o|arm|antebra[cç]o|forearm|coxa|thigh|perna|canela|panturrilha|leg|calf|shin|(?:^|[\s_-])p[eé]s?(?:$|[\s_-])|foot|feet|m[aã]o(?:s)?|hands?/i

export function isModelBodyPartName(name: string): boolean {
  return MODEL_BODY_PART_NAME.test(name)
}

/** Fill removed skin inside closed silhouettes and across open joint ends. */
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
  // Limb crops intentionally have open ends where the upper/lower pieces join.
  // Exterior flood fill leaks through those ends, so restore transparent pixels
  // between the two visible sides of each body scanline as well.
  const fillBetweenSides = (start: number, end: number, stride: number) => {
    let first = -1
    let last = -1
    for (let pixel = start; pixel !== end; pixel += stride) {
      if (data[pixel * 4 + 3] <= 16) continue
      if (first < 0) first = pixel
      last = pixel
    }
    if (first < 0 || last - first <= stride) return
    for (let pixel = first + stride; pixel < last; pixel += stride) {
      const offset = pixel * 4
      if (data[offset + 3] > 16) continue
      data[offset] = target[0]
      data[offset + 1] = target[1]
      data[offset + 2] = target[2]
      data[offset + 3] = 255
      filled++
    }
  }
  for (let y = 0; y < height; y++) fillBetweenSides(y * width, (y + 1) * width, 1)
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

function findModelOutlinePixels(image: ImageData): Uint8Array {
  const { data, width, height } = image
  const count = width * height
  const outline = new Uint8Array(count)
  const luminance = new Float32Array(count)
  for (let pixel = 0; pixel < count; pixel++) {
    const offset = pixel * 4
    if (data[offset + 3] <= 16) continue
    luminance[pixel] = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x
      const offset = pixel * 4
      if (data[offset + 3] <= 16 || luminance[pixel] > 178) continue
      if (luminance[pixel] <= 102) {
        outline[pixel] = 1
        continue
      }
      let touchesOutlineContrast = false
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
          const neighbor = ny * width + nx
          if (data[neighbor * 4 + 3] <= 16 || luminance[neighbor] - luminance[pixel] >= 34) {
            touchesOutlineContrast = true
            break
          }
        }
        if (touchesOutlineContrast) break
      }
      if (touchesOutlineContrast) outline[pixel] = 1
    }
  }
  return outline
}

/** Recolor dark model ink while retaining each pixel's shade and alpha. */
export function tintModelOutlinePixels(image: ImageData, color: string, mask = findModelOutlinePixels(image)): void {
  if (!isValidSkinTone(color)) return
  const { data } = image
  const target = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16))
  for (let pixel = 0; pixel < mask.length; pixel++) {
    if (!mask[pixel]) continue
    const offset = pixel * 4
    const sourceLuminance = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114
    const shade = Math.min(1.15, Math.max(0.42, sourceLuminance / 88))
    data[offset] = Math.min(255, Math.round(target[0] * shade))
    data[offset + 1] = Math.min(255, Math.round(target[1] * shade))
    data[offset + 2] = Math.min(255, Math.round(target[2] * shade))
  }
}

/** Apply model-level body colors together so the contour mask comes from the original pixels. */
export function tintModelBodyPixels(image: ImageData, skinTone?: string, outlineColor?: string): void {
  const outlineMask = isValidSkinTone(outlineColor) ? findModelOutlinePixels(image) : null
  if (isValidSkinTone(skinTone)) tintSkinPixels(image, skinTone)
  else fillEnclosedTransparentSkin(image)
  if (outlineColor && outlineMask) tintModelOutlinePixels(image, outlineColor, outlineMask)
}
