import type { CharacterPaletteOverrides, CharacterPaletteRole } from '../../../shared/customizer'

type SourceSwatch = {
  role: CharacterPaletteRole
  rgb: readonly [number, number, number]
  grayscaleValue?: number
}

/** Exact source swatches used by the fixed character recoloring palette. */
export const CHARACTER_SOURCE_PALETTE: readonly SourceSwatch[] = [
  { role: 'outline', rgb: [43, 43, 43], grayscaleValue: 43 },
  { role: 'shadow', rgb: [107, 107, 107], grayscaleValue: 107 },
  { role: 'base', rgb: [168, 168, 168], grayscaleValue: 168 },
  // Keep recognizing the original gray highlight while accepting the cyan
  // secondary swatch used by newer wardrobe sheets.
  { role: 'light', rgb: [226, 226, 226], grayscaleValue: 226 },
  { role: 'light', rgb: [85, 197, 212] },
  { role: 'detail', rgb: [140, 123, 255] }
]

type GrayscalePaletteRole = Extract<CharacterPaletteRole, 'outline' | 'shadow' | 'base' | 'light'>
export type CharacterPaletteDetection = {
  supported: boolean
  roleCounts: Record<CharacterPaletteRole, number>
  grayscaleRoleCounts: Record<GrayscalePaletteRole, number>
}

const grayscaleSourcePalette = CHARACTER_SOURCE_PALETTE.filter((swatch) => swatch.grayscaleValue !== undefined)
const chromaticSourcePalette = CHARACTER_SOURCE_PALETTE.filter((swatch) => swatch.grayscaleValue === undefined)
const sourceSwatchTolerance = 6
const grayscaleTolerance = 8

function chromaticSourceShade(red: number, green: number, blue: number, swatch: SourceSwatch): number | null {
  const [sourceRed, sourceGreen, sourceBlue] = swatch.rgb
  const sourceMagnitudeSquared = sourceRed ** 2 + sourceGreen ** 2 + sourceBlue ** 2
  const scale = (red * sourceRed + green * sourceGreen + blue * sourceBlue) / sourceMagnitudeSquared
  if (scale < 0.18 || scale > 1.2) return null
  const tolerance = Math.max(8, scale * 14)
  if (Math.abs(red - sourceRed * scale) > tolerance
    || Math.abs(green - sourceGreen * scale) > tolerance
    || Math.abs(blue - sourceBlue * scale) > tolerance) return null
  return scale
}

function matchChromaticSource(red: number, green: number, blue: number): { role: CharacterPaletteRole; shade: number } | null {
  for (const swatch of chromaticSourcePalette) {
    const shade = chromaticSourceShade(red, green, blue, swatch)
    if (shade !== null) return { role: swatch.role, shade }
  }
  return null
}

/** Detect fixed grayscale roles plus supported chromatic secondary/detail swatches. */
export function detectCharacterSourcePalette(pixels: ArrayLike<number>): CharacterPaletteDetection {
  const roleCounts: Record<CharacterPaletteRole, number> = { outline: 0, shadow: 0, base: 0, light: 0, detail: 0 }
  const grayscaleRoleCounts: Record<GrayscalePaletteRole, number> = { outline: 0, shadow: 0, base: 0, light: 0 }
  for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
    if (pixels[offset + 3] < 32) continue
    const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2]
    const chromaticMatch = matchChromaticSource(red, green, blue)
    if (chromaticMatch) {
      roleCounts[chromaticMatch.role] += 1
      continue
    }
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > grayscaleTolerance) continue
    const gray = (red + green + blue) / 3
    for (const swatch of grayscaleSourcePalette) {
      if (Math.abs(gray - swatch.grayscaleValue!) <= sourceSwatchTolerance) {
        roleCounts[swatch.role] += 1
        grayscaleRoleCounts[swatch.role as GrayscalePaletteRole] += 1
      }
    }
  }
  // A piece may legitimately use only one palette role (for example, a cyan
  // shirt or a purple accessory); one recognized source color is sufficient.
  return { supported: Object.values(roleCounts).some((count) => count > 0), roleCounts, grayscaleRoleCounts }
}

function parseColor(value: string | undefined): [number, number, number] | null {
  if (!value || !/^#[\da-f]{6}$/i.test(value)) return null
  return [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)]
}

/** Map detected source swatches; grayscale antialiasing is interpolated only between roles present in this piece. */
export function tintCharacterPalettePixels(pixels: Uint8ClampedArray, colors: CharacterPaletteOverrides): CharacterPaletteDetection {
  const detection = detectCharacterSourcePalette(pixels)
  if (!detection.supported) return detection
  const targets = new Map<CharacterPaletteRole, [number, number, number]>()
  for (const swatch of CHARACTER_SOURCE_PALETTE) {
    const color = parseColor(colors[swatch.role])
    if (color) targets.set(swatch.role, color)
  }
  if (!targets.size) return detection
  const detectedGrayscaleSwatches = grayscaleSourcePalette.filter((swatch) => detection.grayscaleRoleCounts[swatch.role as GrayscalePaletteRole] > 0)

  for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
    if (pixels[offset + 3] === 0) continue
    const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2]
    const chromaticMatch = matchChromaticSource(red, green, blue)
    if (chromaticMatch) {
      const target = targets.get(chromaticMatch.role)
      if (!target) continue
      pixels[offset] = Math.round(target[0] * chromaticMatch.shade)
      pixels[offset + 1] = Math.round(target[1] * chromaticMatch.shade)
      pixels[offset + 2] = Math.round(target[2] * chromaticMatch.shade)
      continue
    }
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > grayscaleTolerance) continue
    const gray = (red + green + blue) / 3
    const exactSwatch = grayscaleSourcePalette.find((swatch) =>
      detection.grayscaleRoleCounts[swatch.role as GrayscalePaletteRole] > 0
      && Math.abs(gray - swatch.grayscaleValue!) <= sourceSwatchTolerance)
    if (exactSwatch) {
      const target = targets.get(exactSwatch.role)
      if (target) {
        pixels[offset] = target[0]
        pixels[offset + 1] = target[1]
        pixels[offset + 2] = target[2]
      }
      continue
    }

    let lower = detectedGrayscaleSwatches[0]
    let upper = detectedGrayscaleSwatches[detectedGrayscaleSwatches.length - 1]
    if (!lower || !upper || lower === upper || gray <= lower.grayscaleValue! || gray >= upper.grayscaleValue!) continue
    for (let index = 0; index < detectedGrayscaleSwatches.length - 1; index += 1) {
      const current = detectedGrayscaleSwatches[index]
      const next = detectedGrayscaleSwatches[index + 1]
      if (gray > current.grayscaleValue! && gray < next.grayscaleValue!) {
        lower = current
        upper = next
        break
      }
    }
    const lowerColor = targets.get(lower.role)
    const upperColor = targets.get(upper.role)
    if (!lowerColor || !upperColor) continue
    const span = upper.grayscaleValue! - lower.grayscaleValue!
    const amount = span === 0 ? 0 : Math.max(0, Math.min(1, (gray - lower.grayscaleValue!) / span))
    pixels[offset] = Math.round(lowerColor[0] + (upperColor[0] - lowerColor[0]) * amount)
    pixels[offset + 1] = Math.round(lowerColor[1] + (upperColor[1] - lowerColor[1]) * amount)
    pixels[offset + 2] = Math.round(lowerColor[2] + (upperColor[2] - lowerColor[2]) * amount)
  }
  return detection
}
