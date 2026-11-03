import type { ModelPart, ModelSkinContourStroke } from '../../../shared/fabricator'
import { MODEL_SKIN_BASE_TONE, isValidSkinTone } from '../../../shared/skinTones.ts'

const MODEL_BODY_PART_NAME = /cabe[çc]a|head|tronco|corpo|torso|body|bra[cç]o|arm|antebra[cç]o|forearm|coxa|thigh|perna|canela|panturrilha|leg|calf|shin|(?:^|[\s_-])p[eé]s?(?:$|[\s_-])|foot|feet|m[aã]o(?:s)?|hands?/i

export function isModelBodyPartName(name: string): boolean {
  return MODEL_BODY_PART_NAME.test(name)
}

/** Split pieces inherit body identity from their source even if their display label changes. */
export function isModelBodyPart(part: Pick<ModelPart, 'name' | 'splitOriginPartName'>): boolean {
  return isModelBodyPartName(part.name)
    || Boolean(part.splitOriginPartName && isModelBodyPartName(part.splitOriginPartName))
}

function createFakeContourBarrier(width: number, height: number, contours: ModelSkinContourStroke[] = []): Uint8Array | null {
  if (!contours.length || width < 1 || height < 1) return null
  const barrier = new Uint8Array(width * height)
  const markCircle = (x: number, y: number, radius: number) => {
    const radiusSquared = (radius + 0.5) ** 2
    for (let cy = Math.max(0, Math.floor(y - radius)); cy <= Math.min(height - 1, Math.ceil(y + radius)); cy++) {
      for (let cx = Math.max(0, Math.floor(x - radius)); cx <= Math.min(width - 1, Math.ceil(x + radius)); cx++) {
        if ((cx - x) ** 2 + (cy - y) ** 2 <= radiusSquared) barrier[cy * width + cx] = 1
      }
    }
  }
  for (const contour of contours) {
    if (contour.points.length < 2 || !Number.isFinite(contour.width)) continue
    const radius = Math.max(0.75, Math.min(16, contour.width * Math.min(width, height) / 2))
    const points = contour.points.map(point => ({
      x: Math.max(0, Math.min(width - 1, point.x * (width - 1))),
      y: Math.max(0, Math.min(height - 1, point.y * (height - 1)))
    }))
    for (let index = 0; index < points.length - 1; index++) {
      const start = points[index]
      const end = points[index + 1]
      const distance = Math.hypot(end.x - start.x, end.y - start.y)
      const steps = Math.max(1, Math.ceil(distance * 2))
      for (let step = 0; step <= steps; step++) {
        const amount = step / steps
        markCircle(start.x + (end.x - start.x) * amount, start.y + (end.y - start.y) * amount, radius)
      }
    }
  }
  return barrier
}

/** Fill removed skin inside contours; artificial strokes close intentionally open joints. */
export function fillEnclosedTransparentSkin(image: ImageData, baseTone = MODEL_SKIN_BASE_TONE, fakeContours: ModelSkinContourStroke[] = [], fillOpenJointEnds = true): number {
  if (!isValidSkinTone(baseTone) || image.width < 1 || image.height < 1) return 0
  const { data, width, height } = image
  const count = width * height
  const barrier = createFakeContourBarrier(width, height, fakeContours)
  const outside = new Uint8Array(count)
  const queue = new Int32Array(count)
  let head = 0
  let tail = 0
  const enqueue = (pixel: number) => {
    if (outside[pixel] || barrier?.[pixel] || data[pixel * 4 + 3] > 16) return
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
    // A 4-neighbor flood treats diagonally touching outline pixels as a closed
    // boundary; an 8-neighbor flood leaks through their shared corners and can
    // leave checkerboard-colored skin slivers just inside the contour.
    if (x > 0) enqueue(pixel - 1)
    if (x + 1 < width) enqueue(pixel + 1)
    if (y > 0) enqueue(pixel - width)
    if (y + 1 < height) enqueue(pixel + width)
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
  if (fillOpenJointEnds) {
    // Legacy images without per-joint guides use scanlines as a fallback.
    // Model-part previews disable this pass so saved barriers bound the fill
    // and cannot create skin slivers at the sides of a joint.
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
  }
  return filled
}

type SkinTintOptions = {
  /** Recover pale opaque pixels along isolated model-piece edges, without crossing the ink contour. */
  recoverPaleModelEdges?: boolean
  protectedOutlineMask?: Uint8Array | null
}

function extendMaskToPaleModelEdges(image: ImageData, mask: Uint8Array, protectedOutlineMask?: Uint8Array | null): void {
  const { data, width, height } = image
  const count = width * height
  const maxDistance = 4
  const distance = new Uint8Array(count)
  const queue = new Int32Array(count)
  let head = 0
  let tail = 0
  for (let pixel = 0; pixel < count; pixel++) if (mask[pixel]) queue[tail++] = pixel

  while (head < tail) {
    const pixel = queue[head++]
    const currentDistance = distance[pixel]
    if (currentDistance >= maxDistance) continue
    const x = pixel % width
    const y = Math.floor(pixel / width)
    for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
      for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
        const next = ny * width + nx
        if (mask[next] || protectedOutlineMask?.[next]) continue
        const offset = next * 4
        if (data[offset + 3] <= 16) continue
        const red = data[offset]
        const green = data[offset + 1]
        const blue = data[offset + 2]
        const luminance = red * 0.299 + green * 0.587 + blue * 0.114
        if (luminance < 165 || Math.max(red, green, blue) - Math.min(red, green, blue) > 48) continue
        mask[next] = 1
        distance[next] = currentDistance + 1
        queue[tail++] = next
      }
    }
  }
}

/** Recolor body artwork while retaining dark ink contours and filling removed skin interiors. */
export function tintSkinPixels(image: ImageData, tone: string, fakeContours: ModelSkinContourStroke[] = [], fillOpenJointEnds = true, options: SkinTintOptions = {}): void {
  if (!isValidSkinTone(tone)) return

  fillEnclosedTransparentSkin(image, MODEL_SKIN_BASE_TONE, fakeContours, fillOpenJointEnds)

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
    if (options.recoverPaleModelEdges) extendMaskToPaleModelEdges(image, mask, options.protectedOutlineMask)
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
export function tintModelBodyPixels(image: ImageData, skinTone?: string, outlineColor?: string, fakeContours: ModelSkinContourStroke[] = []): void {
  const validSkinTone = isValidSkinTone(skinTone)
  const validOutlineColor = isValidSkinTone(outlineColor)
  const modelOutlineMask = validSkinTone || validOutlineColor ? findModelOutlinePixels(image) : null
  const outlineMask = validOutlineColor ? modelOutlineMask : null
  if (validSkinTone) tintSkinPixels(image, skinTone, fakeContours, false, {
    recoverPaleModelEdges: true,
    protectedOutlineMask: modelOutlineMask
  })
  else fillEnclosedTransparentSkin(image, MODEL_SKIN_BASE_TONE, fakeContours, false)
  if (validOutlineColor && outlineColor && outlineMask) tintModelOutlinePixels(image, outlineColor, outlineMask)
}
