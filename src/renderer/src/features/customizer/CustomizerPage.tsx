import { selectCharacterArtwork } from '../../../../shared/characterSourceContinuity'
import { useCustomizerCharacterRoster } from './useCustomizerCharacterRoster'
import { useCustomizerModelBrowserState } from './useCustomizerModelBrowserState'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RenderedCharacterPortrait } from '../../ui/components/RenderedCharacterPortrait'
import { Icon, type IconName } from '../../ui/components/Icon'
import type { FaceCatalogItem, FaceCatalogItemSummary, FaceComponentAsset, FaceComponentAssetSummary, FaceComponentKind, FaceDetailKind, FaceElementKind, FaceExpressionEffects, FaceSet, FaceSheetKind, FabricatorPose, FabricatorPoseSummary, FabricatorProject, FabricatorSlotSummary, HairStyle, HairStyleSummary, WardrobeCategory, WardrobeSet, WardrobeSetSummary } from '../../../../shared/fabricator'
import { resolvePoseCategory } from '../../../../shared/fabricator'
import { hairCategories, hairStyleSupportsCategory } from '../../../../shared/hairCategories'
import type { CustomizerCharacter, CustomizerFaceAppearance, CustomizerWardrobeGroup, CustomizerWardrobePaletteKey, FaceComponentPartId, FacePalettePartId, HairColorOverrides, HairColorRole, HairPartId } from '../../../../shared/customizer'
import { characterBodyDimensionLimits, characterProportionLimits, defaultCharacterBodyDimensions, defaultCharacterProportions, getCharacterBodyDimensions, getCharacterProportions, type CharacterBodyDimensions, type CharacterProportions } from '../../../../shared/customizer'
import { type StudioFaceTransforms } from '../../../../shared/studio'
import { usePreviewBackground } from '../../ui/hooks/usePreviewBackground'
import { DesignBanner } from '../../ui/components/DesignBanner'
import { anchorWardrobeAdjustments, editWardrobeAdjustment, moveWardrobeAdjustment } from '../../../../shared/wardrobeAdjustment'
import { applyCharacterBodyShape } from '../../../../shared/bodyShape'
import { characterRenderSize, configureCharacterSampling, MAX_CHARACTER_PREVIEW_PIXELS } from './renderResolution'
import { renderArtwork, loadStandardExpressionEffects, loadSkinTintedImage, loadCachedImage, withCharacterHeadSize, loadHairAppearanceLayers, renderArtworkWithHair, renderWardrobeOverlay, isRightFaceAsset, renderFaceOverlay, renderFrontHairOverlay, characterShapeScale, drawFaceCatalogOverlay, loadHairTintedImage, resolvedHairColors, clothingCategories, wardrobeComponentsForGroup, customizerHairParts, hairAppearanceStyleId } from '../../characters/characterRenderer'
import type { StandardExpressionEffects, CatalogArtwork, HairTintOptions, HairCatalogSide, AdjustmentPreviewHighlight, ClothingGroupCategory, SelectedWardrobeComponent } from '../../characters/characterRenderer'

const hairPreviewImageCache = new Map<string, Promise<string>>()

const hairColorControls: Array<{ id: HairColorRole; label: string; fallback: string }> = [
  { id: 'base', label: 'Cor base', fallback: '#9b563e' },
  { id: 'fade', label: 'Degradê', fallback: '#633b37' },
  { id: 'outline', label: 'Contorno', fallback: '#392b33' },
  { id: 'highlight', label: 'Luzes', fallback: '#e5ad83' },
  { id: 'accent', label: 'Acessório', fallback: '#cf6391' }
]
const hairPalettePresets: Array<{ name: string; colors: HairColorOverrides }> = [
  { name: 'Castanho', colors: { base: '#8e4b35', fade: '#613525', outline: '#33221f', highlight: '#c68156', accent: '#c0638e' } },
  { name: 'Loiro', colors: { base: '#d6b46e', fade: '#a8844b', outline: '#59422e', highlight: '#f4dea0', accent: '#db9c73' } },
  { name: 'Preto', colors: { base: '#343b49', fade: '#242733', outline: '#14151d', highlight: '#78889b', accent: '#a55a83' } },
  { name: 'Fantasia', colors: { base: '#8756b7', fade: '#593f88', outline: '#302548', highlight: '#c997df', accent: '#e480ae' } },
  { name: 'Chocolate', colors: { base: '#674433', fade: '#452e29', outline: '#261d1b', highlight: '#a27a55', accent: '#c28d5e' } },
  { name: 'Cobre', colors: { base: '#b55a36', fade: '#783526', outline: '#40221e', highlight: '#e99661', accent: '#e5b67e' } },
  { name: 'Ruivo', colors: { base: '#c65430', fade: '#86311f', outline: '#48251f', highlight: '#ed985b', accent: '#e7c382' } },
  { name: 'Mel', colors: { base: '#b78345', fade: '#7d5734', outline: '#473324', highlight: '#e5b96e', accent: '#f1d595' } },
  { name: 'Platinado', colors: { base: '#d5d0c9', fade: '#9f9ba4', outline: '#555467', highlight: '#f3eee5', accent: '#e9d3df' } },
  { name: 'Branco', colors: { base: '#e0e2eb', fade: '#a7acbf', outline: '#54586f', highlight: '#fafaff', accent: '#c5d9ee' } },
  { name: 'Cinza', colors: { base: '#8c919c', fade: '#5b6272', outline: '#303543', highlight: '#c2c7d3', accent: '#9eacc5' } },
  { name: 'Azul noite', colors: { base: '#3e5688', fade: '#29375e', outline: '#1b2340', highlight: '#7996c4', accent: '#a2c8ed' } },
  { name: 'Céu', colors: { base: '#63a9d5', fade: '#3d79a8', outline: '#294866', highlight: '#b8dff1', accent: '#d0edf5' } },
  { name: 'Menta', colors: { base: '#70bea9', fade: '#408c83', outline: '#275457', highlight: '#c2e9cf', accent: '#e1f3dd' } },
  { name: 'Rosa', colors: { base: '#d778ac', fade: '#a65080', outline: '#68344f', highlight: '#f3b5d3', accent: '#f5d9e5' } },
  { name: 'Vinho', colors: { base: '#8d3f62', fade: '#5e2b49', outline: '#341d32', highlight: '#c4799e', accent: '#e1a6b9' } },
  { name: 'Lilás', colors: { base: '#ad88cf', fade: '#7961a5', outline: '#493b70', highlight: '#dcc3ed', accent: '#f1d9ee' } },
  { name: 'Pêssego', colors: { base: '#e89c88', fade: '#bb6b67', outline: '#70404c', highlight: '#ffd2ad', accent: '#f4baca' } },
  { name: 'Verde musgo', colors: { base: '#6e8556', fade: '#4a633e', outline: '#2c4130', highlight: '#a9bc7b', accent: '#d6d0a3' } },
  { name: 'Turquesa', colors: { base: '#399f9e', fade: '#2a7079', outline: '#204753', highlight: '#8bd8cf', accent: '#c0eee1' } }
]
type FaceLibraryPartId = FaceComponentPartId
const customizerFaceParts: Array<{ id: FaceLibraryPartId; label: string; category: FaceComponentKind; element?: 'eye-left' | 'eye-right' | 'brow-left' | 'brow-right'; side: 'left' | 'right' }> = [
  { id: 'eye-left', label: 'Olho esquerdo', category: 'eye', element: 'eye-left', side: 'left' },
  { id: 'eye-right', label: 'Olho direito', category: 'eye', element: 'eye-right', side: 'right' },
  { id: 'pupil-left', label: 'Pupila esquerda', category: 'pupil', side: 'left' },
  { id: 'pupil-right', label: 'Pupila direita', category: 'pupil', side: 'right' },
  { id: 'brow-left', label: 'Sobrancelha esquerda', category: 'eyebrow', element: 'brow-left', side: 'left' },
  { id: 'brow-right', label: 'Sobrancelha direita', category: 'eyebrow', element: 'brow-right', side: 'right' }
]
const facePartColorControls: Array<{ id: HairColorRole; label: string; fallback: string }> = [
  { id: 'base', label: 'Base', fallback: '#55404d' }, { id: 'fade', label: 'Degradê', fallback: '#8a687e' },
  { id: 'outline', label: 'Contorno', fallback: '#251e2c' }, { id: 'highlight', label: 'Luzes', fallback: '#d6b7c7' },
  { id: 'accent', label: 'Acento', fallback: '#bd7198' }
]
function facePartCatalogId(appearance: CustomizerFaceAppearance | undefined, part: typeof customizerFaceParts[number]): string | null | undefined {
  return appearance?.components?.[part.id]?.assetId
}
function facePartSourceId(part: typeof customizerFaceParts[number]): FaceLibraryPartId {
  return part.id
}
function hasSelectedFaceAsset(appearance: CustomizerFaceAppearance): boolean {
  return Boolean(appearance.setId
    || appearance.eyeCatalogId || appearance.eyeLeftCatalogId || appearance.eyeRightCatalogId
    || appearance.eyebrowCatalogId || appearance.eyebrowLeftCatalogId || appearance.eyebrowRightCatalogId
    || appearance.noseCatalogId || appearance.mouthClosedCatalogId || appearance.mouthOpenCatalogId
    || Object.values(appearance.components ?? {}).some((component) => component?.assetId)
    || Object.values(appearance.faceDetails ?? {}).some(Boolean)
    || Object.values(appearance.headExtras ?? {}).some(Boolean))
}
function wrapSlotIndex(index: number, slotCount: number): number {
  return slotCount > 0 ? (index % slotCount + slotCount) % slotCount : 0
}
function sameFaceAssetPair(left: FaceComponentAssetSummary, right: FaceComponentAssetSummary, details: Record<string, FaceComponentAsset>): boolean {
  if (left.kind !== right.kind || !isRightFaceAsset(right)) return false
  if (left.pairId || right.pairId) return Boolean(left.pairId && left.pairId === right.pairId || right.pairId === left.id)
  const leftDetail = details[left.id]
  const rightDetail = details[right.id]
  const baseName = (name: string) => name.replace(/ · (?:Olho|Olho aberto|Olho fechado|Pupila|Sobrancelha) (?:esquerd[oa]|direit[oa])$/i, '')
  return Boolean(leftDetail && rightDetail && !isRightFaceAsset(left) && baseName(left.name) === baseName(right.name) && leftDetail.dataUrl === rightDetail.dataUrl)
}
const skinTonePresets = [
  { id: '#f5ddcb', name: 'Porcelana' },
  { id: '#edc5a5', name: 'Clara' },
  { id: '#dba47d', name: 'Pêssego' },
  { id: '#c88961', name: 'Dourada' },
  { id: '#a96d4c', name: 'Média' },
  { id: '#754a36', name: 'Escura' },
  { id: '#493027', name: 'Retinta' }
] as const
const customizerSkinTonePresets = [skinTonePresets[0], skinTonePresets[1], skinTonePresets[2], skinTonePresets[4], skinTonePresets[6]]

async function sampleOriginalSkinTone(project: FabricatorProject): Promise<string | null> {
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
const proportionControls: Array<{ key: keyof CharacterProportions; label: string; description: string }> = [
  { key: 'scale', label: 'Escala geral', description: 'Aumenta ou diminui o personagem inteiro' },
  { key: 'head', label: 'Tamanho da cabeça', description: 'Altera apenas a cabeça, rosto e cabelo' },
  { key: 'headWidth', label: 'Largura da cabeça', description: 'Alarga ou estreita apenas a cabeça, rosto e cabelo' },
  { key: 'headHeight', label: 'Altura da cabeça', description: 'Alonga ou achata apenas a cabeça, rosto e cabelo' },
  { key: 'width', label: 'Largura', description: 'Estica ou comprime o personagem na horizontal' },
  { key: 'height', label: 'Altura', description: 'Estica ou comprime o personagem na vertical' }
]

/** Decode a replacement before swapping the visible preview image, avoiding a blank frame. */
function preparePreviewImage(source: string | null): Promise<boolean> {
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

function loadHairPreviewImage(source: string): Promise<string> {
  const cached = hairPreviewImageCache.get(source)
  if (cached) return cached
  const preview = loadCachedImage(source).then((image) => {
    const width = image.naturalWidth || image.width
    const height = image.naturalHeight || image.height
    if (!width || !height) return source
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return source
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, width, height).data
    let left = width
    let top = height
    let right = -1
    let bottom = -1
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (pixels[(y * width + x) * 4 + 3] === 0) continue
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x)
        bottom = Math.max(bottom, y)
      }
    }
    if (right < left || bottom < top || (left === 0 && top === 0 && right === width - 1 && bottom === height - 1)) return source
    const contentWidth = right - left + 1
    const contentHeight = bottom - top + 1
    const padding = Math.max(2, Math.ceil(Math.max(contentWidth, contentHeight) * 0.045))
    const output = document.createElement('canvas')
    output.width = contentWidth + padding * 2
    output.height = contentHeight + padding * 2
    const outputContext = output.getContext('2d')
    if (!outputContext) return source
    outputContext.drawImage(image, left, top, contentWidth, contentHeight, padding, padding, contentWidth, contentHeight)
    return output.toDataURL('image/png')
  })
  hairPreviewImageCache.set(source, preview)
  if (hairPreviewImageCache.size > 40) hairPreviewImageCache.delete(hairPreviewImageCache.keys().next().value!)
  void preview.catch(() => hairPreviewImageCache.delete(source))
  return preview
}

