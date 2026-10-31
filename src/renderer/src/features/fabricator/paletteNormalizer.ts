export type PaletteAssetKind = 'wardrobe' | 'hair'
export type PaletteRole = 'outline' | 'shadow' | 'base' | 'secondary' | 'detail' | 'light'
export type PaletteOverrides = Record<string, PaletteRole>

export interface PaletteColorRole {
  role: PaletteRole
  label: string
  hex: string
}

export interface PaletteSourceGroup {
  key: string
  sourceHex: string
  pixels: number
  role: PaletteRole
  confidence: 'high' | 'medium' | 'low'
  chroma?: 'removed' | 'preserved'
}

export interface PaletteNormalizationReport {
  width: number
  height: number
  visiblePixels: number
  chromaRemovedPixels: number
  chromaKeyDetected: boolean
  uncertainPixels: number
  groups: PaletteSourceGroup[]
}

export interface PalettePixelData {
  width: number
  height: number
  data: Uint8ClampedArray
}

export const PALETTES: Record<PaletteAssetKind, PaletteColorRole[]> = {
  wardrobe: [
    { role: 'outline', label: 'Contorno', hex: '#2B2B2B' },
    { role: 'shadow', label: 'Sombra', hex: '#6B6B6B' },
    { role: 'base', label: 'Tecido principal', hex: '#A8A8A8' },
    { role: 'secondary', label: 'Tecido secundário', hex: '#55C5D4' },
    { role: 'detail', label: 'Acessórios e decorações', hex: '#8C7BFF' }
  ],
  hair: [
    { role: 'outline', label: 'Contorno', hex: '#2B2B2B' },
    { role: 'shadow', label: 'Sombra', hex: '#6B6B6B' },
    { role: 'base', label: 'Cor base', hex: '#A8A8A8' },
    { role: 'light', label: 'Luz', hex: '#E2E2E2' }
  ]
}

const keyHex = '#00FF00'
const roleRank: Record<PaletteRole, number> = { outline: 0, shadow: 1, base: 2, secondary: 3, detail: 4, light: 5 }

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.slice(1)
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16)]
}

function colorHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

function colorBinKey(red: number, green: number, blue: number): string {
  return [red, green, blue].map((channel) => Math.floor(channel / 16).toString(16)).join('').toUpperCase()
}

function linear(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/** Perceptual OKLab conversion used for shade distance and hue grouping. */
function toOklab(red: number, green: number, blue: number): [number, number, number] {
  const r = linear(red), g = linear(green), b = linear(blue)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ]
}

function nearestRoleInPalette(red: number, green: number, blue: number, roles: PaletteColorRole[]): { role: PaletteRole; distance: number; gap: number } {
  const source = toOklab(red, green, blue)
  const ranked = roles.map(({ role, hex }) => {
    const target = toOklab(...hexToRgb(hex))
    return { role, distance: Math.hypot(source[0] - target[0], source[1] - target[1], source[2] - target[2]) }
  }).sort((left, right) => left.distance - right.distance)
  return { role: ranked[0].role, distance: ranked[0].distance, gap: (ranked[1]?.distance ?? 1) - ranked[0].distance }
}

