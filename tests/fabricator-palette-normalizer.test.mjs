import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizePalettePixels, PALETTES } from '../src/renderer/src/features/fabricator/paletteNormalizer.ts'
import { detectCharacterSourcePalette, tintCharacterPalettePixels } from '../src/renderer/src/characters/characterPaletteTint.ts'

function pixels(rows) {
  const height = rows.length
  const width = rows[0].length
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const color = rows[y][x]
    data.set(color, (y * width + x) * 4)
  }
  return { width, height, data }
}

function rgba(hex, alpha = 255) {
  const value = hex.replace('#', '')
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16), alpha]
}

function assertVisibleColorsAreOfficial(image, kind) {
  const allowed = new Set(PALETTES[kind].map(({ hex }) => hex))
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (!image.data[offset + 3]) continue
    const hex = `#${[0, 1, 2].map((channel) => image.data[offset + channel].toString(16).padStart(2, '0')).join('').toUpperCase()}`
    assert.ok(allowed.has(hex), `Unexpected visible color ${hex}`)
  }
}

test('wardrobe maps source neutrals, cyan and purple to their fixed roles', () => {
  const image = pixels([[
    rgba('#242424'), rgba('#575757'), rgba('#BDBDBD'), rgba('#39B7C7'), rgba('#9974EC')
  ]])
  const report = normalizePalettePixels(image, 'wardrobe')
  assert.deepEqual(Array.from(image.data).filter((_, index) => index % 4 !== 3), [
    43, 43, 43, 107, 107, 107, 168, 168, 168, 85, 197, 212, 140, 123, 255
  ])
  assert.equal(report.width, 5)
  assert.equal(report.height, 1)
  assertVisibleColorsAreOfficial(image, 'wardrobe')
})

test('hair keeps alpha and maps colored hair by perceptual shade to the hair palette', () => {
  const image = pixels([[rgba('#263139'), rgba('#8D322D', 128), rgba('#E8B7C2')]])
  const report = normalizePalettePixels(image, 'hair')
  assert.equal(image.data[3], 255)
  assert.equal(image.data[7], 128)
  assert.equal(image.data[11], 255)
  assertVisibleColorsAreOfficial(image, 'hair')
  assert.equal(report.visiblePixels, 3)
})

test('already standardized hair colors are left unchanged', () => {
  const image = pixels([[...PALETTES.hair.map(({ hex }) => rgba(hex))]])
  normalizePalettePixels(image, 'hair')
  assert.deepEqual(Array.from(image.data).filter((_, index) => index % 4 !== 3), [
    43, 43, 43, 107, 107, 107, 168, 168, 168, 226, 226, 226
  ])
})

test('normalized clothing and hair swatches are recognized by the Customizer recoloring pipeline', () => {
  const overrides = { outline: '#111111', shadow: '#333333', base: '#777777', light: '#00FFFF', detail: '#FF00FF' }
  const wardrobe = pixels([[...PALETTES.wardrobe.map(({ hex }) => rgba(hex))]])
  normalizePalettePixels(wardrobe, 'wardrobe')
  const wardrobeDetection = detectCharacterSourcePalette(wardrobe.data)
  assert.equal(wardrobeDetection.supported, true)
  assert.equal(wardrobeDetection.roleCounts.outline, 1)
  assert.equal(wardrobeDetection.roleCounts.shadow, 1)
  assert.equal(wardrobeDetection.roleCounts.base, 1)
  assert.equal(wardrobeDetection.roleCounts.light, 1)
  assert.equal(wardrobeDetection.roleCounts.detail, 1)
  tintCharacterPalettePixels(wardrobe.data, overrides)
  assert.deepEqual(Array.from(wardrobe.data).filter((_, index) => index % 4 !== 3), [
    17, 17, 17, 51, 51, 51, 119, 119, 119, 0, 255, 255, 255, 0, 255
  ])

  const hair = pixels([[...PALETTES.hair.map(({ hex }) => rgba(hex))]])
  normalizePalettePixels(hair, 'hair')
  const hairDetection = detectCharacterSourcePalette(hair.data)
  assert.equal(hairDetection.supported, true)
  assert.equal(hairDetection.roleCounts.light, 1)
  tintCharacterPalettePixels(hair.data, overrides)
  assert.deepEqual(Array.from(hair.data).filter((_, index) => index % 4 !== 3), [
    17, 17, 17, 51, 51, 51, 119, 119, 119, 0, 255, 255
  ])
})