function HairAssetPreview({ source, alt, colors, tintOptions, skinTone, opacity = 1, flipX = false }: { source: string; alt: string; colors?: HairColorOverrides; tintOptions?: HairTintOptions; skinTone?: string; opacity?: number; flipX?: boolean }) {
  const [previewSource, setPreviewSource] = useState(source)
  const colorKey = JSON.stringify([colors, tintOptions])
  useEffect(() => {
    let cancelled = false
    setPreviewSource(source)
    const tintedImage = skinTone ? loadSkinTintedImage(source, skinTone) : loadHairTintedImage(source, colors, tintOptions)
    void tintedImage.then((image) => loadHairPreviewImage(image.src)).then((trimmed) => {
      if (!cancelled) setPreviewSource(trimmed)
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [source, colorKey, skinTone])
  return <img src={previewSource} alt={alt} style={{ opacity: Math.min(1, Math.max(0, opacity)), transform: flipX ? 'scaleX(-1)' : undefined }} />
}

const mirroredFaceThumbnailIds = new Set<FaceComponentPartId>(['eye-right', 'pupil-right', 'brow-right'])

function NoseOpacityControl({ value, disabled, onChange }: { value: number; disabled: boolean; onChange: (value: number) => void }) {
  const [open, setOpen] = useState(false)
  const percentage = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return <>
    <button className="customizer-nose-opacity-button" type="button" aria-label={`Transparência do nariz: ${100 - percentage}%`} aria-expanded={open} title={`Transparência ${100 - percentage}%`} disabled={disabled} onClick={() => setOpen((current) => !current)}><Icon name="sliders" /><small>α</small></button>
    {open && <div className="customizer-nose-opacity-popover" role="group" aria-label="Transparência do nariz">
      <div className="customizer-nose-opacity-heading"><span>Transparência</span><output>{100 - percentage}%</output></div>
      <input type="range" min="0" max="100" step="1" value={100 - percentage} disabled={disabled} onChange={(event) => onChange(1 - Number(event.target.value) / 100)} aria-label="Transparência do nariz" />
    </div>}
  </>
}

function MouthBlushControls({ color, opacity, disabled, onChange }: { color: string; opacity: number; disabled: boolean; onChange: (patch: { mouthBlushColor?: string; mouthBlushOpacity?: number }) => void }) {
  const [open, setOpen] = useState(false)
  const percentage = Math.round(Math.min(1, Math.max(0, opacity)) * 100)
  return <span className="customizer-mouth-blush-controls">
    <label className="customizer-mouth-blush-color" style={{ '--mouth-blush-color': color } as React.CSSProperties} title="Escolher cor do blush na boca">
      <input type="color" aria-label="Cor do blush na boca" value={color} disabled={disabled} onChange={(event) => onChange({ mouthBlushColor: event.target.value })} />
      <span aria-hidden="true" />
    </label>
    <button className="customizer-mouth-blush-opacity-button" type="button" aria-label={`Intensidade/transparência do blush na boca: ${percentage}%`} aria-expanded={open} title={`Intensidade do blush: ${percentage}%`} disabled={disabled} onClick={() => setOpen((current) => !current)}><Icon name="sliders" /><small>α</small></button>
    {open && <span className="customizer-mouth-blush-opacity-popover" role="group" aria-label="Intensidade e transparência do blush na boca">
      <span className="customizer-nose-opacity-heading"><span>Intensidade</span><output>{percentage}%</output></span>
      <input type="range" min="0" max="100" step="1" value={percentage} disabled={disabled} onChange={(event) => onChange({ mouthBlushOpacity: Number(event.target.value) / 100 })} aria-label="Intensidade e transparência do blush na boca" />
    </span>}
  </span>
}

function NoseSkinTonePalette({ value, disabled, onSelect }: { value: string; disabled: boolean; onSelect: (tone: string) => void }) {
  return <div className="customizer-nose-skin-palette" aria-label="Paleta de cor de pele">
    <strong>Cor da pele</strong>
    <div className="customizer-nose-skin-options" role="group" aria-label="Escolher cor de pele para o nariz">
      {customizerSkinTonePresets.map((preset) => <button key={preset.id} className={'customizer-nose-skin-tone' + (value.toLowerCase() === preset.id ? ' selected' : '')} style={{ '--skin-tone': preset.id } as React.CSSProperties} type="button" disabled={disabled} aria-label={`Tom de pele ${preset.name}`} aria-pressed={value.toLowerCase() === preset.id} title={preset.name} onClick={() => onSelect(preset.id)}><span /></button>)}
      <label className={'customizer-nose-skin-picker' + (customizerSkinTonePresets.some((preset) => preset.id === value.toLowerCase()) ? '' : ' selected')} title="Escolher uma cor de pele personalizada">
        <input type="color" aria-label="Escolher uma cor de pele personalizada" value={value} disabled={disabled} onChange={(event) => onSelect(event.target.value)} />
        <span style={{ '--skin-tone': value } as React.CSSProperties}><Icon name="brush" /></span>
      </label>
    </div>
  </div>
}

function PiecePaletteStrip({ label = 'Paleta da peça', colors, disabled, onSelect }: { label?: string; colors?: HairColorOverrides; disabled: boolean; onSelect: (colors: HairColorOverrides) => void }) {
  const scroll = (button: HTMLButtonElement, direction: number) => button.closest('.customizer-piece-palette')?.querySelector<HTMLElement>('.customizer-piece-palette-list')?.scrollBy({ left: direction * 150, behavior: 'smooth' })
  return <div className="customizer-piece-palette" aria-label={label}>
    <strong>{label}</strong>
    <div className="customizer-piece-palette-strip">
      <button className="customizer-hair-palette-scroll previous" type="button" aria-label="Paletas anteriores" onClick={(event) => scroll(event.currentTarget, -1)}><Icon name="chevronRight" /></button>
      <div className="customizer-hair-palette-preset-list customizer-piece-palette-list">
        {hairPalettePresets.map((preset) => <button key={preset.name} type="button" disabled={disabled} aria-pressed={hairColorControls.every((color) => colors?.[color.id] === preset.colors[color.id])} onClick={() => onSelect(preset.colors)} title={`Aplicar ${preset.name}`}><span style={{ background: `linear-gradient(115deg, ${preset.colors.highlight} 0 23%, ${preset.colors.base} 23% 65%, ${preset.colors.fade} 65% 84%, ${preset.colors.outline} 84%)` }} />{preset.name}</button>)}
      </div>
      <button className="customizer-hair-palette-scroll" type="button" aria-label="Próximas paletas" onClick={(event) => scroll(event.currentTarget, 1)}><Icon name="chevronRight" /></button>
    </div>
  </div>
}
const adjustableHairPartIds = new Set<string>(['backHair', 'rearHair', 'ponytail', 'frontHair', 'ahoge'])
function hairAppearancePartStyleId(appearance: NonNullable<CustomizerCharacter['customization']['hairAppearance']> | undefined, part: HairPartId): string | null {
  if (appearance?.parts && Object.prototype.hasOwnProperty.call(appearance.parts, part)) return appearance.parts[part] ?? null
  if (part === 'backHair') return hairAppearanceStyleId(appearance, 'back')
  if (part === 'rearHair') return appearance?.parts?.frontHair ?? hairAppearanceStyleId(appearance, 'front')
  return null
}

type WardrobePanel = { id: CustomizerWardrobePaletteKey; label: string; category: ClothingGroupCategory; side: 'left' | 'right' | null; source?: WardrobeCategory[] }
const upperWardrobePanels: WardrobePanel[] = [
  { id: 'shirt', label: 'Camisa', category: 'camisa', side: null },
  { id: 'jacket', label: 'Jaqueta', category: 'jaqueta', side: null },
  { id: 'upper-left', label: 'Manga superior esquerda', category: 'manga-superior', side: 'left' },
  { id: 'upper-right', label: 'Manga superior direita', category: 'manga-superior', side: 'right' },
  { id: 'lower-left', label: 'Manga inferior esquerda', category: 'manga-inferior', side: 'left' },
  { id: 'lower-right', label: 'Manga inferior direita', category: 'manga-inferior', side: 'right' }
]
const upperWardrobePageTwoPanels: WardrobePanel[] = [
  { id: 'gloves-left', label: 'Luvas esquerda', category: 'luvas', side: 'left' },
  { id: 'gloves-right', label: 'Luvas direita', category: 'luvas', side: 'right' },
  { id: 'cape', label: 'Capa', category: 'capa', side: null },
  { id: 'belt', label: 'Cinto', category: 'cinto', side: null },
  { id: 'skirt', label: 'Saia superior', category: 'saia-superior', side: null, source: ['saia'] }
]
const accessoryWardrobePanels: WardrobePanel[] = [
  { id: 'glasses', label: 'Óculos', category: 'oculos', side: null },
  { id: 'head-accessory', label: 'Acessório de cabeça', category: 'acessorio-cabeca', side: null }
]
const lowerWardrobePanels: WardrobePanel[] = [
  { id: 'pants-left', label: 'Calça', category: 'calca', side: null, source: ['calca-coxa', 'calca-canela'] },
  { id: 'shorts-right', label: 'Bermuda', category: 'calca', side: null, source: ['shorts'] },
  { id: 'sock-left', label: 'Esquerda Meia', category: 'meia', side: 'left' },
  { id: 'sock-right', label: 'Direita Meia', category: 'meia', side: 'right' },
  { id: 'shoe-left', label: 'Esquerda Sapato', category: 'sapato', side: 'left' },
  { id: 'shoe-right', label: 'Direita Sapato', category: 'sapato', side: 'right' }
]
const lowerWardrobePageTwoPanels: WardrobePanel[] = [
  { id: 'lower-skirt', label: 'Saia inferior', category: 'saia-inferior', side: null, source: ['saia'] }
]
function wardrobeComponentMatchesPanel(component: WardrobeSet['components'][number], panel: WardrobePanel): boolean {
  if (panel.source ? !panel.source.includes(component.category) : component.category !== panel.category) return false
  if (!panel.side) return true
  const sideHint = `${component.name} ${component.attachedPartId}`.toLocaleLowerCase()
  const left = /\besquerd[oa]\b|\bleft\b/.test(sideHint)
  const right = /\bdireit[oa]\b|\bright\b/.test(sideHint)
  return panel.side === 'left' ? left && !right : right && !left
}

type WardrobePanelCandidate = { summary: WardrobeSetSummary; set: WardrobeSet; component: WardrobeSet['components'][number]; components: WardrobeSet['components']; headExtraAsset?: FaceComponentAsset }

function isWardrobePanelCandidateSelected(candidate: WardrobePanelCandidate, panel: WardrobePanel, groups: CustomizerWardrobeGroup[], appearance?: CustomizerFaceAppearance): boolean {
  if (candidate.headExtraAsset) return appearance?.modelSlot === candidate.summary.modelSlot && appearance.headExtras?.glasses === candidate.headExtraAsset.id
  return candidate.components.every((component) => groups.some((group) => group.modelSlot === candidate.summary.modelSlot && group.setId === candidate.summary.id && group.category === panel.category && group.componentId === component.id))
}

async function renderWardrobeThumbnail(set: WardrobeSet, categories: WardrobeCategory[], componentIds?: string[], resolution = 112): Promise<string | null> {
  const allowedIds = componentIds ? new Set(componentIds) : null
  const pieces = set.components.filter((component) => categories.includes(component.category) && (!allowedIds || allowedIds.has(component.id)))
  if (!pieces.length) return null
  const left = Math.min(...pieces.map((piece) => piece.x))
  const top = Math.min(...pieces.map((piece) => piece.y))
  const right = Math.max(...pieces.map((piece) => piece.x + piece.width))
  const bottom = Math.max(...pieces.map((piece) => piece.y + piece.height))
  const scale = Math.min(resolution / Math.max(1, right - left), resolution / Math.max(1, bottom - top))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil((right - left) * scale))
  canvas.height = Math.max(1, Math.ceil((bottom - top) * scale))
  const context = canvas.getContext('2d')
  if (context) configureCharacterSampling(context)
  if (!context) return null
  for (const piece of pieces) {
    try {
      const image = await loadCachedImage(piece.dataUrl)
      context.save()
      context.translate((piece.x - left + piece.width / 2) * scale, (piece.y - top + piece.height / 2) * scale)
      context.rotate(piece.rotation * Math.PI / 180)
      context.drawImage(image, -piece.width * scale / 2, -piece.height * scale / 2, piece.width * scale, piece.height * scale)
      context.restore()
    } catch { continue }
  }
  return canvas.toDataURL('image/png')
}

function WardrobePanelCandidatePreview({ candidate, colors }: { candidate: WardrobePanelCandidate; colors?: HairColorOverrides }) {
  const [source, setSource] = useState<string | null>(null)
  const componentIds = candidate.components.map((component) => component.id)
  useEffect(() => {
    let active = true
    void renderWardrobeThumbnail(candidate.set, candidate.components.map((component) => component.category), componentIds, 512)
      .then((thumbnail) => { if (active) setSource(thumbnail) })
    return () => { active = false }
  }, [candidate.set, componentIds.join(':')])
  return <HairAssetPreview source={source ?? candidate.component.dataUrl} colors={colors} alt={candidate.component.name} />
}

async function renderFaceCatalogOverlay(artwork: CatalogArtwork, source: FabricatorProject, items: Partial<Record<FaceSheetKind | FaceElementKind, FaceCatalogItem>>, appearance: CustomizerFaceAppearance, skinTone?: string, studioFaceTransforms?: StudioFaceTransforms, maxSize = Math.max(artwork.width, artwork.height), expressionEffects?: FaceExpressionEffects, headOverrides: CustomizerCharacter['customization']['partOverrides'] = {}, highlightedHeadId?: string | null): Promise<string | null> {
  const canvas = document.createElement('canvas')
  const pixelScale = Math.min(maxSize / Math.max(artwork.width, artwork.height), Math.sqrt(MAX_CHARACTER_PREVIEW_PIXELS / (artwork.width * artwork.height)))
  canvas.width = Math.max(1, Math.ceil(artwork.width * pixelScale))
  canvas.height = Math.max(1, Math.ceil(artwork.height * pixelScale))
  const context = canvas.getContext('2d')
  if (context) configureCharacterSampling(context)
  if (!context) return null
  context.scale(pixelScale, pixelScale)
  await drawFaceCatalogOverlay(context, artwork, source, items, appearance, skinTone, studioFaceTransforms, expressionEffects, undefined, undefined, headOverrides, highlightedHeadId)
  return canvas.toDataURL('image/png')
}

const modules: { name: string; icon: IconName; detail: string }[] = [
  { name: 'Modelos', icon: 'sparkles', detail: 'Looks prontos para começar' },
  { name: 'Poses', icon: 'body', detail: 'Pose, proporções e detalhes' },
  { name: 'Cabeça', icon: 'face', detail: 'Rosto, cabelo e expressões' },
  { name: 'Cabelos', icon: 'bow', detail: 'Biblioteca de cabelos do personagem' },
  { name: 'Roupas', icon: 'shirt', detail: 'Monte um visual único' },
  { name: 'Acessórios', icon: 'flower', detail: 'Peças e objetos de cena' },
  { name: 'Objetos', icon: 'box', detail: 'Itens para compor a cena' },
  { name: 'Perfil', icon: 'user', detail: 'Informações do personagem' }
]

const customizerTopTabs: { id: string; label: string }[] = [
  { id: 'modelos', label: 'Modelos' },
  { id: 'corpo', label: 'Corpo' },
  { id: 'cabeca', label: 'Cabeça' },
  { id: 'roupas', label: 'Roupas' },
  { id: 'outros', label: 'Outros' },
  { id: 'perfil', label: 'Perfil' }
]

const customizerHeadTabs = [
  { id: 'hair', label: 'Cabelo', icon: 'bow' },
  { id: 'eyes', label: 'Olhos', icon: 'face' },
  { id: 'face', label: 'Rosto', icon: 'face' },
  { id: 'extra', label: 'Extras', icon: 'sparkles' },
  { id: 'adjust', label: 'Ajustar', icon: 'sliders' }
] as const

const customizerClothesTabs = [
  { id: 'hats', label: 'Chapéus', icon: 'sparkles' },
  { id: 'accessories', label: 'Acess.', icon: 'bow' },
  { id: 'upper', label: 'Superior', icon: 'shirt' },
  { id: 'lower', label: 'Inferior', icon: 'body' },
  { id: 'other', label: 'Outros', icon: 'flower' },
  { id: 'extra', label: 'Extra', icon: 'sparkles' },
  { id: 'adjust', label: 'Ajustar', icon: 'sliders' }
] as const

function clothesAdjustmentDefinitions(tab: Exclude<(typeof customizerClothesTabs)[number]['id'], 'adjust'>) {
  if (tab === 'upper') return clothingCategories.Superior
  if (tab === 'lower') return clothingCategories.Inferior
  if (tab === 'accessories') return clothingCategories.Superior.filter((item) => item.id === 'oculos' || item.id === 'acessorio-cabeca')
  if (tab === 'other') return clothingCategories.Superior.filter((item) => item.id === 'luvas' || item.id === 'capa' || item.id === 'cinto' || item.id === 'saia-superior')
  return []
}

function headAdjustmentItemsFor(tab: Exclude<(typeof customizerHeadTabs)[number]['id'], 'adjust'>) {
  const ids = tab === 'hair' ? new Set(['backHair', 'rearHair', 'ponytail', 'frontHair', 'ahoge'])
    : tab === 'eyes' ? new Set(['eye-left', 'eye-right', 'pupil-left', 'pupil-right', 'brow-left', 'brow-right', 'eye-highlight-left', 'eye-highlight-right'])
      : tab === 'face' ? new Set(['nose', 'mouth', 'blush', 'facial-shadow'])
        : new Set(['oculos', 'acessorio-cabeca'])
  return headAdjustmentItems.filter((item) => ids.has(item.id))
}

const customizerOtherTabs = [
  { id: 'extra', label: 'Extra', icon: 'brush' },
  { id: 'extra2', label: 'Extra 2', icon: 'flower' },
  { id: 'hide', label: 'Ocultar', icon: 'eyeOff' },
  { id: 'text', label: 'Texto', icon: 'message' },
  { id: 'pets', label: 'Pets', icon: 'paw' },
  { id: 'objects', label: 'Objetos', icon: 'box' }
] as const

const headAdjustmentItems = [
  { id: 'backHair', label: 'Cabelo traseiro', icon: 'bow' },
  { id: 'rearHair', label: 'Cabelo posterior', icon: 'bow' },
  { id: 'ponytail', label: 'Rabo de cavalo', icon: 'bow' },
  { id: 'frontHair', label: 'Cabelo frontal', icon: 'bow' },
  { id: 'ahoge', label: 'Ahoge', icon: 'bow' },
  { id: 'eye-left', label: 'Olho esquerdo', icon: 'face' },
  { id: 'eye-right', label: 'Olho direito', icon: 'face' },
  { id: 'pupil-left', label: 'Pupila esquerda', icon: 'eye' },
  { id: 'pupil-right', label: 'Pupila direita', icon: 'eye' },
  { id: 'brow-left', label: 'Sobrancelha esquerda', icon: 'face' },
  { id: 'brow-right', label: 'Sobrancelha direita', icon: 'face' },
  { id: 'nose', label: 'Nariz', icon: 'face' },
  { id: 'mouth', label: 'Boca', icon: 'message' },
  { id: 'eye-highlight-left', label: 'Brilho do olho esquerdo', icon: 'sparkles' },
  { id: 'eye-highlight-right', label: 'Brilho do olho direito', icon: 'sparkles' },
  { id: 'blush', label: 'Blush', icon: 'flower' },
  { id: 'facial-shadow', label: 'Sombra facial', icon: 'brush' },
  { id: 'oculos', label: 'Óculos', icon: 'eye' },
  { id: 'acessorio-cabeca', label: 'Acessório de cabeça', icon: 'sparkles' }
] as const

function CustomizerCategoryIcon({ category }: { category: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return <svg viewBox="0 0 48 48" aria-hidden="true" {...common}>
    {category === 'modelos' && <>
      <rect x="13" y="8" width="27" height="32" rx="5" opacity=".65" />
      <rect x="7" y="12" width="27" height="32" rx="5" />
      <circle cx="20.5" cy="23" r="5" />
      <path d="M12.5 37c1.3-4.2 4.1-6.4 8-6.4s6.7 2.2 8 6.4" />
    </>}
    {category === 'corpo' && <>
      <circle cx="24" cy="9.5" r="5.5" />
      <path d="M17 18h14l4 10-5 3-2-4v15H20V27l-2 4-5-3 4-10Z" />
      <path d="m20 31-4 11m12-11 4 11M20 21l4 5 4-5" />
    </>}
    {category === 'cabeca' && <>
      <path d="M12 22c0-10 5-16 13-16 8.5 0 13 6.3 13 16v5c0 2.1-1.7 3.8-3.8 3.8-.7 4.7-4.8 8.2-9.2 8.2s-8.5-3.5-9.2-8.2A3.8 3.8 0 0 1 12 27v-5Z" />
      <path d="M12 22c.8-6 4.2-9 8-10 .4 3 2.4 4.8 5.5 5.4 2.7.5 5.3 2.1 7.2 4.6M19.5 27h.1m9-.1h.1M21 33c1.8 1.3 4.2 1.3 6 0" />
    </>}
    {category === 'roupas' && <>
      <path d="m17 9 7 3 7-3 10 7-5 9-5-2v18H17V23l-5 2-5-9 10-7Z" />
      <path d="m17 9 7 8 7-8M24 17v24" />
    </>}
    {category === 'outros' && <>
      <path d="m24 5 3.1 10.2L37 18.5l-9.9 3.2L24 32l-3.1-10.3-9.9-3.2 9.9-3.3L24 5Z" />
      <path d="m37 29 1.8 5.2L44 36l-5.2 1.8L37 43l-1.8-5.2L30 36l5.2-1.8L37 29ZM10 6l1.5 4.5L16 12l-4.5 1.5L10 18l-1.5-4.5L4 12l4.5-1.5L10 6Z" />
    </>}
    {category === 'perfil' && <>
      <rect x="7" y="6" width="34" height="36" rx="4" />
      <circle cx="18" cy="19" r="5" />
      <path d="M10.5 33c1.2-4 3.7-6 7.5-6s6.3 2 7.5 6M29 17h7m-7 6h7m-7 7h7m-18 8h18" />
    </>}
  </svg>
}

export function CustomizerPage() {
  const {
    characters, setCharacters, charactersRef, characterSaveQueue,
    selectedCharacterId, setSelectedCharacterId,
    charactersLoading, charactersError, setCharactersError,
    characterSaveState, setCharacterSaveState
  } = useCustomizerCharacterRoster()
  const [dialogMode, setDialogMode] = useState<'create' | 'rename' | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [savingCharacter, setSavingCharacter] = useState(false)
  const [activeModule, setActiveModule] = useState<string | null>(null)
  const [selectedCustomizerTopTab, setSelectedCustomizerTopTab] = useState('corpo')
  const [previewBackground, setPreviewBackground] = usePreviewBackground()
  const [customizerPreviewZoom, setCustomizerPreviewZoom] = useState(1.15)
  const [customizerPreviewPan, setCustomizerPreviewPan] = useState({ x: 0, y: 0 })
  const [previewExtent, setPreviewExtent] = useState({ width: 0, height: 0, density: window.devicePixelRatio || 1 })
  useEffect(() => {
    const update = () => {
      const stages = document.querySelectorAll<HTMLElement>('.customizer-preview-stage-wrap')
      const bounds = Array.from(stages, (stage) => stage.getBoundingClientRect())
      const width = Math.ceil(Math.max(0, ...bounds.map((rect) => rect.width - 136)))
      const height = Math.ceil(Math.max(0, ...bounds.map((rect) => rect.height - 130)))
      const density = window.devicePixelRatio || 1
      setPreviewExtent((current) => current.width === width && current.height === height && current.density === density ? current : { width, height, density })
    }
    const observer = new ResizeObserver(update)
    document.querySelectorAll('.customizer-preview-stage-wrap').forEach((stage) => observer.observe(stage))
    window.addEventListener('resize', update)
    update()
    return () => { observer.disconnect(); window.removeEventListener('resize', update) }
  }, [selectedCustomizerTopTab])

  const {
    rosterQuery, setRosterQuery, catalogModels, setCatalogModels,
    catalogPoses, setCatalogPoses, catalogLoading, setCatalogLoading,
    catalogError, setCatalogError, selectedCatalogModelSlot, setSelectedCatalogModelSlot,
    selectedCatalogPoseSlot, setSelectedCatalogPoseSlot, selectedPoseCategory, setSelectedPoseCategory,
    selectedPosePage, setSelectedPosePage, modelThumbnails, setModelThumbnails,
    poseThumbnails, setPoseThumbnails
  } = useCustomizerModelBrowserState()
  const [clothingSection, setClothingSection] = useState<'Customizar' | 'Superior' | 'Inferior'>('Superior')
  const [clothesPanelTab, setClothesPanelTab] = useState<(typeof customizerClothesTabs)[number]['id']>('upper')
  const [clothesCategorySelection, setClothesCategorySelection] = useState<Exclude<(typeof customizerClothesTabs)[number]['id'], 'adjust'>>('upper')
  const [upperWardrobePage, setUpperWardrobePage] = useState<1 | 2>(1)
  const [lowerWardrobePage, setLowerWardrobePage] = useState<1 | 2>(1)
  const [otherPanelTab, setOtherPanelTab] = useState<(typeof customizerOtherTabs)[number]['id']>('extra')
  const [wardrobeSets, setWardrobeSets] = useState<WardrobeSetSummary[]>([])
  const [wardrobeLoading, setWardrobeLoading] = useState(false)
  const [wardrobeDetails, setWardrobeDetails] = useState<Record<string, WardrobeSet>>({})
  const [wardrobeThumbnails, setWardrobeThumbnails] = useState<Record<string, string>>({})
  const [wardrobeLibraryPanel, setWardrobeLibraryPanel] = useState<WardrobePanel | null>(null)
  const [wardrobeLibraryPage, setWardrobeLibraryPage] = useState(0)
  const [faceCatalogItems, setFaceCatalogItems] = useState<FaceCatalogItemSummary[]>([])
  const [faceCatalogDetails, setFaceCatalogDetails] = useState<Record<string, FaceCatalogItem>>({})
  const [standardExpressionEffects, setStandardExpressionEffects] = useState<StandardExpressionEffects>({})
  const [faceComponentAssets, setFaceComponentAssets] = useState<FaceComponentAssetSummary[]>([])
  const [faceComponentDetails, setFaceComponentDetails] = useState<Record<string, FaceComponentAsset>>({})
  const [faceDetails, setFaceDetails] = useState<Record<string, FaceSet>>({})
  const [faceLoading, setFaceLoading] = useState(false)
  const [faceComponentLoading, setFaceComponentLoading] = useState(false)
  const [hairStyles, setHairStyles] = useState<HairStyleSummary[]>([])
  const [hairDetails, setHairDetails] = useState<Record<string, HairStyle>>({})
  const [hairCatalogSide, setHairCatalogSide] = useState<HairCatalogSide>('front')
  const [hairLoading, setHairLoading] = useState(false)
  const [hairLibraryPart, setHairLibraryPart] = useState<HairPartId | null>(null)
  const [hairLibraryPage, setHairLibraryPage] = useState(0)
  const [faceLibraryPart, setFaceLibraryPart] = useState<FaceLibraryPartId | null>(null)
  const [faceLibraryPage, setFaceLibraryPage] = useState(0)
  const [faceCatalogLibraryPart, setFaceCatalogLibraryPart] = useState<'nose' | 'eye-highlight-left' | 'mouth' | 'eye-highlight-right' | 'blush' | 'facial-shadow' | null>(null)
  const [faceCatalogLibraryPage, setFaceCatalogLibraryPage] = useState(0)
  const [headPanelTab, setHeadPanelTab] = useState<'hair' | 'eyes' | 'face' | 'extra' | 'adjust'>('hair')
  const [headCategorySelection, setHeadCategorySelection] = useState<'hair' | 'eyes' | 'face' | 'extra'>('hair')
  const [headAdjustSelection, setHeadAdjustSelection] = useState<string | null>(null)
  const [adjustmentPreviewHighlight, setAdjustmentPreviewHighlight] = useState<AdjustmentPreviewHighlight | null>(null)
  const [activeHairColorRole, setActiveHairColorRole] = useState<HairColorRole>('base')
  const [selectedClothing, setSelectedClothing] = useState<SelectedWardrobeComponent | null>(null)
  const [wardrobeTransformDraft, setWardrobeTransformDraft] = useState<Pick<CustomizerWardrobeGroup, 'offsetX' | 'offsetY' | 'scaleX' | 'scaleY' | 'rotation'> | null>(null)
  const [selectedWardrobeUrl, setSelectedWardrobeUrl] = useState<string | null>(null)
  const [selectedWardrobeAboveHairUrl, setSelectedWardrobeAboveHairUrl] = useState<string | null>(null)
  const [selectedArtworkProject, setSelectedArtworkProject] = useState<CatalogArtwork | null>(null)
  const [proportionEdit, setProportionEdit] = useState<{ characterId: string; values: CharacterProportions } | null>(null)
  const [bodyDimensionEdit, setBodyDimensionEdit] = useState<{ characterId: string; values: CharacterBodyDimensions } | null>(null)
  const [selectedSourceModelProject, setSelectedSourceModelProject] = useState<FabricatorProject | null>(null)
  const [originalSkinTone, setOriginalSkinTone] = useState<string | null>(null)
  const [selectedArtworkUrl, setSelectedArtworkUrl] = useState<string | null>(null)
  const [selectedFaceUrl, setSelectedFaceUrl] = useState<string | null>(null)
  const [selectedFrontHairUrl, setSelectedFrontHairUrl] = useState<string | null>(null)
  const [selectedArtworkLabel, setSelectedArtworkLabel] = useState('')
  const [previewLoading, setPreviewLoading] = useState(true)
  const thumbnailCache = useRef(new Set<string>())
  const hairPaletteStripRef = useRef<HTMLDivElement>(null)
  const wardrobePaletteStripRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const previewLoadRequest = useRef(0)
  const customizerPreviewStageRef = useRef<HTMLDivElement>(null)
  const mainPreviewStageRef = useRef<HTMLDivElement>(null)
  const customizerPreviewPanDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const clothingDragRef = useRef<{ pointerId: number; clientX: number; clientY: number; scaleX: number; scaleY: number; bone?: CatalogArtwork['parts'][number]; groupKey: string; characterId: string; beforeGroups: CustomizerWardrobeGroup[]; latest: CustomizerCharacter | null } | null>(null)
  const adjustmentLastTargetRef = useRef<AdjustmentPreviewHighlight | null>(null)
  const wardrobeTransformDirty = useRef(false)
  const selectedCharacter = characters.find((character) => character.id === selectedCharacterId) ?? characters[0] ?? null
  const activeHeadPreviewHighlight = activeModule === 'Cabeça' && headPanelTab === 'adjust' && adjustmentPreviewHighlight?.scope === 'head' ? adjustmentPreviewHighlight.id : null
  const activeFacePreviewHighlight = activeHeadPreviewHighlight && !adjustableHairPartIds.has(activeHeadPreviewHighlight) ? activeHeadPreviewHighlight : null
  const activeHairPreviewHighlight = activeHeadPreviewHighlight && adjustableHairPartIds.has(activeHeadPreviewHighlight) ? activeHeadPreviewHighlight : null
  const activeClothingPreviewHighlight = activeModule === 'Roupas' && clothesPanelTab === 'adjust' && adjustmentPreviewHighlight?.scope === 'clothing' ? adjustmentPreviewHighlight : null
  const activeWardrobePreviewHighlight = activeClothingPreviewHighlight ?? (activeHeadPreviewHighlight === 'oculos' || activeHeadPreviewHighlight === 'acessorio-cabeca' ? { scope: 'head' as const, id: activeHeadPreviewHighlight } : null)
  const selectAdjustmentPreviewTarget = (target: AdjustmentPreviewHighlight) => {
    const previous = adjustmentLastTargetRef.current
    const sameTarget = previous?.scope === target.scope && (target.scope === 'head'
      ? previous.scope === 'head' && previous.id === target.id
      : previous.scope === 'clothing' && previous.piece.modelSlot === target.piece.modelSlot && previous.piece.setId === target.piece.setId && previous.piece.category === target.piece.category && previous.piece.componentId === target.piece.componentId)
    adjustmentLastTargetRef.current = target
    if (!sameTarget) setAdjustmentPreviewHighlight(target)
  }
  useEffect(() => { adjustmentLastTargetRef.current = null; setAdjustmentPreviewHighlight(null) }, [selectedCharacter?.id, activeModule, headPanelTab, headCategorySelection, clothesPanelTab, clothesCategorySelection])
  const selectedSkinTone = selectedCharacter?.customization.modelSkinTone
  const activeProportions = proportionEdit && selectedCharacter && proportionEdit.characterId === selectedCharacter.id
    ? proportionEdit.values
    : getCharacterProportions(selectedCharacter?.customization)
  const activeBodyDimensions = useMemo(() => bodyDimensionEdit && selectedCharacter && bodyDimensionEdit.characterId === selectedCharacter.id
    ? bodyDimensionEdit.values
    : getCharacterBodyDimensions(selectedCharacter?.customization), [bodyDimensionEdit, selectedCharacter?.id, selectedCharacter?.customization.bodyDimensions])
  const activeShapeScale = characterShapeScale(activeProportions)
  const displayArtworkProject = useMemo(() => selectedArtworkProject ? applyCharacterBodyShape(withCharacterHeadSize(selectedArtworkProject, activeProportions), activeBodyDimensions) : null, [selectedArtworkProject, activeProportions.head, activeProportions.headWidth, activeProportions.headHeight, activeBodyDimensions])
  const previewStyle = { '--preview-background': previewBackground, '--character-scale-x': activeShapeScale.x, '--character-scale-y': activeShapeScale.y } as import('react').CSSProperties
  const customizerPreviewStyle = { ...previewStyle, '--preview-zoom': customizerPreviewZoom, '--preview-pan-x': `${customizerPreviewPan.x}px`, '--preview-pan-y': `${customizerPreviewPan.y}px` } as import('react').CSSProperties
  const characterWardrobeGroups = selectedCharacter?.customization.wardrobeGroups ?? []
  const characterFaceAppearance = selectedCharacter?.customization.faceAppearance
  const characterHairAppearance = selectedCharacter?.customization.hairAppearance

  useEffect(() => {
    setCustomizerPreviewPan({ x: 0, y: 0 })
    customizerPreviewPanDragRef.current = null
  }, [selectedCharacter?.id])

  function beginCustomizerPreviewPan(event: import('react').PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !selectedArtworkUrl) return
    const target = event.target
    if (target instanceof Element && target.closest('.customizer-preview-controls, .customizer-preview-identity, .customizer-preview-back')) return
    if (wardrobePreviewDraggable && target instanceof Element && target.closest('.customizer-wardrobe-overlay.draggable')) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    customizerPreviewPanDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: customizerPreviewPan.x,
      originY: customizerPreviewPan.y
    }
  }

  function moveCustomizerPreviewPan(event: import('react').PointerEvent<HTMLDivElement>) {
    const drag = customizerPreviewPanDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setCustomizerPreviewPan({ x: drag.originX + event.clientX - drag.startX, y: drag.originY + event.clientY - drag.startY })
  }

  function finishCustomizerPreviewPan(event: import('react').PointerEvent<HTMLDivElement>) {
    if (customizerPreviewPanDragRef.current?.pointerId !== event.pointerId) return
    customizerPreviewPanDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  useEffect(() => {
    let cancelled = false
    setOriginalSkinTone(null)
    if (selectedSourceModelProject) {
      void sampleOriginalSkinTone(selectedSourceModelProject)
        .then((tone) => { if (!cancelled) setOriginalSkinTone(tone) })
        .catch(() => { if (!cancelled) setOriginalSkinTone(null) })
    }
    return () => { cancelled = true }
  }, [selectedSourceModelProject])
  const characterWardrobeHydrationKey = characterWardrobeGroups.map((group) => `${group.modelSlot}:${group.setId}:${group.category}:${group.componentId ?? ''}`).sort().join('|')
  const visibleCharacters = characters
    .filter((character) => character.name.toLowerCase().includes(rosterQuery.trim().toLowerCase()))

  useEffect(() => {
    let cancelled = false
    void Promise.all([window.desktop.listFabricatorSlots(), window.desktop.listFabricatorPoseSlots()])
      .then(async ([models, poses]) => {
        if (cancelled) return
        setCatalogModels(models)
        setCatalogPoses(poses)
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível carregar o catálogo.')
          setPreviewLoading(false)
        }
      })
      .finally(() => { if (!cancelled) setCatalogLoading(false) })
    return () => {
      cancelled = true
      previewLoadRequest.current += 1
    }
  }, [])

  useEffect(() => {
    if (catalogLoading) return
    if (!selectedCharacter) {
      setSelectedCatalogModelSlot(null)
      setSelectedCatalogPoseSlot(null)
      setSelectedPoseCategory('Parado')
      setSelectedPosePage(0)
      setSelectedArtworkUrl(null)
      setSelectedArtworkLabel('')
      setSelectedArtworkProject(null)
      setSelectedSourceModelProject(null)
      setSelectedWardrobeUrl(null)
      setSelectedWardrobeAboveHairUrl(null)
      setPreviewLoading(false)
      return
    }
    const model = catalogModels.find((item) => item?.slot === selectedCharacter.customization.modelSlot)
      ?? catalogModels.find((item) => item?.slot === 1)
      ?? catalogModels.find((item) => item !== null)
    if (!model) {
      setSelectedCatalogModelSlot(null)
      setSelectedCatalogPoseSlot(null)
      setSelectedPoseCategory('Parado')
      setSelectedPosePage(0)
      setSelectedArtworkUrl(null)
      setSelectedArtworkLabel('')
      setSelectedArtworkProject(null)
      setSelectedSourceModelProject(null)
      setSelectedWardrobeUrl(null)
      setSelectedWardrobeAboveHairUrl(null)
      setPreviewLoading(false)
      return
    }
    const requestedPose = selectedCharacter.customization.poseSlot
    const pose = requestedPose === null ? null : catalogPoses.find((item) => item?.sourceModelSlot === model.slot && item.slot === requestedPose)
    const requestId = ++previewLoadRequest.current
    let cancelled = false
    setSelectedCatalogModelSlot(model.slot)
    setSelectedPosePage(0)
    setSelectedCatalogPoseSlot(pose?.slot ?? null)
    setSelectedPoseCategory(pose ? resolvePoseCategory(pose) : 'Parado')
    setSelectedArtworkLabel(pose?.name ?? model.name)
    setSelectedArtworkUrl(null)
    setPreviewLoading(true)
    void (async () => {
      try {
        const sourceProject = await window.desktop.loadFabricatorSlot(model.slot)
        if (!sourceProject) throw new Error('O modelo de referência não está disponível no Fabricador Dev.')
        const poseArtwork = pose ? await window.desktop.loadFabricatorPose(model.slot, pose.slot) : null
        const artwork = selectCharacterArtwork(sourceProject, poseArtwork, pose?.slot ?? null)
        if (!artwork) throw new Error('Não foi possível carregar a prévia deste personagem.')
        if (!cancelled && previewLoadRequest.current === requestId) { setSelectedArtworkProject(artwork); setSelectedSourceModelProject(sourceProject) }
        const artworkUrl = await renderArtwork(applyCharacterBodyShape(withCharacterHeadSize(artwork, activeProportions), activeBodyDimensions), characterRenderSize(artwork.width, artwork.height, previewExtent.width, previewExtent.height, customizerPreviewZoom, previewExtent.density), selectedCharacter.customization.modelSkinTone)
        if (!await preparePreviewImage(artworkUrl)) throw new Error('A prévia nova não pôde ser decodificada; mantendo a imagem anterior.')
        if (!cancelled && previewLoadRequest.current === requestId) setSelectedArtworkUrl(artworkUrl)
      } catch (reason) {
        if (!cancelled && previewLoadRequest.current === requestId) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível carregar a prévia.')
      } finally {
        if (!cancelled && previewLoadRequest.current === requestId) setPreviewLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [catalogLoading, catalogModels, catalogPoses, selectedCharacter?.id, selectedCharacter?.customization.modelSkinTone, previewExtent, customizerPreviewZoom])

  useEffect(() => {
    setSelectedClothing(null)
  }, [selectedCharacter?.id])

  useEffect(() => {
    if (!selectedCharacter || selectedClothing || activeModule === 'Roupas' && clothesPanelTab === 'adjust') return
    const firstGroup = selectedCharacter?.customization.wardrobeGroups?.[0]
    const firstSet = firstGroup ? wardrobeDetails[`${firstGroup.modelSlot}:${firstGroup.setId}`] : undefined
    const firstDefinition = firstGroup ? Object.values(clothingCategories).flat().find((item) => item.id === firstGroup.category) : undefined
    const firstComponent = firstGroup && firstSet
      ? firstGroup.componentId
        ? firstSet.components.find((component) => component.id === firstGroup.componentId)
        : firstSet.components.find((component) => firstDefinition?.source.includes(component.category))
      : undefined
    setSelectedClothing(firstGroup && firstComponent ? { modelSlot: firstGroup.modelSlot, setId: firstGroup.setId, category: firstGroup.category, componentId: firstComponent.id } : null)
  }, [activeModule, clothesPanelTab, selectedCharacter?.id, selectedCharacter?.customization.wardrobeGroups, selectedClothing, wardrobeDetails])

  useEffect(() => {
    if (!selectedCharacter || activeModule !== 'Roupas' || clothesPanelTab !== 'adjust') return
    const definitions = clothesAdjustmentDefinitions(clothesCategorySelection)
    const categoryIds = new Set(definitions.map((item) => item.id))
    const groups = (selectedCharacter.customization.wardrobeGroups ?? []).filter((group) => categoryIds.has(group.category))
    if (!groups.length) {
      setSelectedClothing(null)
      return
    }
    const currentSelectionStillInScope = selectedClothing && groups.some((group) => group.modelSlot === selectedClothing.modelSlot && group.setId === selectedClothing.setId && group.category === selectedClothing.category && (group.componentId === selectedClothing.componentId || !group.componentId))
    if (currentSelectionStillInScope) {
      return
    }
    const firstGroup = groups[0]
    const set = wardrobeDetails[`${firstGroup.modelSlot}:${firstGroup.setId}`]
    const definition = definitions.find((item) => item.id === firstGroup.category)
    const component = set && (firstGroup.componentId
      ? set.components.find((piece) => piece.id === firstGroup.componentId)
      : set.components.find((piece) => definition?.source.includes(piece.category)))
    if (firstGroup.componentId || component) {
      setSelectedClothing({ modelSlot: firstGroup.modelSlot, setId: firstGroup.setId, category: firstGroup.category, componentId: component?.id ?? firstGroup.componentId! })
    }
  }, [activeModule, clothesPanelTab, clothesCategorySelection, selectedCharacter?.id, selectedCharacter?.customization.wardrobeGroups, selectedClothing?.modelSlot, selectedClothing?.setId, selectedClothing?.category, selectedClothing?.componentId, wardrobeDetails])

  useEffect(() => {
    const group = selectedClothing
      ? selectedCharacter?.customization.wardrobeGroups?.find((item) => item.modelSlot === selectedClothing.modelSlot && item.setId === selectedClothing.setId && item.category === selectedClothing.category && (item.componentId === selectedClothing.componentId || !item.componentId))
      : undefined
    wardrobeTransformDirty.current = false
    setWardrobeTransformDraft(group ? { offsetX: group.offsetX, offsetY: group.offsetY, scaleX: group.scaleX, scaleY: group.scaleY, rotation: group.rotation } : null)
  }, [selectedCharacter?.id, selectedCharacter?.customization.wardrobeGroups, selectedClothing?.modelSlot, selectedClothing?.setId, selectedClothing?.category, selectedClothing?.componentId])

  useEffect(() => {
    if (activeModule !== 'Modelos' || catalogLoading) return
    let cancelled = false
    void (async () => {
      for (const model of catalogModels) {
        if (!model || thumbnailCache.current.has(`model:${model.slot}`)) continue
        let artwork: CatalogArtwork | null = null
        const firstPose = catalogPoses.find((pose) => pose?.sourceModelSlot === model.slot && pose.slot === 1)
        try {
          if (firstPose) artwork = await window.desktop.loadFabricatorPose(model.slot, 1)
          if (!artwork) artwork = await window.desktop.loadFabricatorSlot(model.slot)
          if (!artwork) continue
          const thumbnail = await renderArtwork(artwork, 144)
          if (cancelled) return
          if (thumbnail) {
            thumbnailCache.current.add(`model:${model.slot}`)
            setModelThumbnails((current) => ({ ...current, [model.slot]: thumbnail }))
          }
        } catch (reason) {
          if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível gerar uma miniatura do modelo.')
        }
      }
    })()
    return () => { cancelled = true }
  }, [activeModule, catalogLoading, catalogModels, catalogPoses])

  useEffect(() => {
    if ((activeModule !== 'Poses' && selectedCustomizerTopTab !== 'modelos') || selectedCatalogModelSlot === null || catalogLoading) return
    let cancelled = false
    const modelPoses = catalogPoses.filter((pose): pose is NonNullable<typeof pose> => pose?.sourceModelSlot === selectedCatalogModelSlot)
    void (async () => {
      for (const pose of modelPoses) {
        const key = `${pose.sourceModelSlot}:${pose.slot}`
        const cacheKey = `pose-tight-v2:${key}:${pose.updatedAt}`
        if (thumbnailCache.current.has(cacheKey)) continue
        try {
          const artwork: FabricatorPose | null = await window.desktop.loadFabricatorPose(pose.sourceModelSlot, pose.slot)
          if (!artwork) continue
          const thumbnail = await renderArtwork(artwork, 420, undefined, true)
          if (cancelled) return
          if (thumbnail) {
            thumbnailCache.current.add(cacheKey)
            setPoseThumbnails((current) => ({ ...current, [key]: thumbnail }))
          }
        } catch (reason) {
          if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível gerar uma miniatura da pose.')
        }
      }
    })()
    return () => { cancelled = true }
  }, [activeModule, catalogLoading, catalogPoses, selectedCatalogModelSlot, selectedCustomizerTopTab])

  useEffect(() => {
    const wardrobeCatalogVisible = activeModule === 'Roupas' || activeModule === 'Cabeça' && headPanelTab === 'extra'
    if (!wardrobeCatalogVisible || selectedCatalogModelSlot === null) return
    let cancelled = false
    setWardrobeLoading(true)
    void window.desktop.listWardrobeSets(selectedCatalogModelSlot).then((sets) => {
      if (!cancelled) setWardrobeSets(sets)
    }).catch((reason: unknown) => {
      if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível carregar o catálogo de roupas.')
    }).finally(() => { if (!cancelled) setWardrobeLoading(false) })
    return () => { cancelled = true }
  }, [activeModule, headPanelTab, selectedCatalogModelSlot])

  useEffect(() => {
    if (selectedCatalogModelSlot === null) { setFaceCatalogItems([]); return }
    let cancelled = false
    setFaceLoading(true)
    void window.desktop.listFaceCatalog(selectedCatalogModelSlot).then(async (summaries) => {
      if (cancelled) return
      setFaceCatalogItems(summaries)
      const loaded = await Promise.all(summaries.map(async (summary) => ({ key: `${summary.modelSlot}:${summary.id}`, item: await window.desktop.loadFaceCatalogItem(summary.modelSlot, summary.id) })))
      if (cancelled) return
      setFaceCatalogDetails((current) => {
        const next = { ...current }
        for (const entry of loaded) if (entry.item) next[entry.key] = entry.item
        return next
      })
    }).catch((reason: unknown) => {
      if (!cancelled && activeModule === 'Cabeça') setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível carregar os rostos salvos.')
    }).finally(() => { if (!cancelled) setFaceLoading(false) })
    return () => { cancelled = true }
  }, [selectedCatalogModelSlot, activeModule])

  useEffect(() => {
    if (selectedCatalogModelSlot === null) { setStandardExpressionEffects({}); return }
    let cancelled = false
    void loadStandardExpressionEffects(selectedCatalogModelSlot).then((effects) => {
      if (!cancelled) setStandardExpressionEffects(effects)
    }).catch((reason: unknown) => {
      if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível carregar os ajustes das expressões.')
    })
    return () => { cancelled = true }
  }, [selectedCatalogModelSlot])

  useEffect(() => {
    if (selectedCatalogModelSlot === null) { setFaceComponentAssets([]); setFaceComponentDetails({}); setFaceComponentLoading(false); return }
    let cancelled = false
    setFaceComponentLoading(true)
    void window.desktop.listFaceComponentAssets(selectedCatalogModelSlot).then(async (summaries) => {
      const details = await Promise.all(summaries.map((summary) => window.desktop.loadFaceComponentAsset(selectedCatalogModelSlot, summary.id)))
      if (cancelled) return
      setFaceComponentAssets(summaries)
      setFaceComponentDetails(Object.fromEntries(details.filter((item): item is FaceComponentAsset => Boolean(item)).map((item) => [item.id, item])))
    }).catch((reason: unknown) => { if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível carregar os assets faciais.') }).finally(() => { if (!cancelled) setFaceComponentLoading(false) })
    return () => { cancelled = true }
  }, [selectedCatalogModelSlot])

  useEffect(() => {
    const appearance = characterFaceAppearance
    if (!appearance?.setId || appearance.modelSlot !== selectedCatalogModelSlot) return
    let cancelled = false
    const key = `${appearance.modelSlot}:${appearance.setId}`
    if (faceDetails[key]) return
    void window.desktop.loadFaceSet(appearance.modelSlot, appearance.setId).then((face) => {
      if (!cancelled && face) setFaceDetails((current) => ({ ...current, [key]: face }))
    }).catch((reason: unknown) => {
      if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível carregar o rosto legado.')
    })
    return () => { cancelled = true }
  }, [characterFaceAppearance, faceDetails, selectedCatalogModelSlot])

  useEffect(() => {
    if (selectedCatalogModelSlot === null || !(activeModule === 'Cabelos' || activeModule === 'Cabeça' && headPanelTab === 'hair')) { setHairStyles([]); return }
    let cancelled = false
    setHairLoading(true)
    void window.desktop.listHairStyles(selectedCatalogModelSlot).then(async (summaries) => {
      const styles = await Promise.all(summaries.map((summary) => window.desktop.loadHairStyle(selectedCatalogModelSlot, summary.id)))
      if (cancelled) return
      setHairStyles(summaries)
      setHairDetails((current) => {
        const next = { ...current }
        for (const style of styles) if (style) next[`${selectedCatalogModelSlot}:${style.id}`] = style
        return next
      })
    }).catch((reason: unknown) => {
      if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível carregar o catálogo de cabelos.')
    }).finally(() => { if (!cancelled) setHairLoading(false) })
    return () => { cancelled = true }
  }, [activeModule, headPanelTab, selectedCatalogModelSlot])

  useEffect(() => {
    let cancelled = false
    const appearance = characterFaceAppearance
    const hasCatalogSelection = Boolean(appearance?.eyeCatalogId || appearance?.eyeLeftCatalogId || appearance?.eyeRightCatalogId || appearance?.eyebrowCatalogId || appearance?.eyebrowLeftCatalogId || appearance?.eyebrowRightCatalogId || appearance?.noseCatalogId || appearance?.mouthClosedCatalogId || appearance?.mouthOpenCatalogId || Object.values(appearance?.components ?? {}).some((component) => component?.assetId) || Object.values(appearance?.faceDetails ?? {}).some(Boolean) || Object.values(appearance?.headExtras ?? {}).some(Boolean))
    const face = appearance?.setId ? faceDetails[`${appearance.modelSlot}:${appearance.setId}`] : null
    const catalogItems: Partial<Record<FaceSheetKind | FaceElementKind, FaceCatalogItem>> = {}
    if (appearance && hasCatalogSelection) {
      const ids: Partial<Record<FaceSheetKind | FaceElementKind, string | undefined>> = { eyes: appearance.eyeCatalogId, 'eye-left': appearance.eyeLeftCatalogId ?? undefined, 'eye-right': appearance.eyeRightCatalogId ?? undefined, eyebrows: appearance.eyebrowCatalogId, 'brow-left': appearance.eyebrowLeftCatalogId ?? undefined, 'brow-right': appearance.eyebrowRightCatalogId ?? undefined, nose: appearance.noseCatalogId, 'mouth-closed': appearance.mouthClosedCatalogId, 'mouth-open': appearance.mouthOpenCatalogId }
      for (const [category, id] of Object.entries(ids) as Array<[FaceSheetKind | FaceElementKind, string | undefined]>) {
        if (!id) continue
        const item = faceCatalogDetails[`${appearance.modelSlot}:${id}`]
        if (item) catalogItems[category] = item
      }
    }
    if (!displayArtworkProject || !selectedSourceModelProject || !appearance || (!hasCatalogSelection && !face)) { setSelectedFaceUrl(null); return }
    const render = hasCatalogSelection
      ? renderFaceCatalogOverlay(displayArtworkProject, selectedSourceModelProject, catalogItems, appearance, selectedCharacter?.customization.modelSkinTone, undefined, characterRenderSize(displayArtworkProject.width, displayArtworkProject.height, previewExtent.width, previewExtent.height, customizerPreviewZoom, previewExtent.density), standardExpressionEffects[appearance.expressionIndex], selectedCharacter?.customization.partOverrides, activeFacePreviewHighlight)
      : renderFaceOverlay(displayArtworkProject, selectedSourceModelProject, face, appearance, characterRenderSize(displayArtworkProject.width, displayArtworkProject.height, previewExtent.width, previewExtent.height, customizerPreviewZoom, previewExtent.density), selectedCharacter?.customization.partOverrides, activeFacePreviewHighlight)
    void render.then(async (url) => {
      if (!await preparePreviewImage(url)) return
      if (!cancelled) setSelectedFaceUrl(url)
    }).catch((reason: unknown) => {
      if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível montar o rosto do personagem.')
    })
    return () => { cancelled = true }
  }, [characterFaceAppearance, faceCatalogDetails, faceDetails, displayArtworkProject, selectedSourceModelProject, selectedCharacter?.customization.modelSkinTone, selectedCharacter?.customization.partOverrides, previewExtent, customizerPreviewZoom, standardExpressionEffects, activeFacePreviewHighlight])

  useEffect(() => {
    let cancelled = false
    const artwork = displayArtworkProject
    const source = selectedSourceModelProject
    const appearance = selectedCharacter?.customization.hairAppearance
    if (!artwork || !source) return
    void (async () => {
      const [backStyles, posteriorStyles, fringeStyles] = await Promise.all([
        loadHairAppearanceLayers(appearance, source.slot, 'back', hairDetails),
        loadHairAppearanceLayers(appearance, source.slot, 'front', hairDetails),
        loadHairAppearanceLayers(appearance, source.slot, 'fringe', hairDetails)
      ])
      const frontStyles = [...posteriorStyles, ...fringeStyles]
      if (cancelled) return
      const newlyLoaded: Record<string, HairStyle> = {}
      for (const layer of [...backStyles, ...frontStyles]) if (!hairDetails[`${source.slot}:${layer.style.id}`]) newlyLoaded[`${source.slot}:${layer.style.id}`] = layer.style
      if (Object.keys(newlyLoaded).length) setHairDetails((current) => ({ ...current, ...newlyLoaded }))
      const [url, frontUrl] = await Promise.all([
        renderArtworkWithHair(artwork, source, backStyles, characterRenderSize(artwork.width, artwork.height, previewExtent.width, previewExtent.height, customizerPreviewZoom, previewExtent.density), selectedCharacter?.customization.modelSkinTone, appearance?.modelSlot === source.slot ? appearance : undefined, undefined, selectedCharacter?.customization.partOverrides, activeHairPreviewHighlight),
        renderFrontHairOverlay(artwork, source, frontStyles, characterRenderSize(artwork.width, artwork.height, previewExtent.width, previewExtent.height, customizerPreviewZoom, previewExtent.density), appearance?.modelSlot === source.slot ? appearance : undefined, undefined, selectedCharacter?.customization.partOverrides, activeHairPreviewHighlight)
      ])
      const [artworkReady, frontHairReady] = await Promise.all([preparePreviewImage(url), preparePreviewImage(frontUrl)])
      if (!artworkReady || !frontHairReady) return
      if (!cancelled) { setSelectedArtworkUrl(url); setSelectedFrontHairUrl(frontUrl) }
    })().catch((reason: unknown) => {
      if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível montar o cabelo do personagem.')
    })
    return () => { cancelled = true }
  }, [displayArtworkProject, selectedSourceModelProject, selectedCharacter?.id, selectedCharacter?.customization.hairAppearance, selectedCharacter?.customization.modelSkinTone, hairDetails, previewExtent, customizerPreviewZoom, activeHairPreviewHighlight])

  useEffect(() => {
    const wardrobeCatalogVisible = activeModule === 'Roupas' || activeModule === 'Cabeça' && headPanelTab === 'extra'
    if (!wardrobeCatalogVisible || !wardrobeSets.length) return
    let cancelled = false
    void (async () => {
      for (const summary of wardrobeSets) {
        let set: WardrobeSet | null = null
        try {
          set = await window.desktop.loadWardrobeSet(summary.modelSlot, summary.id)
          if (!set || cancelled) continue
          setWardrobeDetails((current) => ({ ...current, [`${summary.modelSlot}:${summary.id}`]: set! }))
          for (const group of Object.values(clothingCategories).flat()) {
            if (!set.components.some((component) => group.source.includes(component.category))) continue
            const key = `${summary.modelSlot}:${summary.id}:${group.id}`
            if (wardrobeThumbnails[key]) continue
            const thumbnail = await renderWardrobeThumbnail(set, group.source)
            if (cancelled) return
            if (thumbnail) setWardrobeThumbnails((current) => ({ ...current, [key]: thumbnail }))
          }
        } catch (reason) {
          if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível montar a miniatura da roupa.')
        }
      }
    })()
    return () => { cancelled = true }
  }, [activeModule, headPanelTab, wardrobeSets])

  useEffect(() => {
    if (!selectedCharacter || !characterWardrobeGroups.length) return
    let cancelled = false
    const groupsToRestore = [...characterWardrobeGroups]
    void (async () => {
      const restored = await Promise.all(groupsToRestore.map(async (group) => {
        const key = `${group.modelSlot}:${group.setId}`
        const set = await window.desktop.loadWardrobeSet(group.modelSlot, group.setId)
        return { group, key, set }
      }))
      if (!cancelled && restored.some(({ set }) => !set)) {
        setCatalogError(`Há roupas equipadas sem conjunto disponível no Fabricador Dev: ${restored.filter(({ set }) => !set).map(({ key }) => key).join(', ')}. Verifique a biblioteca antes de editar o personagem.`)
      }
      if (cancelled) return
      setWardrobeDetails((current) => {
        const next = { ...current }
        for (const { key, set } of restored) if (set) next[key] = set
        return next
      })
      let migratedGroups = groupsToRestore
      if (groupsToRestore.some((group) => !group.adjustmentReference)) {
        const modelSlot = selectedCharacter.customization.modelSlot ?? 1
        const source = await window.desktop.loadFabricatorSlot(modelSlot)
        const poseSlot = selectedCharacter.customization.poseSlot
        const pose = poseSlot === null ? null : await window.desktop.loadFabricatorPose(modelSlot, poseSlot)
        const artwork = selectCharacterArtwork(source, pose, poseSlot)
        if (source && artwork) {
          const shaped = applyCharacterBodyShape(withCharacterHeadSize(artwork, getCharacterProportions(selectedCharacter.customization)), getCharacterBodyDimensions(selectedCharacter.customization))
          const details = Object.fromEntries(restored.filter((entry): entry is typeof entry & { set: WardrobeSet } => !!entry.set).map(({ key, set }) => [key, set]))
          migratedGroups = anchorWardrobeAdjustments(groupsToRestore, modelSlot, shaped.parts, (group) => wardrobeComponentsForGroup(group, details))
        }
      }
      if (cancelled) return
      if (JSON.stringify(migratedGroups) !== JSON.stringify(groupsToRestore)) {
        const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
        // Hydration must not overwrite an edit made while assets were loading.
        if (JSON.stringify(current.customization.wardrobeGroups) === JSON.stringify(groupsToRestore)) {
          await saveCharacter({ ...current, customization: { ...current.customization, wardrobeGroups: migratedGroups }, updatedAt: new Date().toISOString() })
        }
      }
      for (const { group, set } of restored) {
        if (!set) continue
        const category = Object.values(clothingCategories).flat().find((definition) => definition.id === group.category)
        if (!category) continue
        const thumbnailKey = `${group.modelSlot}:${group.setId}:${group.category}`
        if (wardrobeThumbnails[thumbnailKey]) continue
        const thumbnail = await renderWardrobeThumbnail(set, category.source)
        if (cancelled) return
        if (thumbnail) setWardrobeThumbnails((current) => ({ ...current, [thumbnailKey]: thumbnail }))
      }
    })().catch((reason: unknown) => {
      if (!cancelled) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível restaurar as roupas deste personagem.')
    })
    return () => { cancelled = true }
  }, [selectedCharacter?.id, characterWardrobeHydrationKey])

  useEffect(() => {
    let cancelled = false
    const groups = selectedCharacter?.customization.wardrobeGroups ?? []
    if (!displayArtworkProject || !groups.length) {
      setSelectedWardrobeUrl(null)
      setSelectedWardrobeAboveHairUrl(null)
      return
    }
    const previewGroups = wardrobeTransformDraft && selectedClothing
      ? groups.map((group) => group.modelSlot === selectedClothing.modelSlot && group.setId === selectedClothing.setId && group.category === selectedClothing.category && (group.componentId === selectedClothing.componentId || !group.componentId) ? { ...group, componentId: selectedClothing.componentId, ...wardrobeTransformDraft } : group)
      : groups
    void renderWardrobeOverlay(previewGroups, wardrobeDetails, displayArtworkProject, selectedCatalogModelSlot, selectedSourceModelProject, selectedCharacter?.customization.modelSkinTone, characterRenderSize(displayArtworkProject.width, displayArtworkProject.height, previewExtent.width, previewExtent.height, customizerPreviewZoom, previewExtent.density), activeWardrobePreviewHighlight).then(async (result) => {
      const [wardrobeReady, aboveHairReady] = await Promise.all([preparePreviewImage(result.imageUrl), preparePreviewImage(result.aboveHairImageUrl)])
      if (!wardrobeReady || !aboveHairReady) return
      if (!cancelled) {
        setSelectedWardrobeUrl(result.imageUrl)
        setSelectedWardrobeAboveHairUrl(result.aboveHairImageUrl)
      }
    }).catch((reason: unknown) => {
      if (!cancelled) {
        setSelectedWardrobeUrl(null)
        setSelectedWardrobeAboveHairUrl(null)
        setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível compor as roupas do personagem.')
      }
    })
    return () => { cancelled = true }
  }, [selectedCharacter?.id, selectedCharacter?.customization.modelSkinTone, selectedCharacter?.customization.wardrobeGroups, wardrobeDetails, displayArtworkProject, selectedCatalogModelSlot, selectedSourceModelProject, selectedClothing?.modelSlot, selectedClothing?.setId, selectedClothing?.category, selectedClothing?.componentId, wardrobeTransformDraft, previewExtent, customizerPreviewZoom, activeWardrobePreviewHighlight])

  function selectCharacter(id: string) {
    setSelectedCharacterId(id)
    setActiveModule(null)
  }

  async function saveCharacter(next: CustomizerCharacter) {
    setCharactersError('')
    setCharacterSaveState('saving')
    charactersRef.current = charactersRef.current.map((character) => character.id === next.id ? next : character)
    setCharacters(charactersRef.current)
    const previousWrite = characterSaveQueue.current.get(next.id)
    const write = (previousWrite ? previousWrite.catch(() => undefined) : Promise.resolve())
      .then(() => window.desktop.saveCustomizerCharacter(next))
    characterSaveQueue.current.set(next.id, write)
    try {
      await write
      setCharacterSaveState('saved')
      window.dispatchEvent(new Event('customizer:characters-updated'))
    } catch (reason) {
      setCharacterSaveState('error')
      setCharactersError(reason instanceof Error ? reason.message : 'Não foi possível salvar o personagem.')
      if (characterSaveQueue.current.get(next.id) === write) {
        const latest = await window.desktop.listCustomizerCharacters().catch(() => null)
        if (latest) {
          charactersRef.current = latest
          setCharacters(latest)
        }
      }
    } finally {
      if (characterSaveQueue.current.get(next.id) === write) characterSaveQueue.current.delete(next.id)
    }
  }

  function anchorCurrentWardrobe(groups: CustomizerWardrobeGroup[]): CustomizerWardrobeGroup[] {
    if (!displayArtworkProject || !selectedSourceModelProject) return groups
    return anchorWardrobeAdjustments(groups, selectedSourceModelProject.slot, displayArtworkProject.parts,
      (group) => wardrobeComponentsForGroup(group, wardrobeDetails))
  }

  async function saveCharacterCustomization(patch: Partial<CustomizerCharacter['customization']> | ((current: CustomizerCharacter['customization']) => Partial<CustomizerCharacter['customization']>)) {
    if (!selectedCharacter) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const changes = typeof patch === 'function' ? patch(current.customization) : patch
    const customization = { ...current.customization, ...changes }
    if (customization.wardrobeGroups) customization.wardrobeGroups = anchorCurrentWardrobe(customization.wardrobeGroups)
    await saveCharacter({ ...current, customization, updatedAt: new Date().toISOString() })
  }

  function changeProportion(key: keyof CharacterProportions, value: number) {
    if (!selectedCharacter) return
    const { min, max } = characterProportionLimits[key]
    setProportionEdit({ characterId: selectedCharacter.id, values: { ...activeProportions, [key]: Math.min(max, Math.max(min, Math.round(value))) } })
  }

  function commitProportions(values: CharacterProportions) {
    if (!selectedCharacter) return
    setProportionEdit({ characterId: selectedCharacter.id, values })
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const saved = getCharacterProportions(current.customization)
    if ((Object.keys(values) as Array<keyof CharacterProportions>).every((key) => saved[key] === values[key])) return
    void saveCharacterCustomization({ proportions: values })
  }

  function commitProportion(key: keyof CharacterProportions, value: number) {
    const { min, max } = characterProportionLimits[key]
    commitProportions({ ...activeProportions, [key]: Math.min(max, Math.max(min, Math.round(value))) })
  }

  function commitBodyDimensions(values: CharacterBodyDimensions) {
    if (!selectedCharacter) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const saved = getCharacterBodyDimensions(current.customization)
    if ((Object.keys(values) as Array<keyof CharacterBodyDimensions>).every((key) => saved[key] === values[key])) return
    void saveCharacterCustomization({ bodyDimensions: values })
  }

  function commitBodyDimension(key: keyof CharacterBodyDimensions, value: number) {
    const { min, max } = characterBodyDimensionLimits[key]
    const values = { ...activeBodyDimensions, [key]: Math.min(max, Math.max(min, Math.round(value))) }
    setBodyDimensionEdit(selectedCharacter ? { characterId: selectedCharacter.id, values } : null)
    commitBodyDimensions(values)
  }

  function changeBodyDimension(key: keyof CharacterBodyDimensions, value: number) {
    if (!selectedCharacter) return
    const { min, max } = characterBodyDimensionLimits[key]
    setBodyDimensionEdit({ characterId: selectedCharacter.id, values: { ...activeBodyDimensions, [key]: Math.min(max, Math.max(min, Math.round(value))) } })
  }

  async function chooseFaceCatalogItem(summary: FaceCatalogItemSummary, variantIndex?: number) {
    const item = faceCatalogDetails[`${summary.modelSlot}:${summary.id}`] ?? await window.desktop.loadFaceCatalogItem(summary.modelSlot, summary.id)
    if (!item || !selectedCharacter) return
    setFaceCatalogDetails((current) => ({ ...current, [`${summary.modelSlot}:${summary.id}`]: item }))
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.faceAppearance
    const field: Record<FaceSheetKind, keyof CustomizerFaceAppearance> = {
      eyes: 'eyeCatalogId', eyebrows: 'eyebrowCatalogId', nose: 'noseCatalogId',
      'mouth-closed': 'mouthClosedCatalogId', 'mouth-open': 'mouthOpenCatalogId'
    }
    const sameModel = previous?.modelSlot === item.modelSlot
    const migrated: Partial<Pick<CustomizerFaceAppearance, 'eyeCatalogId' | 'eyebrowCatalogId' | 'noseCatalogId' | 'mouthClosedCatalogId' | 'mouthOpenCatalogId'>> = {}
    if (sameModel && previous?.setId) {
      const legacySet = await window.desktop.loadFaceSet(previous.modelSlot, previous.setId)
      for (const kind of Object.keys(field) as FaceSheetKind[]) {
        if (!legacySet?.sheets[kind]) continue
        const legacyItemId = `legacy_${legacySet.id}_${kind}`
        if (!faceCatalogItems.some((entry) => entry.id === legacyItemId)) continue
        if (kind === 'eyes') migrated.eyeCatalogId = legacyItemId
        else if (kind === 'eyebrows') migrated.eyebrowCatalogId = legacyItemId
        else if (kind === 'nose') migrated.noseCatalogId = legacyItemId
        else if (kind === 'mouth-closed') migrated.mouthClosedCatalogId = legacyItemId
        else migrated.mouthOpenCatalogId = legacyItemId
      }
    }
    const appearance: CustomizerFaceAppearance = {
      ...(sameModel ? previous : undefined),
      ...migrated,
      modelSlot: item.modelSlot,
      setId: undefined,
      [field[item.category]]: item.id,
      eyeState: sameModel ? previous.eyeState : 0,
      eyebrows: sameModel ? previous.eyebrows : true,
      noseIndex: item.category === 'nose' ? variantIndex ?? item.selectedNose : sameModel ? previous.noseIndex : item.selectedNose,
      expressionIndex: item.category.startsWith('mouth') ? variantIndex ?? item.selectedExpression : sameModel ? previous.expressionIndex : item.selectedExpression,
      mouthOpen: item.category === 'mouth-open' ? true : item.category === 'mouth-closed' ? false : sameModel ? previous.mouthOpen : false
    }
    if (item.category === 'eyes' || item.category === 'eyebrows') {
      setHeadPanelTab('eyes')
      setHeadCategorySelection('eyes')
    } else {
      setHeadPanelTab('face')
      setHeadCategorySelection('face')
    }
    await saveCharacterCustomization({ faceAppearance: appearance })
  }

  async function chooseFacePartCatalogItem(partId: FaceLibraryPartId, summary: FaceComponentAssetSummary) {
    const part = customizerFaceParts.find((entry) => entry.id === partId)
    if (!part || !selectedCharacter) return
    const categoryParts = customizerFaceParts.filter((candidate) => candidate.category === part.category)
    const leftPart = categoryParts.find((candidate) => candidate.side === 'left')
    const rightPart = categoryParts.find((candidate) => candidate.side === 'right')
    const leftSummary = isRightFaceAsset(summary)
      ? faceComponentAssets.find((candidate) => !isRightFaceAsset(candidate) && sameFaceAssetPair(candidate, summary, faceComponentDetails)) ?? summary
      : summary
    const rightSummary = isRightFaceAsset(leftSummary)
      ? leftSummary
      : faceComponentAssets.find((candidate) => sameFaceAssetPair(leftSummary, candidate, faceComponentDetails)) ?? leftSummary
    const selectedAssets = new Map<string, FaceComponentAsset>()
    for (const candidate of new Set([leftSummary, rightSummary])) {
      const asset = faceComponentDetails[candidate.id] ?? await window.desktop.loadFaceComponentAsset(candidate.modelSlot, candidate.id)
      if (asset) selectedAssets.set(candidate.id, asset)
    }
    const item = selectedAssets.get((part.side === 'right' ? rightSummary : leftSummary).id)
    if (!item || !leftPart || !rightPart) return
    setFaceComponentDetails((current) => ({ ...current, ...Object.fromEntries(selectedAssets) }))
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.faceAppearance
    const sameModel = previous?.modelSlot === item.modelSlot
    const linkedSides = { ...(sameModel ? previous?.linkedSides : undefined), [part.category]: false }
    const previousComponents = sameModel ? previous?.components : undefined
    const appearance: CustomizerFaceAppearance = {
      ...(sameModel ? previous : undefined), modelSlot: item.modelSlot, setId: undefined, linkedSides,
      components: {
        ...(previousComponents ?? {}),
        [leftPart.id]: { ...previousComponents?.[leftPart.id], assetId: leftSummary.id, transform: undefined },
        [rightPart.id]: { ...previousComponents?.[rightPart.id], assetId: rightSummary.id, transform: undefined }
      },
      eyeState: sameModel ? previous.eyeState : 0,
      eyebrows: sameModel ? previous.eyebrows : true,
      noseIndex: sameModel ? previous.noseIndex : 0,
      expressionIndex: sameModel ? previous.expressionIndex : 0,
      mouthOpen: sameModel ? previous.mouthOpen : false
    }
    await saveCharacterCustomization({ faceAppearance: appearance })
  }

  async function setFacePartColor(part: FaceLibraryPartId, role: HairColorRole, value: string) {
    if (!selectedCharacter || selectedCatalogModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.faceAppearance
    const appearanceBefore = previous?.modelSlot === selectedCatalogModelSlot ? previous : undefined
    const partDefinition = customizerFaceParts.find((entry) => entry.id === part)!
    const targetPart = facePartSourceId(partDefinition)
    const components = { ...(appearanceBefore?.components ?? {}) }
    const manualColorRoles = [...new Set([...(components[targetPart]?.manualColorRoles ?? []), role])]
    components[targetPart] = { ...(components[targetPart] ?? { assetId: null }), colors: { ...components[targetPart]?.colors, [role]: value }, manualColorRoles }
    const appearance: CustomizerFaceAppearance = previous?.modelSlot === selectedCatalogModelSlot ? { ...previous, components } : {
      modelSlot: selectedCatalogModelSlot, eyeState: 0, eyebrows: true, noseIndex: 0, expressionIndex: 0, mouthOpen: false, components
    }
    await saveCharacterCustomization({ faceAppearance: appearance })
  }

  async function applyFacePartPalette(part: FaceLibraryPartId, colors: HairColorOverrides) {
    if (!selectedCharacter || selectedCatalogModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.faceAppearance
    const sameModel = previous?.modelSlot === selectedCatalogModelSlot
    const components = { ...(sameModel ? previous?.components : undefined) }
    components[part] = { ...(components[part] ?? { assetId: null }), colors, manualColorRoles: [] }
    await saveCharacterCustomization({ faceAppearance: {
      ...(sameModel ? previous : undefined), modelSlot: selectedCatalogModelSlot,
      eyeState: sameModel ? previous.eyeState : 0, eyebrows: sameModel ? previous.eyebrows : true,
      noseIndex: sameModel ? previous.noseIndex : 0, expressionIndex: sameModel ? previous.expressionIndex : 0,
      mouthOpen: sameModel ? previous.mouthOpen : false, components
    } })
  }

  async function resetFacePartColors(part: FaceLibraryPartId) {
    if (!selectedCharacter || selectedCatalogModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.faceAppearance
    if (!previous || previous.modelSlot !== selectedCatalogModelSlot) return
    const partDefinition = customizerFaceParts.find((entry) => entry.id === part)!
    const targetPart = facePartSourceId(partDefinition)
    const components = { ...previous.components }
    if (components[targetPart]) components[targetPart] = { ...components[targetPart]!, colors: undefined }
    await saveCharacterCustomization({ faceAppearance: { ...previous, components } })
  }

  async function clearFacePartSelection(partId: FaceLibraryPartId) {
    const part = customizerFaceParts.find((entry) => entry.id === partId)
    if (!part || !selectedCharacter || selectedCatalogModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.faceAppearance
    if (!previous || previous.modelSlot !== selectedCatalogModelSlot) return
    const pair = customizerFaceParts.filter((candidate) => candidate.category === part.category)
    const components = { ...previous.components }
    for (const targetPart of pair) {
      components[targetPart.id] = { ...(previous.components?.[targetPart.id] ?? { assetId: null }), assetId: null }
    }
    const appearance = { ...previous, components }
    await saveCharacterCustomization({ faceAppearance: hasSelectedFaceAsset(appearance) ? appearance : undefined })
  }

  async function chooseHairStyle(summary: HairStyleSummary | null, side: HairCatalogSide) {
    if (!selectedCharacter) return
    const modelSlot = summary?.modelSlot ?? selectedCatalogModelSlot
    if (modelSlot === null || modelSlot === undefined) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.hairAppearance
    const sameModel = previous?.modelSlot === modelSlot
    const frontStyleId = side === 'front' ? summary?.id ?? null : sameModel ? hairAppearanceStyleId(previous, 'front') : null
    const backStyleId = side === 'back' ? summary?.id ?? null : sameModel ? hairAppearanceStyleId(previous, 'back') : null
    await saveCharacterCustomization({ hairAppearance: { ...(sameModel ? previous : undefined), modelSlot, frontStyleId, backStyleId } })
  }

  async function chooseHairPartStyle(part: HairPartId, summary: HairStyleSummary | null) {
    if (!selectedCharacter || selectedCatalogModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.hairAppearance
    const sameModel = previous?.modelSlot === selectedCatalogModelSlot
    const previousParts = sameModel ? previous?.parts : undefined
    const parts = { ...(previousParts ?? {}), ...(part === 'frontHair' && previousParts?.frontHair && !previousParts.rearHair ? { rearHair: previousParts.frontHair } : {}), [part]: summary?.id ?? null }
    await saveCharacterCustomization({ hairAppearance: { ...(sameModel ? previous : undefined), modelSlot: selectedCatalogModelSlot, parts } })
  }

  async function setHairColor(role: HairColorRole, value: string) {
    if (!selectedCharacter || selectedCatalogModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.hairAppearance
    const sameModel = previous?.modelSlot === selectedCatalogModelSlot
    const partColors = { ...(sameModel ? previous?.partColors : undefined) }
    for (const part of customizerHairParts) {
      if (!partColors[part.id]?.[role]) continue
      const next = { ...partColors[part.id] }
      delete next[role]
      if (Object.keys(next).length) partColors[part.id] = next
      else delete partColors[part.id]
    }
    await saveCharacterCustomization({ hairAppearance: {
      ...(sameModel ? previous : undefined),
      modelSlot: selectedCatalogModelSlot,
      colors: { ...(sameModel ? previous?.colors : undefined), [role]: value },
      partColors
    } })
  }

  async function setHairPartColor(part: HairPartId, role: HairColorRole, value: string) {
    if (!selectedCharacter || selectedCatalogModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.hairAppearance
    const sameModel = previous?.modelSlot === selectedCatalogModelSlot
    const partColors = { ...(sameModel ? previous?.partColors : undefined) }
    partColors[part] = { ...partColors[part], [role]: value }
    await saveCharacterCustomization({ hairAppearance: { ...(sameModel ? previous : undefined), modelSlot: selectedCatalogModelSlot, partColors } })
  }

  async function applyHairPartPalette(part: HairPartId, colors: HairColorOverrides) {
    if (!selectedCharacter || selectedCatalogModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.hairAppearance
    const sameModel = previous?.modelSlot === selectedCatalogModelSlot
    await saveCharacterCustomization({ hairAppearance: {
      ...(sameModel ? previous : undefined), modelSlot: selectedCatalogModelSlot,
      partColors: { ...(sameModel ? previous?.partColors : undefined), [part]: colors }
    } })
  }

  async function resetHairPartColors(part: HairPartId) {
    if (!selectedCharacter || selectedCatalogModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.hairAppearance
    if (!previous || previous.modelSlot !== selectedCatalogModelSlot) return
    const partColors = { ...previous.partColors }
    delete partColors[part]
    await saveCharacterCustomization({ hairAppearance: { ...previous, partColors } })
  }

  async function applyHairPalette(colors: HairColorOverrides) {
    if (!selectedCharacter || selectedCatalogModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.hairAppearance
    const sameModel = previous?.modelSlot === selectedCatalogModelSlot
    await saveCharacterCustomization({ hairAppearance: { ...(sameModel ? previous : undefined), modelSlot: selectedCatalogModelSlot, colors, partColors: {} } })
  }

  async function restoreHairColors() {
    if (!selectedCharacter || selectedCatalogModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.hairAppearance
    if (!previous || previous.modelSlot !== selectedCatalogModelSlot) return
    await saveCharacterCustomization({ hairAppearance: { ...previous, colors: undefined, partColors: undefined } })
  }

  async function setFaceCatalogVariant(patch: Partial<CustomizerFaceAppearance>) {
    if (!selectedCharacter || selectedCatalogModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const old = current.customization.faceAppearance
    const sameModel = old?.modelSlot === selectedCatalogModelSlot
    const appearance: CustomizerFaceAppearance = {
      ...(sameModel ? old : undefined), modelSlot: selectedCatalogModelSlot,
      eyeState: sameModel ? old.eyeState : 0, eyebrows: sameModel ? old.eyebrows : true,
      noseIndex: sameModel ? old.noseIndex : 0, expressionIndex: sameModel ? old.expressionIndex : 0,
      mouthOpen: sameModel ? old.mouthOpen : false, ...patch
    }
    await saveCharacterCustomization({ faceAppearance: hasSelectedFaceAsset(appearance) ? appearance : undefined })
  }

  async function applyFaceCatalogPalette(part: FacePalettePartId, colors: HairColorOverrides) {
    const current = selectedCharacter && (charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter)
    if (!current || selectedCatalogModelSlot === null) return
    const previous = current.customization.faceAppearance
    const sameModel = previous?.modelSlot === selectedCatalogModelSlot
    const base: CustomizerFaceAppearance = sameModel ? previous : {
      modelSlot: selectedCatalogModelSlot, eyeState: 0, eyebrows: true, noseIndex: 0, expressionIndex: 0, mouthOpen: false
    }
    const facePalettes = { ...(sameModel ? previous.facePalettes : undefined), [part]: colors }
    const facePaletteManualRoles = { ...(sameModel ? previous.facePaletteManualRoles : undefined), [part]: [] }
    await saveCharacterCustomization({ faceAppearance: { ...base, facePalettes, facePaletteManualRoles } })
  }

  async function setFaceCatalogPartColor(part: FacePalettePartId, role: HairColorRole, value: string) {
    const current = selectedCharacter && (charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter)
    if (!current || selectedCatalogModelSlot === null) return
    const previous = current.customization.faceAppearance
    const sameModel = previous?.modelSlot === selectedCatalogModelSlot
    const base: CustomizerFaceAppearance = sameModel ? previous : {
      modelSlot: selectedCatalogModelSlot, eyeState: 0, eyebrows: true, noseIndex: 0, expressionIndex: 0, mouthOpen: false
    }
    const facePalettes = { ...(sameModel ? previous.facePalettes : undefined), [part]: { ...(sameModel ? previous.facePalettes?.[part] : undefined), [role]: value } }
    const facePaletteManualRoles = { ...(sameModel ? previous.facePaletteManualRoles : undefined), [part]: [...new Set([...(sameModel ? previous.facePaletteManualRoles?.[part] ?? [] : []), role])] }
    await saveCharacterCustomization({ faceAppearance: { ...base, facePalettes, facePaletteManualRoles } })
  }

  async function chooseFaceDetailCatalogItem(kind: FaceDetailKind, summary: FaceComponentAssetSummary) {
    if (!selectedCharacter || selectedCatalogModelSlot === null || summary.modelSlot !== selectedCatalogModelSlot) return
    const details = { ...(activeFaceAppearance?.faceDetails ?? {}), [kind]: summary.id }
    await setFaceCatalogVariant({ faceDetails: details })
  }

  async function clearFaceCatalogPart(part: 'nose' | 'mouth' | FaceDetailKind) {
    if (!selectedCharacter || selectedCatalogModelSlot === null) return
    if (part !== 'nose' && part !== 'mouth') {
      const details = { ...(activeFaceAppearance?.faceDetails ?? {}), [part]: null }
      await setFaceCatalogVariant({ faceDetails: details })
      return
    }
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.faceAppearance
    const sameModel = previous?.modelSlot === selectedCatalogModelSlot
    const base: CustomizerFaceAppearance = sameModel ? { ...previous } : {
      modelSlot: selectedCatalogModelSlot, eyeState: 0, eyebrows: true, noseIndex: 0, expressionIndex: 0, mouthOpen: false
    }
    const faceAppearance = part === 'nose'
      ? { ...base, noseCatalogId: undefined, noseIndex: 0 }
      : { ...base, mouthClosedCatalogId: undefined, mouthOpenCatalogId: undefined, expressionIndex: 0 }
    await saveCharacterCustomization({ faceAppearance: hasSelectedFaceAsset(faceAppearance) ? faceAppearance : undefined })
  }

  function wardrobeGroupKey(group: Pick<CustomizerWardrobeGroup, 'modelSlot' | 'setId' | 'category' | 'componentId'>) {
    return `${group.modelSlot}:${group.setId}:${group.category}:${group.componentId ?? ''}`
  }

  async function applyUpperWardrobePanel(panel: WardrobePanel, candidate: WardrobePanelCandidate | null) {
    if (!selectedCharacter || selectedCatalogModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const before = current.customization.wardrobeGroups ?? []
    if (panel.id === 'glasses') {
      const currentAppearance = current.customization.faceAppearance
      const selectedHeadExtraId = currentAppearance?.modelSlot === selectedCatalogModelSlot ? currentAppearance.headExtras?.glasses : undefined
      if (candidate?.headExtraAsset || !candidate && selectedHeadExtraId) {
        const after = before.filter((group) => group.modelSlot !== selectedCatalogModelSlot || group.category !== panel.category)
        const base = currentAppearance?.modelSlot === selectedCatalogModelSlot ? currentAppearance : { modelSlot: selectedCatalogModelSlot, eyeState: 0 as const, eyebrows: true, noseIndex: 0, expressionIndex: 0, mouthOpen: false }
        const headExtras = { ...base.headExtras }
        if (candidate?.headExtraAsset) headExtras.glasses = candidate.headExtraAsset.id
        else delete headExtras.glasses
        const faceAppearance = { ...base, headExtras }
        setSelectedClothing(null)
        await saveCharacterCustomization({ wardrobeGroups: after, faceAppearance: hasSelectedFaceAsset(faceAppearance) ? faceAppearance : undefined })
        return
      }
    }
    const replacesSelectedHeadExtra = panel.id === 'glasses' && current.customization.faceAppearance?.modelSlot === selectedCatalogModelSlot && Boolean(current.customization.faceAppearance.headExtras?.glasses)
    const existingCandidate = candidate && !replacesSelectedHeadExtra && candidate.components.every((component) => before.some((group) => group.modelSlot === candidate.summary.modelSlot && group.setId === candidate.summary.id && group.category === panel.category && group.componentId === component.id))
    if (existingCandidate) {
      setSelectedClothing({ modelSlot: candidate.summary.modelSlot, setId: candidate.summary.id, category: panel.category, componentId: candidate.component.id })
      return
    }
    const panelComponents = wardrobeSets.flatMap((summary) => {
      const set = wardrobeDetails[`${summary.modelSlot}:${summary.id}`]
      return set ? set.components.filter((component) => wardrobeComponentMatchesPanel(component, panel)).map((component) => `${summary.modelSlot}:${summary.id}:${component.id}`) : []
    })
    const panelComponentKeys = new Set(panelComponents)
    const matchingGroups = before.filter((group) => group.modelSlot === selectedCatalogModelSlot && group.category === panel.category && (!group.componentId || panelComponentKeys.has(`${group.modelSlot}:${group.setId}:${group.componentId}`)))
    if (!candidate && !matchingGroups.length) return
    const after = before.filter((group) => {
      if (group.modelSlot !== selectedCatalogModelSlot || group.category !== panel.category) return true
      if (!group.componentId) return false
      return !panelComponentKeys.has(`${group.modelSlot}:${group.setId}:${group.componentId}`)
    })
    if (candidate) {
      const palette = current.customization.wardrobePalettes?.[panel.id]
      after.push(...candidate.components.map((component) => ({ modelSlot: candidate.summary.modelSlot, setId: candidate.summary.id, category: panel.category, componentId: component.id, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0, ...(palette ? { colors: palette } : {}) })))
      setSelectedClothing({ modelSlot: candidate.summary.modelSlot, setId: candidate.summary.id, category: panel.category, componentId: candidate.component.id })
    } else {
      if (selectedClothing?.category === panel.category && panelComponentKeys.has(`${selectedCatalogModelSlot}:${selectedClothing.setId}:${selectedClothing.componentId}`)) setSelectedClothing(null)
    }
    if (panel.id === 'glasses') {
      const currentAppearance = current.customization.faceAppearance
      if (currentAppearance?.modelSlot === selectedCatalogModelSlot && currentAppearance.headExtras?.glasses) {
        const headExtras = { ...currentAppearance.headExtras }
        delete headExtras.glasses
        const faceAppearance = { ...currentAppearance, headExtras }
        await saveCharacterCustomization({ wardrobeGroups: after, faceAppearance: hasSelectedFaceAsset(faceAppearance) ? faceAppearance : undefined })
        return
      }
    }
    await saveCharacterCustomization({ wardrobeGroups: after })
  }

  async function applyWardrobePalette(panel: WardrobePanel, candidate: WardrobePanelCandidate, colors: HairColorOverrides) {
    if (!selectedCharacter) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const componentIds = new Set(candidate.components.map((component) => component.id))
    const wardrobeGroups = (current.customization.wardrobeGroups ?? []).map((group) => group.modelSlot === candidate.summary.modelSlot && group.setId === candidate.summary.id && group.category === panel.category && !!group.componentId && componentIds.has(group.componentId)
      ? { ...group, colors }
      : group)
    await saveCharacterCustomization({
      wardrobePalettes: { ...current.customization.wardrobePalettes, [panel.id]: colors },
      wardrobeGroups
    })
  }

  async function setWardrobePieceColor(setId: string, category: ClothingGroupCategory, componentIds: string[], role: HairColorRole, value: string) {
    if (!selectedCharacter) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const groups = current.customization.wardrobeGroups ?? []
    const componentIdSet = new Set(componentIds)
    const wardrobeGroups = groups.map((group) => group.modelSlot === selectedCatalogModelSlot && group.setId === setId && group.category === category && !!group.componentId && componentIdSet.has(group.componentId)
      ? { ...group, colors: { ...group.colors, [role]: value } }
      : group)
    await saveCharacterCustomization({ wardrobeGroups })
  }

  async function resetWardrobePieceColors(panel: WardrobePanel, setId: string, componentIds: string[]) {
    if (!selectedCharacter) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const before = current.customization.wardrobeGroups ?? []
    const componentIdSet = new Set(componentIds)
    const after = before.map((group) => {
      if (group.setId !== setId || group.modelSlot !== selectedCatalogModelSlot || group.category !== panel.category || !group.componentId || !componentIdSet.has(group.componentId)) return group
      const { colors: _colors, ...rest } = group
      return rest
    })
    const wardrobePalettes = { ...current.customization.wardrobePalettes }
    delete wardrobePalettes[panel.id]
    await saveCharacterCustomization({ wardrobeGroups: after, wardrobePalettes })
  }

  function beginWardrobeDrag(event: import('react').PointerEvent<HTMLImageElement>) {
    if (activeModule !== 'Roupas' || clothingSection !== 'Customizar' || !selectedCharacter || !selectedClothing || !selectedArtworkProject) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const beforeGroups = anchorCurrentWardrobe(current.customization.wardrobeGroups ?? [])
    const group = beforeGroups.find((item) => item.setId === selectedClothing.setId && item.category === selectedClothing.category && (item.componentId === selectedClothing.componentId || !item.componentId))
    if (!group) return
    const scene = event.currentTarget.closest('.stage-scene')
    const rect = scene?.getBoundingClientRect()
    if (!rect) return
    const previewScale = Math.min((rect.width - 136) / selectedArtworkProject.width, (rect.height - 130) / selectedArtworkProject.height)
    clothingDragRef.current = {
      pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY,
      scaleX: Math.max(.01, previewScale * activeShapeScale.x), scaleY: Math.max(.01, previewScale * activeShapeScale.y),
      bone: displayArtworkProject?.parts.find((bone) => bone.id === group.adjustmentReference?.boneId),
      groupKey: wardrobeGroupKey(group), characterId: selectedCharacter.id, beforeGroups, latest: null
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function moveWardrobeDrag(event: import('react').PointerEvent<HTMLImageElement>) {
    const drag = clothingDragRef.current
    if (activeModule !== 'Roupas' || clothingSection !== 'Customizar' || !drag || drag.pointerId !== event.pointerId || !selectedCharacter || selectedCharacter.id !== drag.characterId) return
    const nextGroups = drag.beforeGroups.map((group) => wardrobeGroupKey(group) === drag.groupKey
      ? moveWardrobeAdjustment(group, drag.bone, { x: (event.clientX - drag.clientX) / drag.scaleX, y: (event.clientY - drag.clientY) / drag.scaleY }) : group)
    const nextCharacter = { ...selectedCharacter, customization: { ...selectedCharacter.customization, wardrobeGroups: nextGroups }, updatedAt: new Date().toISOString() }
    drag.latest = nextCharacter
    charactersRef.current = charactersRef.current.map((character) => character.id === nextCharacter.id ? nextCharacter : character)
    setCharacters((current) => current.map((character) => character.id === nextCharacter.id ? nextCharacter : character))
  }

  function finishWardrobeDrag(event: import('react').PointerEvent<HTMLImageElement>) {
    const drag = clothingDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    clothingDragRef.current = null
    if (drag.latest) {
      void saveCharacter(drag.latest)
    }
  }

  async function submitCharacterDialog(event: import('react').FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = nameDraft.trim()
    if (!name || savingCharacter) return
    setSavingCharacter(true)
    setCharactersError('')
    try {
      if (dialogMode === 'create') {
        const character = await window.desktop.createCustomizerCharacter(name)
        charactersRef.current = [...charactersRef.current, character]
        setCharacters((current) => [...current, character])
        setSelectedCharacterId(character.id)
        setActiveModule(null)
      } else if (dialogMode === 'rename' && selectedCharacter) {
        await saveCharacter({ ...selectedCharacter, name, updatedAt: new Date().toISOString() })
      }
      setDialogMode(null)
    } catch (reason) {
      setCharactersError(reason instanceof Error ? reason.message : 'Não foi possível salvar o personagem.')
    } finally {
      setSavingCharacter(false)
    }
  }

  async function deleteSelectedCharacter() {
    if (!selectedCharacter || !window.confirm(`Excluir ${selectedCharacter.name}? Esta ação não remove modelos nem poses do Fabricador Dev.`)) return
    try {
      await window.desktop.deleteCustomizerCharacter(selectedCharacter.id)
      const remaining = characters.filter((character) => character.id !== selectedCharacter.id)
      charactersRef.current = remaining
      setCharacters(remaining)
      setSelectedCharacterId(remaining[0]?.id ?? '')
      setActiveModule(null)
      setCharactersError('')
    } catch (reason) {
      setCharactersError(reason instanceof Error ? reason.message : 'Não foi possível excluir o personagem.')
    }
  }

  async function selectCatalogModel(model: NonNullable<FabricatorSlotSummary>) {
    const requestId = ++previewLoadRequest.current
    setSelectedCatalogModelSlot(model.slot)
    setSelectedPosePage(0)
    setSelectedArtworkLabel(model.name)
    setSelectedArtworkUrl(null)
    setPreviewLoading(true)
    setCatalogError('')
    try {
      const firstPose = catalogPoses.find((pose) => pose?.sourceModelSlot === model.slot && pose.slot === 1)
      setSelectedCatalogPoseSlot(firstPose?.slot ?? null)
      setSelectedPoseCategory(firstPose ? resolvePoseCategory(firstPose) : 'Parado')
      await saveCharacterCustomization({ modelSlot: model.slot, poseSlot: firstPose?.slot ?? null })
      const sourceProject = await window.desktop.loadFabricatorSlot(model.slot)
      if (!sourceProject) throw new Error('O modelo de referência não está disponível no Fabricador Dev.')
      let artwork: CatalogArtwork | null = firstPose ? await window.desktop.loadFabricatorPose(model.slot, 1) : null
      if (!artwork) artwork = sourceProject
      if (!artwork) throw new Error('Não foi possível abrir este modelo.')
      const artworkUrl = await renderArtwork(applyCharacterBodyShape(withCharacterHeadSize(artwork, activeProportions), activeBodyDimensions), characterRenderSize(artwork.width, artwork.height, previewExtent.width, previewExtent.height, customizerPreviewZoom, previewExtent.density), selectedCharacter?.customization.modelSkinTone)
      if (!await preparePreviewImage(artworkUrl)) throw new Error('A prévia nova não pôde ser decodificada; mantendo a imagem anterior.')
      if (previewLoadRequest.current === requestId) { setSelectedArtworkProject(artwork); setSelectedSourceModelProject(sourceProject); setSelectedArtworkUrl(artworkUrl) }
    } catch (reason) {
      if (previewLoadRequest.current === requestId) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível abrir este modelo.')
    } finally {
      if (previewLoadRequest.current === requestId) setPreviewLoading(false)
    }
  }

  async function selectCatalogPose(pose: NonNullable<FabricatorPoseSummary>) {
    const requestId = ++previewLoadRequest.current
    const nextCategory = resolvePoseCategory(pose)
    if (nextCategory !== selectedPoseCategory) setSelectedPosePage(0)
    setSelectedCatalogPoseSlot(pose.slot)
    setSelectedPoseCategory(nextCategory)
    setSelectedArtworkLabel(pose.name)
    setPreviewLoading(true)
    setCatalogError('')
    try {
      await saveCharacterCustomization({ modelSlot: pose.sourceModelSlot, poseSlot: pose.slot })
      const sourceProject = selectedSourceModelProject?.slot === pose.sourceModelSlot ? selectedSourceModelProject : await window.desktop.loadFabricatorSlot(pose.sourceModelSlot)
      if (!sourceProject) throw new Error('O modelo de referência desta pose não está disponível.')
      const artwork = await window.desktop.loadFabricatorPose(pose.sourceModelSlot, pose.slot)
      if (!artwork) throw new Error('Não foi possível abrir esta pose.')
      const artworkUrl = await renderArtwork(applyCharacterBodyShape(withCharacterHeadSize(artwork, activeProportions), activeBodyDimensions), characterRenderSize(artwork.width, artwork.height, previewExtent.width, previewExtent.height, customizerPreviewZoom, previewExtent.density), selectedCharacter?.customization.modelSkinTone)
      if (!await preparePreviewImage(artworkUrl)) throw new Error('A prévia nova não pôde ser decodificada; mantendo a imagem anterior.')
      if (previewLoadRequest.current === requestId) { setSelectedArtworkProject(artwork); setSelectedSourceModelProject(sourceProject); setSelectedArtworkUrl(artworkUrl) }
    } catch (reason) {
      if (previewLoadRequest.current === requestId) setCatalogError(reason instanceof Error ? reason.message : 'Não foi possível abrir esta pose.')
    } finally {
      if (previewLoadRequest.current === requestId) setPreviewLoading(false)
    }
  }

  const availableModels = catalogModels.filter((model): model is NonNullable<typeof model> => model !== null)
  const availablePoses = catalogPoses.filter((pose): pose is NonNullable<typeof pose> => pose?.sourceModelSlot === selectedCatalogModelSlot).sort((a, b) => a.slot - b.slot)
  const poseCategories = ['Parado', 'Sentado', ...new Set(availablePoses.map(resolvePoseCategory).filter((category) => category !== 'Parado' && category !== 'Sentado'))]
  const categoryPoses = availablePoses.filter((pose) => resolvePoseCategory(pose) === selectedPoseCategory)
  const posePageCount = Math.max(1, Math.ceil(categoryPoses.length / 5))
  const activePosePage = Math.min(selectedPosePage, posePageCount - 1)
  const visibleCategoryPoses = categoryPoses.slice(activePosePage * 5, activePosePage * 5 + 5)
  const showAdjacentPoseCategory = (direction: -1 | 1) => {
    const categoryIndex = poseCategories.indexOf(selectedPoseCategory)
    const nextCategory = poseCategories[(categoryIndex + direction + poseCategories.length) % poseCategories.length]
    setSelectedPoseCategory(nextCategory)
    setSelectedPosePage(0)
  }
  const showAdjacentPosePage = (direction: -1 | 1) => {
    setSelectedPosePage((current) => Math.max(0, Math.min(posePageCount - 1, current + direction)))
  }
  const selectedModelName = availableModels.find((model) => model.slot === selectedCatalogModelSlot)?.name
  const activeFaceAppearance = characterFaceAppearance?.modelSlot === selectedCatalogModelSlot ? characterFaceAppearance : undefined
  const wardrobePreviewDraggable = false

  const renderHairCatalog = () => (
    <div className="customizer-hair-catalog">
      {selectedCatalogModelSlot === null ? <div className="customizer-catalog-empty">Escolha um modelo para ver os cabelos salvos.</div>
        : hairLoading ? <div className="customizer-catalog-empty">Carregando cabelos…</div>
          : hairStyles.length === 0 ? <div className="customizer-catalog-empty">Este modelo ainda não tem cabelos no catálogo. Importe e salve um cabelo em Cabelos Dev.</div>
            : <>
              <div className="customizer-hair-heading"><span><strong>Cabelos do Modelo {String(selectedCatalogModelSlot).padStart(2, '0')}</strong><small>Aplicação salva somente em {selectedCharacter?.name ?? 'este personagem'}.</small></span>
                {characterHairAppearance?.modelSlot === selectedCatalogModelSlot && hairAppearanceStyleId(characterHairAppearance, hairCatalogSide) && <button onClick={() => void chooseHairStyle(null, hairCatalogSide)} type="button"><Icon name="eyeOff" /> Remover {hairCatalogSide === 'front' ? 'posterior' : 'traseiro'}</button>}
              </div>
              <nav className="customizer-hair-tabs" aria-label="Categoria de cabelo">
                {([{ id: 'front', label: 'Posterior' }, { id: 'back', label: 'Traseiro' }] as const).map((category) => <button key={category.id} className={hairCatalogSide === category.id ? 'active' : ''} onClick={() => setHairCatalogSide(category.id)} aria-pressed={hairCatalogSide === category.id} type="button">{category.label}</button>)}
              </nav>
              <div className="customizer-hair-grid">{hairStyles.filter((summary) => hairStyleSupportsCategory(summary, hairCatalogSide === 'front' ? 'rearHair' : 'backHair')).map((summary) => {
                const detail = hairDetails[String(summary.modelSlot) + ':' + summary.id]
                const selected = characterHairAppearance?.modelSlot === summary.modelSlot && hairAppearanceStyleId(characterHairAppearance, hairCatalogSide) === summary.id
                const asset = detail?.[hairCatalogSide]
                return <button className={'customizer-hair-card' + (selected ? ' selected' : '')} key={summary.id} onClick={() => void chooseHairStyle(summary, hairCatalogSide)} aria-pressed={selected} title={'Aplicar cabelo ' + (hairCatalogSide === 'front' ? 'posterior' : 'traseiro') + ' em ' + (selectedCharacter?.name ?? 'personagem')} type="button">
                  <span className="customizer-hair-art">{asset && <img src={asset.dataUrl} alt="" />}{!asset && <span><Icon name="bow" /></span>}</span>
                  <b>{summary.name}</b><small>{selected ? 'Aplicado' : `Usar ${hairCatalogSide === 'front' ? 'posterior' : 'traseiro'}`}</small>
                </button>
              })}{hairStyles.every((summary) => !hairStyleSupportsCategory(summary, hairCatalogSide === 'front' ? 'rearHair' : 'backHair')) && <p className="customizer-face-empty">Nenhum cabelo {hairCatalogSide === 'front' ? 'posterior' : 'traseiro'} salvo para este modelo.</p>}</div>
            </>}
    </div>
  )

  const renderHairCustomizer = () => {
    const appearance = characterHairAppearance?.modelSlot === selectedCatalogModelSlot ? characterHairAppearance : undefined
    const colorOverrides = appearance?.colors ?? {}
    const renderPieceSelector = (part: typeof customizerHairParts[number]) => {
      const { side } = part
      const options = hairStyles.filter((summary) => hairStyleSupportsCategory(summary, part.id))
      const selectedId = hairAppearancePartStyleId(appearance, part.id)
      const selectedIndex = options.findIndex((summary) => summary.id === selectedId)
      const selected = selectedIndex >= 0 ? options[selectedIndex] : null
      const selectedSlot = selectedIndex >= 0 ? selectedIndex + 1 : 0
      const slotCount = options.length + 1
      const asset = selected ? hairDetails[`${selected.modelSlot}:${selected.id}`]?.[side] : null
      const pieceColors = resolvedHairColors(appearance, part.id)
      const hasLocalColors = Object.keys(appearance?.partColors?.[part.id] ?? {}).length > 0
      const chooseAt = (index: number) => {
        if (!selectedCharacter) return
        const slot = wrapSlotIndex(index, slotCount)
        void chooseHairPartStyle(part.id, slot === 0 ? null : options[slot - 1])
      }
      return <article className="customizer-hair-piece" key={part.id}>
        <header><strong>{part.label} {selectedSlot + 1}/{slotCount}</strong>{hasLocalColors && <button className="customizer-hair-reset" onClick={() => void resetHairPartColors(part.id)} title={`Voltar ${part.label} à paleta geral`} type="button">Usar paleta geral</button>}</header>
        <div className="customizer-hair-piece-selector">
          <button aria-label={`Peça anterior: ${part.label}`} onClick={() => chooseAt(selectedSlot - 1)} disabled={!options.length || !selectedCharacter} type="button"><Icon name="chevronRight" /></button>
          <button className="customizer-hair-piece-preview" aria-label={`Abrir biblioteca de ${part.label}`} title={`Abrir biblioteca de ${part.label}`} onClick={() => { setHairLibraryPage(0); setHairLibraryPart(part.id) }} type="button">
            {asset ? <HairAssetPreview source={asset.dataUrl} colors={pieceColors} alt={selected?.name ?? ''} /> : null}
          </button>
          <button aria-label={`Próxima peça: ${part.label}`} onClick={() => chooseAt(selectedSlot + 1)} disabled={!options.length || !selectedCharacter} type="button"><Icon name="chevronRight" /></button>
          <div className="customizer-hair-piece-colors" aria-label={`Cores de ${part.label}`}>
            {hairColorControls.map((color) => <label key={color.id} className={appearance?.partColors?.[part.id]?.[color.id] ? 'local' : ''} style={{ '--hair-color-swatch': pieceColors[color.id] ?? color.fallback } as React.CSSProperties} title={`${color.label} de ${part.label} · ${appearance?.partColors?.[part.id]?.[color.id] ? 'ajuste individual' : 'paleta geral'}`}>
              <input type="color" aria-label={`${color.label} de ${part.label}`} value={pieceColors[color.id] ?? color.fallback} disabled={!selectedCharacter || !asset} onFocus={() => setActiveHairColorRole(color.id)} onChange={(event) => void setHairPartColor(part.id, color.id, event.target.value)} />
              <span aria-hidden="true">{color.id === 'highlight' ? 'L' : color.id === 'accent' ? 'A' : color.id === 'outline' ? 'C' : color.id === 'fade' ? 'D' : 'B'}</span>
            </label>)}
          </div>
        </div>
        <PiecePaletteStrip label={part.label} colors={appearance?.partColors?.[part.id]} disabled={!selectedCharacter || !asset} onSelect={(colors) => void applyHairPartPalette(part.id, colors)} />
      </article>
    }
    return <section className="customizer-hair-workspace" aria-label="Personalização do cabelo">
      {selectedCatalogModelSlot === null ? <div className="customizer-catalog-empty">Escolha um modelo para carregar os cabelos do Fabricador Dev.</div>
        : hairLoading ? <div className="customizer-catalog-empty">Carregando cabelos do Fabricador Dev…</div>
          : <>
            <div className="customizer-hair-layout">
            <div className="customizer-hair-color-controls" aria-label="Paleta geral dos cabelos">
              <div className="customizer-hair-palette-editor">
                <div className="customizer-hair-palette-title"><strong>Paleta geral</strong><span>Uma cor para os cinco cabelos</span><button type="button" onClick={() => void restoreHairColors()} disabled={!appearance || !Object.keys(colorOverrides).length && !Object.values(appearance.partColors ?? {}).some((colors) => Object.keys(colors ?? {}).length)} title="Restaurar as cores originais dos cinco cabelos">Restaurar</button></div>
                <div className="customizer-hair-palette-swatches">{hairColorControls.map((color) => <label className="customizer-hair-color-control" data-role={color.id} key={color.id} title={`${color.label} · aplica a todos os cabelos`}>
                  <span>{color.label}</span><input className={activeHairColorRole === color.id ? 'active' : ''} type="color" aria-label={`${color.label} geral`} value={colorOverrides[color.id] ?? color.fallback} disabled={!selectedCharacter} onFocus={() => setActiveHairColorRole(color.id)} onChange={(event) => void setHairColor(color.id, event.target.value)} />
                </label>)}</div>
              </div>
              <aside className="customizer-hair-palette-presets" aria-label="Paletas prontas">
                <button className="customizer-hair-palette-scroll previous" aria-label="Ver paletas anteriores" onClick={() => hairPaletteStripRef.current?.scrollBy({ left: -180, behavior: 'smooth' })} type="button"><Icon name="chevronRight" /></button>
                <div className="customizer-hair-palette-preset-list" ref={hairPaletteStripRef}>{hairPalettePresets.map((preset) => <button key={preset.name} type="button" disabled={!selectedCharacter} aria-pressed={hairColorControls.every((color) => colorOverrides[color.id] === preset.colors[color.id])} onClick={() => void applyHairPalette(preset.colors)} title={`Aplicar a paleta ${preset.name} aos cinco cabelos`}><span style={{ background: `linear-gradient(115deg, ${preset.colors.highlight} 0 23%, ${preset.colors.base} 23% 65%, ${preset.colors.fade} 65% 84%, ${preset.colors.outline} 84%)` }} />{preset.name}</button>)}</div>
                <button className="customizer-hair-palette-scroll" aria-label="Ver próximas paletas" onClick={() => hairPaletteStripRef.current?.scrollBy({ left: 180, behavior: 'smooth' })} type="button"><Icon name="chevronRight" /></button>
              </aside>
            </div>
            {customizerHairParts.map(renderPieceSelector)}
            </div>
          </>}
    </section>
  }

  const renderHairLibrary = () => {
    if (!hairLibraryPart) return null
    const part = customizerHairParts.find((item) => item.id === hairLibraryPart)
    if (!part) return null
    const options = hairStyles.filter((summary) => hairStyleSupportsCategory(summary, part.id))
    const pageSize = 20
    const slots: Array<HairStyleSummary | null> = [null, ...options]
    const pageCount = Math.max(1, Math.ceil(slots.length / pageSize))
    const page = Math.min(hairLibraryPage, pageCount - 1)
    const visible = slots.slice(page * pageSize, (page + 1) * pageSize)
    const appearance = characterHairAppearance?.modelSlot === selectedCatalogModelSlot ? characterHairAppearance : undefined
    const selectedId = hairAppearancePartStyleId(appearance, part.id)
    const choose = (summary: HairStyleSummary | null) => {
      void chooseHairPartStyle(part.id, summary)
    }
    return <section className="customizer-hair-library" aria-labelledby="customizer-hair-library-title">
        <header className="customizer-hair-library-heading">
          <button className="customizer-hair-library-remove" type="button" onClick={() => void chooseHairPartStyle(part.id, null)} disabled={!selectedId} aria-label={`Remover ${part.label} do personagem`} title={`Remover ${part.label} do personagem`}><Icon name="trash" /></button>
          <h2 id="customizer-hair-library-title">{part.label}</h2>
          <button className="customizer-hair-library-close" type="button" onClick={() => setHairLibraryPart(null)} aria-label="Fechar biblioteca">×</button>
        </header>
        <div className="customizer-hair-library-grid" aria-label={`Peças disponíveis para ${part.label}`}>
          {visible.map((summary) => {
            if (!summary) return <button className={`customizer-hair-library-item${!selectedId ? ' selected' : ''}`} key="empty-slot" title="Slot vazio" aria-label={`Slot vazio · remover ${part.label} do personagem`} aria-pressed={!selectedId} type="button" onClick={() => choose(null)} />
            const asset = hairDetails[`${summary.modelSlot}:${summary.id}`]?.[part.side]
            const isSelected = summary.id === selectedId
            return <button className={`customizer-hair-library-item${isSelected ? ' selected' : ''}`} key={summary.id} title={summary.name} aria-label={`Selecionar ${summary.name}`} aria-pressed={isSelected} type="button" onClick={() => choose(summary)}>
              {asset ? <HairAssetPreview source={asset.dataUrl} colors={resolvedHairColors(appearance, part.id)} alt="" /> : <span className="customizer-hair-library-placeholder"><Icon name="bow" /></span>}
            </button>
          })}
          {!options.length && <p className="customizer-hair-library-empty">Nenhuma peça salva nesta categoria.</p>}
        </div>
        <footer className="customizer-hair-library-pagination">
          <button className="customizer-hair-library-page-arrow" type="button" aria-label="Página anterior" disabled={page === 0} onClick={() => setHairLibraryPage((current) => Math.max(0, current - 1))}><Icon name="chevronRight" /></button>
          <span>Página <strong>{page + 1}/{pageCount}</strong></span>
          <button className="customizer-hair-library-page-arrow next" type="button" aria-label="Próxima página" disabled={page >= pageCount - 1} onClick={() => setHairLibraryPage((current) => Math.min(pageCount - 1, current + 1))}><Icon name="chevronRight" /></button>
        </footer>
      </section>
  }

  const faceOptionsForCategory = (category: FaceComponentKind) => {
    const candidates = faceComponentAssets.filter((asset) => asset.kind === category)
    return candidates.filter((asset) => !isRightFaceAsset(asset) || !candidates.some((candidate) =>
      !isRightFaceAsset(candidate) && sameFaceAssetPair(candidate, asset, faceComponentDetails)
    ))
  }

  const faceCatalogLayoutParts = [
    { id: 'nose', label: 'Nariz', help: 'Nenhuma peça salva' },
    { id: 'eye-highlight-left', label: 'Destaque do olho esquerdo', help: 'Nenhuma peça salva' },
    { id: 'mouth', label: 'Boca', help: 'Fechada ou aberta' },
    { id: 'eye-highlight-right', label: 'Destaque do olho direito', help: 'Nenhuma peça salva' },
    { id: 'blush', label: 'Blush', help: 'Nenhuma peça salva' },
    { id: 'facial-shadow', label: 'Sombra facial', help: 'Nenhuma peça salva' }
  ] as const
  type FaceCatalogLayoutPart = typeof faceCatalogLayoutParts[number]['id']
  type FaceCatalogChoice =
    | { type: 'catalog'; summary: FaceCatalogItemSummary; piece: FaceCatalogItem['pieces'][number] }
    | { type: 'detail'; summary: FaceComponentAssetSummary; asset: FaceComponentAsset }
  const faceCatalogChoicesFor = (category: FaceSheetKind) => faceCatalogItems
    .filter((summary) => summary.category === category)
    .flatMap((summary) => faceCatalogDetails[`${summary.modelSlot}:${summary.id}`]?.pieces
      .filter((piece) => piece.sheet === category)
      .map((piece) => ({ type: 'catalog' as const, summary, piece })) ?? [])
  const faceCatalogChoicesForPart = (part: FaceCatalogLayoutPart) => part === 'nose'
    ? faceCatalogChoicesFor('nose')
    : part === 'mouth'
      ? faceCatalogChoicesFor(activeFaceAppearance?.mouthOpen ? 'mouth-open' : 'mouth-closed')
      : faceComponentAssets.filter((summary) => summary.kind === part).flatMap((summary): FaceCatalogChoice[] => {
        const asset = faceComponentDetails[summary.id]
        return asset && asset.kind === part ? [{ type: 'detail', summary, asset }] : []
      })
  const faceCatalogSelectedId = (part: FaceCatalogLayoutPart) => part === 'nose'
    ? activeFaceAppearance?.noseCatalogId
    : part === 'mouth'
      ? activeFaceAppearance?.mouthOpen ? activeFaceAppearance.mouthOpenCatalogId : activeFaceAppearance?.mouthClosedCatalogId
      : activeFaceAppearance?.faceDetails?.[part]
  const faceCatalogSelectedVariant = (part: FaceCatalogLayoutPart) => part === 'nose'
    ? activeFaceAppearance?.noseIndex ?? 0
    : part === 'mouth' ? activeFaceAppearance?.expressionIndex ?? 0 : 0
  const faceCatalogChoiceSelected = (part: FaceCatalogLayoutPart, choice: FaceCatalogChoice) => {
    if (choice.type === 'detail') return choice.summary.id === faceCatalogSelectedId(part)
    return choice.summary.id === faceCatalogSelectedId(part) && choice.piece.index === faceCatalogSelectedVariant(part)
  }
  const chooseFaceCatalogChoice = (part: FaceCatalogLayoutPart, choice: FaceCatalogChoice) => {
    if (choice.type === 'detail') void chooseFaceDetailCatalogItem(part as FaceDetailKind, choice.summary)
    else void chooseFaceCatalogItem(choice.summary, choice.piece.index)
  }

  async function updateCharacterMouthBlush(patch: Partial<Pick<CustomizerFaceAppearance, 'mouthBlushEnabled' | 'mouthBlushColor' | 'mouthBlushOpacity'>>) {
    if (!selectedCharacter || selectedCatalogModelSlot === null) return
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const previous = current.customization.faceAppearance
    const sameModel = previous?.modelSlot === selectedCatalogModelSlot
    const appearance: CustomizerFaceAppearance = {
      ...(sameModel ? previous : undefined),
      modelSlot: selectedCatalogModelSlot,
      eyeState: sameModel ? previous.eyeState : 0,
      eyebrows: sameModel ? previous.eyebrows : true,
      noseIndex: sameModel ? previous.noseIndex : 0,
      expressionIndex: sameModel ? previous.expressionIndex : 0,
      mouthOpen: sameModel ? previous.mouthOpen : false,
      mouthBlushEnabled: sameModel ? previous.mouthBlushEnabled : false,
      ...patch
    }
    await saveCharacterCustomization({ faceAppearance: appearance })
  }

  const renderMouthBlushToggle = () => <label className="customizer-mouth-blush-toggle" title="Controla o blush na expressão base e nos presets do Studio">
    <input type="checkbox" checked={Boolean(activeFaceAppearance?.mouthBlushEnabled)} disabled={!selectedCharacter || selectedCatalogModelSlot === null} onChange={(event) => void updateCharacterMouthBlush({ mouthBlushEnabled: event.target.checked })} />
    <span>Blush na boca</span>
  </label>

  const renderMouthBlushControls = () => <MouthBlushControls
    color={activeFaceAppearance?.mouthBlushColor ?? '#e86388'}
    opacity={activeFaceAppearance?.mouthBlushOpacity ?? .38}
    disabled={!selectedCharacter || selectedCatalogModelSlot === null}
    onChange={(patch) => void updateCharacterMouthBlush(patch)}
  />

  const renderFaceCatalogCard = (part: typeof faceCatalogLayoutParts[number]) => {
    const choices = faceCatalogChoicesForPart(part.id)
    const selectedId = faceCatalogSelectedId(part.id)
    const selectedIndex = choices.findIndex((choice) => faceCatalogChoiceSelected(part.id, choice))
    const selected = selectedIndex >= 0 ? choices[selectedIndex] : null
    const selectedSlot = selectedIndex >= 0 ? selectedIndex + 1 : 0
    const slotCount = choices.length + 1
    const colors = activeFaceAppearance?.facePalettes?.[part.id] ?? {}
    const skinTone = activeFaceAppearance?.noseSkinTone ?? selectedSkinTone
    const catalogOpacity = selected?.type === 'catalog' ? faceCatalogDetails[`${selected.summary.modelSlot}:${selected.summary.id}`]?.opacity ?? 1 : 1
    const chooseAt = (index: number) => {
      if (!selectedCharacter) return
      const slot = wrapSlotIndex(index, slotCount)
      if (slot === 0) void clearFaceCatalogPart(part.id)
      else chooseFaceCatalogChoice(part.id, choices[slot - 1])
    }
    const isMouth = part.id === 'mouth'
    const clearPart = part.id
    return <article className={`customizer-hair-piece customizer-face-piece customizer-face-layout-piece customizer-face-layout-piece-${part.id}${isMouth ? ' customizer-face-layout-mouth' : ''}`} key={part.id}>
      <header><strong>{part.label} {selectedSlot + 1}/{slotCount}</strong>{isMouth && <span className="customizer-mouth-blush-group">{renderMouthBlushToggle()}{renderMouthBlushControls()}</span>}<button className="customizer-hair-reset" type="button" disabled={!selectedId} onClick={() => void clearFaceCatalogPart(clearPart)}>Remover</button></header>
      {isMouth && <nav className="customizer-face-layout-mode" aria-label="Tipo de boca">
        <button className={!activeFaceAppearance?.mouthOpen ? 'active' : ''} type="button" aria-pressed={!activeFaceAppearance?.mouthOpen} onClick={() => void setFaceCatalogVariant({ mouthOpen: false })}>Fechada</button>
        <button className={activeFaceAppearance?.mouthOpen ? 'active' : ''} type="button" aria-pressed={Boolean(activeFaceAppearance?.mouthOpen)} onClick={() => void setFaceCatalogVariant({ mouthOpen: true })}>Aberta</button>
      </nav>}
      <div className="customizer-hair-piece-selector customizer-face-layout-selector">
        <button aria-label={`Peça anterior: ${part.label}`} onClick={() => chooseAt(selectedSlot - 1)} disabled={!choices.length || !selectedCharacter} type="button"><Icon name="chevronRight" /></button>
        <button className="customizer-hair-piece-preview" aria-label={`Abrir biblioteca de ${part.label}`} title={`Abrir biblioteca de ${part.label}`} type="button" onClick={() => { setFaceCatalogLibraryPage(0); setFaceCatalogLibraryPart(part.id) }}>
          {selected && <HairAssetPreview source={selected.type === 'catalog' ? selected.piece.dataUrl : selected.asset.dataUrl} colors={colors} tintOptions={{ preserveNearWhite: true, allowNearWhiteRoles: activeFaceAppearance?.facePaletteManualRoles?.[part.id] }} skinTone={part.id === 'nose' ? skinTone : undefined} opacity={part.id === 'nose' ? activeFaceAppearance?.noseOpacity ?? catalogOpacity : 1} alt={selected.summary.name} />}
        </button>
        <button aria-label={`Próxima peça: ${part.label}`} onClick={() => chooseAt(selectedSlot + 1)} disabled={!choices.length || !selectedCharacter} type="button"><Icon name="chevronRight" /></button>
        <div className={`customizer-hair-piece-colors${part.id === 'nose' ? ' customizer-nose-piece-colors' : ''}`} aria-label={`Cores de ${part.label}`}>
          {facePartColorControls.slice(0, 3).map((color) => <label key={color.id} className={colors[color.id] ? 'local' : ''} style={{ '--hair-color-swatch': colors[color.id] ?? color.fallback } as React.CSSProperties} title={`${color.label} de ${part.label}`}>
            <input type="color" aria-label={`${color.label} de ${part.label}`} value={colors[color.id] ?? color.fallback} disabled={!selectedCharacter || !selected} onChange={(event) => void setFaceCatalogPartColor(part.id, color.id, event.target.value)} />
            <span aria-hidden="true">{color.id === 'highlight' ? 'L' : color.id === 'accent' ? 'A' : color.id === 'outline' ? 'C' : color.id === 'fade' ? 'D' : 'B'}</span>
          </label>)}
          {part.id === 'nose' && <NoseOpacityControl value={activeFaceAppearance?.noseOpacity ?? catalogOpacity} disabled={!selectedCharacter || !selected} onChange={(value) => void saveCharacterCustomization((current) => current.faceAppearance ? { faceAppearance: { ...current.faceAppearance, noseOpacity: value } } : {})} />}
          {facePartColorControls.slice(3).map((color) => <label key={color.id} className={colors[color.id] ? 'local' : ''} style={{ '--hair-color-swatch': colors[color.id] ?? color.fallback } as React.CSSProperties} title={`${color.label} de ${part.label}`}>
            <input type="color" aria-label={`${color.label} de ${part.label}`} value={colors[color.id] ?? color.fallback} disabled={!selectedCharacter || !selected} onChange={(event) => void setFaceCatalogPartColor(part.id, color.id, event.target.value)} />
            <span aria-hidden="true">{color.id === 'highlight' ? 'L' : color.id === 'accent' ? 'A' : color.id === 'outline' ? 'C' : color.id === 'fade' ? 'D' : 'B'}</span>
          </label>)}
        </div>
      </div>
      {part.id === 'nose'
        ? <NoseSkinTonePalette value={skinTone ?? originalSkinTone ?? skinTonePresets[0].id} disabled={!selectedCharacter || !selected} onSelect={(tone) => void saveCharacterCustomization((current) => current.faceAppearance ? { faceAppearance: { ...current.faceAppearance, noseSkinTone: tone } } : {})} />
        : <PiecePaletteStrip label={part.label} colors={colors} disabled={!selectedCharacter || !selected} onSelect={(palette) => void applyFaceCatalogPalette(part.id, palette)} />}
    </article>
  }

  const renderFaceCatalogLibrary = () => {
    if (!faceCatalogLibraryPart) return null
    const part = faceCatalogLayoutParts.find((entry) => entry.id === faceCatalogLibraryPart)!
    const choices = faceCatalogChoicesForPart(part.id)
    const pageSize = 20
    const slots: Array<FaceCatalogChoice | null> = [null, ...choices]
    const pageCount = Math.max(1, Math.ceil(slots.length / pageSize))
    const page = Math.min(faceCatalogLibraryPage, pageCount - 1)
    const visible = slots.slice(page * pageSize, (page + 1) * pageSize)
    const selectedId = faceCatalogSelectedId(part.id)
    const selectedIndex = choices.findIndex((choice) => faceCatalogChoiceSelected(part.id, choice))
    return <section className={`customizer-hair-library customizer-face-layout-library${part.id === 'mouth' ? ' customizer-face-layout-library-mouth' : ''}`} aria-labelledby="customizer-face-layout-library-title">
      <header className={`customizer-hair-library-heading${part.id === 'mouth' ? ' customizer-hair-library-heading-mouth' : ''}`}>
        <button className="customizer-hair-library-remove" type="button" onClick={() => void clearFaceCatalogPart(part.id)} disabled={!selectedId} aria-label={`Remover ${part.label}`} title={`Remover ${part.label}`}><Icon name="trash" /></button>
        <h2 id="customizer-face-layout-library-title">{part.label}</h2>
        {part.id === 'mouth' && <span className="customizer-mouth-blush-group">{renderMouthBlushToggle()}{renderMouthBlushControls()}</span>}
        <button className="customizer-hair-library-close" type="button" onClick={() => setFaceCatalogLibraryPart(null)} aria-label="Voltar às peças do rosto">×</button>
      </header>
      {part.id === 'mouth' && <nav className="customizer-face-layout-mode customizer-face-layout-library-mode" aria-label="Tipo de boca">
        <button className={!activeFaceAppearance?.mouthOpen ? 'active' : ''} type="button" aria-pressed={!activeFaceAppearance?.mouthOpen} onClick={() => { setFaceCatalogLibraryPage(0); void setFaceCatalogVariant({ mouthOpen: false }) }}>Fechada</button>
        <button className={activeFaceAppearance?.mouthOpen ? 'active' : ''} type="button" aria-pressed={Boolean(activeFaceAppearance?.mouthOpen)} onClick={() => { setFaceCatalogLibraryPage(0); void setFaceCatalogVariant({ mouthOpen: true }) }}>Aberta</button>
      </nav>}
      <div className="customizer-hair-library-grid" aria-label={`Biblioteca de ${part.label}`}>
        {visible.map((choice) => {
          if (!choice) return <button className={`customizer-hair-library-item${selectedIndex < 0 ? ' selected' : ''}`} key="empty-slot" title="Slot vazio" aria-label={`Slot vazio · remover ${part.label} do personagem`} aria-pressed={selectedIndex < 0} type="button" onClick={() => { void clearFaceCatalogPart(part.id); setFaceCatalogLibraryPart(null) }} />
          const selected = faceCatalogChoiceSelected(part.id, choice)
          const itemId = choice.type === 'catalog' ? `${choice.summary.id}:${choice.piece.id}` : choice.summary.id
          const imageUrl = choice.type === 'catalog' ? choice.piece.dataUrl : choice.asset.dataUrl
          const itemIndex = choice.type === 'catalog' ? ` · ${choice.piece.index + 1}` : ''
          return <button className={`customizer-hair-library-item${selected ? ' selected' : ''}`} key={itemId} title={`${choice.summary.name}${itemIndex}`} aria-label={`Selecionar ${part.label}${itemIndex}`} aria-pressed={selected} type="button" onClick={() => { chooseFaceCatalogChoice(part.id, choice); setFaceCatalogLibraryPart(null) }}><img src={imageUrl} alt="" /></button>
        })}
        {!choices.length && <p className="customizer-hair-library-empty">Nenhuma outra peça de {part.label.toLowerCase()} salva no Fabricador Dev.</p>}
      </div>
      <footer className="customizer-hair-library-pagination">
        <button className="customizer-hair-library-page-arrow" type="button" aria-label="Página anterior" disabled={page === 0} onClick={() => setFaceCatalogLibraryPage((current) => Math.max(0, current - 1))}><Icon name="chevronRight" /></button>
        <span>Página <strong>{page + 1}/{pageCount}</strong></span>
        <button className="customizer-hair-library-page-arrow next" type="button" aria-label="Próxima página" disabled={page >= pageCount - 1} onClick={() => setFaceCatalogLibraryPage((current) => Math.min(pageCount - 1, current + 1))}><Icon name="chevronRight" /></button>
      </footer>
    </section>
  }

  const renderFaceCatalogCustomizer = () => <section className="customizer-hair-workspace customizer-face-catalog-workspace" aria-label="Personalização do rosto">
    {selectedCatalogModelSlot === null ? <div className="customizer-catalog-empty">Escolha um modelo para ver as peças faciais.</div>
      : faceLoading || faceComponentLoading ? <div className="customizer-catalog-empty">Carregando catálogo facial…</div>
        : faceCatalogLibraryPart ? renderFaceCatalogLibrary()
          : <div className="customizer-hair-layout customizer-face-layout customizer-face-layout-catalog">{faceCatalogLayoutParts.map(renderFaceCatalogCard)}</div>}
  </section>

  const renderFaceCustomizer = () => {
    const appearance = characterFaceAppearance?.modelSlot === selectedCatalogModelSlot ? characterFaceAppearance : undefined
    const renderPart = (part: typeof customizerFaceParts[number]) => {
      const options = faceOptionsForCategory(part.category)
      const selectedId = facePartCatalogId(appearance, part)
      const selectedAsset = selectedId ? faceComponentAssets.find((summary) => summary.id === selectedId) : undefined
      const selectedOption = selectedAsset && isRightFaceAsset(selectedAsset)
        ? options.find((summary) => sameFaceAssetPair(summary, selectedAsset, faceComponentDetails))
        : selectedAsset
      const selectedIndex = options.findIndex((summary) => summary.id === selectedOption?.id)
      const selected = selectedIndex >= 0 ? options[selectedIndex] : null
      const piece = selectedId ? faceComponentDetails[selectedId] : null
      const selectedSlot = selectedIndex >= 0 ? selectedIndex + 1 : 0
      const slotCount = options.length + 1
      const colorPartId = facePartSourceId(part)
      const componentAppearance = appearance?.components?.[colorPartId]
      const colors = componentAppearance?.colors ?? {}
      const hasLocalColors = Object.keys(colors).length > 0
      const chooseAt = (index: number) => {
        if (!selectedCharacter) return
        const slot = wrapSlotIndex(index, slotCount)
        if (slot === 0) void clearFacePartSelection(part.id)
        else void chooseFacePartCatalogItem(part.id, options[slot - 1])
      }
      return <article className={`customizer-hair-piece customizer-face-piece customizer-face-piece-${part.id}`} key={part.id}>
        <header><strong>{part.label} {selectedSlot + 1}/{slotCount}</strong>{hasLocalColors && <button className="customizer-hair-reset" onClick={() => void resetFacePartColors(colorPartId)} title={'Restaurar cores de ' + part.label} type="button">Restaurar</button>}</header>
        <div className="customizer-hair-piece-selector">
          <button aria-label={'Peça anterior: ' + part.label} onClick={() => chooseAt(selectedSlot - 1)} disabled={!options.length || !selectedCharacter} type="button"><Icon name="chevronRight" /></button>
          <button className="customizer-hair-piece-preview" aria-label={'Abrir biblioteca de ' + part.label} title={'Abrir biblioteca de ' + part.label} onClick={() => { setFaceLibraryPage(0); setFaceLibraryPart(part.id) }} type="button">
            {piece ? <HairAssetPreview source={piece.dataUrl} colors={colors} tintOptions={{ preserveNearWhite: true, allowNearWhiteRoles: componentAppearance?.manualColorRoles }} alt={selected?.name ?? ''} flipX={part.side === 'right'} /> : null}
          </button>
          <button aria-label={'Próxima peça: ' + part.label} onClick={() => chooseAt(selectedSlot + 1)} disabled={!options.length || !selectedCharacter} type="button"><Icon name="chevronRight" /></button>
          <div className="customizer-hair-piece-colors" aria-label={'Cores de ' + part.label}>
            {facePartColorControls.map((color) => <label key={color.id} className={colors[color.id] ? 'local' : ''} style={{ '--hair-color-swatch': colors[color.id] ?? color.fallback } as React.CSSProperties} title={color.label + ' de ' + part.label}>
              <input type="color" aria-label={color.label + ' de ' + part.label} value={colors[color.id] ?? color.fallback} disabled={!selectedCharacter || !piece} onChange={(event) => void setFacePartColor(part.id, color.id, event.target.value)} />
              <span aria-hidden="true">{color.id === 'highlight' ? 'L' : color.id === 'accent' ? 'A' : color.id === 'outline' ? 'C' : color.id === 'fade' ? 'D' : 'B'}</span>
            </label>)}
          </div>
        </div>
        <PiecePaletteStrip label={part.label} colors={colors} disabled={!selectedCharacter || !piece} onSelect={(palette) => void applyFacePartPalette(part.id, palette)} />
      </article>
    }
    return <section className="customizer-hair-workspace customizer-face-workspace" aria-label="Personalização dos olhos e sobrancelhas">
      {selectedCatalogModelSlot === null ? <div className="customizer-catalog-empty">Escolha um modelo para carregar olhos e sobrancelhas do Fabricador Dev.</div>
        : faceLoading ? <div className="customizer-catalog-empty">Carregando catálogo facial…</div>
          : <div className="customizer-hair-layout customizer-face-layout">{customizerFaceParts.map(renderPart)}</div>}
    </section>
  }

  const renderFaceLibrary = () => {
    if (!faceLibraryPart) return null
    const part = customizerFaceParts.find((entry) => entry.id === faceLibraryPart)
    if (!part) return null
    const options = faceOptionsForCategory(part.category)
    const pageSize = 20
    const slots: Array<FaceComponentAssetSummary | null> = [null, ...options]
    const pageCount = Math.max(1, Math.ceil(slots.length / pageSize))
    const page = Math.min(faceLibraryPage, pageCount - 1)
    const visible = slots.slice(page * pageSize, (page + 1) * pageSize)
    const appearance = characterFaceAppearance?.modelSlot === selectedCatalogModelSlot ? characterFaceAppearance : undefined
    const selectedId = facePartCatalogId(appearance, part)
    const selectedAsset = selectedId ? faceComponentAssets.find((summary) => summary.id === selectedId) : undefined
    const selectedOption = selectedAsset && isRightFaceAsset(selectedAsset)
      ? options.find((summary) => sameFaceAssetPair(summary, selectedAsset, faceComponentDetails))
      : selectedAsset
    const selectedIndex = options.findIndex((summary) => summary.id === selectedOption?.id)
    const selectedFacePart = appearance?.components?.[facePartSourceId(part)]
    const selectedColors = selectedFacePart?.colors
    return <section className="customizer-hair-library" aria-labelledby="customizer-face-library-title">
      <header className="customizer-hair-library-heading">
        <button className="customizer-hair-library-remove" type="button" onClick={() => void clearFacePartSelection(part.id)} disabled={!selectedId} aria-label={'Remover ' + part.label + ' do personagem'} title={'Remover ' + part.label + ' do personagem'}><Icon name="trash" /></button>
        <h2 id="customizer-face-library-title">{part.label}</h2>
        <button className="customizer-hair-library-close" type="button" onClick={() => setFaceLibraryPart(null)} aria-label="Voltar aos controles dos olhos">×</button>
      </header>
      <div className="customizer-hair-library-grid" aria-label={'Biblioteca de ' + part.label}>
        {visible.map((summary) => {
          if (!summary) return <button className={`customizer-hair-library-item${selectedIndex < 0 ? ' selected' : ''}`} key="empty-slot" title="Slot vazio" aria-label={`Slot vazio · remover ${part.label} do personagem`} aria-pressed={selectedIndex < 0} type="button" onClick={() => void clearFacePartSelection(part.id)} />
          const piece = faceComponentDetails[summary.id]
          const selected = summary.id === selectedOption?.id
          return <button className={`customizer-hair-library-item${selected ? ' selected' : ''}`} key={summary.id} title={summary.name} aria-label={'Selecionar ' + summary.name} aria-pressed={selected} type="button" onClick={() => void chooseFacePartCatalogItem(part.id, summary)}>
            {piece ? <HairAssetPreview source={piece.dataUrl} colors={selectedColors} tintOptions={{ preserveNearWhite: true, allowNearWhiteRoles: selectedFacePart?.manualColorRoles }} alt="" flipX={part.side === 'right'} /> : <span className="customizer-hair-library-placeholder"><Icon name="face" /></span>}
          </button>
        })}
        {!options.length && <p className="customizer-hair-library-empty">Nenhum asset salvo para {part.label}. Importe esta peça no Rosto Dev.</p>}
      </div>
      <footer className="customizer-hair-library-pagination">
        <button className="customizer-hair-library-page-arrow" type="button" aria-label="Página anterior" disabled={page === 0} onClick={() => setFaceLibraryPage((current) => Math.max(0, current - 1))}><Icon name="chevronRight" /></button>
        <span>Página <strong>{page + 1}/{pageCount}</strong></span>
        <button className="customizer-hair-library-page-arrow next" type="button" aria-label="Próxima página" disabled={page >= pageCount - 1} onClick={() => setFaceLibraryPage((current) => Math.min(pageCount - 1, current + 1))}><Icon name="chevronRight" /></button>
      </footer>
    </section>
  }

  const upperWardrobeCandidates = (panel: WardrobePanel): WardrobePanelCandidate[] => {
    const wardrobeCandidates = wardrobeSets
    .filter((summary) => summary.modelSlot === selectedCatalogModelSlot)
    .flatMap((summary) => {
      const set = wardrobeDetails[`${summary.modelSlot}:${summary.id}`]
      if (!set) return []
      const components = set.components.filter((component) => wardrobeComponentMatchesPanel(component, panel))
      if (!components.length) return []
      if (panel.id === 'pants-left') {
        const representative = components.find((component) => component.category === 'calca-coxa') ?? components[0]
        return [{ summary, set, component: representative, components }]
      }
      return components.map((component) => ({ summary, set, component, components: [component] }))
    })
    if (panel.id !== 'glasses' || selectedCatalogModelSlot === null) return wardrobeCandidates
    const headExtraCandidates = faceComponentAssets
      .filter((summary) => summary.kind === 'head-extra' && summary.modelSlot === selectedCatalogModelSlot)
      .flatMap((summary): WardrobePanelCandidate[] => {
        const asset = faceComponentDetails[summary.id]
        if (!asset || asset.kind !== 'head-extra') return []
        const component: WardrobeSet['components'][number] = { id: asset.id, name: asset.name, category: 'oculos', attachedPartId: 'head', x: 0, y: 0, width: asset.width, height: asset.height, rotation: asset.defaultTransform.rotation, dataUrl: asset.dataUrl }
        const set: WardrobeSet = { schemaVersion: 1, edition: 2, id: `head-extra:${asset.id}`, modelSlot: summary.modelSlot, modelName: '', name: asset.name, width: asset.width, height: asset.height, components: [component], updatedAt: asset.updatedAt }
        const wardrobeSummary: WardrobeSetSummary = { id: set.id, modelSlot: set.modelSlot, modelName: set.modelName, name: set.name, updatedAt: set.updatedAt, edition: 2, componentCount: 1 }
        return [{ summary: wardrobeSummary, set, component, components: [component], headExtraAsset: asset }]
      })
    return [...headExtraCandidates, ...wardrobeCandidates]
  }

  const renderUpperWardrobeLibrary = () => {
    if (!wardrobeLibraryPanel) return null
    const panel = wardrobeLibraryPanel
    const candidates = upperWardrobeCandidates(panel)
    const slots: Array<(typeof candidates)[number] | null> = [null, ...candidates]
    const pageSize = 20
    const pageCount = Math.max(1, Math.ceil(slots.length / pageSize))
    const page = Math.min(wardrobeLibraryPage, pageCount - 1)
    const visible = slots.slice(page * pageSize, (page + 1) * pageSize)
    const appliedGroups = selectedCharacter?.customization.wardrobeGroups ?? []
    const selectedIndex = candidates.findIndex((candidate) => isWardrobePanelCandidateSelected(candidate, panel, appliedGroups, selectedCharacter?.customization.faceAppearance))
    const clearPanel = () => void applyUpperWardrobePanel(panel, null)
    return <section className="customizer-hair-library" aria-labelledby="customizer-upper-wardrobe-library-title">
      <header className="customizer-hair-library-heading">
        <button className="customizer-hair-library-remove" type="button" onClick={clearPanel} disabled={selectedIndex < 0} aria-label={`Remover ${panel.label} do personagem`} title={`Remover ${panel.label} do personagem`}><Icon name="trash" /></button>
        <h2 id="customizer-upper-wardrobe-library-title">{panel.label}</h2>
        <button className="customizer-hair-library-close" type="button" onClick={() => setWardrobeLibraryPanel(null)} aria-label="Fechar biblioteca">×</button>
      </header>
      <div className="customizer-hair-library-grid" aria-label={`Biblioteca de ${panel.label}`}>
        {visible.map((entry) => {
          if (!entry) return <button className={`customizer-hair-library-item${selectedIndex < 0 ? ' selected' : ''}`} key="empty-slot" title="Slot vazio" aria-label={`Slot vazio · remover ${panel.label} do personagem`} aria-pressed={selectedIndex < 0} type="button" onClick={clearPanel} />
          const selected = entry.summary.id === candidates[selectedIndex]?.summary.id && entry.component.id === candidates[selectedIndex]?.component.id
          return <button className={`customizer-hair-library-item${selected ? ' selected' : ''}`} key={`${entry.summary.modelSlot}:${entry.summary.id}:${entry.component.id}`} title={entry.component.name} aria-label={`Selecionar ${entry.component.name}`} aria-pressed={selected} type="button" onClick={() => { void applyUpperWardrobePanel(panel, entry); setWardrobeLibraryPanel(null) }}>
            <WardrobePanelCandidatePreview candidate={entry} />
          </button>
        })}
        {!candidates.length && <p className="customizer-hair-library-empty">Nenhuma peça salva para {panel.label}. Importe e classifique uma peça no Fabricador Dev.</p>}
      </div>
      <footer className="customizer-hair-library-pagination">
        <button className="customizer-hair-library-page-arrow" type="button" aria-label="Página anterior" disabled={page === 0} onClick={() => setWardrobeLibraryPage((current) => Math.max(0, current - 1))}><Icon name="chevronRight" /></button>
        <span>Página <strong>{page + 1}/{pageCount}</strong></span>
        <button className="customizer-hair-library-page-arrow next" type="button" aria-label="Próxima página" disabled={page >= pageCount - 1} onClick={() => setWardrobeLibraryPage((current) => Math.min(pageCount - 1, current + 1))}><Icon name="chevronRight" /></button>
      </footer>
    </section>
  }

  const renderUpperWardrobePanels = () => {
    const page = clothingSection === 'Inferior' ? lowerWardrobePage : upperWardrobePage
    const pageTwo = page === 2
    const panels = selectedCustomizerTopTab === 'cabeca' && headPanelTab === 'extra' ? accessoryWardrobePanels : clothingSection === 'Inferior'
      ? pageTwo ? lowerWardrobePageTwoPanels : lowerWardrobePanels
      : pageTwo ? upperWardrobePageTwoPanels : upperWardrobePanels
    return <div className={`customizer-hair-layout customizer-upper-wardrobe-layout${clothingSection === 'Superior' && pageTwo ? ' page-two' : ''}${clothingSection === 'Inferior' && pageTwo ? ' lower-page-two' : ''}`} aria-label={`Peças de roupa ${clothingSection.toLowerCase()} · página ${page}`}>
    {panels.map((panel) => {
      const candidates = upperWardrobeCandidates(panel)
      const appliedGroups = selectedCharacter?.customization.wardrobeGroups ?? []
      const selectedIndex = candidates.findIndex((candidate) => isWardrobePanelCandidateSelected(candidate, panel, appliedGroups, selectedCharacter?.customization.faceAppearance))
      const currentCandidate = selectedIndex >= 0 ? candidates[selectedIndex] : null
      const currentGroup = currentCandidate ? appliedGroups.find((group) => group.modelSlot === currentCandidate.summary.modelSlot && group.setId === currentCandidate.summary.id && group.category === panel.category && group.componentId === currentCandidate.component.id) : undefined
      const wardrobePalette = selectedCharacter?.customization.wardrobePalettes?.[panel.id] ?? {}
      const colors = { ...wardrobePalette, ...currentGroup?.colors }
      const hasLocalColors = !currentCandidate?.headExtraAsset && Object.keys(colors).length > 0
      const selectedSlot = selectedIndex >= 0 ? selectedIndex + 1 : 0
      const slotCount = candidates.length + 1
      const move = (direction: -1 | 1) => {
        const nextSlot = (selectedSlot + direction + slotCount) % slotCount
        void applyUpperWardrobePanel(panel, nextSlot === 0 ? null : candidates[nextSlot - 1])
      }
      return <article className={`customizer-hair-piece customizer-upper-wardrobe-piece customizer-wardrobe-piece-${panel.id}`} key={panel.id} aria-label={panel.label}>
        <header><strong>{panel.label} {selectedSlot + 1}/{candidates.length + 1}</strong>{hasLocalColors && currentCandidate && <button className="customizer-hair-reset" type="button" onClick={() => void resetWardrobePieceColors(panel, currentCandidate.summary.id, currentCandidate.components.map((component) => component.id))}>Restaurar</button>}</header>
        <div className="customizer-hair-piece-selector customizer-upper-wardrobe-selector">
          <button aria-label={`Peça anterior: ${panel.label}`} onClick={() => move(-1)} disabled={!candidates.length || !selectedCharacter || selectedCatalogModelSlot === null} type="button"><Icon name="chevronRight" /></button>
          <button className="customizer-hair-piece-preview" aria-label={`Abrir biblioteca de ${panel.label}`} title={`Abrir biblioteca de ${panel.label}`} onClick={() => { setWardrobeLibraryPage(0); setWardrobeLibraryPanel(panel) }} type="button">
            {currentCandidate ? <WardrobePanelCandidatePreview candidate={currentCandidate} colors={colors} /> : <span>Escolha uma peça</span>}
          </button>
          <button aria-label={`Próxima peça: ${panel.label}`} onClick={() => move(1)} disabled={!candidates.length || !selectedCharacter || selectedCatalogModelSlot === null} type="button"><Icon name="chevronRight" /></button>
          <div className="customizer-hair-piece-colors" aria-label={`Cores de ${panel.label}`}>
            {hairColorControls.map((color) => <label key={color.id} className={colors[color.id] ? 'local' : ''} style={{ '--hair-color-swatch': colors[color.id] ?? color.fallback } as React.CSSProperties} title={`${color.label} de ${panel.label}`}>
              <input type="color" aria-label={`${color.label} de ${panel.label}`} value={colors[color.id] ?? color.fallback} disabled={!selectedCharacter || !currentCandidate || Boolean(currentCandidate.headExtraAsset)} onChange={(event) => void setWardrobePieceColor(currentCandidate!.summary.id, panel.category, currentCandidate!.components.map((component) => component.id), color.id, event.target.value)} />
              <span aria-hidden="true">{color.id === 'highlight' ? 'L' : color.id === 'accent' ? 'A' : color.id === 'outline' ? 'C' : color.id === 'fade' ? 'D' : 'B'}</span>
            </label>)}
          </div>
        </div>
        <div className="customizer-upper-piece-colors" aria-label={`Paletas de ${panel.label}`}>
          <div className="customizer-upper-piece-colors-heading"><strong>{currentCandidate?.component.name ?? 'Paleta da peça'}</strong></div>
          <div className="customizer-hair-palette-presets customizer-upper-piece-palette-presets">
            <button className="customizer-hair-palette-scroll previous" aria-label={`Ver paletas anteriores de ${panel.label}`} onClick={() => wardrobePaletteStripRefs.current[panel.id]?.scrollBy({ left: -180, behavior: 'smooth' })} type="button"><Icon name="chevronRight" /></button>
            <div className="customizer-hair-palette-preset-list" ref={(node) => { wardrobePaletteStripRefs.current[panel.id] = node }}>
              {hairPalettePresets.map((preset) => <button key={preset.name} type="button" disabled={!selectedCharacter || !currentCandidate || Boolean(currentCandidate.headExtraAsset)} aria-pressed={hairColorControls.every((color) => wardrobePalette[color.id] === preset.colors[color.id])} onClick={() => currentCandidate && void applyWardrobePalette(panel, currentCandidate, preset.colors)} title={`Aplicar paleta ${preset.name} a ${panel.label}`}><span style={{ background: `linear-gradient(115deg, ${preset.colors.highlight} 0 23%, ${preset.colors.base} 23% 65%, ${preset.colors.fade} 65% 84%, ${preset.colors.outline} 84%)` }} />{preset.name}</button>)}
            </div>
            <button className="customizer-hair-palette-scroll" aria-label={`Ver próximas paletas de ${panel.label}`} onClick={() => wardrobePaletteStripRefs.current[panel.id]?.scrollBy({ left: 180, behavior: 'smooth' })} type="button"><Icon name="chevronRight" /></button>
          </div>
        </div>
      </article>
    })}
    </div>
  }

  const renderWardrobeCatalog = () => (
    <div className="customizer-wardrobe-catalog">
      {wardrobeLoading ? <div className="customizer-catalog-empty">Carregando roupas…</div> : <>
        {catalogError && <p className="customizer-catalog-error" role="alert">{catalogError}</p>}
        {wardrobeLibraryPanel ? renderUpperWardrobeLibrary() : renderUpperWardrobePanels()}
      </>}
    </div>
  )

  const hasHeadAdjustmentItem = (id: string) => {
    const appearance = selectedCharacter?.customization.faceAppearance
    if (hairCategories.some((part) => part.id === id)) return Boolean(hairAppearancePartStyleId(selectedCharacter?.customization.hairAppearance, id as HairPartId))
    if (id === 'eye-left' || id === 'eye-right' || id === 'pupil-left' || id === 'pupil-right' || id === 'brow-left' || id === 'brow-right') {
      return Boolean(appearance?.components?.[id as FaceComponentPartId]?.assetId || (id.startsWith('eye') ? appearance?.eyeCatalogId || appearance?.eyeLeftCatalogId || appearance?.eyeRightCatalogId || appearance?.setId : id.startsWith('brow') ? appearance?.eyebrowCatalogId || appearance?.eyebrowLeftCatalogId || appearance?.eyebrowRightCatalogId || appearance?.setId : false))
    }
    if (id === 'nose') return Boolean(appearance?.noseCatalogId || appearance?.setId)
    if (id === 'mouth') return Boolean(appearance?.mouthClosedCatalogId || appearance?.mouthOpenCatalogId || appearance?.setId)
    if (id === 'oculos' || id === 'acessorio-cabeca') return Boolean(appearance?.headExtras?.[id === 'oculos' ? 'glasses' : 'head-accessory'] || selectedCharacter?.customization.wardrobeGroups?.some((group) => group.category === id))
    return Boolean(appearance?.faceDetails?.[id as FaceDetailKind])
  }

  const restoreHeadAdjustments = () => {
    setHeadAdjustSelection(null)
    adjustmentLastTargetRef.current = null
    setAdjustmentPreviewHighlight(null)
    if (!selectedCharacter) return
    void saveCharacterCustomization((current) => ({
      partOverrides: Object.fromEntries(Object.entries(current.partOverrides ?? {}).filter(([key]) => !key.startsWith('head:')))
    }))
  }

  const updateHeadAdjustment = async (operation: 'transform' | 'toggle-hidden', values?: { x?: number; y?: number; scaleX?: number; scaleY?: number; rotation?: number }) => {
    if (!selectedCharacter || !headAdjustSelection) return
    setAdjustmentPreviewHighlight(null)
    const wardrobeCategory = headAdjustSelection === 'oculos' || headAdjustSelection === 'acessorio-cabeca' ? headAdjustSelection : null
    const currentCharacter = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const originalGroups = currentCharacter.customization.wardrobeGroups ?? []
    const anchoredGroups = anchorCurrentWardrobe(originalGroups)
    const wardrobeGroup = wardrobeCategory ? [...anchoredGroups].reverse().find((group) => group.category === wardrobeCategory) : undefined
    if (wardrobeGroup) {
      const displayed = [...originalGroups].reverse().find((group) => group.category === wardrobeCategory) ?? wardrobeGroup
      const wardrobeGroups = anchoredGroups.map((group) => {
        if (group !== wardrobeGroup) return group
        if (operation === 'transform') return editWardrobeAdjustment(group,
          displayArtworkProject?.parts.find((bone) => bone.id === group.adjustmentReference?.boneId),
          { offsetX: values?.x, offsetY: values?.y, scaleX: values?.scaleX, scaleY: values?.scaleY, rotation: values?.rotation }, displayed)
        if (group.hidden) { const { opacity: _opacity, ...rest } = group; return { ...rest, hidden: false } }
        return { ...group, hidden: true }
      })
      await saveCharacterCustomization({ wardrobeGroups })
      return
    }
    const key = `head:${headAdjustSelection}`
    await saveCharacterCustomization((current) => {
      const existing = current.partOverrides?.[key] ?? {}
      const next = { ...existing }
      if (operation === 'transform' && values) Object.assign(next, values)
      else {
        next.hidden = !existing.hidden
        if (!next.hidden) delete next.opacity
      }
      return { partOverrides: { ...current.partOverrides, [key]: next } }
    })
  }

  const updateClothesAdjustComponent = async (operation: 'transform' | 'toggle-hidden', values?: Partial<Pick<CustomizerWardrobeGroup, 'offsetX' | 'offsetY' | 'scaleX' | 'scaleY' | 'rotation'>>) => {
    if (!selectedCharacter || !selectedClothing) return
    setAdjustmentPreviewHighlight(null)
    const current = charactersRef.current.find((character) => character.id === selectedCharacter.id) ?? selectedCharacter
    const originalGroups = current.customization.wardrobeGroups ?? []
    const groups = anchorCurrentWardrobe(originalGroups)
    const selectedSet = wardrobeDetails[`${selectedClothing.modelSlot}:${selectedClothing.setId}`]
    const sourceCategories: WardrobeCategory[] = clothingCategories.Inferior.concat(clothingCategories.Superior).find((item) => item.id === selectedClothing.category)?.source ?? []
    const isSamePiece = (group: CustomizerWardrobeGroup) => group.modelSlot === selectedClothing.modelSlot && group.setId === selectedClothing.setId && group.category === selectedClothing.category && (group.componentId === selectedClothing.componentId || !group.componentId)
    const displayed = originalGroups.find(isSamePiece)
    const transformGroup = (group: CustomizerWardrobeGroup) => editWardrobeAdjustment(group,
      displayArtworkProject?.parts.find((bone) => bone.id === group.adjustmentReference?.boneId), values ?? {}, displayed ?? group)
    const nextGroups: CustomizerWardrobeGroup[] = []
    const toggleHidden = (group: CustomizerWardrobeGroup): CustomizerWardrobeGroup => {
      if (group.hidden) { const { opacity: _opacity, ...rest } = group; return { ...rest, hidden: false } }
      return { ...group, hidden: true }
    }
    for (const group of groups) {
      if (!isSamePiece(group)) { nextGroups.push(group); continue }
      if (group.componentId) {
        if (operation === 'transform') nextGroups.push(transformGroup(group))
        else nextGroups.push(toggleHidden(group))
        continue
      }
      if (!selectedSet) { nextGroups.push(group); continue }
      const matchingComponents = selectedSet.components.filter((component) => sourceCategories.includes(component.category))
      if (!matchingComponents.length) { nextGroups.push(group); continue }
      for (const component of matchingComponents) {
        const componentGroup = { ...group, componentId: component.id }
        if (operation === 'transform' && component.id === selectedClothing.componentId) nextGroups.push(transformGroup(componentGroup))
        else if (operation === 'toggle-hidden' && component.id === selectedClothing.componentId) nextGroups.push(toggleHidden(componentGroup))
        else nextGroups.push(componentGroup)
      }
    }
    const adjusted = nextGroups.find(isSamePiece)
    if (values && adjusted) setWardrobeTransformDraft({ offsetX: adjusted.offsetX, offsetY: adjusted.offsetY, scaleX: adjusted.scaleX, scaleY: adjusted.scaleY, rotation: adjusted.rotation })
    await saveCharacterCustomization({ wardrobeGroups: nextGroups })
  }

  const renderAdjustmentPicker = (area: 'head' | 'clothes') => {
    const isHead = area === 'head'
    const scopeDefinitions = isHead ? [] : clothesAdjustmentDefinitions(clothesCategorySelection)
    const scopeCategoryIds = new Set(scopeDefinitions.map((item) => item.id))
    const adjustmentLabel = customizerClothesTabs.find((tab) => tab.id === clothesCategorySelection)?.label ?? 'categoria selecionada'
    const selectedGroups = !isHead ? (selectedCharacter?.customization.wardrobeGroups ?? []).filter((group) => scopeCategoryIds.has(group.category)) : []
    const setOrder = new Map<string, number>()
    selectedGroups.forEach((group) => {
      const key = `${group.modelSlot}:${group.setId}`
      if (!setOrder.has(key)) setOrder.set(key, setOrder.size)
    })
    const sideOrder = (component: WardrobeSet['components'][number]) => {
      const side = `${component.name} ${component.attachedPartId}`.toLocaleLowerCase()
      const isLeft = /\besquerd[oa]\b|\bleft\b/.test(side)
      const isRight = /\bdireit[oa]\b|\bright\b/.test(side)
      return isLeft && !isRight ? 0 : isRight && !isLeft ? 1 : 2
    }
    const sortedAdjustmentComponents = selectedGroups.flatMap((group) => {
      const set = wardrobeDetails[`${group.modelSlot}:${group.setId}`]
      if (!set) return []
      const definition = scopeDefinitions.find((item) => item.id === group.category)
      const acceptedCategories = definition?.source ?? []
      const parts = group.componentId
        ? set.components.filter((component) => component.id === group.componentId)
        : set.components.filter((component) => acceptedCategories.includes(component.category))
      return parts.map((component) => ({ group: { ...group, componentId: component.id }, component, set, categoryOrder: scopeDefinitions.findIndex((item) => item.id === group.category), sourceOrder: acceptedCategories.indexOf(component.category) }))
    }).filter((entry, index, list) => list.findIndex((candidate) => candidate.group.modelSlot === entry.group.modelSlot && candidate.group.setId === entry.group.setId && candidate.group.category === entry.group.category && candidate.component.id === entry.component.id) === index)
      .sort((a, b) => {
        const setKeyA = `${a.group.modelSlot}:${a.group.setId}`
        const setKeyB = `${b.group.modelSlot}:${b.group.setId}`
        const setOrderDifference = (setOrder.get(setKeyA) ?? 0) - (setOrder.get(setKeyB) ?? 0)
        if (setOrderDifference) return setOrderDifference
        const categoryOrderDifference = a.categoryOrder - b.categoryOrder
        if (categoryOrderDifference) return categoryOrderDifference
        const sourceOrderDifference = a.sourceOrder - b.sourceOrder
        if (sourceOrderDifference) return sourceOrderDifference
        return sideOrder(a.component) - sideOrder(b.component)
      })
    const arePairSiblings = (a: (typeof sortedAdjustmentComponents)[number], b: (typeof sortedAdjustmentComponents)[number]) =>
      a.group.modelSlot === b.group.modelSlot && a.group.setId === b.group.setId && a.group.category === b.group.category && sideOrder(a.component) === 0 && sideOrder(b.component) === 1
    const adjustmentComponents = sortedAdjustmentComponents.map((entry, index, entries) => ({
      ...entry,
      pairStart: sideOrder(entry.component) === 0 && entries.slice(index + 1).some((candidate) => arePairSiblings(entry, candidate))
    }))
    const selectedAdjustmentComponent = !isHead && selectedClothing
      ? adjustmentComponents.find((entry) => entry.group.modelSlot === selectedClothing.modelSlot && entry.group.setId === selectedClothing.setId && entry.group.category === selectedClothing.category && entry.component.id === selectedClothing.componentId)
      : undefined
    const selectedAdjustmentPieceIsDimmed = Boolean(selectedAdjustmentComponent?.group.hidden)

    if (!isHead) {
      const transform = wardrobeTransformDraft ?? { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0 }
      const changeTransform = (patch: Partial<typeof transform>) => {
        const next = { ...transform, ...patch }
        void updateClothesAdjustComponent('transform', next)
      }
      const moveBy = (x: number, y: number) => changeTransform({ offsetX: transform.offsetX + x, offsetY: transform.offsetY + y })
      return <section className="customizer-adjust-picker customizer-clothes-adjust-detail" aria-label={`Ajustes de roupas ${adjustmentLabel.toLowerCase()}`}>
        <header className="customizer-adjust-heading customizer-clothes-adjust-detail-heading">
          <button className={`customizer-adjust-reset ${selectedAdjustmentPieceIsDimmed ? 'is-restore' : 'is-delete'}`} type="button" onClick={() => void updateClothesAdjustComponent('toggle-hidden')} disabled={!selectedCharacter || !selectedAdjustmentComponent} title={selectedAdjustmentPieceIsDimmed ? `Restaurar ${selectedAdjustmentComponent?.component.name || 'peça selecionada'}` : `Excluir ${selectedAdjustmentComponent?.component.name || 'peça selecionada'}`} aria-label={selectedAdjustmentPieceIsDimmed ? `Restaurar ${selectedAdjustmentComponent?.component.name || 'peça selecionada'}` : `Excluir ${selectedAdjustmentComponent?.component.name || 'peça selecionada'}`}><Icon name={selectedAdjustmentPieceIsDimmed ? 'undo' : 'trash'} /><span>{selectedAdjustmentPieceIsDimmed ? 'RESTAURAR' : 'EXCLUIR'}</span></button>
          <h2>Ajustar roupas · {adjustmentLabel}</h2>
        </header>
        {!selectedCharacter && <p className="customizer-adjust-hint">Selecione um personagem para ver as peças dele.</p>}
        {selectedCharacter && <div className="customizer-clothes-adjust-workspace">
          <section className="customizer-clothes-adjust-parts" aria-label={`Peças de roupas ${adjustmentLabel.toLowerCase()}`}>
            <header><strong>Roupas · {adjustmentLabel}</strong><small>{adjustmentComponents.length} peça(s)</small></header>
            {adjustmentComponents.length ? <div className="customizer-clothes-adjust-part-grid">
              {adjustmentComponents.map(({ group, component, set, pairStart }) => {
                const isSelected = selectedClothing?.modelSlot === group.modelSlot && selectedClothing.setId === group.setId && selectedClothing.category === group.category && selectedClothing.componentId === component.id
                const isDimmed = Boolean(group.hidden)
                return <div key={`${group.modelSlot}:${group.setId}:${component.id}`} className={`customizer-clothes-adjust-part${isSelected ? ' selected' : ''}${isDimmed ? ' dimmed' : ''}${pairStart ? ' pair-start' : ''}`}>
                  <button type="button" className="customizer-clothes-adjust-part-select" aria-pressed={isSelected} onClick={() => {
                    setSelectedClothing({ modelSlot: group.modelSlot, setId: group.setId, category: group.category, componentId: component.id })
                    selectAdjustmentPreviewTarget({ scope: 'clothing', piece: { modelSlot: group.modelSlot, setId: group.setId, category: group.category, componentId: component.id } })
                  }}>
                    <span className="customizer-clothes-adjust-part-preview"><img src={component.dataUrl} alt="" /></span>
                    <strong title={component.name}>{component.name || component.attachedPartId}</strong>
                    <small>{set.name}</small>
                  </button>
                </div>
              })}
            </div> : <p className="customizer-clothes-adjust-empty">Nenhuma peça aplicada em <strong>{adjustmentLabel}</strong> neste personagem. Escolha uma peça nesta categoria para ajustar seus componentes.</p>}
          </section>
          {selectedAdjustmentComponent ? <section className="customizer-clothes-adjust-controls" aria-label="Controles da peça selecionada">
            <div className="customizer-clothes-adjust-position">
              <div className="customizer-clothes-adjust-pad" aria-label="Mover a peça">
                <button type="button" aria-label="Mover para cima" onClick={() => moveBy(0, -1)}>↑</button>
                <button type="button" aria-label="Mover para a esquerda" onClick={() => moveBy(-1, 0)}>←</button>
                <span><Icon name="move" /></span>
                <button type="button" aria-label="Mover para a direita" onClick={() => moveBy(1, 0)}>→</button>
                <button type="button" aria-label="Mover para baixo" onClick={() => moveBy(0, 1)}>↓</button>
              </div>
            </div>
            <div className="customizer-clothes-adjust-axis-grid">
              {([{ key: 'scaleX', label: 'Largura', min: .05, max: 5, step: .02 }, { key: 'scaleY', label: 'Altura', min: .05, max: 5, step: .02 }] as const).map(({ key, label, min, max, step }) => <div className="customizer-clothes-adjust-axis" key={key}>
                <strong>{label} <output>{Math.round(transform[key] * 100)}%</output></strong>
                <button type="button" aria-label={`Diminuir ${label.toLowerCase()}`} onClick={() => changeTransform({ [key]: Math.max(min, Number((transform[key] - step).toFixed(2))) })}>−</button>
                <button type="button" aria-label={`Aumentar ${label.toLowerCase()}`} onClick={() => changeTransform({ [key]: Math.min(max, Number((transform[key] + step).toFixed(2))) })}>+</button>
              </div>)}
            </div>
            <div className="customizer-clothes-adjust-rotation"><strong>Rotação <output>{Math.round(transform.rotation)}°</output></strong><button type="button" aria-label="Girar para a esquerda" onClick={() => changeTransform({ rotation: transform.rotation - 1 })}>↶</button><button type="button" aria-label="Girar para a direita" onClick={() => changeTransform({ rotation: transform.rotation + 1 })}>↷</button></div>
          </section> : <div className="customizer-clothes-adjust-empty-controls">Selecione uma peça na lista para ajustar.</div>}
        </div>}
      </section>
    }
      const items = headAdjustmentItemsFor(headCategorySelection)
    const selectedId = headAdjustSelection
    const reset = restoreHeadAdjustments
    const previewFor = (id: string): string | null => {
      if (!selectedCharacter) return null
      if (isHead) {
        const appearance = selectedCharacter.customization.faceAppearance
        const hairPart = hairCategories.find((part) => part.id === id)
        if (hairPart) {
          const styleId = hairAppearancePartStyleId(selectedCharacter.customization.hairAppearance, hairPart.id)
          const modelSlot = selectedCharacter.customization.hairAppearance?.modelSlot
          return styleId && modelSlot ? hairDetails[`${modelSlot}:${styleId}`]?.[hairPart.side]?.dataUrl ?? null : null
        }
        const facePart = id as FaceComponentPartId
        const componentId = appearance?.components?.[facePart]?.assetId
        if (componentId) return faceComponentDetails[componentId]?.dataUrl ?? null
        const detailId = appearance?.faceDetails?.[id as FaceDetailKind]
        if (detailId) return faceComponentDetails[detailId]?.dataUrl ?? null
        if (id === 'oculos' || id === 'acessorio-cabeca') {
          const wardrobeGroup = [...(selectedCharacter.customization.wardrobeGroups ?? [])].reverse().find((group) => group.category === id)
          if (wardrobeGroup) {
            const wardrobeSet = wardrobeDetails[`${wardrobeGroup.modelSlot}:${wardrobeGroup.setId}`]
            const component = wardrobeSet?.components.find((entry) => entry.id === wardrobeGroup.componentId)
              ?? wardrobeSet?.components.find((entry) => entry.category === wardrobeGroup.category)
            if (component?.dataUrl) return component.dataUrl
          }
        }
        const extraId = appearance?.headExtras?.[id === 'oculos' ? 'glasses' : 'head-accessory']
        if (extraId) return faceComponentDetails[extraId]?.dataUrl ?? null
        const catalogId = id === 'eye-right' || id === 'pupil-right' ? appearance?.eyeRightCatalogId ?? appearance?.eyeCatalogId
          : id.startsWith('eye-') || id.startsWith('pupil-') ? appearance?.eyeLeftCatalogId ?? appearance?.eyeCatalogId
          : id === 'brow-right' ? appearance?.eyebrowRightCatalogId ?? appearance?.eyebrowCatalogId
            : id.startsWith('brow-') ? appearance?.eyebrowLeftCatalogId ?? appearance?.eyebrowCatalogId
            : id === 'nose' ? appearance?.noseCatalogId : id === 'mouth' ? appearance?.mouthClosedCatalogId : undefined
        const catalog = catalogId ? faceCatalogDetails[`${appearance?.modelSlot}:${catalogId}`] : undefined
        return catalog?.pieces[0]?.dataUrl ?? null
      }
      const group = selectedCharacter.customization.wardrobeGroups?.find((entry) => entry.category === id)
      if (!group) return null
      const set = wardrobeDetails[`${group.modelSlot}:${group.setId}`]
      return set?.components.find((component) => component.id === group.componentId)?.dataUrl ?? set?.components.find((component) => component.category === group.category)?.dataUrl ?? null
    }
    if (isHead) {
      const selectedItem = items.find((item) => item.id === selectedId)
      const appliedItems = items.filter((item) => hasHeadAdjustmentItem(item.id))
      const selectedWardrobeGroup = selectedId === 'oculos' || selectedId === 'acessorio-cabeca' ? [...(selectedCharacter?.customization.wardrobeGroups ?? [])].reverse().find((group) => group.category === selectedId) : undefined
      const selectedOverride = selectedId ? selectedCharacter?.customization.partOverrides?.[`head:${selectedId}`] : undefined
      const transform = { x: selectedWardrobeGroup?.offsetX ?? selectedOverride?.x ?? 0, y: selectedWardrobeGroup?.offsetY ?? selectedOverride?.y ?? 0, scaleX: selectedWardrobeGroup?.scaleX ?? selectedOverride?.scaleX ?? 1, scaleY: selectedWardrobeGroup?.scaleY ?? selectedOverride?.scaleY ?? 1, rotation: selectedWardrobeGroup?.rotation ?? selectedOverride?.rotation ?? 0 }
      const selectedDimmed = Boolean(selectedWardrobeGroup?.hidden ?? selectedOverride?.hidden)
      const changeTransform = (patch: Partial<typeof transform>) => void updateHeadAdjustment('transform', { ...transform, ...patch })
      const moveBy = (x: number, y: number) => changeTransform({ x: transform.x + x, y: transform.y + y })
      const headLabel = customizerHeadTabs.find((tab) => tab.id === headCategorySelection)?.label ?? 'categoria selecionada'
      return <section className="customizer-adjust-picker customizer-clothes-adjust-detail" aria-label={`Ajustes de cabeça · ${headLabel}`}>
        <header className="customizer-adjust-heading customizer-clothes-adjust-detail-heading">
          <button className={`customizer-adjust-reset ${selectedDimmed ? 'is-restore' : 'is-delete'}`} type="button" onClick={() => void updateHeadAdjustment('toggle-hidden')} disabled={!selectedCharacter || !selectedId || !hasHeadAdjustmentItem(selectedId)} title={selectedDimmed ? 'Restaurar item selecionado' : 'Excluir item selecionado'} aria-label={selectedDimmed ? 'Restaurar item selecionado' : 'Excluir item selecionado'}><Icon name={selectedDimmed ? 'undo' : 'trash'} /><span>{selectedDimmed ? 'RESTAURAR' : 'EXCLUIR'}</span></button>
          <h2>Ajustar cabeça · {headLabel}</h2>
        </header>
        {!selectedCharacter && <p className="customizer-adjust-hint">Selecione um personagem para ver os itens de cabeça.</p>}
        {selectedCharacter && <div className="customizer-clothes-adjust-workspace">
          <section className="customizer-clothes-adjust-parts" aria-label="Itens de cabeça aplicados">
            <header><strong>Itens da cabeça</strong><small>{appliedItems.length} item(ns)</small></header>
            {appliedItems.length ? <div className="customizer-clothes-adjust-part-grid">
              {appliedItems.map((item) => {
                const override = selectedCharacter.customization.partOverrides?.[`head:${item.id}`]
                const dimmed = Boolean(override?.hidden || selectedCharacter.customization.wardrobeGroups?.some((group) => group.category === item.id && group.hidden))
                const preview = previewFor(item.id)
                return <div key={item.id} className={`customizer-clothes-adjust-part${selectedId === item.id ? ' selected' : ''}${dimmed ? ' dimmed' : ''}`}>
                  <button type="button" className="customizer-clothes-adjust-part-select" aria-pressed={selectedId === item.id} onClick={() => { setHeadAdjustSelection(item.id); selectAdjustmentPreviewTarget({ scope: 'head', id: item.id }) }}>
                    <span className="customizer-clothes-adjust-part-preview">{preview ? <img src={preview} alt="" style={{ transform: mirroredFaceThumbnailIds.has(item.id as FaceComponentPartId) ? 'scaleX(-1)' : undefined }} /> : <Icon name={item.icon} />}</span>
                    <strong title={item.label}>{item.label}</strong><small>Somente neste personagem</small>
                  </button>
                </div>
              })}
            </div> : <p className="customizer-clothes-adjust-empty">Nenhum item aplicado em <strong>{headLabel}</strong> neste personagem. Escolha um item nesta categoria para ajustar separadamente.</p>}
          </section>
          {selectedItem && hasHeadAdjustmentItem(selectedItem.id) ? <section className="customizer-clothes-adjust-controls" aria-label="Controles do item de cabeça selecionado">
            <div className="customizer-clothes-adjust-position">
              <div className="customizer-clothes-adjust-pad" aria-label="Mover o item">
                <button type="button" aria-label="Mover para cima" onClick={() => moveBy(0, -1)}>↑</button><button type="button" aria-label="Mover para a esquerda" onClick={() => moveBy(-1, 0)}>←</button><span><Icon name="move" /></span><button type="button" aria-label="Mover para a direita" onClick={() => moveBy(1, 0)}>→</button><button type="button" aria-label="Mover para baixo" onClick={() => moveBy(0, 1)}>↓</button>
              </div>
            </div>
            <div className="customizer-clothes-adjust-axis-grid">{([{ key: 'scaleX', label: 'Largura' }, { key: 'scaleY', label: 'Altura' }] as const).map(({ key, label }) => <div className="customizer-clothes-adjust-axis" key={key}><strong>{label} <output>{Math.round(transform[key] * 100)}%</output></strong><button type="button" aria-label={`Diminuir ${label.toLowerCase()}`} onClick={() => changeTransform({ [key]: Math.max(.05, Number((transform[key] - .02).toFixed(2))) })}>−</button><button type="button" aria-label={`Aumentar ${label.toLowerCase()}`} onClick={() => changeTransform({ [key]: Math.min(5, Number((transform[key] + .02).toFixed(2))) })}>+</button></div>)}</div>
            <div className="customizer-clothes-adjust-rotation"><strong>Rotação <output>{Math.round(transform.rotation)}°</output></strong><button type="button" aria-label="Girar para a esquerda" onClick={() => changeTransform({ rotation: transform.rotation - 1 })}>↶</button><button type="button" aria-label="Girar para a direita" onClick={() => changeTransform({ rotation: transform.rotation + 1 })}>↷</button></div>
          </section> : <div className="customizer-clothes-adjust-empty-controls">Selecione um item aplicado na lista para ajustar.</div>}
        </div>}
      </section>
    }
    return <section className="customizer-adjust-picker" aria-label={isHead ? 'Ajustes de cabeça' : 'Ajustes de roupas'}>
      <header className="customizer-adjust-heading">
        <button className="customizer-adjust-reset" type="button" onClick={reset} disabled={!selectedCharacter} title="Restaurar ajustes deste personagem"><Icon name="reset" /><span>RESTAURAR</span></button>
        <h2>Selecione um item para ajustar</h2>
      </header>
      {!selectedCharacter && <p className="customizer-adjust-hint">Selecione um personagem para ver as peças dele.</p>}
      <div className="customizer-adjust-grid">
        {items.map((item) => {
          const applied = isHead ? hasHeadAdjustmentItem(item.id) : Boolean(selectedCharacter?.customization.wardrobeGroups?.some((group) => group.category === item.id))
          const selected = selectedId === item.id
          const preview = previewFor(item.id)
          return <button key={item.id} className={`customizer-adjust-card${selected ? ' selected' : ''}${applied ? ' applied' : ''}`} type="button" disabled={!selectedCharacter} aria-pressed={selected} onClick={() => { setHeadAdjustSelection(item.id); selectAdjustmentPreviewTarget({ scope: 'head', id: item.id }) }} title={`${item.label}${applied ? ' · aplicado neste personagem' : ' · sem peça aplicada'}`}>
            <span className="customizer-adjust-card-label">{item.label}</span>
            <span className="customizer-adjust-card-preview">{preview ? <img src={preview} alt="" style={{ transform: mirroredFaceThumbnailIds.has(item.id as FaceComponentPartId) ? 'scaleX(-1)' : undefined }} /> : <Icon name={item.icon} />}{applied && <i><Icon name="check" /></i>}</span>
            <small>{applied ? 'Aplicado' : 'Sem peça'}</small>
          </button>
        })}
      </div>
      {selectedId && <div className="customizer-adjust-selection" role="status">Categoria selecionada: <strong>{items.find((item) => item.id === selectedId)?.label}</strong>{!items.some((item) => item.id === selectedId && (isHead ? hasHeadAdjustmentItem(item.id) : selectedCharacter?.customization.wardrobeGroups?.some((group) => group.category === item.id))) && <span> · nenhuma peça aplicada neste personagem</span>}</div>}
      <p className="customizer-adjust-scope">Os ajustes desta área pertencem somente ao personagem selecionado.</p>
    </section>
  }

  if (activeModule !== null && modules.some((module) => module.name === activeModule)) {
    return (
      <div className="customizer-models-view">
        <div className="customizer-models-columns">
          <section className="customizer-model-preview" aria-label="Prévia do personagem">
            <div className="stage-wrap customizer-preview-stage-wrap" ref={customizerPreviewStageRef}>
              <div className="stage-scene customizer-preview-pan-surface" style={customizerPreviewStyle} onPointerDown={beginCustomizerPreviewPan} onPointerMove={moveCustomizerPreviewPan} onPointerUp={finishCustomizerPreviewPan} onPointerCancel={finishCustomizerPreviewPan}>
                <button className="customizer-back-button customizer-preview-back" onClick={() => setActiveModule(null)} aria-label="Voltar ao Customizar" title="Voltar ao Customizar" type="button"><Icon name="close" /></button>
                <div className="customizer-preview-controls" aria-label="Controles da prévia">
                  <label className="preview-scene-color" title="Mudar a cor do fundo da prévia">
                    <span className="preview-color-swatch" style={{ backgroundColor: previewBackground }} />
                    <input type="color" aria-label="Cor do fundo da prévia" value={previewBackground} onChange={(event) => setPreviewBackground(event.target.value)} />
                  </label>
                  <button aria-label="Tela cheia" title="Tela cheia" onClick={() => {
                    const stage = customizerPreviewStageRef.current
                    if (!stage) return
                    if (document.fullscreenElement === stage) void document.exitFullscreen()
                    else void stage.requestFullscreen()
                  }} type="button"><Icon name="expand" /></button>
                  <button aria-label="Afastar" title="Afastar" onClick={() => setCustomizerPreviewZoom((zoom) => Math.max(.75, Number((zoom - .1).toFixed(2))))} type="button"><Icon name="zoomOut" /></button>
                  <button aria-label="Aproximar" title="Aproximar" onClick={() => setCustomizerPreviewZoom((zoom) => Math.min(4, Number((zoom + .1).toFixed(2))))} type="button"><Icon name="zoomIn" /></button>
                  <button aria-label="Restaurar zoom" title="Restaurar zoom" onClick={() => setCustomizerPreviewZoom(1.15)} type="button"><Icon name="reset" /></button>
                </div>
                {selectedArtworkUrl ? <img className="customizer-selected-artwork" src={selectedArtworkUrl} alt={selectedArtworkLabel} /> : !previewLoading && <div className="customizer-no-artwork"><Icon name="body" /><span>Nenhum modelo salvo para mostrar.</span></div>}
              {selectedWardrobeUrl && selectedArtworkUrl && <img className={'customizer-wardrobe-overlay' + (wardrobePreviewDraggable ? ' draggable' : '')} src={selectedWardrobeUrl} alt="Roupas do personagem" draggable={false} onPointerDown={wardrobePreviewDraggable ? beginWardrobeDrag : undefined} onPointerMove={wardrobePreviewDraggable ? moveWardrobeDrag : undefined} onPointerUp={wardrobePreviewDraggable ? finishWardrobeDrag : undefined} onPointerCancel={wardrobePreviewDraggable ? finishWardrobeDrag : undefined} />}
              {selectedFaceUrl && selectedArtworkUrl && <img className="customizer-face-overlay" src={selectedFaceUrl} alt="Rosto do personagem" draggable={false} />}
              {selectedFrontHairUrl && selectedArtworkUrl && <img className="customizer-front-hair-overlay" src={selectedFrontHairUrl} alt="Cabelo posterior e franja frontal" draggable={false} />}
              {selectedWardrobeAboveHairUrl && selectedArtworkUrl && <img className="customizer-wardrobe-above-hair-overlay" src={selectedWardrobeAboveHairUrl} alt="Óculos e acessórios de cabeça por cima dos cabelos" draggable={false} />}
                {previewLoading && <div className="customizer-preview-loading">Carregando prévia…</div>}
              </div>
            </div>
          </section>
          <section className={`customizer-models-sidebar${selectedCustomizerTopTab === 'roupas' && (clothesPanelTab === 'upper' || clothesPanelTab === 'lower' || clothesPanelTab === 'adjust') ? ' customizer-models-sidebar-clothes-upper' : ''}`} aria-label="Categorias de personalização">
            <div className={`customizer-models-sidebar-nav${selectedCustomizerTopTab === 'roupas' ? ' customizer-models-sidebar-nav-clothes' : ''}`}>
            <nav className="customizer-top-tabs" aria-label="Áreas do Customizar" role="tablist">
              {customizerTopTabs.map((tab) => <button
                key={tab.id}
                className={selectedCustomizerTopTab === tab.id ? 'active' : ''}
                onClick={() => {
                  setSelectedCustomizerTopTab(tab.id)
                  const moduleByTab: Record<string, string> = { modelos: 'Modelos', corpo: 'Modelos', cabeca: 'Cabeça', roupas: 'Roupas', outros: 'Acessórios', perfil: 'Perfil' }
                  setActiveModule(moduleByTab[tab.id])
                }}
                aria-selected={selectedCustomizerTopTab === tab.id}
                role="tab"
                type="button"
              ><CustomizerCategoryIcon category={tab.id} /><span>{tab.label}</span></button>)}
            </nav>
            {selectedCustomizerTopTab === 'cabeca' && <nav className="customizer-head-category-tabs" aria-label="Categorias de cabeça" role="tablist">
              {customizerHeadTabs.map((tab) => <button key={tab.id} className={headPanelTab === tab.id || headPanelTab === 'adjust' && headCategorySelection === tab.id ? 'active' : ''} onClick={() => {
                const nextTab = tab.id === 'adjust' && headPanelTab === 'adjust' ? headCategorySelection : tab.id
                setHeadPanelTab(nextTab)
                if (nextTab !== 'adjust') setHeadCategorySelection(nextTab)
              }} aria-selected={headPanelTab === tab.id} role="tab" type="button"><Icon name={tab.icon} /><span>{tab.label}</span></button>)}
            </nav>}
            {selectedCustomizerTopTab === 'roupas' && <nav className="customizer-clothes-category-tabs" aria-label="Categorias de roupas" role="tablist">
              {customizerClothesTabs.map((tab) => <button key={tab.id} className={clothesPanelTab === tab.id || clothesPanelTab === 'adjust' && clothesCategorySelection === tab.id ? 'active' : ''} onClick={() => {
                if (tab.id === clothesPanelTab && (tab.id === 'upper' || tab.id === 'lower')) {
                  if (tab.id === 'upper') setUpperWardrobePage((page) => page === 1 ? 2 : 1)
                  else setLowerWardrobePage((page) => page === 1 ? 2 : 1)
                  setWardrobeLibraryPanel(null)
                }
                const nextTab = tab.id === 'adjust' && clothesPanelTab === 'adjust' ? clothesCategorySelection : tab.id
                setClothesPanelTab(nextTab)
                if (nextTab !== 'adjust') setClothesCategorySelection(nextTab)
                if (nextTab === 'upper') setClothingSection('Superior')
                else if (nextTab === 'lower') setClothingSection('Inferior')
              }} aria-selected={clothesPanelTab === tab.id} role="tab" type="button"><Icon name={tab.icon} />{tab.id === 'upper' || tab.id === 'lower' ? <span className="customizer-upper-tab-label"><span>{tab.label}</span><small>{tab.id === 'upper' ? upperWardrobePage : lowerWardrobePage}/2</small></span> : <span>{tab.label}</span>}</button>)}
            </nav>}
            {selectedCustomizerTopTab === 'outros' && <nav className="customizer-other-category-tabs" aria-label="Categorias de outros itens" role="tablist">
              {customizerOtherTabs.map((tab) => <button key={tab.id} className={otherPanelTab === tab.id ? 'active' : ''} onClick={() => setOtherPanelTab(tab.id)} aria-selected={otherPanelTab === tab.id} role="tab" type="button"><Icon name={tab.icon} /><span>{tab.label}</span></button>)}
            </nav>}
            </div>
            <div className={`customizer-sidebar-scroll-content${selectedCustomizerTopTab === 'cabeca' && (headPanelTab === 'hair' || headPanelTab === 'eyes' || headPanelTab === 'face') ? ' customizer-sidebar-scroll-content-hair' : ''}${selectedCustomizerTopTab === 'roupas' && (clothesPanelTab === 'upper' || clothesPanelTab === 'lower' || clothesPanelTab === 'adjust') ? ' customizer-sidebar-scroll-content-clothes-upper' : ''}`} aria-label={`Conteúdo de ${customizerTopTabs.find((tab) => tab.id === selectedCustomizerTopTab)?.label ?? 'personalização'}`}>
            {selectedCustomizerTopTab === 'cabeca' && headPanelTab === 'hair' && (hairLibraryPart ? renderHairLibrary() : renderHairCustomizer())}
            {selectedCustomizerTopTab === 'cabeca' && headPanelTab === 'eyes' && (faceLibraryPart ? renderFaceLibrary() : renderFaceCustomizer())}
            {selectedCustomizerTopTab === 'cabeca' && headPanelTab === 'face' && renderFaceCatalogCustomizer()}
            {selectedCustomizerTopTab === 'cabeca' && headPanelTab === 'extra' && renderWardrobeCatalog()}
            {selectedCustomizerTopTab === 'cabeca' && headPanelTab === 'adjust' && renderAdjustmentPicker('head')}
            {selectedCustomizerTopTab === 'roupas' && (clothesPanelTab === 'upper' || clothesPanelTab === 'lower') && renderWardrobeCatalog()}
            {selectedCustomizerTopTab === 'roupas' && clothesPanelTab === 'adjust' && renderAdjustmentPicker('clothes')}
            {selectedCustomizerTopTab === 'modelos' && <section className="customizer-model-skin-tones" aria-label="Cor de pele do modelo">
              <strong>Cor de pele</strong>
              <div className="customizer-model-skin-tone-row" role="group" aria-label="Escolher cor de pele">
                <button className={'customizer-model-skin-tone' + (!selectedSkinTone ? ' selected' : '')} style={{ '--skin-tone': originalSkinTone ?? skinTonePresets[0].id } as React.CSSProperties} onClick={() => void saveCharacterCustomization({ modelSkinTone: undefined })} aria-label="Cor original do modelo" aria-pressed={!selectedSkinTone} title="Cor original do modelo" type="button" disabled={!selectedCharacter}><span />{!selectedSkinTone && <Icon name="check" />}</button>
                {customizerSkinTonePresets.map((preset) => {
                  const selected = selectedSkinTone === preset.id
                  return <button key={preset.id} className={'customizer-model-skin-tone' + (selected ? ' selected' : '')} style={{ '--skin-tone': preset.id } as React.CSSProperties} onClick={() => void saveCharacterCustomization({ modelSkinTone: preset.id })} aria-label={`Tom de pele ${preset.name}`} aria-pressed={selected} title={preset.name} type="button" disabled={!selectedCharacter}><span />{selected && <Icon name="check" />}</button>
                })}
                <label className={'customizer-model-skin-picker' + (selectedSkinTone && !customizerSkinTonePresets.some((preset) => preset.id === selectedSkinTone) ? ' selected' : '')} title="Escolher uma cor personalizada">
                  <input type="color" aria-label="Escolher cor de pele personalizada" value={selectedSkinTone ?? originalSkinTone ?? skinTonePresets[0].id} onChange={(event) => void saveCharacterCustomization({ modelSkinTone: event.target.value })} disabled={!selectedCharacter} />
                  <span className="customizer-model-skin-picker-swatch" style={{ '--skin-tone': selectedSkinTone ?? originalSkinTone ?? skinTonePresets[0].id } as React.CSSProperties}><Icon name="brush" /></span>
                </label>
              </div>
            </section>}
            {selectedCustomizerTopTab === 'modelos' && <section className="customizer-pose-carousel" aria-label="Pose do modelo">
              <header className="customizer-pose-carousel-heading" aria-live="polite">
                <strong>{selectedPoseCategory} · Página {activePosePage + 1}{posePageCount > 1 ? ` de ${posePageCount}` : ''}</strong>
              </header>
              <div className="customizer-pose-carousel-body">
                <div className="customizer-pose-carousel-nav" role="group" aria-label="Navegação à esquerda">
                  <button className="customizer-pose-carousel-arrow category" aria-label="Categoria anterior" title="Categoria anterior" onClick={() => showAdjacentPoseCategory(-1)} type="button"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M13 2 0 16l13 14v-8h19V10H13z" /></svg></button>
                  <button className="customizer-pose-carousel-arrow page" aria-label="Página anterior de poses" title="Página anterior" onClick={() => showAdjacentPosePage(-1)} disabled={activePosePage === 0} type="button"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M13 2 0 16l13 14v-8h19V10H13z" /></svg></button>
                </div>
                <div className="customizer-pose-carousel-poses">
                  {visibleCategoryPoses.map((pose) => <button className={`customizer-pose-carousel-image${selectedCatalogPoseSlot === pose.slot ? ' selected' : ''}`} key={`${pose.sourceModelSlot}:${pose.slot}`} onClick={() => void selectCatalogPose(pose)} disabled={!selectedCharacter || previewLoading} title={`Pose ${String(pose.slot).padStart(2, '0')}: ${pose.name}`} aria-label={`Selecionar pose ${String(pose.slot).padStart(2, '0')}`} aria-pressed={selectedCatalogPoseSlot === pose.slot} type="button">{poseThumbnails[`${pose.sourceModelSlot}:${pose.slot}`] ? <img src={poseThumbnails[`${pose.sourceModelSlot}:${pose.slot}`]} alt="" /> : <span>Pose {String(pose.slot).padStart(2, '0')}</span>}</button>)}
                  {Array.from({ length: Math.max(0, 5 - visibleCategoryPoses.length) }, (_, index) => <span className="customizer-pose-carousel-empty" key={`empty-${index}`} />)}
                </div>
                <div className="customizer-pose-carousel-nav" role="group" aria-label="Navegação à direita">
                  <button className="customizer-pose-carousel-arrow category" aria-label="Próxima categoria" title="Próxima categoria" onClick={() => showAdjacentPoseCategory(1)} type="button"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M19 2 32 16 19 30v-8H0V10h19z" /></svg></button>
                  <button className="customizer-pose-carousel-arrow page" aria-label="Próxima página de poses" title="Próxima página" onClick={() => showAdjacentPosePage(1)} disabled={activePosePage >= posePageCount - 1} type="button"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M19 2 32 16 19 30v-8H0V10h19z" /></svg></button>
                </div>
              </div>
            </section>}
            {selectedCustomizerTopTab === 'modelos' && <section className="customizer-proportions" aria-label="Proporções do personagem">
              <header><strong>Proporções</strong><button onClick={() => commitProportions({ ...defaultCharacterProportions })} disabled={!selectedCharacter} type="button">Restaurar</button></header>
              <div className="customizer-proportions-grid">{proportionControls.map(({ key, label, description }) => {
                const limits = characterProportionLimits[key]
                return <div className="customizer-proportion-control" key={key} title={description}>
                  <div className="customizer-proportion-heading"><label htmlFor={`character-proportion-${key}`}>{label}</label><output>{activeProportions[key]}%</output></div>
                  <div className="customizer-proportion-inputs">
                    <button aria-label={`Diminuir ${label.toLowerCase()}`} disabled={!selectedCharacter || activeProportions[key] <= limits.min} onClick={() => commitProportion(key, activeProportions[key] - 1)} type="button">−</button>
                    <input id={`character-proportion-${key}`} type="range" min={limits.min} max={limits.max} step="1" value={activeProportions[key]} disabled={!selectedCharacter} onChange={(event) => changeProportion(key, Number(event.target.value))} onPointerUp={(event) => commitProportion(key, Number(event.currentTarget.value))} onPointerCancel={(event) => commitProportion(key, Number(event.currentTarget.value))} onKeyUp={(event) => commitProportion(key, Number(event.currentTarget.value))} onBlur={(event) => commitProportion(key, Number(event.currentTarget.value))} />
                    <button aria-label={`Aumentar ${label.toLowerCase()}`} disabled={!selectedCharacter || activeProportions[key] >= limits.max} onClick={() => commitProportion(key, activeProportions[key] + 1)} type="button">+</button>
                  </div>
                </div>
              })}</div>
            </section>}
            {selectedCustomizerTopTab === 'modelos' && <section className="customizer-body-shape" aria-label="Ajuste de largura e altura das partes do corpo">
              <header><span><strong>Corpo · tronco e membros</strong><small>As peças acompanham as juntas, com ajustes separados para coxas e pernas inferiores.</small></span><button onClick={() => { setBodyDimensionEdit(selectedCharacter ? { characterId: selectedCharacter.id, values: { ...defaultCharacterBodyDimensions } } : null); commitBodyDimensions({ ...defaultCharacterBodyDimensions }) }} disabled={!selectedCharacter} type="button">Restaurar</button></header>
              <div className="customizer-body-shape-grid">{([
                { name: 'Tronco', width: 'torsoWidth', height: 'torsoHeight' },
                { name: 'Braços', width: 'armsWidth', height: 'armsHeight' },
                { name: 'Coxas', width: 'thighsWidth', height: 'thighsHeight' },
                { name: 'Pernas inferiores', width: 'lowerLegsWidth', height: 'lowerLegsHeight' }
              ] as const).map(({ name, width, height }) => <fieldset className="customizer-body-part" key={name}>
                <legend>{name}</legend>
                {([['width', width, 'Largura'], ['height', height, 'Altura']] as const).map(([axis, key, label]) => {
                  const limits = characterBodyDimensionLimits[key]
                  const finish = (value: number) => commitBodyDimension(key, value)
                  return <label className="customizer-body-axis" key={axis}><span>{label}<output>{activeBodyDimensions[key]}%</output></span><div className="customizer-proportion-inputs"><button aria-label={`Diminuir ${label.toLowerCase()} de ${name}`} disabled={!selectedCharacter || activeBodyDimensions[key] <= limits.min} onClick={() => finish(activeBodyDimensions[key] - 1)} type="button">−</button><input aria-label={`${label} de ${name}`} type="range" min={limits.min} max={limits.max} step="1" value={activeBodyDimensions[key]} disabled={!selectedCharacter} onChange={(event) => changeBodyDimension(key, Number(event.target.value))} onPointerUp={(event) => finish(Number(event.currentTarget.value))} onPointerCancel={(event) => finish(Number(event.currentTarget.value))} onKeyUp={(event) => finish(Number(event.currentTarget.value))} onBlur={(event) => finish(Number(event.currentTarget.value))} /><button aria-label={`Aumentar ${label.toLowerCase()} de ${name}`} disabled={!selectedCharacter || activeBodyDimensions[key] >= limits.max} onClick={() => finish(activeBodyDimensions[key] + 1)} type="button">+</button></div></label>
                })}
              </fieldset>)}</div>
              <label className="customizer-body-balance"><span><b>Harmonia corporal</b><output>{activeBodyDimensions.balance}%</output></span><small>Coxas maiores aumentam um pouco o tronco; tronco maior aumenta um pouco braços e pernas. Em 0%, só o controle escolhido muda de tamanho.</small><input aria-label="Harmonia corporal" type="range" min="0" max="100" step="1" value={activeBodyDimensions.balance} disabled={!selectedCharacter} onChange={(event) => changeBodyDimension('balance', Number(event.target.value))} onPointerUp={(event) => commitBodyDimension('balance', Number(event.currentTarget.value))} onPointerCancel={(event) => commitBodyDimension('balance', Number(event.currentTarget.value))} onKeyUp={(event) => commitBodyDimension('balance', Number(event.currentTarget.value))} onBlur={(event) => commitBodyDimension('balance', Number(event.currentTarget.value))} /></label>
            </section>}
            </div>
            <div className="customizer-models-content" hidden>
            <div className="customizer-models-options-grid">
              {modules.map((module, index) => (
                <button
                  className={`customizer-model-option${activeModule === module.name ? ' selected' : ''}`}
                  key={module.name}
                  onClick={() => {
                    setActiveModule(module.name)
                    if (module.name === 'Modelos' && selectedCatalogModelSlot !== null) {
                      const selectedModel = availableModels.find((model) => model.slot === selectedCatalogModelSlot)
                      if (selectedModel) void selectCatalogModel(selectedModel)
                    }
                  }}
                  aria-pressed={activeModule === module.name}
                  title={module.detail}
                  type="button"
                >
                  <span className="customizer-model-option-icon"><Icon name={module.icon} /></span>
                  <span className="customizer-model-option-name">{module.name}</span>
                  {index === 0 && <span className="customizer-model-option-new">NOVO</span>}
                </button>
              ))}
            </div>
            <section className="customizer-catalog-panel" aria-label={'Catálogo de ' + activeModule}>
              <header className="customizer-catalog-heading">
                <div><p className="eyebrow">CATÁLOGO</p><h2>{activeModule === 'Poses' ? selectedModelName ?? 'Escolha um modelo' : activeModule}</h2></div>
                {activeModule === 'Modelos' && <small>{availableModels.length} modelos</small>}
                {activeModule === 'Poses' && selectedCatalogModelSlot !== null && <small>{availablePoses.length} poses</small>}
              </header>
              {catalogError && <p className="customizer-catalog-error" role="alert">{catalogError}</p>}
              {activeModule === 'Modelos' && (
                catalogLoading ? <div className="customizer-catalog-empty">Carregando modelos…</div>
                  : availableModels.length === 0 ? <div className="customizer-catalog-empty">Nenhum modelo salvo ainda.</div>
                    : <div className="customizer-catalog-grid customizer-model-catalog">
                      {availableModels.map((model) => (
                        <button className={'customizer-catalog-card model-catalog-card' + (selectedCatalogModelSlot === model.slot ? ' selected' : '')} key={model.slot} onClick={() => void selectCatalogModel(model)} aria-label={'Selecionar ' + model.name} aria-pressed={selectedCatalogModelSlot === model.slot} title={model.name} type="button">
                          {modelThumbnails[model.slot] ? <img src={modelThumbnails[model.slot]} alt="" /> : <span className="customizer-catalog-placeholder"><Icon name="body" /></span>}
                        </button>
                      ))}
                    </div>
              )}
              {activeModule === 'Modelos' && selectedCharacter && selectedCatalogModelSlot !== null && <section className="customizer-skin-tones" aria-label="Cor de pele do personagem">
                <header><strong>Cor da pele</strong><small>Salva somente em {selectedCharacter.name}</small></header>
                <div className="customizer-skin-tone-options" role="group" aria-label="Escolher tom de pele">
                  {skinTonePresets.map((preset) => {
                    const selected = selectedCharacter.customization.modelSkinTone === preset.id
                    return <button key={preset.id} className={'customizer-skin-tone' + (selected ? ' selected' : '')} style={{ '--skin-tone': preset.id } as React.CSSProperties} onClick={() => void saveCharacterCustomization({ modelSkinTone: preset.id })} aria-label={`Tom de pele ${preset.name}`} aria-pressed={selected} title={preset.name} type="button"><span />{selected && <Icon name="check" />}</button>
                  })}
                </div>
              </section>}
              {activeModule === 'Poses' && (
                selectedCatalogModelSlot === null ? <div className="customizer-catalog-empty"><span>Selecione um modelo para ver as poses dele.</span><button onClick={() => setActiveModule('Modelos')} type="button">Ver modelos</button></div>
                  : catalogLoading ? <div className="customizer-catalog-empty">Carregando poses…</div>
                    : availablePoses.length === 0 ? <div className="customizer-catalog-empty">Este modelo ainda não tem poses salvas.</div>
                      : <div className="customizer-catalog-grid customizer-pose-catalog">
                        {availablePoses.map((pose) => {
                          const key = pose.sourceModelSlot + ':' + pose.slot
                          return <button className={'customizer-catalog-card pose-catalog-card' + (selectedCatalogPoseSlot === pose.slot ? ' selected' : '')} key={key} onClick={() => void selectCatalogPose(pose)} aria-pressed={selectedCatalogPoseSlot === pose.slot} title={pose.name} type="button">
                            {poseThumbnails[key] ? <img src={poseThumbnails[key]} alt="" /> : <span className="customizer-catalog-placeholder"><Icon name="body" /></span>}
                            <span className="customizer-pose-caption"><b>Pose {String(pose.slot).padStart(2, '0')}</b><small>{pose.name}</small></span>
                          </button>
                        })}
                      </div>
              )}
              {activeModule === 'Cabeça' && <div className="customizer-head-workspace">
                <nav className="customizer-head-tabs" aria-label="Categorias da cabeça" role="tablist">
                  {customizerHeadTabs.map((tab) => <button key={tab.id} className={headPanelTab === tab.id || headPanelTab === 'adjust' && headCategorySelection === tab.id ? 'active' : ''} onClick={() => {
                    const nextTab = tab.id === 'adjust' && headPanelTab === 'adjust' ? headCategorySelection : tab.id
                    setHeadPanelTab(nextTab)
                    if (nextTab !== 'adjust') setHeadCategorySelection(nextTab)
                  }} aria-selected={headPanelTab === tab.id} role="tab" type="button"><Icon name={tab.icon} /><span>{tab.label}</span></button>)}
                </nav>
                {headPanelTab === 'hair' && renderHairCatalog()}
                {headPanelTab === 'extra' && <div className="customizer-head-placeholder"><Icon name="sparkles" /><strong>Extras da cabeça</strong><span>Escolha os óculos no painel lateral.</span></div>}
                {headPanelTab === 'adjust' && renderAdjustmentPicker('head')}
              </div>}
              {activeModule === 'Cabelos' && renderHairCatalog()}
              {/* O catálogo de roupas é renderizado no painel lateral visível. */}
              {activeModule !== 'Modelos' && activeModule !== 'Poses' && activeModule !== 'Roupas' && <div className="customizer-catalog-empty">O catálogo de {activeModule} aparecerá aqui.</div>}
            </section>
            </div>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="home-layout">
        <aside className="roster-panel panel" aria-label="Personagens">
          <div className="panel-heading roster-heading">
            <div>
              <p className="eyebrow">SUA COLEÇÃO</p>
              <h2>Personagens <span>{characters.length.toString().padStart(2, '0')}</span></h2>
            </div>
            {selectedCharacter && <button className="icon-button roster-delete-button" aria-label={'Excluir ' + selectedCharacter.name} title="Excluir personagem" onClick={() => void deleteSelectedCharacter()} type="button"><Icon name="trash" /></button>}
            <button className="icon-button add-button" aria-label="Adicionar personagem" onClick={() => { setNameDraft(''); setDialogMode('create') }} type="button">
              <Icon name="plus" />
            </button>
          </div>
          <label className="roster-search">
            <Icon name="search" />
            <input aria-label="Buscar personagem" placeholder="Buscar personagem" value={rosterQuery} onChange={(event) => setRosterQuery(event.target.value)} />
            <kbd>/</kbd>
          </label>
          <div className="character-grid">
            {visibleCharacters.map((character) => (
              <button
                className={`character-card ${selectedCharacter?.id === character.id ? 'selected' : ''}`}
                key={character.id}
                onClick={() => selectCharacter(character.id)}
                aria-pressed={selectedCharacter?.id === character.id}
              >
                <RenderedCharacterPortrait className="customizer-character-headshot" character={character} />
                <span>{character.name}</span>
              </button>
            ))}
            {charactersLoading && <p className="empty-roster">Carregando personagens…</p>}
            {!charactersLoading && characters.length === 0 && <p className="empty-roster">Sua coleção está vazia. Use + para criar o primeiro personagem.</p>}
            {!charactersLoading && characters.length > 0 && visibleCharacters.length === 0 && <p className="empty-roster">Nenhum personagem encontrado.</p>}
          </div>
          <div className="roster-footer"><span className={'online-dot' + (charactersError || characterSaveState === 'error' ? ' roster-error-dot' : '')} /> {charactersError || (characterSaveState === 'saving' ? `Salvando ${selectedCharacter?.name ?? 'personagem'}…` : characterSaveState === 'error' ? 'Falha ao salvar personagem' : selectedCharacter ? `Alterações de ${selectedCharacter.name} salvas` : 'Personagens salvos neste dispositivo')}</div>
        </aside>

        <section className="preview-column" aria-label="Preview do personagem">
          <div className="stage-wrap customizer-preview-stage-wrap" ref={mainPreviewStageRef}>
            <div className="stage-scene customizer-preview-pan-surface" style={customizerPreviewStyle} onPointerDown={beginCustomizerPreviewPan} onPointerMove={moveCustomizerPreviewPan} onPointerUp={finishCustomizerPreviewPan} onPointerCancel={finishCustomizerPreviewPan}>
              <div className="preview-title customizer-preview-identity">
                <p className="eyebrow">CUSTOMIZAR <span>/</span> PERSONAGEM</p>
                <h1><span className="customizer-preview-character-name">{selectedCharacter?.name ?? (charactersLoading ? 'Carregando personagens…' : 'Crie um personagem')}</span><button className="rename-button" aria-label="Editar nome do personagem" disabled={!selectedCharacter} onClick={() => { setNameDraft(selectedCharacter?.name ?? ''); setDialogMode('rename') }} type="button"><Icon name="edit" /></button></h1>
              </div>
              <div className="customizer-preview-controls" aria-label="Controles da prévia">
                <label className="preview-scene-color" title="Mudar a cor do fundo da prévia">
                  <span className="preview-color-swatch" style={{ backgroundColor: previewBackground }} />
                  <input type="color" aria-label="Cor do fundo da prévia" value={previewBackground} onChange={(event) => setPreviewBackground(event.target.value)} />
                </label>
                <button aria-label="Tela cheia" title="Tela cheia" onClick={() => {
                  const stage = mainPreviewStageRef.current
                  if (!stage) return
                  if (document.fullscreenElement === stage) void document.exitFullscreen()
                  else void stage.requestFullscreen()
                }} type="button"><Icon name="expand" /></button>
                <button aria-label="Afastar" title="Afastar" onClick={() => setCustomizerPreviewZoom((zoom) => Math.max(.75, Number((zoom - .1).toFixed(2))))} type="button"><Icon name="zoomOut" /></button>
                <button aria-label="Aproximar" title="Aproximar" onClick={() => setCustomizerPreviewZoom((zoom) => Math.min(4, Number((zoom + .1).toFixed(2))))} type="button"><Icon name="zoomIn" /></button>
                <button aria-label="Restaurar zoom" title="Restaurar zoom" onClick={() => setCustomizerPreviewZoom(1.15)} type="button"><Icon name="reset" /></button>
              </div>
              {selectedArtworkUrl ? <img className="customizer-selected-artwork" src={selectedArtworkUrl} alt={selectedArtworkLabel} /> : !previewLoading && <div className="customizer-no-artwork"><Icon name="body" /><span>{selectedCharacter ? 'Importe um modelo no Fabricador Dev para começar.' : 'Crie um personagem para começar a personalizar.'}</span></div>}
                {selectedWardrobeUrl && selectedArtworkUrl && <img className={'customizer-wardrobe-overlay' + (wardrobePreviewDraggable ? ' draggable' : '')} src={selectedWardrobeUrl} alt="Roupas do personagem" draggable={false} onPointerDown={wardrobePreviewDraggable ? beginWardrobeDrag : undefined} onPointerMove={wardrobePreviewDraggable ? moveWardrobeDrag : undefined} onPointerUp={wardrobePreviewDraggable ? finishWardrobeDrag : undefined} onPointerCancel={wardrobePreviewDraggable ? finishWardrobeDrag : undefined} />}
                {selectedFaceUrl && selectedArtworkUrl && <img className="customizer-face-overlay" src={selectedFaceUrl} alt="Rosto do personagem" draggable={false} />}
                {selectedFrontHairUrl && selectedArtworkUrl && <img className="customizer-front-hair-overlay" src={selectedFrontHairUrl} alt="Cabelo posterior e franja frontal" draggable={false} />}
                {selectedWardrobeAboveHairUrl && selectedArtworkUrl && <img className="customizer-wardrobe-above-hair-overlay" src={selectedWardrobeAboveHairUrl} alt="Óculos e acessórios de cabeça por cima dos cabelos" draggable={false} />}
              {previewLoading && <div className="customizer-preview-loading">Carregando prévia…</div>}
            </div>
            <div className="stage-underbar customizer-preview-underbar">
              <button className="text-action" onClick={() => setActiveModule('Personalização')}><Icon name="sliders" /> Personalizar</button>
            </div>
          </div>

        </section>

        <aside className="modules-panel panel" aria-label="Áreas do Customizar">
          <DesignBanner />
          <nav className="customizer-top-tabs home-customizer-top-tabs" aria-label="Áreas do Customizar">
            {customizerTopTabs.map((tab) => <button
              key={tab.id}
              onClick={() => {
                setSelectedCustomizerTopTab(tab.id)
                const moduleByTab: Record<string, string> = {
                  modelos: 'Modelos',
                  corpo: 'Modelos',
                  cabeca: 'Cabeça',
                  roupas: 'Roupas',
                  outros: 'Acessórios',
                  perfil: 'Perfil'
                }
                setActiveModule(moduleByTab[tab.id])
              }}
              type="button"
            ><CustomizerCategoryIcon category={tab.id} /><span>{tab.label}</span></button>)}
          </nav>
        </aside>
      {dialogMode && <div className="character-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogMode(null) }}>
        <form className="character-dialog" onSubmit={(event) => void submitCharacterDialog(event)} aria-labelledby="character-dialog-title">
          <p className="eyebrow">SUA COLEÇÃO</p>
          <h2 id="character-dialog-title">{dialogMode === 'create' ? 'Novo personagem' : 'Renomear personagem'}</h2>
          <label htmlFor="character-name">Nome</label>
          <input id="character-name" autoFocus maxLength={80} value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} placeholder="Ex.: Chloe" />
          {charactersError && <p className="character-dialog-error" role="alert">{charactersError}</p>}
          <div className="character-dialog-actions"><button className="quiet-button" type="button" onClick={() => setDialogMode(null)}>Cancelar</button><button className="primary-button" type="submit" disabled={!nameDraft.trim() || savingCharacter}>{savingCharacter ? 'Salvando…' : 'Salvar'}</button></div>
        </form>
      </div>}
    </div>
  )
}

// Compatibilidade: chamadas antigas continuam disponíveis sem carregar a tela no Studio.
export { renderArtwork, prepareSavedCharacterRenderer, renderSavedCharacter, loadStandardExpressionEffects } from '../../characters/characterRenderer'
export type { CatalogArtwork } from '../../characters/characterRenderer'
