import type { CharacterPaletteOverrides } from '../../../shared/customizer'

export const CHARACTER_SOURCE_PALETTE = [
  { role: 'outline', value: 43 },
  { role: 'shadow', value: 107 },
  { role: 'base', value: 168 },
  { role: 'light', value: 226 }
] as const

export type CharacterPaletteRole = typeof CHARACTER_SOURCE_PALETTE[number]['role']
export type CharacterPaletteDetection = { supported: boolean; roleCounts: Record<CharacterPaletteRole, number> }
type SourceSwatch = typeof CHARACTER_SOURCE_PALETTE[number]

const swatchTolerance = 6
const grayscaleTolerance = 8

/** Detect the authored grayscale swatches; transparent and chromatic pixels are excluded. */
export function detectCharacterSourcePalette(pixels: ArrayLike<number>): CharacterPaletteDetection {
  const roleCounts: Record<CharacterPaletteRole, number> = { outline: 0, shadow: 0, base: 0, light: 0 }
  for (let offset = 0; offset + 3 < pixels.length; offset += 4) {
    if (pixels[offset + 3] < 32) continue
    const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2]
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > grayscaleTolerance) continue
    const gray = (red + green + blue) / 3
    for (const swatch of CHARACTER_SOURCE_PALETTE) {
      if (Math.abs(gray - swatch.value) <= swatchTolerance) roleCounts[swatch.role] += 1
    }
  }
  return { supported: Object.values(roleCounts).filter(count => count > 0).length >= 2, roleCounts }
}

function parseColor(value: string | undefined): [number, number, number] | null {
  if (!value || !/^#[\da-f]{6}$/i.test(value)) return null
  return [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)]
}

/** Map the four source values explicitly, with linear interpolation only between them for antialiasing. */
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
    if (Math.max(red, green, blue) - Math.min(red, green, blue) > grayscaleTolerance) continue
    const gray = (red + green + blue) / 3
    if (gray < CHARACTER_SOURCE_PALETTE[0].value || gray > CHARACTER_SOURCE_PALETTE[3].value) continue

    let lower: SourceSwatch = CHARACTER_SOURCE_PALETTE[0]
    let upper: SourceSwatch = CHARACTER_SOURCE_PALETTE[3]
    for (let index = 0; index < CHARACTER_SOURCE_PALETTE.length - 1; index += 1) {
      const first = CHARACTER_SOURCE_PALETTE[index]
      const second = CHARACTER_SOURCE_PALETTE[index + 1]
      if (gray >= first.value && gray <= second.value) { lower = first; upper = second; break }
    }
    const lowerColor = targets.get(lower.role)
    const upperColor = targets.get(upper.role)
    if (!lowerColor && !upperColor) continue
    const from = lowerColor ?? upperColor!
    const to = upperColor ?? lowerColor!
    const span = Number(upper.value) - Number(lower.value)
    const amount = span === 0 ? 0 : Math.max(0, Math.min(1, (gray - lower.value) / span))
    pixels[offset] = Math.round(from[0] + (to[0] - from[0]) * amount)
    pixels[offset + 1] = Math.round(from[1] + (to[1] - from[1]) * amount)
    pixels[offset + 2] = Math.round(from[2] + (to[2] - from[2]) * amount)
  }
  return detection
}