test('green chroma becomes transparent, its blended outline edge is despilled, and internal openings stay empty', () => {
  const green = rgba('#00FF00')
  const rows = Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => green))
  for (let y = 2; y <= 4; y += 1) for (let x = 2; x <= 4; x += 1) rows[y][x] = rgba('#A8A8A8')
  for (const [x, y] of [[2, 2], [3, 2], [4, 2], [2, 3], [4, 3], [2, 4], [3, 4], [4, 4]]) rows[y][x] = rgba('#2B2B2B')
  rows[3][3] = green
  rows[3][1] = [21, 149, 21, 255]
  const image = pixels(rows)
  const report = normalizePalettePixels(image, 'wardrobe')
  const edge = (3 * image.width + 1) * 4
  const hole = (3 * image.width + 3) * 4
  assert.ok(image.data[edge + 3] > 0 && image.data[edge + 3] < 255)
  assert.deepEqual(Array.from(image.data.slice(edge, edge + 3)), [43, 43, 43])
  assert.equal(image.data[hole + 3], 0)
  assert.equal(report.chromaKeyDetected, true)
  assert.ok(report.chromaRemovedPixels > 0)
  assert.ok(report.groups.some(({ chroma }) => chroma === 'removed'))
  assertVisibleColorsAreOfficial(image, 'wardrobe')
})

test('manual source-color group correction is applied without changing dimensions or alpha', () => {
  const image = pixels([[rgba('#D02010'), rgba('#D02010', 96)]])
  const report = normalizePalettePixels(image, 'wardrobe', { D21: 'detail' })
  assert.deepEqual(Array.from(image.data.slice(0, 3)), [140, 123, 255])
  assert.deepEqual(Array.from(image.data.slice(4, 7)), [140, 123, 255])
  assert.equal(image.data[7], 96)
  assert.equal(report.width, 2)
  assert.equal(report.height, 1)
  assert.equal(report.groups.find(({ key }) => key === 'D21')?.role, 'detail')
  assertVisibleColorsAreOfficial(image, 'wardrobe')
})

test('transparent pixels keep their original alpha and are ignored by palette classification', () => {
  const image = pixels([[rgba('#00FF00', 0), rgba('#777777', 75)]])
  const report = normalizePalettePixels(image, 'hair')
  assert.equal(image.data[3], 0)
  assert.equal(image.data[7], 75)
  assert.equal(report.chromaKeyDetected, false)
  assert.equal(report.visiblePixels, 1)
  assertVisibleColorsAreOfficial(image, 'hair')
})

test('green inside a transparent canvas is kept as artwork when no green key is found on the border', () => {
  const rows = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => rgba('#000000', 0)))
  rows[1][1] = rgba('#15DE15')
  const image = pixels(rows)
  const report = normalizePalettePixels(image, 'wardrobe')
  assert.equal(report.chromaKeyDetected, false)
  assert.equal(image.data[(1 * image.width + 1) * 4 + 3], 255)
  assert.equal(report.uncertainPixels, 1)
  assertVisibleColorsAreOfficial(image, 'wardrobe')
})

test('manual color mapping can preserve a green source group as an accessory instead of removing it', () => {
  const rows = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => rgba('#000000', 0)))
  rows[1][1] = rgba('#00FF00')
  const image = pixels(rows)
  const report = normalizePalettePixels(image, 'wardrobe', { '0F0': 'detail' })
  assert.equal(report.chromaKeyDetected, true)
  assert.equal(report.chromaRemovedPixels, 0)
  assert.equal(report.groups.find(({ key }) => key === '0F0')?.role, 'detail')
  assert.equal(report.groups.find(({ key }) => key === '0F0')?.chroma, 'preserved')
  const center = (image.width + 1) * 4
  assert.deepEqual(Array.from(image.data.slice(center, center + 3)), [140, 123, 255])
  assert.equal(image.data[center + 3], 255)
  assertVisibleColorsAreOfficial(image, 'wardrobe')
})
