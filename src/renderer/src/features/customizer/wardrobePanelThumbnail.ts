import type { WardrobeCategory, WardrobeSet } from '../../../../shared/fabricator'
import { loadCachedImage } from '../../characters/characterRenderer'
import { configureCharacterSampling } from './renderResolution'

export async function renderWardrobeThumbnail(set: WardrobeSet, categories: WardrobeCategory[], componentIds?: string[], resolution = 112): Promise<string | null> {
  const allowedIds = componentIds ? new Set(componentIds) : null
  const pieces = set.components.filter((component) => categories.includes(component.category) && (!allowedIds || allowedIds.has(component.id)))
  if (!pieces.length) return null
  const left = Math.min(...pieces.map((piece) => piece.x))
  const top = Math.min(...pieces.map((piece) => piece.y))
  const right = Math.max(...pieces.map((piece) => piece.x + piece.width))
  const bottom = Math.max(...pieces.map((piece) => piece.y + piece.height))
  const scale = Math.min(resolution / Math.max(1, right - left), resolution / Math.max(1, bottom - top))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil((right - left) * scale))
  canvas.height = Math.max(1, Math.ceil((bottom - top) * scale))
  const context = canvas.getContext('2d')
  if (context) configureCharacterSampling(context)
  if (!context) return null
  for (const piece of pieces) {
    try {
      const image = await loadCachedImage(piece.dataUrl)
      context.save()
      context.translate((piece.x - left + piece.width / 2) * scale, (piece.y - top + piece.height / 2) * scale)
      context.rotate(piece.rotation * Math.PI / 180)
      context.drawImage(image, -piece.width * scale / 2, -piece.height * scale / 2, piece.width * scale, piece.height * scale)
      context.restore()
    } catch { continue }
  }
  return canvas.toDataURL('image/png')
}
