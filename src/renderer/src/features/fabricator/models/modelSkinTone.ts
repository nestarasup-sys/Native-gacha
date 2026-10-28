import type { ModelPart } from '../../../../../shared/fabricator'
import { isValidSkinTone } from '../../../../../shared/skinTones'
import { fillEnclosedTransparentSkin, tintSkinPixels } from '../../../characters/skinTint'
import { loadImageFromDataUrl } from './imageData'

export function isModelSkinPart(part: ModelPart): boolean {
  return /cabe[çc]a|head|tronco|corpo|torso|body|bra[cç]o|arm|antebra[cç]o|forearm|coxa|thigh|perna|canela|panturrilha|leg|calf|shin|(?:^|[\s_-])p[eé]s?(?:$|[\s_-])|foot|feet|m[aã]os?|hands?/i.test(part.name)
}

export async function createModelSkinTonePreview(part: ModelPart, tone?: string): Promise<string | null> {
  if (!isModelSkinPart(part)) return null
  const image = await loadImageFromDataUrl(part.dataUrl, 'Não foi possível preparar a prévia da cor de pele.')
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context || !canvas.width || !canvas.height) return null
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  if (isValidSkinTone(tone)) tintSkinPixels(pixels, tone)
  else if (!fillEnclosedTransparentSkin(pixels)) return null
  context.putImageData(pixels, 0, 0)
  return canvas.toDataURL('image/png')
}

type PreviewCacheEntry = { source: string; tone?: string; result: Promise<string | null> }
const previewCache = new Map<string, PreviewCacheEntry>()

export function cachedModelSkinTonePreview(slot: number, part: ModelPart, tone?: string): Promise<string | null> {
  const key = `${slot}:${part.id}`
  const cached = previewCache.get(key)
  if (cached?.source === part.dataUrl && cached.tone === tone) return cached.result
  const result = createModelSkinTonePreview(part, tone)
  previewCache.delete(key)
  previewCache.set(key, { source: part.dataUrl, tone, result })
  if (previewCache.size > 80) previewCache.delete(previewCache.keys().next().value!)
  void result.catch(() => {
    if (previewCache.get(key)?.result === result) previewCache.delete(key)
  })
  return result
}
