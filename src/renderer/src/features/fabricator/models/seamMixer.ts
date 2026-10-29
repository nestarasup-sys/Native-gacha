import type { ModelPart } from '../../../../../shared/fabricator'
import { loadImageFromDataUrl } from './imageData'
import type { SeamMixerSurface } from './seamMixerSurfaceCache'
export type { SeamMixerSurface } from './seamMixerSurfaceCache'

type SeamMixerSegmentInput = {
  fromX: number
  fromY: number
  toX: number
  toY: number
  projectSize: { width: number; height: number }
  scale: number
  pan: { x: number; y: number }
  stageBounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>
  candidates: ModelPart[]
  touchedPixels: Map<string, Uint8Array>
  surfaces: Map<string, SeamMixerSurface>
  session: number
  getCurrentSession: () => number
}

/** Applies the seam brush to visible pixels that overlap a lower model layer. */
export async function paintSeamMixerSegment({
  fromX,
  fromY,
  toX,
  toY,
  projectSize,
  scale,
  pan,
  stageBounds,
  candidates,
  touchedPixels,
  surfaces,
  session,
  getCurrentSession
}: SeamMixerSegmentInput): Promise<Map<string, string> | null> {
  if (!scale || session !== getCurrentSession()) return null

  const imageDataById = new Map<string, ImageData>()
  const surfacesForSegment = new Map<string, SeamMixerSurface>()
  const affectedParts = new Map<string, ModelPart>()
  const getImageData = async (part: ModelPart) => {
    let surface = surfacesForSegment.get(part.id) ?? surfaces.get(part.id)
    if (!surface) {
      const image = await loadImageFromDataUrl(part.dataUrl, 'Não foi possível abrir o recorte.')
      if (session !== getCurrentSession()) return null
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return null
      context.drawImage(image, 0, 0)
      surface = { canvas, context }
      surfaces.set(part.id, surface)
    }
    surfacesForSegment.set(part.id, surface)
    let imageData = imageDataById.get(part.id)
    if (!imageData) {
      imageData = surface.context.getImageData(0, 0, surface.canvas.width, surface.canvas.height)
      imageDataById.set(part.id, imageData)
    }
    return imageData
  }
  const getLocalPoint = (part: ModelPart, x: number, y: number) => {
    const centerX = part.x + part.width / 2
    const centerY = part.y + part.height / 2
    const radians = -part.rotation * Math.PI / 180
    const offsetX = x - centerX
    const offsetY = y - centerY
    return {
      x: centerX + offsetX * Math.cos(radians) - offsetY * Math.sin(radians) - part.x,
      y: centerY + offsetX * Math.sin(radians) + offsetY * Math.cos(radians) - part.y
    }
  }
  const distance = Math.hypot(toX - fromX, toY - fromY)
  const steps = Math.max(1, Math.ceil(distance / 10))
  const radius = 24 / scale

  for (let step = 0; step <= steps; step += 1) {
    const screenX = fromX + (toX - fromX) * (step / steps)
    const screenY = fromY + (toY - fromY) * (step / steps)
    const boardX = (screenX - stageBounds.left - stageBounds.width / 2 - pan.x) / scale + projectSize.width / 2
    const boardY = (screenY - stageBounds.top - stageBounds.height / 2 - pan.y) / scale + projectSize.height / 2

    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const part = candidates[candidateIndex]
      const { x: localX, y: localY } = getLocalPoint(part, boardX, boardY)
      if (localX < 0 || localY < 0 || localX >= part.width || localY >= part.height) continue

      const imageData = await getImageData(part)
      if (!imageData) return null
      const width = imageData.width
      const height = imageData.height
      const pixelX = Math.floor(localX / part.width * width)
      const pixelY = Math.floor(localY / part.height * height)
      if (imageData.data[(pixelY * width + pixelX) * 4 + 3] === 0) continue

      // Keep the brush from fading isolated pieces by checking coverage per pixel.
      const lowerLayers: Array<{ part: ModelPart; imageData: ImageData }> = []
      for (let lowerIndex = candidateIndex + 1; lowerIndex < candidates.length; lowerIndex += 1) {
        const lowerPart = candidates[lowerIndex]
        const lowerData = await getImageData(lowerPart)
        if (!lowerData) return null
        lowerLayers.push({ part: lowerPart, imageData: lowerData })
      }
      if (!lowerLayers.length) break

      let touched = touchedPixels.get(part.id)
      if (!touched) { touched = new Uint8Array(width * height); touchedPixels.set(part.id, touched) }
      const centerPixelX = localX / part.width * width
      const centerPixelY = localY / part.height * height
      const radiusX = radius / part.width * width
      const radiusY = radius / part.height * height
      const minX = Math.max(0, Math.floor(centerPixelX - radiusX))
      const maxX = Math.min(width - 1, Math.ceil(centerPixelX + radiusX))
      const minY = Math.max(0, Math.floor(centerPixelY - radiusY))
      const maxY = Math.min(height - 1, Math.ceil(centerPixelY + radiusY))
      let changed = false
      for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
        const dx = (x + 0.5 - centerPixelX) / radiusX
        const dy = (y + 0.5 - centerPixelY) / radiusY
        const radial = dx * dx + dy * dy
        const index = y * width + x
        if (radial > 1 || touched[index]) continue
        const pixelLocalX = (x + 0.5) / width * part.width
        const pixelLocalY = (y + 0.5) / height * part.height
        const rotation = part.rotation * Math.PI / 180
        const partCenterX = part.x + part.width / 2
        const partCenterY = part.y + part.height / 2
        const relativeX = pixelLocalX - part.width / 2
        const relativeY = pixelLocalY - part.height / 2
        const pixelBoardX = partCenterX + relativeX * Math.cos(rotation) - relativeY * Math.sin(rotation)
        const pixelBoardY = partCenterY + relativeX * Math.sin(rotation) + relativeY * Math.cos(rotation)
        const coveredByLowerLayer = lowerLayers.some(({ part: lowerPart, imageData: lowerData }) => {
          const lowerPoint = getLocalPoint(lowerPart, pixelBoardX, pixelBoardY)
          if (lowerPoint.x < 0 || lowerPoint.y < 0 || lowerPoint.x >= lowerPart.width || lowerPoint.y >= lowerPart.height) return false
          const lowerX = Math.floor(lowerPoint.x / lowerPart.width * lowerData.width)
          const lowerY = Math.floor(lowerPoint.y / lowerPart.height * lowerData.height)
          return lowerData.data[(lowerY * lowerData.width + lowerX) * 4 + 3] > 0
        })
        if (!coveredByLowerLayer) continue
        touched[index] = 1
        const alphaOffset = index * 4 + 3
        const alpha = imageData.data[alphaOffset]
        if (alpha === 0) continue
        const falloff = 1 - radial
        imageData.data[alphaOffset] = Math.round(alpha * (1 - 0.3 * falloff))
        changed = true
      }
      if (changed) affectedParts.set(part.id, part)
      break
    }
  }

  if (session !== getCurrentSession() || affectedParts.size === 0) return null
  const changedAssets = new Map<string, string>()
  for (const [partId] of affectedParts) {
    const surface = surfacesForSegment.get(partId)
    const imageData = imageDataById.get(partId)
    if (!surface || !imageData) continue
    surface.context.putImageData(imageData, 0, 0)
    changedAssets.set(partId, surface.canvas.toDataURL('image/png'))
  }
  return changedAssets
}
