import { createCharacterCanvas, isCharacterCanvasWorker } from '../../characters/canvasSurface'
import { createEyeInteriorMaskCache } from './eyeInteriorMaskCache'

type EyeMaskImage = string | CanvasImageSource

/** Builds an alpha mask from the light inner eye area, leaving its dark outline outside the mask. */
async function createEyeInteriorMaskCanvas(dataUrl: string): Promise<HTMLCanvasElement | null> {
  try {
    const response = await fetch(dataUrl)
    const bitmap = await createImageBitmap(await response.blob())
    try {
      const canvas = createCharacterCanvas()
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return null
      context.drawImage(bitmap, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
      const values = pixels.data

      for (let index = 0; index < values.length; index += 4) {
        const sourceAlpha = values[index + 3] / 255
        const luminance = values[index] * 0.2126 + values[index + 1] * 0.7152 + values[index + 2] * 0.0722
        // The dark contour and its antialiasing stay transparent; the light sclera stays opaque.
        const coverage = Math.max(0, Math.min(1, (luminance - 145) / 55))
        const alpha = Math.round(sourceAlpha * coverage * 255)
        values[index] = 255
        values[index + 1] = 255
        values[index + 2] = 255
        values[index + 3] = alpha
      }

      context.putImageData(pixels, 0, 0)
      return canvas
    } finally {
      bitmap.close()
    }
  } catch {
    return null
  }
}

const maskCache = createEyeInteriorMaskCache(createEyeInteriorMaskCanvas)

function buildEyeInteriorMask(dataUrl: string): Promise<HTMLCanvasElement | null> {
  return maskCache.load(dataUrl)
}

export async function eyeInteriorMask(dataUrl: string): Promise<string> {
  const canvas = await buildEyeInteriorMask(dataUrl)
  return canvas?.toDataURL('image/png') ?? dataUrl
}

export async function eyeInteriorMaskSource(dataUrl: string): Promise<EyeMaskImage> {
  const canvas = await buildEyeInteriorMask(dataUrl)
  if (!canvas) return dataUrl
  return isCharacterCanvasWorker() ? canvas as unknown as CanvasImageSource : canvas.toDataURL('image/png')
}
