import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { defaultCharacterColorOverrides, normalizeCharacterColorOverrides, setCharacterColorRole } from '../../src/shared/customizer'
import { recolorWardrobeComponents } from '../../src/shared/wardrobePlacementModel'
import { detectCharacterSourcePalette, tintCharacterPalettePixels } from '../../src/renderer/src/characters/characterPaletteTint'
import { isCustomizerCharacter } from '../../electron/domains/customizer/validation'
import { isValidCustomizerFaceAppearance } from '../../src/shared/customizerValidation'

function paletteFixture(): Uint8ClampedArray {
  return new Uint8ClampedArray([
    43, 43, 43, 255,
    107, 107, 107, 255,
    168, 168, 168, 255,
    226, 226, 226, 255,
    140, 123, 255, 255,
    70, 61, 128, 128,
    75, 75, 75, 128,
    158, 158, 158, 96,
    43, 43, 43, 0,
    255, 255, 255, 0,
    140, 123, 255, 0,
    210, 24, 100, 255
  ])
}

const vividPalette = {
  outline: '#E03020', shadow: '#20D030', base: '#2040E0', light: '#F0E020', detail: '#E0D010'
}

describe('paleta fixa de cabelo, roupas e acessórios', () => {
  it('reconhece os cinco tons por valor explícito e mantém transparência, antialias e detalhes cromáticos', () => {
    const pixels = paletteFixture()
    const original = pixels.slice()
    const detection = tintCharacterPalettePixels(pixels, vividPalette)

    expect(detection.supported).toBe(true)
    expect(Array.from(pixels.slice(0, 4))).toEqual([224, 48, 32, 255])
    expect(Array.from(pixels.slice(4, 8))).toEqual([32, 208, 48, 255])
    expect(Array.from(pixels.slice(8, 12))).toEqual([32, 64, 224, 255])
    expect(Array.from(pixels.slice(12, 16))).toEqual([240, 224, 32, 255])
    expect(Array.from(pixels.slice(16, 20))).toEqual([224, 208, 16, 255])
    expect(Array.from(pixels.slice(20, 24))).toEqual([112, 104, 8, 128])
    expect(pixels[27]).toBe(original[27])
    expect(pixels[31]).toBe(original[31])
    expect(Array.from(pixels.slice(32, 44))).toEqual(Array.from(original.slice(32, 44)))
    expect(Array.from(pixels.slice(44, 48))).toEqual(Array.from(original.slice(44, 48)))
    expect(pixels[26]).not.toBe(original[26])
    expect(pixels[30]).not.toBe(original[30])
  })

  it('usa azul-turquesa como padrão secundário e preserva o roxo padrão de detalhe', () => {
    const pixels = paletteFixture()
    tintCharacterPalettePixels(pixels, defaultCharacterColorOverrides)

    expect(Array.from(pixels.slice(12, 16))).toEqual([85, 197, 212, 255])
    expect(Array.from(pixels.slice(16, 20))).toEqual([140, 123, 255, 255])
  })

  it('reconhece a secundária ciano das folhas novas e seus tons sombreados', () => {
    const pixels = new Uint8ClampedArray([
      43, 43, 43, 255,
      168, 168, 168, 255,
      85, 197, 212, 255,
      43, 99, 106, 160,
      89, 193, 208, 255,
      33, 150, 190, 255,
      85, 197, 212, 0
    ])
    const customSecondary = { ...defaultCharacterColorOverrides, light: '#D020B0' }

    const detection = tintCharacterPalettePixels(pixels, customSecondary)

    expect(detection.supported).toBe(true)
    expect(detection.roleCounts.light).toBe(3)
    expect(Array.from(pixels.slice(8, 12))).toEqual([208, 32, 176, 255])
    expect(Array.from(pixels.slice(12, 16))).toEqual([104, 16, 88, 160])
    expect(Array.from(pixels.slice(16, 20))).toEqual([205, 32, 173, 255])
    expect(Array.from(pixels.slice(20, 24))).toEqual([33, 150, 190, 255])
    expect(Array.from(pixels.slice(24, 28))).toEqual([85, 197, 212, 0])
  })

  it('altera cada papel independentemente e preserva os outros quatro', () => {
    const roles = ['outline', 'shadow', 'base', 'light', 'detail'] as const
    const fixtureRoleByPixel = ['outline', 'shadow', 'base', 'light', 'detail', 'detail'] as const
    const baseline = paletteFixture()
    tintCharacterPalettePixels(baseline, defaultCharacterColorOverrides)
    for (let selectedIndex = 0; selectedIndex < roles.length; selectedIndex += 1) {
      const changed = paletteFixture()
      const selectedRole = roles[selectedIndex]
      const changedPalette = setCharacterColorRole(defaultCharacterColorOverrides, selectedRole, '#35AABB')
      tintCharacterPalettePixels(changed, changedPalette)
      for (let sourceIndex = 0; sourceIndex < fixtureRoleByPixel.length; sourceIndex += 1) {
        const offset = sourceIndex * 4
        const actual = Array.from(changed.slice(offset, offset + 4))
        const expected = Array.from(baseline.slice(offset, offset + 4))
        if (fixtureRoleByPixel[sourceIndex] === selectedRole) expect(actual).not.toEqual(expected)
        else expect(actual).toEqual(expected)
      }
    }
    expect(normalizeCharacterColorOverrides({ base: '#112233', fade: '#223344', highlight: '#445566' })).toEqual({
      outline: '#2B2B2B', shadow: '#223344', base: '#112233', light: '#445566', detail: '#8C7BFF'
    })
    expect(defaultCharacterColorOverrides).toEqual({ outline: '#2B2B2B', shadow: '#6B6B6B', base: '#A8A8A8', light: '#55C5D4', detail: '#8C7BFF' })
  })

  it('não classifica nem altera assets antigos fora da paleta', () => {
    const pixels = new Uint8ClampedArray([18, 92, 201, 255, 240, 30, 45, 255, 255, 255, 255, 0])
    const original = pixels.slice()
    expect(detectCharacterSourcePalette(pixels).supported).toBe(false)
    expect(tintCharacterPalettePixels(pixels, vividPalette).supported).toBe(false)
    expect(pixels).toEqual(original)
  })

  it('mantém cores salvas por personagem e por ID de componente', () => {
    const group = (componentId: string, colors: { base: string }) => ({
      modelSlot: 1, setId: 'uniforme', category: 'camisa' as const, componentId,
      offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0, colors
    })
    const characterA = [group('frente', { base: '#AA0000' }), group('manga', { base: '#00AA00' })]
    const characterB = [group('frente', { base: '#0000AA' })]
    const recoloredA = recolorWardrobeComponents(characterA, 1, 'uniforme', 'camisa', ['frente'], {
      kind: 'role', role: 'base', value: '#CC5500'
    })

    expect(recoloredA[0].colors?.base).toBe('#CC5500')
    expect(recoloredA[1].colors?.base).toBe('#00AA00')
    expect(characterB[0].colors?.base).toBe('#0000AA')
    expect(characterA[0].colors?.base).toBe('#AA0000')
  })

  it('valida e conserva paletas persistidas antigas e novas sem conversão automática', () => {
    const character = {
      id: 'personagem-1', name: 'Teste', hair: '#000000', outfit: '#FFFFFF', skin: '#C08060',
      customization: { modelSlot: null, poseSlot: null, partOverrides: {}, layerOrder: [] },
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
    }
    const oldSaved = structuredClone(character) as typeof character & { customization: { wardrobePalettes?: Record<string, unknown> } }
    oldSaved.customization.wardrobePalettes = { shirt: { base: '#AA3300', fade: '#662200', outline: '#331100', highlight: '#EE9955' } }
    const newSaved = structuredClone(character) as typeof character & { customization: { wardrobePalettes?: Record<string, unknown> } }
    newSaved.customization.wardrobePalettes = { shirt: { outline: '#111111', shadow: '#444444', base: '#888888', light: '#DDDDDD', detail: '#8C7BFF' } }
    newSaved.customization.wardrobeGroups = [{
      modelSlot: 1, setId: 'uniforme', category: 'camisa', componentId: 'frente',
      offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0,
      colors: { outline: '#111111', shadow: '#444444', base: '#888888', light: '#DDDDDD', detail: '#8C7BFF' }
    }]

    expect(isCustomizerCharacter(oldSaved)).toBe(true)
    expect(isCustomizerCharacter(newSaved)).toBe(true)
    expect(oldSaved.customization.wardrobePalettes?.shirt).toEqual({ base: '#AA3300', fade: '#662200', outline: '#331100', highlight: '#EE9955' })
  })

  it('mantém olhos e rosto no contrato de paleta antigo', () => {
    const face = {
      modelSlot: 1, eyeState: 0 as const, eyebrows: true, noseIndex: 0,
      expressionIndex: 0, mouthOpen: false,
      components: { 'eye-left': { assetId: 'olho-1', colors: { base: '#AA3300', fade: '#662200' } } }
    }
    expect(isValidCustomizerFaceAppearance(face)).toBe(true)
    expect(isValidCustomizerFaceAppearance({
      ...face,
      components: { 'eye-left': { assetId: 'olho-1', colors: { outline: '#111111', shadow: '#444444', base: '#888888', light: '#DDDDDD' } } }
    })).toBe(false)
  })

  it('usa a recoloração fixa em cabelo, roupa e acessórios sem mudar olhos, rosto nem pele', () => {
    const source = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
    const thumbnail = source('../../src/renderer/src/features/customizer/wardrobePanelThumbnail.ts')
    const wardrobeRenderer = source('../../src/renderer/src/characters/characterWardrobeRenderer.ts')
    const hairRenderer = source('../../src/renderer/src/characters/characterLayerRenderer.ts')
    const faceRenderer = source('../../src/renderer/src/characters/characterFaceCatalogRenderer.ts')
    const characterRenderer = source('../../src/renderer/src/characters/characterRenderer.ts')
    const editorV6Renderer = source('../../src/renderer/src/characters/editorV6CharacterRenderer.ts')
    const imageTint = source('../../src/renderer/src/characters/characterImageTint.ts')
    const wardrobeWorkspace = source('../../src/renderer/src/features/customizer/CustomizerWardrobeCatalogWorkspace.tsx')
    const paletteControls = source('../../src/renderer/src/features/customizer/CustomizerAppearanceControls.tsx')

    expect(thumbnail).toContain('loadCharacterTintedImage(piece.dataUrl, colors)')
    expect(wardrobeRenderer).toContain('loadCharacterTintedImage(garment.component.dataUrl, garment.group.colors)')
    expect(hairRenderer).toContain('loadCharacterTintedImage(asset.dataUrl, resolvedHairColors(hairAppearance, layer.part))')
    expect(faceRenderer).toContain('loadHairTintedImage(asset.dataUrl, selectedPart.colors')
    expect(faceRenderer).toContain('loadCharacterTintedImage(asset.dataUrl, wardrobePalettes?.[paletteKey])')
    expect(characterRenderer).toContain('assetProvider, character.customization.wardrobePalettes')
    expect(editorV6Renderer).toContain('assetProvider, character.customization.wardrobePalettes')
    expect(wardrobeWorkspace).toContain('disabled={!hasCharacter || !currentCandidate}')
    expect(wardrobeWorkspace).not.toContain('Boolean(currentCandidate.headExtraAsset)')
    expect(paletteControls).toContain("label: 'Cor secundária', fallback: '#55C5D4'")
    expect(paletteControls).toContain("label: 'Cor de acessório/detalhe', fallback: '#8C7BFF'")
    expect(imageTint).toContain('tintSkinPixels(pixels, tone)')
  })
})
