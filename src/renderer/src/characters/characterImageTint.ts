import type { HairColorOverrides, HairColorRole } from '../../../shared/customizer'
import type { ModelSkinContourStroke } from '../../../shared/fabricator'
import { isValidSkinTone } from '../../../shared/skinTones'
import { tintModelBodyPixels, tintSkinPixels } from './skinTint'
import { createCharacterCanvas, isCharacterCanvasWorker } from './canvasSurface'
import { createCharacterImagePromiseCache, createCharacterImagePromiseCacheBudget } from './characterImagePromiseCache'

export type HairTintOptions = { preserveNearWhite?: boolean; allowNearWhiteRoles?: readonly HairColorRole[] }
type CharacterImageLoader = (source: string | CanvasImageSource) => Promise<HTMLImageElement>

export function createCharacterImageTint(loadCachedImage: CharacterImageLoader) {
  const tintCacheBudget = createCharacterImagePromiseCacheBudget(128 * 1024 * 1024)
  const skinTintImageCache = createCharacterImagePromiseCache({ maxEntries: 80, maxBytes: 64 * 1024 * 1024, budget: tintCacheBudget })
  const modelBodyTintImageCache = createCharacterImagePromiseCache({ maxEntries: 80, maxBytes: 64 * 1024 * 1024, budget: tintCacheBudget })
  const hairTintImageCache = createCharacterImagePromiseCache({ maxEntries: 40, maxBytes: 64 * 1024 * 1024, budget: tintCacheBudget })

  function hairHue(red: number, green: number, blue: number): number {
    const maximum = Math.max(red, green, blue)
    const difference = maximum - Math.min(red, green, blue)
    if (!difference) return 0
    const section = maximum === red ? ((green - blue) / difference) % 6 : maximum === green ? (blue - red) / difference + 2 : (red - green) / difference + 4
    return (section * 60 + 360) % 360
  }

  function hairImageColorProfile(pixels: Uint8ClampedArray): { low: number; high: number; hue: number; hasAccent: boolean } {
    const luminanceBins = new Uint32Array(256)
    const hueBins = new Uint32Array(24)
    let count = 0
    let chromatic = 0
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset + 3] < 160) continue
      const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2]
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
      luminanceBins[Math.round(luminance)] += 1
      count += 1
      const maximum = Math.max(red, green, blue)
      if (maximum > 40 && (maximum - Math.min(red, green, blue)) / maximum > 0.3 && luminance > 35) {
        hueBins[Math.floor(hairHue(red, green, blue) / 15) % 24] += 1
        chromatic += 1
      }
    }
    const percentile = (fraction: number) => {
      let seen = 0
      for (let value = 0; value < luminanceBins.length; value += 1) {
        seen += luminanceBins[value]
        if (seen >= count * fraction) return value
      }
      return 255
    }
    let hueIndex = 0
    for (let index = 1; index < hueBins.length; index += 1) if (hueBins[index] > hueBins[hueIndex]) hueIndex = index
    return { low: percentile(0.01), high: percentile(0.98), hue: hueIndex * 15 + 7.5, hasAccent: chromatic > count * 0.03 }
  }

  function hairPixelColorRole(red: number, green: number, blue: number, profile: ReturnType<typeof hairImageColorProfile>, legacyAccent = false): HairColorRole {
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
    const maximum = Math.max(red, green, blue)
    const saturation = maximum === 0 ? 0 : (maximum - Math.min(red, green, blue)) / maximum
    const hueDistance = Math.abs(hairHue(red, green, blue) - profile.hue)
    if (legacyAccent && profile.hasAccent && saturation > 0.3 && Math.min(hueDistance, 360 - hueDistance) > 48 && luminance > 35) return 'accent'
    const range = profile.high - profile.low
    if (range < 18) return 'base'
    const position = (luminance - profile.low) / range
    if (position < 0.16) return 'outline'
    if (position < 0.43) return 'fade'
    if (position < 0.82) return 'base'
    return 'highlight'
  }

  function loadHairTintedImage(source: string, overrides: HairColorOverrides | undefined, options?: HairTintOptions): Promise<HTMLImageElement> {
    if (!overrides || !Object.values(overrides).some(Boolean)) return loadCachedImage(source)
    const key = `${source}:${JSON.stringify([overrides, options])}`
    const cached = hairTintImageCache.get(key)
    if (cached) return cached
    const createTinted = () => loadCachedImage(source).then((sourceImage) => {
      const canvas = createCharacterCanvas()
      canvas.width = sourceImage.naturalWidth || sourceImage.width
      canvas.height = sourceImage.naturalHeight || sourceImage.height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context || !canvas.width || !canvas.height) return sourceImage
      context.drawImage(sourceImage, 0, 0)
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
      const pixels = imageData.data
      const parsed = new Map<HairColorRole, [number, number, number]>()
      for (const [role, value] of Object.entries(overrides) as Array<[HairColorRole, string]>) {
        if (!/^#[\da-f]{6}$/i.test(value)) continue
        parsed.set(role, [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)])
      }
      if (parsed.size === 0) return sourceImage
      const profile = hairImageColorProfile(pixels)
      const luminanceTotals: Record<HairColorRole, number> = { base: 0, fade: 0, outline: 0, highlight: 0, accent: 0 }
      const roleCounts: Record<HairColorRole, number> = { base: 0, fade: 0, outline: 0, highlight: 0, accent: 0 }
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset + 3] < 160) continue
        const role = hairPixelColorRole(pixels[offset], pixels[offset + 1], pixels[offset + 2], profile, parsed.has('accent') && !parsed.has('base'))
        luminanceTotals[role] += pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722
        roleCounts[role] += 1
      }
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset + 3] === 0) continue
        const role = hairPixelColorRole(pixels[offset], pixels[offset + 1], pixels[offset + 2], profile, parsed.has('accent') && !parsed.has('base'))
        const target = parsed.get(role)
        if (!target) continue
        const red = pixels[offset]
        const green = pixels[offset + 1]
        const blue = pixels[offset + 2]
        const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
        const nearWhite = luminance >= 220 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 32
        if (options?.preserveNearWhite && nearWhite && !options.allowNearWhiteRoles?.includes(role)) continue
        const sourceLuminance = Math.max(1, luminance)
        const referenceLuminance = roleCounts[role] ? luminanceTotals[role] / roleCounts[role] : sourceLuminance
        const shade = Math.max(0.48, Math.min(1.52, sourceLuminance / Math.max(1, referenceLuminance)))
        pixels[offset] = Math.min(255, target[0] * shade)
        pixels[offset + 1] = Math.min(255, target[1] * shade)
        pixels[offset + 2] = Math.min(255, target[2] * shade)
      }
      context.putImageData(imageData, 0, 0)
      if (isCharacterCanvasWorker()) return canvas as unknown as HTMLImageElement
      const output = new Image()
      output.src = canvas.toDataURL('image/png')
      if (output.decode) return output.decode().then(() => output)
      return new Promise<HTMLImageElement>((resolve, reject) => {
        output.onload = () => resolve(output)
        output.onerror = () => reject(new Error('Não foi possível recolorir o cabelo.'))
      })
    })
    const tinted = createTinted()
    hairTintImageCache.set(key, tinted)
    return tinted
  }

  function loadSkinTintedImage(source: string, tone: string): Promise<HTMLImageElement> {
    const key = `${tone}:${source}`
    const cached = skinTintImageCache.get(key)
    if (cached) return cached
    const createTinted = () => loadCachedImage(source).then((sourceImage) => {
      const canvas = createCharacterCanvas()
      canvas.width = sourceImage.naturalWidth || sourceImage.width
      canvas.height = sourceImage.naturalHeight || sourceImage.height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context || !canvas.width || !canvas.height) return sourceImage
      context.drawImage(sourceImage, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
      tintSkinPixels(pixels, tone)
      context.putImageData(pixels, 0, 0)
      if (isCharacterCanvasWorker()) return canvas as unknown as HTMLImageElement
      const output = new Image()
      output.src = canvas.toDataURL('image/png')
      if (output.decode) return output.decode().then(() => output)
      return new Promise<HTMLImageElement>((resolve, reject) => {
        output.onload = () => resolve(output)
        output.onerror = () => reject(new Error('Não foi possível aplicar a cor de pele.'))
      })
    })
    const tinted = createTinted()
    skinTintImageCache.set(key, tinted)
    return tinted
  }

  function loadModelBodyTintedImage(source: string, skinTone?: string, outlineColor?: string, fakeContours?: ModelSkinContourStroke[]): Promise<HTMLImageElement> {
    const validTone = isValidSkinTone(skinTone) ? skinTone : undefined
    const validOutline = isValidSkinTone(outlineColor) ? outlineColor : undefined
    const key = `${validTone ?? ''}:${validOutline ?? ''}:${JSON.stringify(fakeContours ?? [])}:${source}`
    const cached = modelBodyTintImageCache.get(key)
    if (cached) return cached
    const createTinted = () => loadCachedImage(source).then((sourceImage) => {
      const canvas = createCharacterCanvas()
      canvas.width = sourceImage.naturalWidth || sourceImage.width
      canvas.height = sourceImage.naturalHeight || sourceImage.height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context || !canvas.width || !canvas.height) return sourceImage
      context.drawImage(sourceImage, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
      tintModelBodyPixels(pixels, validTone, validOutline, fakeContours)
      context.putImageData(pixels, 0, 0)
      if (isCharacterCanvasWorker()) return canvas as unknown as HTMLImageElement
      const output = new Image()
      output.src = canvas.toDataURL('image/png')
      if (output.decode) return output.decode().then(() => output)
      return new Promise<HTMLImageElement>((resolve, reject) => {
        output.onload = () => resolve(output)
        output.onerror = () => reject(new Error('Não foi possível aplicar as cores do corpo.'))
      })
    })
    const tinted = createTinted()
    modelBodyTintImageCache.set(key, tinted)
    return tinted
  }


  return { loadHairTintedImage, loadSkinTintedImage, loadModelBodyTintedImage }
}
