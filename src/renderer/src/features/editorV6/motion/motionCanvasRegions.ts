import { motionCropFromPixels, type MotionPixelBounds, type MotionPixelCrop } from './motionPixelAnalysis'

type CanvasFactory = () => HTMLCanvasElement

/** Keeps a full RGBA changed-pixel rectangle and edge-extended source gutter for resampling. */
export function createChangedMotionPixelPatch(
  source: HTMLCanvasElement,
  bounds: MotionPixelBounds,
  createCanvas: CanvasFactory = () => document.createElement('canvas')
): HTMLCanvasElement {
  const patchWidth = bounds.right - bounds.left + 1, patchHeight = bounds.bottom - bounds.top + 1
  const gutter = 2, patch = createCanvas()
  patch.width = patchWidth + gutter * 2
  patch.height = patchHeight + gutter * 2
  const sourceContext = source.getContext('2d', { willReadFrequently: true })!
  const sourceLeft = Math.max(0, bounds.left - gutter), sourceTop = Math.max(0, bounds.top - gutter)
  const sourceRight = Math.min(source.width, bounds.right + gutter + 1), sourceBottom = Math.min(source.height, bounds.bottom + gutter + 1)
  const sourcePixels = sourceContext.getImageData(sourceLeft, sourceTop, sourceRight - sourceLeft, sourceBottom - sourceTop).data
  const sourceWidth = sourceRight - sourceLeft, context = patch.getContext('2d')!, pixels = context.createImageData(patch.width, patch.height)
  for (let y = 0; y < patch.height; y++) for (let x = 0; x < patch.width; x++) {
    const sourceX = Math.max(sourceLeft, Math.min(sourceRight - 1, bounds.left + x - gutter))
    const sourceY = Math.max(sourceTop, Math.min(sourceBottom - 1, bounds.top + y - gutter))
    const sourceOffset = ((sourceY - sourceTop) * sourceWidth + sourceX - sourceLeft) * 4, targetOffset = (y * patch.width + x) * 4
    pixels.data[targetOffset] = sourcePixels[sourceOffset]; pixels.data[targetOffset + 1] = sourcePixels[sourceOffset + 1]
    pixels.data[targetOffset + 2] = sourcePixels[sourceOffset + 2]; pixels.data[targetOffset + 3] = sourcePixels[sourceOffset + 3]
  }
  context.putImageData(pixels, 0, 0)
  return patch
}

/** Reads the complete canvas RGBA surface and applies the shared crop/fingerprint policy. */
export function readMotionCanvasCrop(canvas: HTMLCanvasElement, fingerprint = false, alphaThreshold = 8): MotionPixelCrop {
  const pixels = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height).data
  return motionCropFromPixels(pixels, canvas.width, canvas.height, fingerprint, alphaThreshold)
}

/** Copies a transparent region with a clear gutter to avoid sampling adjacent atlas frames. */
export function createTransparentMotionPatch(
  source: HTMLCanvasElement,
  bounds: MotionPixelCrop,
  gutter = 2,
  createCanvas: CanvasFactory = () => document.createElement('canvas')
): HTMLCanvasElement {
  const patch = createCanvas()
  patch.width = bounds.width + gutter * 2
  patch.height = bounds.height + gutter * 2
  const context = patch.getContext('2d')
  if (!context) throw Error('Não foi possível preparar o recorte transparente da boca.')
  // The blank gutter stays transparent so bilinear sampling cannot pull neighboring frames.
  context.drawImage(source, bounds.left, bounds.top, bounds.width, bounds.height, gutter, gutter, bounds.width, bounds.height)
  return patch
}

/** Copies an exact source rectangle, used for the mouthless base face. */
export function cropMotionCanvas(
  source: HTMLCanvasElement,
  bounds: MotionPixelCrop,
  createCanvas: CanvasFactory = () => document.createElement('canvas')
): HTMLCanvasElement {
  const crop = createCanvas()
  crop.width = bounds.width
  crop.height = bounds.height
  const context = crop.getContext('2d')
  if (!context) throw Error('Não foi possível preparar a base do personagem sem boca.')
  context.drawImage(source, bounds.left, bounds.top, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height)
  return crop
}
