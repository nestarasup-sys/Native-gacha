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

export type CharacterPaletteDetection = { supported: boolean; roleCounts: Record<CharacterPaletteRole, number> }

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
      if (Math.abs(gray - swatch.grayscaleValue!) <= sourceSwatchTolerance) roleCounts[swatch.role] += 1
    }
  }
  return { supported: Object.values(roleCounts).filter((count) => count > 0).length >= 2, roleCounts }
}

function parseColor(value: string | undefined): [number, number, number] | null {
  if (!value || !/^#[\da-f]{6}$/i.test(value)) return null
  return [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)]
}

/** Map source swatches explicitly; grayscale antialias pixels interpolate between fixed roles. */
export function tintCharacterPalettePixels(pixels: Uint8ClampedArray, colors: CharacterPaletteOverrides): CharacterPaletteDetection {
  const detection = detectCharacterSourcePalette(pixels)
  if (!detection.supported) return detection
  const targets = new Map<CharacterPaletteRole, [number, number, number]>()
  for (const swatch of CHARACTER_SOURCE_PALETTE) {
    const color = parseColor(colors[swatch.role])
    if (color) targets.set(swatch.role, color)
  }
  if (!targets.size) return detection

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
    const first = grayscaleSourcePalette[0]
    const last = grayscaleSourcePalette[grayscaleSourcePalette.length - 1]
    if (gray < first.grayscaleValue! || gray > last.grayscaleValue!) continue

    let lower = first
    let upper = last
    for (let index = 0; index < grayscaleSourcePalette.length - 1; index += 1) {
      const current = grayscaleSourcePalette[index]
      const next = grayscaleSourcePalette[index + 1]
      if (gray >= current.grayscaleValue! && gray <= next.grayscaleValue!) {
        lower = current
        upper = next
        break
      }
    }
    const lowerColor = targets.get(lower.role)
    const upperColor = targets.get(upper.role)
    if (!lowerColor && !upperColor) continue
    const from = lowerColor ?? upperColor!
    const to = upperColor ?? lowerColor!
    const span = upper.grayscaleValue! - lower.grayscaleValue!
    const amount = span === 0 ? 0 : Math.max(0, Math.min(1, (gray - lower.grayscaleValue!) / span))
    pixels[offset] = Math.round(from[0] + (to[0] - from[0]) * amount)
    pixels[offset + 1] = Math.round(from[1] + (to[1] - from[1]) * amount)
    pixels[offset + 2] = Math.round(from[2] + (to[2] - from[2]) * amount)
  }
  return detection
}