function classifyPixel(red: number, green: number, blue: number, kind: PaletteAssetKind, sensitivity: number): { role: PaletteRole; confidence: PaletteSourceGroup['confidence'] } {
  const palette = PALETTES[kind]
  const exact = palette.find(({ hex }) => {
    const [r, g, b] = hexToRgb(hex)
    return red === r && green === g && blue === b
  })
  if (exact) return { role: exact.role, confidence: 'high' }

  const lab = toOklab(red, green, blue)
  const chroma = Math.hypot(lab[1], lab[2])
  const level = Math.max(0, Math.min(100, sensitivity)) / 100
  const lowGap = 0.075 - level * 0.05
  if (kind === 'wardrobe' && chroma >= 0.065 - level * 0.035) {
    const hue = (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360
    const huePadding = level * 8
    if (hue >= 150 - huePadding && hue <= 225 + huePadding) return { role: 'secondary', confidence: 'high' }
    if (hue >= 235 - huePadding && hue <= 330 + huePadding) return { role: 'detail', confidence: 'high' }
    const gray = nearestRoleInPalette(red, green, blue, palette.filter(({ role }) => role === 'outline' || role === 'shadow' || role === 'base'))
    return { role: gray.role, confidence: chroma >= 0.1 ? 'low' : 'medium' }
  }

  const shades = kind === 'hair'
    ? palette
    : palette.filter(({ role }) => role === 'outline' || role === 'shadow' || role === 'base')
  const nearest = nearestRoleInPalette(red, green, blue, shades)
  const confidence = nearest.gap < lowGap ? 'low' : nearest.gap < lowGap * 2 ? 'medium' : 'high'
  return { role: nearest.role, confidence }
}

function isGreenCandidate(red: number, green: number, blue: number, sensitivity: number): boolean {
  const level = Math.max(0, Math.min(100, sensitivity)) / 100
  return green >= 90 - level * 20 && green - red >= 45 - level * 18 && green - blue >= 40 - level * 18 && green >= red * (1.22 - level * 0.12) && green >= blue * (1.18 - level * 0.12)
}

type PaletteRgbMap = Map<PaletteRole, [number, number, number]>

function inferKeyEdge(red: number, green: number, blue: number, colors: PaletteRgbMap): { role: PaletteRole; foregroundCoverage: number; error: number } {
  const background = hexToRgb(keyHex)
  let best: { role: PaletteRole; foregroundCoverage: number; error: number } = { role: 'base', foregroundCoverage: 0, error: Number.POSITIVE_INFINITY }
  for (const [role, foreground] of colors) {
    const direction = [foreground[0] - background[0], foreground[1] - background[1], foreground[2] - background[2]]
    const vector = [red - background[0], green - background[1], blue - background[2]]
    const lengthSquared = direction.reduce((sum, value) => sum + value * value, 0)
    const coverage = Math.max(0, Math.min(1, vector.reduce((sum, value, index) => sum + value * direction[index], 0) / lengthSquared))
    const error = Math.sqrt(vector.reduce((sum, value, index) => {
      const residual = value - direction[index] * coverage
      return sum + residual * residual
    }, 0) / 3)
    if (error < best.error) best = { role, foregroundCoverage: coverage, error }
  }
  return best
}

interface ColorGroupAccumulator {
  count: number
  sourceHex: string
  roles: Map<PaletteRole, number>
  uncertainPixels: number
  lowConfidencePixels: number
  chroma?: 'preserved'
}

function writeRoleColor(data: Uint8ClampedArray, offset: number, role: PaletteRole, colors: PaletteRgbMap): void {
  const target = colors.get(role)
  if (!target) throw new Error(`A paleta não contém o papel ${role}.`)
  const [red, green, blue] = target
  data[offset] = red; data[offset + 1] = green; data[offset + 2] = blue
}

function detectGreenScreen(data: Uint8ClampedArray, width: number, height: number, sensitivity: number): boolean {
  let boundaryCandidates = 0
  let boundaryPixels = 0
  const add = (x: number, y: number) => {
    const pixel = y * width + x
    const offset = pixel * 4
    boundaryPixels += 1
    if (data[offset + 3] > 0 && isGreenCandidate(data[offset], data[offset + 1], data[offset + 2], sensitivity)) {
      boundaryCandidates += 1
    }
  }
  for (let x = 0; x < width; x += 1) { add(x, 0); if (height > 1) add(x, height - 1) }
  for (let y = 1; y < height - 1; y += 1) { add(0, y); if (width > 1) add(width - 1, y) }
  const cornerGreen = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]].filter(([x, y]) => {
    const offset = (y * width + x) * 4
    return data[offset + 3] > 0 && isGreenCandidate(data[offset], data[offset + 1], data[offset + 2], sensitivity)
  }).length
  if (cornerGreen >= 2 || (boundaryCandidates >= 8 && boundaryCandidates / Math.max(1, boundaryPixels) >= 0.025)) return true

  // A green-filled opening can be disconnected from the outside border. Exact key pixels are
  // rare in these gray/cyan/purple palettes, so a small cluster is enough to request review.
  let interiorKeyPixels = 0
  const keyTolerance = 24 + sensitivity * 0.16
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0 || !isGreenCandidate(data[offset], data[offset + 1], data[offset + 2], sensitivity)) continue
    const distance = Math.hypot(data[offset], data[offset + 1] - 255, data[offset + 2])
    if (distance <= 3) return true
    if (distance <= keyTolerance) interiorKeyPixels += 1
    if (interiorKeyPixels >= 4) return true
  }
  return false
}

function removeDetectedChromaKey(data: Uint8ClampedArray, width: number, height: number, colors: PaletteRgbMap, sensitivity: number, overrides: PaletteOverrides): { detected: boolean; removedPixels: number; groups: PaletteSourceGroup[]; preservedKeys: Set<string> } {
  const detected = detectGreenScreen(data, width, height, sensitivity)
  if (!detected) return { detected: false, removedPixels: 0, groups: [], preservedKeys: new Set() }
  let removedPixels = 0
  const groups = new Map<string, PaletteSourceGroup>()
  const preservedKeys = new Set<string>()
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0 || !isGreenCandidate(data[offset], data[offset + 1], data[offset + 2], sensitivity)) continue
    const key = colorBinKey(data[offset], data[offset + 1], data[offset + 2])
    if (overrides[key] && colors.has(overrides[key])) { preservedKeys.add(key); continue }
    const sourceHex = colorHex(data[offset], data[offset + 1], data[offset + 2])
    const keyDistance = Math.hypot(data[offset], data[offset + 1] - 255, data[offset + 2])
    let role: PaletteRole = 'base'
    if (keyDistance <= 26 + sensitivity * 0.2) {
      data[offset] = 0; data[offset + 1] = 0; data[offset + 2] = 0; data[offset + 3] = 0
      removedPixels += 1
    } else {
      const edge = inferKeyEdge(data[offset], data[offset + 1], data[offset + 2], colors)
      if (edge.error <= 22 || edge.foregroundCoverage <= 0.015) {
        role = edge.role
        if (edge.foregroundCoverage <= 0.015) {
          data[offset] = 0; data[offset + 1] = 0; data[offset + 2] = 0; data[offset + 3] = 0
        } else {
          writeRoleColor(data, offset, edge.role, colors)
          data[offset + 3] = Math.round(data[offset + 3] * edge.foregroundCoverage)
        }
        removedPixels += 1
      } else {
        // Keep green-like source colors that cannot be separated from the key confidently.
        continue
      }
    }
    const group = groups.get(key)
    if (group) group.pixels += 1
    else groups.set(key, { key, sourceHex, pixels: 1, role, confidence: 'low', chroma: 'removed' })
  }
  return { detected: true, removedPixels, groups: [...groups.values()], preservedKeys }
}

