import type { ModelPart } from '../../../../../shared/fabricator'
import { MODEL_SKIN_BASE_TONE, isValidSkinTone } from '../../../../../shared/skinTones'
import { fillEnclosedTransparentSkin, isModelBodyPartName, tintModelBodyPixels } from '../../../characters/skinTint'
import { loadImageFromDataUrl } from './imageData'

export function isModelSkinPart(part: ModelPart): boolean {
  return isModelBodyPartName(part.name)
}

export async function createModelBodyAppearancePreview(part: ModelPart, tone?: string, outlineColor?: string): Promise<string | null> {
  if (!isModelSkinPart(part)) return null
  const image = await loadImageFromDataUrl(part.dataUrl, 'Não foi possível preparar a prévia da cor de pele.')
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context || !canvas.width || !canvas.height) return null
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  if (isValidSkinTone(tone) || isValidSkinTone(outlineColor)) tintModelBodyPixels(pixels, tone, outlineColor, part.fakeSkinContours)
  else if (!fillEnclosedTransparentSkin(pixels, MODEL_SKIN_BASE_TONE, part.fakeSkinContours)) return null
  context.putImageData(pixels, 0, 0)
  return canvas.toDataURL('image/png')
}

type PreviewCacheEntry = { source: string; tone?: string; outlineColor?: string; contoursKey: string; result: Promise<string | null> }
const previewCache = new Map<string, PreviewCacheEntry>()

export function cachedModelBodyAppearancePreview(slot: number, part: ModelPart, tone?: string, outlineColor?: string): Promise<string | null> {
  const key = `${slot}:${part.id}`
  const contoursKey = JSON.stringify(part.fakeSkinContours ?? [])
  const cached = previewCache.get(key)
  if (cached?.source === part.dataUrl && cached.tone === tone && cached.outlineColor === outlineColor && cached.contoursKey === contoursKey) return cached.result
  const result = createModelBodyAppearancePreview(part, tone, outlineColor)
  previewCache.delete(key)
  previewCache.set(key, { source: part.dataUrl, tone, outlineColor, contoursKey, result })
  if (previewCache.size > 80) previewCache.delete(previewCache.keys().next().value!)
  void result.catch(() => {
    if (previewCache.get(key)?.result === result) previewCache.delete(key)
  })
  return result
}
