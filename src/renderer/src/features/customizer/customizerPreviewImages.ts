import type { FabricatorProject } from '../../../../shared/fabricator'
import { loadCachedImage } from '../../characters/characterRenderer'

/** Decode a replacement before swapping the visible preview image, avoiding a blank frame. */
export function preparePreviewImage(source: string | null): Promise<boolean> {
  if (!source) return Promise.resolve(true)
  const image = new Image()
  if (typeof image.decode === 'function') {
    image.src = source
    return image.decode().then(() => true, () => false)
  }
  return new Promise((resolve) => {
    image.onload = () => resolve(true)
    image.onerror = () => resolve(false)
    image.src = source
    if (image.complete && image.naturalWidth > 0) resolve(true)
  })
}

export async function sampleOriginalSkinTone(project: FabricatorProject): Promise<string | null> {
  const head = project.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
  if (!head) return null
  const image = await loadCachedImage(head.dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  const colors = new Map<number, { count: number; red: number; green: number; blue: number }>()
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const red = pixels[offset]
    const green = pixels[offset + 1]
    const blue = pixels[offset + 2]
    if (pixels[offset + 3] < 230 || red <= 110 || red <= green || green <= blue || red - blue > 110) continue
    const key = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3)
    const entry = colors.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 }
    entry.count++
    entry.red += red
    entry.green += green
    entry.blue += blue
    colors.set(key, entry)
  }
  const dominant = [...colors.values()].sort((a, b) => b.count - a.count)[0]
  if (!dominant) return null
  return '#' + [dominant.red, dominant.green, dominant.blue]
    .map((value) => Math.round(value / dominant.count).toString(16).padStart(2, '0')).join('')
}