export function normalizePalettePixels(image: PalettePixelData, kind: PaletteAssetKind, overrides: PaletteOverrides = {}, sensitivity = 55): PaletteNormalizationReport {
  const { width, height, data } = image
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data.length !== width * height * 4) {
    throw new Error('Os pixels da imagem são inválidos.')
  }
  if (width * height > 32_000_000) throw new Error('A imagem tem mais de 32 milhões de pixels. Reduza as dimensões para continuar.')

  const palette = PALETTES[kind]
  const colors: PaletteRgbMap = new Map(palette.map(({ role, hex }) => [role, hexToRgb(hex)]))
  const exactColors = new Set(palette.map(({ hex }) => Number.parseInt(hex.slice(1), 16)))
  const exactRoles = new Map<number, PaletteRole>(palette.map((entry) => [Number.parseInt(entry.hex.slice(1), 16), entry.role]))
  const chroma = removeDetectedChromaKey(data, width, height, colors, sensitivity, overrides)
  const groups = new Map<string, ColorGroupAccumulator>()
  const classifications = new Map<string, { role: PaletteRole; confidence: PaletteSourceGroup['confidence'] }>()
  let visiblePixels = 0, uncertainPixels = 0

  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) continue
    visiblePixels += 1
    const red = data[offset], green = data[offset + 1], blue = data[offset + 2]
    const sourceColor = (red << 16) | (green << 8) | blue
    const exactRole = exactRoles.get(sourceColor)
    if (exactRole) continue

    const key = colorBinKey(red, green, blue)
    let classified = classifications.get(key)
    if (!classified) { classified = classifyPixel(red, green, blue, kind, sensitivity); classifications.set(key, classified) }
    const manualRole = palette.some((item) => item.role === overrides[key]) ? overrides[key] : undefined
    const role = manualRole ?? classified.role
    const uncertainChroma = chroma.detected && isGreenCandidate(red, green, blue, sensitivity) && !manualRole
    const needsReview = !manualRole && (classified.confidence !== 'high' || uncertainChroma)
    if (needsReview) uncertainPixels += 1
    let group = groups.get(key)
    if (!group) {
      const groupChroma = chroma.preservedKeys.has(key) ? 'preserved' as const : undefined
      group = { count: 0, sourceHex: colorHex(red, green, blue), roles: new Map(), uncertainPixels: 0, lowConfidencePixels: 0, ...(groupChroma ? { chroma: groupChroma } : {}) }
      groups.set(key, group)
    }
    group.count += 1
    group.roles.set(role, (group.roles.get(role) ?? 0) + 1)
    if (needsReview) group.uncertainPixels += 1
    if (classified.confidence === 'low' && !manualRole) group.lowConfidencePixels += 1
    writeRoleColor(data, offset, role, colors)
  }

  const reportGroups: PaletteSourceGroup[] = [...groups.entries()].map(([key, group]) => {
    const role = [...group.roles.entries()].sort((left, right) => right[1] - left[1] || roleRank[left[0]] - roleRank[right[0]])[0]?.[0] ?? 'base'
    const confidence = group.lowConfidencePixels >= group.count * 0.45 ? 'low' as const : group.uncertainPixels > 0 ? 'medium' as const : 'high' as const
    return { key, sourceHex: group.sourceHex, pixels: group.count, role, confidence, ...(group.chroma ? { chroma: group.chroma } : {}) }
  })
  reportGroups.push(...chroma.groups)
  reportGroups.sort((left, right) => Number(Boolean(right.chroma)) - Number(Boolean(left.chroma)) || (left.confidence === 'low' ? 0 : 1) - (right.confidence === 'low' ? 0 : 1) || right.pixels - left.pixels)

  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) continue
    const color = (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2]
    if (!exactColors.has(color)) throw new Error(`A normalização deixou uma cor fora da paleta: ${colorHex(data[offset], data[offset + 1], data[offset + 2])}.`)
  }

  return { width, height, visiblePixels, chromaRemovedPixels: chroma.removedPixels, chromaKeyDetected: chroma.detected, uncertainPixels, groups: reportGroups.slice(0, 12) }
}
