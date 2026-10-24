import type { FaceCatalogItem, FaceCatalogItemSummary, FaceComponentAsset, FaceComponentAssetSummary, FaceDetailKind, FaceElementKind, FaceExpressionEffects, FaceSet, FaceSheetKind, FabricatorProject, HairStyle, WardrobeCategory, WardrobeSet } from '../../../shared/fabricator'
import { hairCategories } from '../../../shared/hairCategories'
import type { CustomizerCharacter, CustomizerFaceAppearance, CustomizerWardrobeCategory, CustomizerWardrobeGroup, FaceComponentPartId, FacePalettePartId, HairColorOverrides, HairColorRole, HairPartId } from '../../../shared/customizer'
import { resolveStudioTalkMouthId, type StudioFaceMode, type StudioFaceTransforms } from '../../../shared/studio'
import { mapWardrobeComponentToPose, wardrobePosePadding } from '../../../shared/wardrobePose'
import { normalizeLayerOrder } from '../../../shared/modelRig'
import { validateWardrobeFlow } from '../../../shared/assetFlow'
import { wardrobeAdjustmentMatrix } from '../../../shared/wardrobeAdjustment'
import { eyeInteriorMask } from '../ui/image/eyeInteriorMask'
import { tintSkinPixels } from './skinTint'
import { configureCharacterSampling, MAX_CHARACTER_PREVIEW_PIXELS } from './renderResolution'
import { drawFaceExpressionEffects } from './expressionEffectRender'
import { loadStandardExpressionEffects, type StandardExpressionEffects } from './standardExpressionEffects'
export { loadStandardExpressionEffects } from './standardExpressionEffects'
export type { StandardExpressionEffects } from './standardExpressionEffects'
import type { VideoCharacterRenderAssetProvider } from '../../../shared/videoCharacterRenderAssets'
import { resolveSavedCharacterSource, characterShapeScale, type CatalogArtwork } from './characterSourceResolver'
import { getCharacterProportions } from '../../../shared/customizer'
import { prepareGachaStaticLayers } from './gachaStaticLayers'
import { createPreparedGachaGpuLayers, type GachaFacePass } from './gachaPreparedGpuLayers'
import { catalogComponentIdsForPass } from './gachaFaceComponentPass'
export { GPU_FACE_PASSES } from './gachaPreparedGpuLayers'
export type { GachaFacePass } from './gachaPreparedGpuLayers'
import { exportImageMemos, loadCachedImage } from './characterImageMemos'
export { loadCachedImage, configureVideoExportCharacterImageCaches, clearVideoExportCharacterImageCaches, disposeVideoExportCharacterImageCaches } from './characterImageMemos'
export { withCharacterHeadSize, characterShapeScale } from './characterSourceResolver'
export type { CatalogArtwork } from './characterSourceResolver'

const skinTintImageCache = new Map<string, Promise<HTMLImageElement>>()

const hairTintImageCache = new Map<string, Promise<HTMLImageElement>>()

const faceElementOrder: FaceElementKind[] = ['brow-left', 'brow-right', 'eye-left', 'eye-right', 'nose', 'mouth']

export function isRightFaceAsset(asset: FaceComponentAssetSummary): boolean {
  return asset.rightSidePositioned === true || / · (?:Olho|Olho aberto|Olho fechado|Pupila|Sobrancelha) direit[oa]$/i.test(asset.name)
}

export type HairTintOptions = { preserveNearWhite?: boolean; allowNearWhiteRoles?: readonly HairColorRole[] }

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

function hairPixelColorRole(red: number, green: number, blue: number, profile: ReturnType<typeof hairImageColorProfile>): HairColorRole {
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
  const maximum = Math.max(red, green, blue)
  const saturation = maximum === 0 ? 0 : (maximum - Math.min(red, green, blue)) / maximum
  const hueDistance = Math.abs(hairHue(red, green, blue) - profile.hue)
  if (profile.hasAccent && saturation > 0.3 && Math.min(hueDistance, 360 - hueDistance) > 48 && luminance > 35) return 'accent'
  const range = profile.high - profile.low
  if (range < 18) return 'base'
  const position = (luminance - profile.low) / range
  if (position < 0.16) return 'outline'
  if (position < 0.43) return 'fade'
  if (position < 0.82) return 'base'
  return 'highlight'
}

export function loadHairTintedImage(source: string, overrides: HairColorOverrides | undefined, options?: HairTintOptions): Promise<HTMLImageElement> {
  if (!overrides || !Object.values(overrides).some(Boolean)) return loadCachedImage(source)
  const key = `${source}:${JSON.stringify([overrides, options])}`
  if (!exportImageMemos) {
    const cached = hairTintImageCache.get(key)
    if (cached) return cached
  }
  const createTinted = () => loadCachedImage(source).then((sourceImage) => {
    const canvas = document.createElement('canvas')
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
      const role = hairPixelColorRole(pixels[offset], pixels[offset + 1], pixels[offset + 2], profile)
      luminanceTotals[role] += pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722
      roleCounts[role] += 1
    }
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset + 3] === 0) continue
      const role = hairPixelColorRole(pixels[offset], pixels[offset + 1], pixels[offset + 2], profile)
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
    const output = new Image()
    output.src = canvas.toDataURL('image/png')
    if (output.decode) return output.decode().then(() => output)
    return new Promise<HTMLImageElement>((resolve, reject) => {
      output.onload = () => resolve(output)
      output.onerror = () => reject(new Error('Não foi possível recolorir o cabelo.'))
    })
  })
  if (exportImageMemos) return exportImageMemos.hair.getOrCreate(key, createTinted)
  const tinted = createTinted()
  hairTintImageCache.set(key, tinted)
  if (hairTintImageCache.size > 40) hairTintImageCache.delete(hairTintImageCache.keys().next().value!)
  void tinted.catch(() => hairTintImageCache.delete(key))
  return tinted
}

export function loadSkinTintedImage(source: string, tone: string): Promise<HTMLImageElement> {
  const key = `${tone}:${source}`
  if (!exportImageMemos) {
    const cached = skinTintImageCache.get(key)
    if (cached) return cached
  }
  const createTinted = () => loadCachedImage(source).then((sourceImage) => {
    const canvas = document.createElement('canvas')
    canvas.width = sourceImage.naturalWidth || sourceImage.width
    canvas.height = sourceImage.naturalHeight || sourceImage.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context || !canvas.width || !canvas.height) return sourceImage
    context.drawImage(sourceImage, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    tintSkinPixels(pixels, tone)
    context.putImageData(pixels, 0, 0)
    const output = new Image()
    output.src = canvas.toDataURL('image/png')
    if (output.decode) return output.decode().then(() => output)
    return new Promise<HTMLImageElement>((resolve, reject) => {
      output.onload = () => resolve(output)
      output.onerror = () => reject(new Error('Não foi possível aplicar a cor de pele.'))
    })
  })
  if (exportImageMemos) return exportImageMemos.skin.getOrCreate(key, createTinted)
  const tinted = createTinted()
  skinTintImageCache.set(key, tinted)
  void tinted.catch(() => skinTintImageCache.delete(key))
  return tinted
}

export type ClothingGroupCategory = CustomizerWardrobeCategory

export type SelectedWardrobeComponent = { modelSlot: number; setId: string; category: ClothingGroupCategory; componentId: string }

export type AdjustmentPreviewHighlight = { scope: 'head'; id: string } | { scope: 'clothing'; piece: SelectedWardrobeComponent }

function drawPreviewImageWithHalo(context: CanvasRenderingContext2D, image: CanvasImageSource, dx: number, dy: number, highlighted: boolean, width?: number, height?: number) {
  const draw = () => width === undefined || height === undefined ? context.drawImage(image, dx, dy) : context.drawImage(image, dx, dy, width, height)
  if (highlighted) {
    // Render the pink canvas shadow behind the exact piece, then redraw it cleanly.
    context.save()
    context.shadowColor = 'rgba(255, 71, 163, .98)'
    context.shadowBlur = 9
    draw()
    context.restore()
  }
  draw()
}

export type HairCatalogSide = 'front' | 'back'

type HairLayerSide = HairCatalogSide | 'fringe'

type HairLayerReference = { style: HairStyle; side: HairLayerSide; part: HairPartId }

export const customizerHairParts = hairCategories

export const hairAppearanceStyleId = (appearance: NonNullable<CustomizerCharacter['customization']['hairAppearance']> | undefined, side: HairCatalogSide): string | null => {
  if (!appearance) return null
  const key = side === 'front' ? 'frontStyleId' : 'backStyleId'
  return key in appearance ? appearance[key] ?? null : appearance.styleId ?? null
}

function hairAppearanceStyleIds(appearance: NonNullable<CustomizerCharacter['customization']['hairAppearance']> | undefined, side: HairLayerSide): Array<{ id: string; part: HairPartId }> {
  return customizerHairParts.filter((part) => part.side === side).flatMap((part) => {
    const hasPartOverride = Boolean(appearance?.parts && Object.prototype.hasOwnProperty.call(appearance.parts, part.id))
    const legacyFrontPart = part.id === 'rearHair' && appearance?.parts && Object.prototype.hasOwnProperty.call(appearance.parts, 'frontHair')
      ? appearance.parts.frontHair
      : null
    const id = hasPartOverride ? appearance?.parts?.[part.id] ?? null : part.id === 'backHair' ? hairAppearanceStyleId(appearance, 'back') : part.id === 'rearHair' ? legacyFrontPart ?? hairAppearanceStyleId(appearance, 'front') : null
    return id ? [{ id, part: part.id }] : []
  })
}

export async function loadHairAppearanceLayers(appearance: NonNullable<CustomizerCharacter['customization']['hairAppearance']> | undefined, modelSlot: number, side: HairLayerSide, cached: Record<string, HairStyle> = {}, assetProvider: VideoCharacterRenderAssetProvider = window.desktop): Promise<HairLayerReference[]> {
  if (!appearance || appearance.modelSlot !== modelSlot) return []
  const ids = hairAppearanceStyleIds(appearance, side)
  const styles = await Promise.all(ids.map(async ({ id }) => cached[`${modelSlot}:${id}`] ?? await assetProvider.loadHairStyle(modelSlot, id)))
  return styles.flatMap((style, index) => style ? [{ style, side, part: ids[index].part }] : [])
}

export function resolvedHairColors(appearance: CustomizerCharacter['customization']['hairAppearance'], part: HairPartId): HairColorOverrides {
  return { ...appearance?.colors, ...appearance?.partColors?.[part] }
}

export const clothingCategories: Record<'Superior' | 'Inferior', Array<{ id: ClothingGroupCategory; label: string; source: WardrobeCategory[] }>> = {
  Superior: [
    { id: 'camisa', label: 'Camisas', source: ['camisa'] },
    { id: 'jaqueta', label: 'Jaquetas', source: ['jaqueta'] },
    { id: 'manga-superior', label: 'Mangas superiores', source: ['manga-superior'] },
    { id: 'manga-inferior', label: 'Mangas inferiores', source: ['manga-inferior'] },
    { id: 'luvas', label: 'Luvas', source: ['luvas'] },
    { id: 'capa', label: 'Capa', source: ['capa'] },
    { id: 'cinto', label: 'Cinto', source: ['cinto'] },
    { id: 'oculos', label: 'Óculos', source: ['oculos'] },
    { id: 'acessorio-cabeca', label: 'Acessórios de cabeça', source: ['acessorio-cabeca'] },
    { id: 'saia-superior', label: 'Saia superior', source: ['saia'] }
  ],
  Inferior: [
    { id: 'calca', label: 'Calça/Bermuda', source: ['calca-coxa', 'calca-canela', 'shorts'] },
    { id: 'meia', label: 'Meias', source: ['meia'] },
    { id: 'sapato', label: 'Sapatos', source: ['sapato'] },
    { id: 'saia-inferior', label: 'Saia inferior', source: ['saia'] }
  ]
}

export function wardrobeComponentsForGroup(group: CustomizerWardrobeGroup, details: Record<string, WardrobeSet>): WardrobeSet['components'] {
  const accepted = Object.values(clothingCategories).flat().find((category) => category.id === group.category)?.source
  return details[`${group.modelSlot}:${group.setId}`]?.components.filter((component) => accepted?.includes(component.category)
    && (!group.componentId || group.componentId === component.id)) ?? []
}

export async function renderWardrobeOverlay(
  groups: CustomizerWardrobeGroup[],
  details: Record<string, WardrobeSet>,
  artwork: CatalogArtwork,
  modelSlot: number | null,
  source: FabricatorProject | null,
  skinTone?: string,
  maxSize = Math.max(artwork.width, artwork.height),
  highlight?: AdjustmentPreviewHighlight | null
): Promise<{ imageUrl: string | null; aboveHairImageUrl: string | null }> {
  if (!groups.length || modelSlot === null || !source) return { imageUrl: null, aboveHairImageUrl: null }
  const output = document.createElement('canvas')
  const pixelScale = Math.min(maxSize / Math.max(artwork.width, artwork.height), Math.sqrt(MAX_CHARACTER_PREVIEW_PIXELS / (artwork.width * artwork.height)))
  output.width = Math.max(1, Math.ceil(artwork.width * pixelScale))
  output.height = Math.max(1, Math.ceil(artwork.height * pixelScale))
  const outputContext = output.getContext('2d')
  if (!outputContext) return { imageUrl: null, aboveHairImageUrl: null }
  configureCharacterSampling(outputContext)
  outputContext.scale(pixelScale, pixelScale)
  let aboveHairCanvas: HTMLCanvasElement | null = null
  let aboveHairContext: CanvasRenderingContext2D | null = null
  const hidden = new Set(artwork.hiddenPartIds ?? [])
  const bodyOrder = normalizeLayerOrder(artwork.parts, artwork.layerOrder)
  const garmentLayers = new Map<string, Array<{ group: CustomizerWardrobeGroup; component: WardrobeSet['components'][number]; transform: ReturnType<typeof mapWardrobeComponentToPose>; center: { x: number; y: number }; sequence: number }>>()
  let sequence = 0
  let hasAboveHairAccessories = false

  const selections = groups.flatMap((group) => {
    const set = details[`${group.modelSlot}:${group.setId}`]
    if (!set || group.modelSlot !== modelSlot || group.hidden) return []
    const accepted = clothingCategories[clothingCategories.Inferior.some((item) => item.id === group.category) ? 'Inferior' : 'Superior']
      .find((category) => category.id === group.category)?.source
    if (!accepted) return []
    const components = wardrobeComponentsForGroup(group, details)
    return [{ group, set, components }]
  })
  const equippedComponents = new Map<string, WardrobeSet['components']>()
  for (const { group, components } of selections) {
    const key = `${group.modelSlot}:${group.setId}`
    equippedComponents.set(key, [...(equippedComponents.get(key) ?? []), ...components])
  }

  // Match the wardrobe pose test: each garment is inserted immediately above
  // the model layer it is attached to, before the next body layer is drawn.
  for (const { group, set, components } of selections) {
    if (!components.length) {
      // A saved character references a component that is no longer found;
      // silently omitting it makes the Customizer appear miscalibrated.
      throw new Error(`O conjunto de roupa ${group.setId} não possui mais a peça selecionada (${group.componentId ?? group.category}). Reabra a biblioteca e confira o encaixe.`)
    }
    const checked = validateWardrobeFlow({ ...set, components }, source,
      { sourceModelSlot: modelSlot, sourceModelUpdatedAt: source.updatedAt, parts: artwork.parts }, [group])
    const errors = checked.issues.filter((issue) => issue.severity === 'error')
    if (errors.length) {
      throw new Error(`O pré-ajuste da roupa ${group.setId} não é compatível com este modelo/pose: ${errors.map((issue) => `${issue.code}:${issue.componentId ?? '-'}`).join(', ')}. Corrija o vínculo no Fabricador Dev; o personagem não será alterado.`)
    }
    const mapped: Array<{ component: WardrobeSet['components'][number]; transform: ReturnType<typeof mapWardrobeComponentToPose>; center: { x: number; y: number }; sequence: number }> = []
    for (const component of components) {
      const sourceBone = source.parts.find((part) => part.id === component.attachedPartId)
      const targetBone = artwork.parts.find((part) => part.id === component.attachedPartId)
      if (!sourceBone || !targetBone) continue
      const { kneeOverlap, edgePadding } = wardrobePosePadding(component, equippedComponents.get(`${group.modelSlot}:${group.setId}`) ?? [])
      if (component.glue?.mode === 'loose') continue
      const transform = mapWardrobeComponentToPose(component, sourceBone, targetBone, kneeOverlap, edgePadding)
      mapped.push({ component, transform, center: transform.origin, sequence: sequence++ })
    }
    if (!mapped.length) continue
    // Each component owns its bone anchor. Averaging the centers of visible
    // siblings shifted scale/rotation pivots whenever another piece was hidden
    // or restored (thigh + calf, sleeves, accessories, etc.).
    for (const item of mapped) {
      const layer = garmentLayers.get(item.component.attachedPartId) ?? []
      layer.push({ group, ...item })
      garmentLayers.set(item.component.attachedPartId, layer)
    }
  }

  for (const partId of bodyOrder) {
    const part = artwork.parts.find((item) => item.id === partId)
    if (!part) continue
    if (!hidden.has(part.id)) {
      try {
        // The wardrobe composite redraws the body to interleave garments with
        // model layers. Keep that duplicate body in sync with the tinted base
        // preview, otherwise the original skin pixels cover the selected tone.
        const image = skinTone ? await loadSkinTintedImage(part.dataUrl, skinTone) : await loadCachedImage(part.dataUrl)
        outputContext.save()
        outputContext.translate(part.x + part.width / 2, part.y + part.height / 2)
        outputContext.rotate(part.rotation * Math.PI / 180)
        outputContext.drawImage(image, -part.width / 2, -part.height / 2, part.width, part.height)
        outputContext.restore()
      } catch { /* Keep rendering the remaining layers when one image is unavailable. */ }
    }
    const garments = (garmentLayers.get(part.id) ?? []).sort((a, b) => a.sequence - b.sequence)
    for (const garment of garments) {
      try {
        const image = garment.group.colors ? await loadHairTintedImage(garment.component.dataUrl, garment.group.colors) : await loadCachedImage(garment.component.dataUrl)
        const matrix = /^matrix\(([^)]+)\)$/.exec(garment.transform.matrix)?.[1].split(',').map(Number) ?? [1, 0, 0, 1, 0, 0]
        const drawGarment = (context: CanvasRenderingContext2D, highlighted = false) => {
          context.save()
          context.globalAlpha = garment.group.hidden ? 0 : Math.min(1, Math.max(0, garment.group.opacity ?? 1))
          context.transform(...wardrobeAdjustmentMatrix(garment.group, artwork.parts.find((bone) => bone.id === garment.component.attachedPartId), garment.center))
          context.translate(garment.transform.origin.x, garment.transform.origin.y)
          context.transform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5])
          context.translate(garment.transform.localLeft + garment.transform.renderWidth / 2, garment.transform.localTop + garment.transform.renderHeight / 2)
          context.rotate(garment.transform.localRotation * Math.PI / 180)
          drawPreviewImageWithHalo(context, image, -garment.transform.renderWidth / 2, -garment.transform.renderHeight / 2, highlighted, garment.transform.renderWidth, garment.transform.renderHeight)
          context.restore()
        }
        const renderAboveHair = garment.component.renderAboveHair === true
          && (garment.component.category === 'oculos' || garment.component.category === 'acessorio-cabeca')
        if (renderAboveHair && !aboveHairContext) {
          aboveHairCanvas = document.createElement('canvas')
          aboveHairCanvas.width = output.width
          aboveHairCanvas.height = output.height
          aboveHairContext = aboveHairCanvas.getContext('2d')
          if (aboveHairContext) { configureCharacterSampling(aboveHairContext); aboveHairContext.scale(pixelScale, pixelScale) }
        }
        if (renderAboveHair && aboveHairContext) hasAboveHairAccessories = true
        const highlightMatchesClothing = highlight?.scope === 'clothing'
          && highlight.piece.modelSlot === garment.group.modelSlot
          && highlight.piece.setId === garment.group.setId
          && highlight.piece.category === garment.group.category
          && highlight.piece.componentId === garment.component.id
        const highlightMatchesHeadExtra = highlight?.scope === 'head'
          && (highlight.id === 'oculos' || highlight.id === 'acessorio-cabeca')
          && highlight.id === garment.group.category
        const targetContext = renderAboveHair && aboveHairContext ? aboveHairContext : outputContext
        if (highlightMatchesClothing || highlightMatchesHeadExtra) drawGarment(targetContext, true)
        drawGarment(targetContext)
      } catch {
        throw new Error(`A imagem da peça ${garment.component.name} não pôde ser renderizada. Verifique o asset no Fabricador Dev sem alterar o personagem.`)
      }
    }
  }
  const aboveHairImageUrl = hasAboveHairAccessories && aboveHairCanvas ? aboveHairCanvas.toDataURL('image/png') : null
  return { imageUrl: output.toDataURL('image/png'), aboveHairImageUrl }
}

export async function renderArtwork(artwork: CatalogArtwork, maxSize: number, skinTone?: string, trimTransparent = false): Promise<string | null> {
  if (artwork.width <= 0 || artwork.height <= 0) return null
  const scale = Math.min(maxSize / artwork.width, maxSize / artwork.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(artwork.width * scale))
  canvas.height = Math.max(1, Math.round(artwork.height * scale))
  const context = canvas.getContext('2d')
  if (context) configureCharacterSampling(context)
  if (!context) return null

  const hidden = new Set(artwork.hiddenPartIds ?? [])
  const layerIndex = new Map((artwork.layerOrder ?? []).map((id, index) => [id, index]))
  const parts = artwork.parts
    .filter((part) => !hidden.has(part.id))
    .map((part, index) => ({ part, index }))
    .sort((a, b) => (layerIndex.get(a.part.id) ?? a.index) - (layerIndex.get(b.part.id) ?? b.index))

  for (const { part } of parts) {
    try {
      const image = skinTone ? await loadSkinTintedImage(part.dataUrl, skinTone) : await loadCachedImage(part.dataUrl)
      context.save()
      try {
        context.translate((part.x + part.width / 2) * scale, (part.y + part.height / 2) * scale)
        context.rotate(part.rotation * Math.PI / 180)
        context.drawImage(image, -part.width * scale / 2, -part.height * scale / 2, part.width * scale, part.height * scale)
      } finally {
        context.restore()
      }
    } catch {
      continue
    }
  }

  if (!trimTransparent) return canvas.toDataURL('image/png')

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  let left = canvas.width
  let top = canvas.height
  let right = -1
  let bottom = -1
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      if (pixels[(y * canvas.width + x) * 4 + 3] === 0) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  if (right < left || bottom < top) return canvas.toDataURL('image/png')
  const margin = 0
  const trimmed = document.createElement('canvas')
  trimmed.width = right - left + 1 + margin * 2
  trimmed.height = bottom - top + 1 + margin * 2
  trimmed.getContext('2d')?.drawImage(canvas, left, top, right - left + 1, bottom - top + 1, margin, margin, right - left + 1, bottom - top + 1)
  return trimmed.toDataURL('image/png')
}

export async function renderArtworkWithHair(artwork: CatalogArtwork, source: FabricatorProject, backStyles: HairStyle | HairLayerReference[] | null, maxSize: number, skinTone?: string, hairAppearance?: CustomizerCharacter['customization']['hairAppearance'], targetContext?: CanvasRenderingContext2D, headOverrides: CustomizerCharacter['customization']['partOverrides'] = {}, highlightedHeadId?: string | null): Promise<string | null> {
  const hairLayers: HairLayerReference[] = Array.isArray(backStyles) ? backStyles : backStyles ? [{ style: backStyles, side: 'back', part: 'backHair' }] : []
  const validHairLayers = hairLayers.filter((layer) => layer.side === 'back' && layer.style.modelSlot === source.slot && Boolean(layer.style.back))
  if (!validHairLayers.length && !targetContext) return renderArtwork(artwork, maxSize, skinTone)
  const sourceHead = source.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
  const targetHead = artwork.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
  if (!sourceHead || !targetHead || !sourceHead.width || !sourceHead.height) {
    const fallback = await renderArtwork(artwork, maxSize, skinTone)
    if (targetContext && fallback) targetContext.drawImage(await loadCachedImage(fallback), 0, 0, targetContext.canvas.width, targetContext.canvas.height)
    return targetContext ? null : fallback
  }
  const scale = Math.min(maxSize / artwork.width, maxSize / artwork.height)
  const canvas = targetContext?.canvas ?? document.createElement('canvas')
  if (!targetContext) {
    canvas.width = Math.max(1, Math.round(artwork.width * scale))
    canvas.height = Math.max(1, Math.round(artwork.height * scale))
  }
  const context = targetContext ?? canvas.getContext('2d')
  if (context) configureCharacterSampling(context)
  if (!context) return null
  const hidden = new Set(artwork.hiddenPartIds ?? [])
  const order = (artwork.layerOrder ?? []).filter((id, index, ids) => ids.indexOf(id) === index && artwork.parts.some((part) => part.id === id))
  for (const part of artwork.parts) if (!order.includes(part.id)) order.push(part.id)
  const drawBackHair = async (layer: HairLayerReference) => {
    const { style, side } = layer
    const asset = style[side]
    if (!asset) return
      const baseTransform = style.transforms[side]
      const override = headOverrides[`head:${layer.part}`]
      if (override?.hidden) return
      const transform = baseTransform && override ? { ...baseTransform, x: baseTransform.x + (override.x ?? 0), y: baseTransform.y + (override.y ?? 0), scaleX: baseTransform.scaleX * (override.scaleX ?? 1), scaleY: baseTransform.scaleY * (override.scaleY ?? 1), rotation: baseTransform.rotation + (override.rotation ?? 0) } : baseTransform
      if (!transform) return
    try {
      const localX = transform.x / sourceHead.width * targetHead.width
      const localY = transform.y / sourceHead.height * targetHead.height
      const radians = targetHead.rotation * Math.PI / 180
      const x = targetHead.x + targetHead.width / 2 + (localX - targetHead.width / 2) * Math.cos(radians) - (localY - targetHead.height / 2) * Math.sin(radians)
      const y = targetHead.y + targetHead.height / 2 + (localX - targetHead.width / 2) * Math.sin(radians) + (localY - targetHead.height / 2) * Math.cos(radians)
      const width = asset.width * transform.scaleX / sourceHead.width * targetHead.width
      const height = asset.height * transform.scaleY / sourceHead.height * targetHead.height
      const image = await loadHairTintedImage(asset.dataUrl, resolvedHairColors(hairAppearance, layer.part))
      context.save()
      context.translate(x * scale, y * scale)
      context.rotate((targetHead.rotation + transform.rotation) * Math.PI / 180)
      context.scale(transform.flipX ? -1 : 1, 1)
      drawPreviewImageWithHalo(context, image, -width * scale / 2, -height * scale / 2, highlightedHeadId === layer.part, width * scale, height * scale)
      context.restore()
    } catch { /* One missing hair layer must not hide the model preview. */ }
  }
  for (const layer of validHairLayers) await drawBackHair(layer)
  for (const id of order) {
    const part = artwork.parts.find((item) => item.id === id)
    if (!part) continue
    if (!hidden.has(part.id)) {
      try {
        const image = skinTone ? await loadSkinTintedImage(part.dataUrl, skinTone) : await loadCachedImage(part.dataUrl)
        context.save()
        context.translate((part.x + part.width / 2) * scale, (part.y + part.height / 2) * scale)
        context.rotate(part.rotation * Math.PI / 180)
        context.drawImage(image, -part.width * scale / 2, -part.height * scale / 2, part.width * scale, part.height * scale)
        context.restore()
      } catch { /* Continue rendering the remaining model layers. */ }
    }
  }
  return targetContext ? null : canvas.toDataURL('image/png')
}

export async function renderFrontHairOverlay(artwork: CatalogArtwork, source: FabricatorProject, frontStyles: HairStyle | HairLayerReference[] | null, maxSize: number, hairAppearance?: CustomizerCharacter['customization']['hairAppearance'], targetContext?: CanvasRenderingContext2D, headOverrides: CustomizerCharacter['customization']['partOverrides'] = {}, highlightedHeadId?: string | null): Promise<string | null> {
  const hairLayers: HairLayerReference[] = Array.isArray(frontStyles) ? frontStyles : frontStyles ? [{ style: frontStyles, side: 'front', part: 'rearHair' }] : []
  const validHairLayers = hairLayers.filter((layer) => (layer.side === 'front' || layer.side === 'fringe') && layer.style[layer.side] && layer.style.modelSlot === source.slot)
  if (!validHairLayers.length && !targetContext) return null
  const sourceHead = source.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
  const targetHead = artwork.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
  if (!sourceHead || !targetHead || sourceHead.width <= 0 || sourceHead.height <= 0) return null
  const scale = Math.min(maxSize / artwork.width, maxSize / artwork.height)
  const canvas = targetContext?.canvas ?? document.createElement('canvas')
  if (!targetContext) canvas.width = Math.max(1, Math.round(artwork.width * scale))
  if (!targetContext) canvas.height = Math.max(1, Math.round(artwork.height * scale))
  const context = targetContext ?? canvas.getContext('2d')
  if (context) configureCharacterSampling(context)
  if (!context) return null
  for (const layer of validHairLayers) {
    const asset = layer.style[layer.side]
    if (!asset) continue
    const baseTransform = layer.style.transforms[layer.side]
    const override = headOverrides[`head:${layer.part}`]
    if (override?.hidden) continue
    const transform = baseTransform && override ? { ...baseTransform, x: baseTransform.x + (override.x ?? 0), y: baseTransform.y + (override.y ?? 0), scaleX: baseTransform.scaleX * (override.scaleX ?? 1), scaleY: baseTransform.scaleY * (override.scaleY ?? 1), rotation: baseTransform.rotation + (override.rotation ?? 0) } : baseTransform
    if (!transform) continue
    const localX = transform.x / sourceHead.width * targetHead.width
    const localY = transform.y / sourceHead.height * targetHead.height
    const radians = targetHead.rotation * Math.PI / 180
    const x = targetHead.x + targetHead.width / 2 + (localX - targetHead.width / 2) * Math.cos(radians) - (localY - targetHead.height / 2) * Math.sin(radians)
    const y = targetHead.y + targetHead.height / 2 + (localX - targetHead.width / 2) * Math.sin(radians) + (localY - targetHead.height / 2) * Math.cos(radians)
    const width = asset.width * transform.scaleX / sourceHead.width * targetHead.width
    const height = asset.height * transform.scaleY / sourceHead.height * targetHead.height
    try {
      const image = await loadHairTintedImage(asset.dataUrl, resolvedHairColors(hairAppearance, layer.part))
      context.save()
      context.translate(x * scale, y * scale)
      context.rotate((targetHead.rotation + transform.rotation) * Math.PI / 180)
      context.scale(transform.flipX ? -1 : 1, 1)
      drawPreviewImageWithHalo(context, image, -width * scale / 2, -height * scale / 2, highlightedHeadId === layer.part, width * scale, height * scale)
      context.restore()
    } catch { /* Continue drawing the remaining front hair layers. */ }
  }
  return targetContext ? null : canvas.toDataURL('image/png')
}

export async function renderFaceOverlay(artwork: CatalogArtwork, source: FabricatorProject | null, face: FaceSet | null, appearance: CustomizerFaceAppearance | undefined, maxSize = Math.max(artwork.width, artwork.height), headOverrides: CustomizerCharacter['customization']['partOverrides'] = {}, highlightedHeadId?: string | null): Promise<string | null> {
  if (!source || !face || !appearance || appearance.setId !== face.id || appearance.modelSlot !== source.slot) return null
  const sourceHead = source.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
  const targetHead = artwork.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
  if (!sourceHead || !targetHead || sourceHead.width <= 0 || sourceHead.height <= 0) return null
  const canvas = document.createElement('canvas')
  const pixelScale = Math.min(maxSize / Math.max(artwork.width, artwork.height), Math.sqrt(MAX_CHARACTER_PREVIEW_PIXELS / (artwork.width * artwork.height)))
  canvas.width = Math.max(1, Math.ceil(artwork.width * pixelScale))
  canvas.height = Math.max(1, Math.ceil(artwork.height * pixelScale))
  const context = canvas.getContext('2d')
  if (context) configureCharacterSampling(context)
  if (!context) return null
  context.scale(pixelScale, pixelScale)
  for (const element of faceElementOrder) {
    if (element.startsWith('brow') && !appearance.eyebrows) continue
    const sheet = element.startsWith('eye') ? 'eyes' : element.startsWith('brow') ? 'eyebrows' : element === 'nose' ? 'nose' : appearance.mouthOpen ? 'mouth-open' : 'mouth-closed'
    const index = sheet === 'eyes' ? appearance.eyeState : sheet === 'nose' ? appearance.noseIndex : sheet.startsWith('mouth') ? appearance.expressionIndex : 0
    const side = element.endsWith('left') ? 'left' : element.endsWith('right') ? 'right' : undefined
    const piece = face.pieces.find((item) => item.sheet === sheet && item.index === index && item.side === side)
    if (!piece) continue
    const baseTransform = face.transforms[element]
    const override = headOverrides[`head:${element}`]
    if (override?.hidden) continue
    const transform = override ? { ...baseTransform, x: baseTransform.x + (override.x ?? 0), y: baseTransform.y + (override.y ?? 0), scaleX: baseTransform.scaleX * (override.scaleX ?? 1), scaleY: baseTransform.scaleY * (override.scaleY ?? 1), rotation: baseTransform.rotation + (override.rotation ?? 0) } : baseTransform
    try {
      const image = await loadCachedImage(piece.dataUrl)
      const localX = transform.x / sourceHead.width * targetHead.width
      const localY = transform.y / sourceHead.height * targetHead.height
      const x = targetHead.x + targetHead.width / 2 + (localX - targetHead.width / 2) * Math.cos(targetHead.rotation * Math.PI / 180) - (localY - targetHead.height / 2) * Math.sin(targetHead.rotation * Math.PI / 180)
      const y = targetHead.y + targetHead.height / 2 + (localX - targetHead.width / 2) * Math.sin(targetHead.rotation * Math.PI / 180) + (localY - targetHead.height / 2) * Math.cos(targetHead.rotation * Math.PI / 180)
      const width = piece.width * transform.scaleX / sourceHead.width * targetHead.width
      const height = piece.height * transform.scaleY / sourceHead.height * targetHead.height
      context.save()
      context.translate(x, y)
      context.rotate((targetHead.rotation + transform.rotation) * Math.PI / 180)
      drawPreviewImageWithHalo(context, image, -width / 2, -height / 2, highlightedHeadId === element, width, height)
      context.restore()
    } catch { /* Skip a missing facial asset without hiding the character preview. */ }
  }
  return canvas.toDataURL('image/png')
}

function componentSheetName(name: string): string {
  return name.replace(/(?:\s*[·-]\s*(?:Olho(?:\s+(?:aberto|fechado))?|Pupila|Sobrancelha)(?:\s+(?:esquerda|direita|esquerdo|direito))?)+$/i, '').trim().toLocaleLowerCase()
}

function closedEyeSimilarity(openEye: FaceComponentAsset, closedEye: FaceComponentAsset): number {
  const open = openEye.defaultTransform
  const closed = closedEye.defaultTransform
  const renderedOpenWidth = openEye.width * open.scaleX
  const renderedOpenHeight = openEye.height * open.scaleY
  const renderedClosedWidth = closedEye.width * closed.scaleX
  const renderedClosedHeight = closedEye.height * closed.scaleY
  return Math.hypot(closed.x - open.x, closed.y - open.y)
    + Math.abs(Math.log(renderedClosedWidth / renderedOpenWidth)) * 15
    + Math.abs(Math.log(renderedClosedHeight / renderedOpenHeight)) * 15
    + Math.abs(closed.rotation - open.rotation) / 10
}

function transferEyeCloseAdjustment(openBase: FaceComponentAsset['defaultTransform'], openCurrent: FaceComponentAsset['defaultTransform'], closedBase: FaceComponentAsset['defaultTransform']): FaceComponentAsset['defaultTransform'] {
  return {
    ...closedBase,
    x: closedBase.x + openCurrent.x - openBase.x,
    y: closedBase.y + openCurrent.y - openBase.y,
    scaleX: closedBase.scaleX * openCurrent.scaleX / openBase.scaleX,
    scaleY: closedBase.scaleY * openCurrent.scaleY / openBase.scaleY,
    rotation: closedBase.rotation + openCurrent.rotation - openBase.rotation,
    flipX: Boolean(closedBase.flipX) !== (Boolean(openCurrent.flipX) !== Boolean(openBase.flipX))
  }
}

function alignMouthTransformToClosedBase(transform: FaceComponentAsset['defaultTransform'], closedItem: FaceCatalogItem | undefined, activeItem: FaceCatalogItem): FaceComponentAsset['defaultTransform'] {
  const closedBase = closedItem?.transforms.mouth
  const activeBase = activeItem.transforms.mouth
  if (!closedBase || !activeBase || closedBase.scaleX <= 0 || closedBase.scaleY <= 0) return transform
  return {
    ...transform,
    scaleX: transform.scaleX * activeBase.scaleX / closedBase.scaleX,
    scaleY: transform.scaleY * activeBase.scaleY / closedBase.scaleY
  }
}

type StudioClosedEyeResolver = (openEye: FaceComponentAsset, side: 'left' | 'right') => Promise<FaceComponentAsset | null>


export async function drawFaceCatalogOverlay(context: CanvasRenderingContext2D, artwork: CatalogArtwork, source: FabricatorProject, items: Partial<Record<FaceSheetKind | FaceElementKind, FaceCatalogItem>>, appearance: CustomizerFaceAppearance, skinTone?: string, studioFaceTransforms?: StudioFaceTransforms, expressionEffects?: FaceExpressionEffects, studioFaceMode?: StudioFaceMode, resolveClosedEye?: StudioClosedEyeResolver, headOverrides: CustomizerCharacter['customization']['partOverrides'] = {}, highlightedHeadId?: string | null, assetProvider: VideoCharacterRenderAssetProvider = window.desktop, gpuPass?: GachaFacePass): Promise<void> {
  const sourceHead = source.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
  const targetHead = artwork.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
  if (!sourceHead || !targetHead || sourceHead.width <= 0 || sourceHead.height <= 0) return
  // A Dev asset can be recalibrated without changing the character document.
  // Keep only a render-local cache so each Customizer/Studio draw sees the current calibration.
  const componentLoads = new Map<string, Promise<FaceComponentAsset | null>>()
  const loadComponent = (id: string) => {
    let pending = componentLoads.get(id)
    if (!pending) { pending = assetProvider.loadFaceComponentAsset(appearance.modelSlot, id); componentLoads.set(id, pending) }
    return pending
  }
  if (!gpuPass || gpuPass === 'effects')
    await drawFaceExpressionEffects(context, artwork, sourceHead, targetHead, appearance, items, expressionEffects, studioFaceTransforms)
  if (gpuPass === 'effects') return
  const categoryIds: Partial<Record<FaceSheetKind, string | undefined>> = {
    eyes: appearance.eyeCatalogId,
    eyebrows: appearance.eyebrowCatalogId,
    nose: appearance.noseCatalogId,
    'mouth-closed': appearance.mouthOpen ? undefined : appearance.mouthClosedCatalogId,
    'mouth-open': appearance.mouthOpen ? appearance.mouthOpenCatalogId : undefined
  }
  for (const element of faceElementOrder) {
    if (gpuPass && gpuPass !== 'catalog') break
    if (element.startsWith('brow') && !appearance.eyebrows) continue
    const componentPart = element === 'eye-left' || element === 'eye-right' || element === 'brow-left' || element === 'brow-right' ? element : null
    if (componentPart) {
      const sourcePart = componentPart
      if (appearance.components?.[sourcePart]?.assetId) continue
    }
    const sheet: FaceSheetKind = element.startsWith('eye') ? 'eyes' : element.startsWith('brow') ? 'eyebrows' : element === 'nose' ? 'nose' : appearance.mouthOpen ? 'mouth-open' : 'mouth-closed'
    const side = element.endsWith('left') ? 'left' : element.endsWith('right') ? 'right' : undefined
    const sideKey = side ? `${sheet === 'eyes' ? 'eye' : 'brow'}-${side}` as FaceElementKind : null
    const sideField = element === 'eye-left' ? 'eyeLeftCatalogId' : element === 'eye-right' ? 'eyeRightCatalogId' : element === 'brow-left' ? 'eyebrowLeftCatalogId' : element === 'brow-right' ? 'eyebrowRightCatalogId' : null
    const hasSideSelection = sideField !== null && Object.hasOwn(appearance, sideField)
    const sideSelection = sideField ? appearance[sideField] : undefined
    const item = (sideKey ? items[sideKey] : undefined) ?? items[sheet]
    if (!item || item.id !== (hasSideSelection ? sideSelection : categoryIds[sheet])) continue
    const index = sheet === 'eyes' ? appearance.eyeState : sheet === 'nose' ? appearance.noseIndex : sheet.startsWith('mouth') ? appearance.expressionIndex : 0
    const piece = item.pieces.find((candidate) => candidate.sheet === sheet && candidate.index === index && candidate.side === side)
    if (!piece) continue
    const studioCategory = sheet === 'eyes' ? 'eyes' : sheet === 'eyebrows' ? 'eyebrows' : sheet === 'nose' ? 'nose' : 'mouth'
    const pairedMouthSheet = sheet === 'mouth-open' ? 'mouth-closed' : 'mouth-open'
    const pairedMouthId = sheet === 'mouth-open' ? appearance.mouthClosedCatalogId : appearance.mouthOpenCatalogId
    const closedMouthId = appearance.mouthClosedCatalogId
    const openMouthId = appearance.mouthOpenCatalogId
    const closedMouthExpression = closedMouthId ? studioFaceTransforms?.[`expression:mouth-closed:${closedMouthId}`] : undefined
    const openMouthExpression = openMouthId ? studioFaceTransforms?.[`expression:mouth-open:${openMouthId}`] : undefined
    const expressionTransform = element === 'mouth' && studioFaceMode
      ? closedMouthExpression ?? openMouthExpression ?? studioFaceTransforms?.[`expression:${element}:${item.id}`] ?? studioFaceTransforms?.[`expression:${sheet}:${item.id}`]
      : studioFaceTransforms?.[`expression:${element}:${item.id}`] ?? studioFaceTransforms?.[`expression:${sheet}:${item.id}`]
    const studioTransform = element === 'mouth' && studioFaceMode
      ? studioFaceTransforms?.mouth
        ?? (closedMouthId ? studioFaceTransforms?.[`mouth-closed:${closedMouthId}`] : undefined)
        ?? (openMouthId ? studioFaceTransforms?.[`mouth-open:${openMouthId}`] : undefined)
        ?? studioFaceTransforms?.[`${sheet}:${item.id}`]
        ?? (pairedMouthId ? studioFaceTransforms?.[`${pairedMouthSheet}:${pairedMouthId}`] : undefined)
      : studioFaceTransforms?.[`${sheet}:${item.id}`] ?? studioFaceTransforms?.[studioCategory]
    const sharedMouthBase = element === 'mouth'
      ? appearance.transforms?.mouth ?? items['mouth-closed']?.transforms.mouth ?? item.transforms.mouth
      : appearance.transforms?.[element] ?? item.transforms[element]
    const baseTransform = expressionTransform?.sourceTransformOverride ?? studioTransform?.sourceTransformOverride ?? sharedMouthBase
    const sourceTransform = element === 'mouth' && baseTransform
      ? alignMouthTransformToClosedBase(baseTransform, items['mouth-closed'], item)
      : baseTransform
    const elementOverride = headOverrides[`head:${element}`]
    if (elementOverride?.hidden) continue
    const transform = sourceTransform && elementOverride ? { ...sourceTransform, x: sourceTransform.x + (elementOverride.x ?? 0), y: sourceTransform.y + (elementOverride.y ?? 0), scaleX: sourceTransform.scaleX * (elementOverride.scaleX ?? 1), scaleY: sourceTransform.scaleY * (elementOverride.scaleY ?? 1), rotation: sourceTransform.rotation + (elementOverride.rotation ?? 0) } : sourceTransform
    if (!transform) continue
    try {
      const catalogPalettePart: FacePalettePartId | undefined = sheet === 'nose' ? 'nose' : sheet.startsWith('mouth') ? 'mouth' : undefined
      const catalogPalette = catalogPalettePart ? appearance.facePalettes?.[catalogPalettePart] : undefined
      const noseTone = appearance.noseSkinTone ?? skinTone
      const image = sheet === 'nose'
        ? noseTone ? await loadSkinTintedImage(piece.dataUrl, noseTone) : await loadCachedImage(piece.dataUrl)
        : await loadHairTintedImage(piece.dataUrl, appearance.partColors?.[element as 'eye-left' | 'eye-right' | 'brow-left' | 'brow-right'] ?? catalogPalette, catalogPalette ? { preserveNearWhite: true, allowNearWhiteRoles: appearance.facePaletteManualRoles?.[catalogPalettePart!] } : undefined)
      const localX = transform.x / sourceHead.width * targetHead.width + (studioTransform?.x ?? 0) / 100 * targetHead.width
      const localY = transform.y / sourceHead.height * targetHead.height + (studioTransform?.y ?? 0) / 100 * targetHead.height
      const radians = targetHead.rotation * Math.PI / 180
      const x = targetHead.x + targetHead.width / 2 + (localX - targetHead.width / 2) * Math.cos(radians) - (localY - targetHead.height / 2) * Math.sin(radians)
      const y = targetHead.y + targetHead.height / 2 + (localX - targetHead.width / 2) * Math.sin(radians) + (localY - targetHead.height / 2) * Math.cos(radians)
      const width = piece.width * transform.scaleX / sourceHead.width * targetHead.width * (studioTransform?.width ?? 100) / 100
      const height = piece.height * transform.scaleY / sourceHead.height * targetHead.height * (studioTransform?.height ?? 100) / 100
      context.save()
      if (sheet === 'nose') context.globalAlpha = Math.min(1, Math.max(0, appearance.noseOpacity ?? item.opacity ?? 1))
      context.translate(x, y)
      context.rotate((targetHead.rotation + transform.rotation + (studioTransform?.rotation ?? 0)) * Math.PI / 180)
      drawPreviewImageWithHalo(context, image, -width / 2, -height / 2, highlightedHeadId === element, width, height)
      context.restore()
    } catch { /* Keep the rest of the face visible if one catalog asset is missing. */ }
  }
  if (gpuPass === 'catalog') return
  const componentIds = catalogComponentIdsForPass(gpuPass)
  const loaded = new Map<FaceComponentPartId, FaceComponentAsset>()
  await Promise.all(componentIds.map(async (part) => {
    const id = appearance.components?.[part]?.assetId
    if (!id) return
    const asset = await loadComponent(id)
    if (asset) loaded.set(part, asset)
  }))

  const closedEyeAssets = new Map<FaceComponentPartId, FaceComponentAsset>()
  if (studioFaceMode === 'blink') {
    for (const side of ['left', 'right'] as const) {
      const part = `eye-${side}` as const
      const openEye = loaded.get(part)
      if (!openEye) continue
      const closedEye = await resolveClosedEye?.(openEye, side)
      if (!closedEye) throw new Error(`Não encontrei o olho fechado correspondente ao olho ${side === 'left' ? 'esquerdo' : 'direito'} salvo em Olhos Dev.`)
      closedEyeAssets.set(part, closedEye)
    }
    if (!closedEyeAssets.size && !appearance.eyeCatalogId && !appearance.eyeLeftCatalogId && !appearance.eyeRightCatalogId) {
      throw new Error('Selecione olhos do catálogo ou assets de Olhos Dev com a peça de olho fechado para usar Blink.')
    }
    for (const side of ['left', 'right'] as const) {
      const part = `eye-${side}` as const
      if (loaded.has(part)) continue
      const field = side === 'left' ? 'eyeLeftCatalogId' : 'eyeRightCatalogId'
      const id = Object.hasOwn(appearance, field) ? appearance[field] : appearance.eyeCatalogId
      const item = (side === 'left' ? items['eye-left'] : items['eye-right']) ?? items.eyes
      if (id && item?.id === id && !item.pieces.some((piece) => piece.sheet === 'eyes' && piece.index === 2 && piece.side === side)) {
        throw new Error(`A folha de olhos selecionada não tem a variante fechada do lado ${side === 'left' ? 'esquerdo' : 'direito'}.`)
      }
    }
  }
  const layerOrder: FaceComponentPartId[] = ['brow-left', 'brow-right', 'eye-left', 'eye-right', 'pupil-left', 'pupil-right']
  let pupilClipCanvas: HTMLCanvasElement | null = null
  for (const part of layerOrder) {
    if (gpuPass && gpuPass !== part) continue
    const category = part.startsWith('eye') ? 'eye' : part.startsWith('pupil') ? 'pupil' : 'eyebrow'
    const isRight = part.endsWith('right')
    if (studioFaceMode === 'blink' && category === 'pupil') continue
    const asset = category === 'eye' && studioFaceMode === 'blink' ? closedEyeAssets.get(part) ?? loaded.get(part) : loaded.get(part)
    const selectedPart = appearance.components?.[part]
    if (!asset || !selectedPart) continue
    // Fabricator Dev owns placement and scale; the Customizer only chooses the asset.
    const expressionTransform = studioFaceTransforms?.[`expression-component:${part}`]?.sourceTransformOverride
    const originalEye = category === 'eye' ? loaded.get(part) : undefined
    const openTransform = originalEye
      ? expressionTransform ?? selectedPart.transform ?? originalEye.defaultTransform
      : undefined
    const sourceTransform = closedEyeAssets.has(part) && originalEye && openTransform
      ? transferEyeCloseAdjustment(originalEye.defaultTransform, openTransform, asset.defaultTransform)
      : expressionTransform ?? selectedPart.transform ?? asset.defaultTransform
    const override = headOverrides[`head:${part}`]
    if (override?.hidden) continue
    const transform = override ? { ...sourceTransform, x: sourceTransform.x + (override.x ?? 0), y: sourceTransform.y + (override.y ?? 0), scaleX: sourceTransform.scaleX * (override.scaleX ?? 1), scaleY: sourceTransform.scaleY * (override.scaleY ?? 1), rotation: sourceTransform.rotation + (override.rotation ?? 0) } : sourceTransform
    const mirroredTransform = isRight && category !== 'pupil' && !asset.rightSidePositioned ? { ...transform, x: sourceHead.width - transform.x, rotation: -transform.rotation } : transform
    let localX = mirroredTransform.x
    let localY = mirroredTransform.y
    let drawRotation = mirroredTransform.rotation
    let scaleX = mirroredTransform.scaleX
    let scaleY = mirroredTransform.scaleY
    let sourceWidth = asset.width * scaleX
    let sourceHeight = asset.height * scaleY
    let pupilEyeClip: { asset: FaceComponentAsset; transform: FaceComponentAsset['defaultTransform']; flipX: boolean; colors?: HairColorOverrides } | undefined
    if (category === 'pupil') {
      const eyePart: FaceComponentPartId = isRight ? 'eye-right' : 'eye-left'
      const eyeAsset = loaded.get(eyePart)
      if (!eyeAsset) continue
      const eyeSelection = appearance.components?.[eyePart]
      const eyeTransformBase = eyeAsset
        ? studioFaceTransforms?.[`expression-component:${eyePart}`]?.sourceTransformOverride ?? eyeSelection?.transform ?? eyeAsset.defaultTransform
        : undefined
      if (eyeTransformBase) {
        const eyeTransform = isRight && !eyeAsset?.rightSidePositioned ? { ...eyeTransformBase, x: sourceHead.width - eyeTransformBase.x, rotation: -eyeTransformBase.rotation } : eyeTransformBase
        if (eyeAsset) pupilEyeClip = { asset: eyeAsset, transform: eyeTransform, flipX: Boolean(eyeTransformBase.flipX) !== (isRight && !eyeAsset.rightSidePositioned), colors: eyeSelection?.colors }
        // Fabricator stores pupil x/y as offsets in head pixels. The preview
        // positions the pupil inside a scaled eye mask, so those offsets must
        // not be scaled a second time by the eye transform here.
        const pupilOffsetX = isRight && !asset.rightSidePositioned ? -transform.x : transform.x
        const pupilOffsetY = transform.y
        const pupilAngle = eyeTransform.rotation * Math.PI / 180
        localX = eyeTransform.x + pupilOffsetX * Math.cos(pupilAngle) - pupilOffsetY * Math.sin(pupilAngle)
        localY = eyeTransform.y + pupilOffsetX * Math.sin(pupilAngle) + pupilOffsetY * Math.cos(pupilAngle)
        scaleX = eyeTransform.scaleX * scaleX
        scaleY = eyeTransform.scaleY * scaleY
        sourceWidth = (eyeAsset?.width ?? sourceHead.width * .19) * eyeTransform.scaleX * transform.scaleX
        sourceHeight = (eyeAsset?.height ?? sourceHead.height * .17) * eyeTransform.scaleY * transform.scaleY
        const pupilSideDirection = isRight && !asset.rightSidePositioned ? -1 : 1
        const eyeFlipDirection = pupilEyeClip?.flipX ? -1 : 1
        drawRotation = eyeTransform.rotation + transform.rotation * pupilSideDirection * eyeFlipDirection
      }
    }
    const localTargetX = localX / sourceHead.width * targetHead.width
    const localTargetY = localY / sourceHead.height * targetHead.height
    const radians = targetHead.rotation * Math.PI / 180
    const x = targetHead.x + targetHead.width / 2 + (localTargetX - targetHead.width / 2) * Math.cos(radians) - (localTargetY - targetHead.height / 2) * Math.sin(radians)
    const y = targetHead.y + targetHead.height / 2 + (localTargetX - targetHead.width / 2) * Math.sin(radians) + (localTargetY - targetHead.height / 2) * Math.cos(radians)
    const width = sourceWidth / sourceHead.width * targetHead.width
    const height = sourceHeight / sourceHead.height * targetHead.height
    try {
      const image = await loadHairTintedImage(asset.dataUrl, selectedPart.colors, { preserveNearWhite: true, allowNearWhiteRoles: selectedPart.manualColorRoles })
      if (category === 'pupil' && pupilEyeClip) {
        if (!pupilClipCanvas) { pupilClipCanvas = document.createElement('canvas'); pupilClipCanvas.width = context.canvas.width; pupilClipCanvas.height = context.canvas.height }
        const clipped = pupilClipCanvas.getContext('2d')
        if (clipped) {
          clipped.clearRect(0, 0, pupilClipCanvas.width, pupilClipCanvas.height)
          clipped.save(); clipped.translate(x, y); clipped.rotate((targetHead.rotation + drawRotation) * Math.PI / 180)
          const pupilFlip = Boolean(transform.flipX) !== Boolean(pupilEyeClip.flipX)
          if (pupilFlip) clipped.scale(-1, 1)
          clipped.drawImage(image, -width / 2, -height / 2, width, height); clipped.restore()

          const eyeMask = await loadCachedImage(await eyeInteriorMask(pupilEyeClip.asset.dataUrl))
          const eyeLocalX = pupilEyeClip.transform.x / sourceHead.width * targetHead.width
          const eyeLocalY = pupilEyeClip.transform.y / sourceHead.height * targetHead.height
          const eyeX = targetHead.x + targetHead.width / 2 + (eyeLocalX - targetHead.width / 2) * Math.cos(radians) - (eyeLocalY - targetHead.height / 2) * Math.sin(radians)
          const eyeY = targetHead.y + targetHead.height / 2 + (eyeLocalX - targetHead.width / 2) * Math.sin(radians) + (eyeLocalY - targetHead.height / 2) * Math.cos(radians)
          const eyeWidth = pupilEyeClip.asset.width * pupilEyeClip.transform.scaleX / sourceHead.width * targetHead.width
          const eyeHeight = pupilEyeClip.asset.height * pupilEyeClip.transform.scaleY / sourceHead.height * targetHead.height
          clipped.save(); clipped.globalCompositeOperation = 'destination-in'; clipped.translate(eyeX, eyeY)
          clipped.rotate((targetHead.rotation + pupilEyeClip.transform.rotation) * Math.PI / 180)
          if (pupilEyeClip.flipX) clipped.scale(-1, 1)
          clipped.drawImage(eyeMask, -eyeWidth / 2, -eyeHeight / 2, eyeWidth, eyeHeight); clipped.restore()
          drawPreviewImageWithHalo(context, pupilClipCanvas, 0, 0, highlightedHeadId === part)
        }
      } else {
        context.save(); context.translate(x, y); context.rotate((targetHead.rotation + drawRotation) * Math.PI / 180)
        if (Boolean(transform.flipX) !== (isRight && !asset.rightSidePositioned)) context.scale(-1, 1)
        drawPreviewImageWithHalo(context, image, -width / 2, -height / 2, highlightedHeadId === part, width, height); context.restore()
      }
    } catch { /* Keep the rest of the face visible if one component asset is unavailable. */ }
  }
  if (gpuPass && gpuPass !== 'details' && gpuPass !== 'extras') return
  const detailOrder: FaceDetailKind[] = ['facial-shadow', 'blush', 'eye-highlight-left', 'eye-highlight-right']
  for (const kind of detailOrder) {
    if (gpuPass === 'extras') break
    const id = appearance.faceDetails?.[kind]
    if (!id) continue
    const asset = await loadComponent(id)
    if (!asset || asset.kind !== kind) continue
    const baseTransform = asset.defaultTransform
    const override = headOverrides[`head:${kind}`]
    if (override?.hidden) continue
    const transform = override ? { ...baseTransform, x: baseTransform.x + (override.x ?? 0), y: baseTransform.y + (override.y ?? 0), scaleX: baseTransform.scaleX * (override.scaleX ?? 1), scaleY: baseTransform.scaleY * (override.scaleY ?? 1), rotation: baseTransform.rotation + (override.rotation ?? 0) } : baseTransform
    const localX = transform.x / sourceHead.width * targetHead.width
    const localY = transform.y / sourceHead.height * targetHead.height
    const radians = targetHead.rotation * Math.PI / 180
    const x = targetHead.x + targetHead.width / 2 + (localX - targetHead.width / 2) * Math.cos(radians) - (localY - targetHead.height / 2) * Math.sin(radians)
    const y = targetHead.y + targetHead.height / 2 + (localX - targetHead.width / 2) * Math.sin(radians) + (localY - targetHead.height / 2) * Math.cos(radians)
    const width = asset.width * transform.scaleX / sourceHead.width * targetHead.width
    const height = asset.height * transform.scaleY / sourceHead.height * targetHead.height
    try {
      const image = await loadHairTintedImage(asset.dataUrl, appearance.facePalettes?.[kind], { preserveNearWhite: true, allowNearWhiteRoles: appearance.facePaletteManualRoles?.[kind] })
      context.save(); context.translate(x, y); context.rotate((targetHead.rotation + transform.rotation) * Math.PI / 180)
      if (transform.flipX) context.scale(-1, 1)
      drawPreviewImageWithHalo(context, image, -width / 2, -height / 2, highlightedHeadId === kind, width, height); context.restore()
    } catch { /* Keep the rest of the face visible if one detail asset is unavailable. */ }
  }
  if (gpuPass === 'details') return
  for (const id of Object.values(appearance.headExtras ?? {})) {
    if (!id) continue
    const asset = await loadComponent(id)
    if (!asset || asset.kind !== 'head-extra') continue
    const baseTransform = asset.defaultTransform
    const extraName = Object.entries(appearance.headExtras ?? {}).find(([, extraId]) => extraId === id)?.[0]
    const override = headOverrides[`head:${extraName === 'glasses' ? 'oculos' : 'acessorio-cabeca'}`]
    if (override?.hidden) continue
    const transform = override ? { ...baseTransform, x: baseTransform.x + (override.x ?? 0), y: baseTransform.y + (override.y ?? 0), scaleX: baseTransform.scaleX * (override.scaleX ?? 1), scaleY: baseTransform.scaleY * (override.scaleY ?? 1), rotation: baseTransform.rotation + (override.rotation ?? 0) } : baseTransform
    const localX = transform.x / sourceHead.width * targetHead.width
    const localY = transform.y / sourceHead.height * targetHead.height
    const radians = targetHead.rotation * Math.PI / 180
    const x = targetHead.x + targetHead.width / 2 + (localX - targetHead.width / 2) * Math.cos(radians) - (localY - targetHead.height / 2) * Math.sin(radians)
    const y = targetHead.y + targetHead.height / 2 + (localX - targetHead.width / 2) * Math.sin(radians) + (localY - targetHead.height / 2) * Math.cos(radians)
    const width = asset.width * transform.scaleX / sourceHead.width * targetHead.width
    const height = asset.height * transform.scaleY / sourceHead.height * targetHead.height
    try {
      const image = await loadCachedImage(asset.dataUrl)
      context.save(); context.translate(x, y); context.rotate((targetHead.rotation + transform.rotation) * Math.PI / 180)
      if (transform.flipX) context.scale(-1, 1)
      drawPreviewImageWithHalo(context, image, -width / 2, -height / 2, highlightedHeadId === (extraName === 'glasses' ? 'oculos' : 'acessorio-cabeca'), width, height); context.restore()
    } catch { /* Keep the character visible if an accessory asset is unavailable. */ }
  }
}

export async function prepareSavedCharacterRenderer(character: CustomizerCharacter, renderSource?: { artwork: CatalogArtwork; source: FabricatorProject; assetProvider?: VideoCharacterRenderAssetProvider }): Promise<{ width: number; height: number; render: (appearance?: CustomizerFaceAppearance, studioFaceTransforms?: StudioFaceTransforms, expressionEffects?: FaceExpressionEffects, studioFaceMode?: StudioFaceMode) => Promise<{ dataUrl: string; width: number; height: number }>; renderToCanvas: (appearance?: CustomizerFaceAppearance, studioFaceTransforms?: StudioFaceTransforms, expressionEffects?: FaceExpressionEffects, studioFaceMode?: StudioFaceMode) => Promise<{ canvas: HTMLCanvasElement; width: number; height: number }>; renderGpuLayers: (appearance?: CustomizerFaceAppearance, studioFaceTransforms?: StudioFaceTransforms, expressionEffects?: FaceExpressionEffects, studioFaceMode?: StudioFaceMode) => Promise<ReadonlyArray<{ id: string; source: HTMLCanvasElement }>>; renderGpuFacePass: (pass: GachaFacePass, appearance?: CustomizerFaceAppearance, studioFaceTransforms?: StudioFaceTransforms, expressionEffects?: FaceExpressionEffects, studioFaceMode?: StudioFaceMode) => Promise<HTMLCanvasElement>; gpuStaticLayers: Readonly<{ behindFace: HTMLCanvasElement; inFrontOfFace: HTMLCanvasElement | null }> }> {
  const { modelSlot, assetProvider, source, artwork } = await resolveSavedCharacterSource(character, renderSource)
  const proportions = getCharacterProportions(character.customization)
  const hairAppearance = character.customization.hairAppearance
  const [backStyles, posteriorStyles, fringeStyles] = await Promise.all([
    loadHairAppearanceLayers(hairAppearance, modelSlot, 'back', {}, assetProvider),
    loadHairAppearanceLayers(hairAppearance, modelSlot, 'front', {}, assetProvider),
    loadHairAppearanceLayers(hairAppearance, modelSlot, 'fringe', {}, assetProvider)
  ])
  const frontStyles = [...posteriorStyles, ...fringeStyles]
  const baseImage = document.createElement('canvas')
  baseImage.width = artwork.width
  baseImage.height = artwork.height
  const baseContext = baseImage.getContext('2d')
  if (!baseContext) throw new Error(`Não foi possível montar a prévia de ${character.name}.`)
  await renderArtworkWithHair(artwork, source, backStyles, Math.max(artwork.width, artwork.height), character.customization.modelSkinTone, hairAppearance, baseContext, character.customization.partOverrides)

  const groups = (character.customization.wardrobeGroups ?? []).filter((group) => group.modelSlot === modelSlot)
  const details: Record<string, WardrobeSet> = {}
  await Promise.all(groups.map(async (group) => {
    const key = `${group.modelSlot}:${group.setId}`
    if (details[key]) return
    const set = await assetProvider.loadWardrobeSet(group.modelSlot, group.setId)
    if (!set) throw new Error(`O personagem referencia um conjunto de roupa indisponível (${key}). A fonte não será modificada.`)
    details[key] = set
  }))
  const wardrobe = await renderWardrobeOverlay(groups, details, artwork, modelSlot, source, character.customization.modelSkinTone)

  const appearance = character.customization.faceAppearance
  const expressionEffectsByIndex = appearance?.modelSlot === modelSlot
    ? await loadStandardExpressionEffects(modelSlot, assetProvider).catch((): StandardExpressionEffects => ({}))
    : {}
  let faceItems: Partial<Record<FaceSheetKind | FaceElementKind, FaceCatalogItem>> = {}
  const faceItemPromises = new Map<string, Promise<FaceCatalogItem | null>>()
  let faceCatalogSummariesPromise: Promise<FaceCatalogItemSummary[]> | null = null
  let closedEyeAssetsPromise: Promise<FaceComponentAsset[]> | null = null
  const resolveClosedEye: StudioClosedEyeResolver = async (openEye, side) => {
    if (!closedEyeAssetsPromise) {
      closedEyeAssetsPromise = assetProvider.listFaceComponentAssets(modelSlot, 'eye-closed').then(async (summaries) => {
        const details = await Promise.all(summaries.map((summary) => assetProvider.loadFaceComponentAsset(modelSlot, summary.id)))
        return details.filter((asset): asset is FaceComponentAsset => Boolean(asset?.kind === 'eye-closed'))
      })
    }
    const candidates = (await closedEyeAssetsPromise).filter((asset) => isRightFaceAsset(asset) === (side === 'right'))
    const openBaseName = componentSheetName(openEye.name)
    const paired = candidates.filter((asset) => Boolean(openEye.pairId && openEye.pairId === asset.pairId))
    if (paired.length) return paired.sort((left, right) => closedEyeSimilarity(openEye, left) - closedEyeSimilarity(openEye, right))[0]
    const sameSheet = candidates.filter((asset) => componentSheetName(asset.name) === openBaseName)
    if (sameSheet.length) return sameSheet.sort((left, right) => closedEyeSimilarity(openEye, left) - closedEyeSimilarity(openEye, right))[0]
    return candidates.length === 1 ? candidates[0] : null
  }
  let legacyFaceUrl: string | null = null
  if (appearance?.modelSlot === modelSlot) {
    const hasCatalogFaceSelection = Boolean(appearance.eyeCatalogId || appearance.eyeLeftCatalogId || appearance.eyeRightCatalogId || appearance.eyebrowCatalogId || appearance.eyebrowLeftCatalogId || appearance.eyebrowRightCatalogId || appearance.noseCatalogId || appearance.mouthClosedCatalogId || appearance.mouthOpenCatalogId || Object.values(appearance.components ?? {}).some((component) => component?.assetId))
    if (hasCatalogFaceSelection) {
      const selections: Array<[FaceSheetKind | FaceElementKind, string | undefined]> = [
        ['eyes', appearance.eyeCatalogId], ['eyebrows', appearance.eyebrowCatalogId], ['nose', appearance.noseCatalogId],
        ['eye-left', appearance.eyeLeftCatalogId ?? undefined], ['eye-right', appearance.eyeRightCatalogId ?? undefined], ['brow-left', appearance.eyebrowLeftCatalogId ?? undefined], ['brow-right', appearance.eyebrowRightCatalogId ?? undefined],
        ['mouth-closed', appearance.mouthClosedCatalogId], ['mouth-open', appearance.mouthOpenCatalogId]
      ]
      const entries = await Promise.all(selections.filter((entry): entry is [FaceSheetKind | FaceElementKind, string] => Boolean(entry[1])).map(async ([category, id]) => [category, await assetProvider.loadFaceCatalogItem(modelSlot, id)] as const))
      for (const [category, item] of entries) if (item) faceItems[category] = item
    } else if (appearance.setId) {
      const face = await assetProvider.loadFaceSet(modelSlot, appearance.setId)
      if (face) legacyFaceUrl = await renderFaceOverlay(artwork, source, face, appearance)
    }
  }
  const frontHairImage = frontStyles.length ? document.createElement('canvas') : null
  if (frontHairImage) {
    frontHairImage.width = artwork.width
    frontHairImage.height = artwork.height
    const frontContext = frontHairImage.getContext('2d')
    if (!frontContext) throw new Error('Não foi possível preparar o cabelo do personagem.')
    await renderFrontHairOverlay(artwork, source, frontStyles, Math.max(artwork.width, artwork.height), hairAppearance, frontContext, character.customization.partOverrides)
  }
  const wardrobeImage = wardrobe.imageUrl ? await loadCachedImage(wardrobe.imageUrl) : null
  const wardrobeAboveHairImage = wardrobe.aboveHairImageUrl ? await loadCachedImage(wardrobe.aboveHairImageUrl) : null
  const legacyFaceImage = legacyFaceUrl ? await loadCachedImage(legacyFaceUrl) : null
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, artwork.width)
  canvas.height = Math.max(1, artwork.height)
  const context = canvas.getContext('2d')
  if (context) configureCharacterSampling(context)
  if (!context) throw new Error('Não foi possível preparar a imagem do personagem.')
  const rigLayers = prepareGachaStaticLayers(baseImage, wardrobeImage, frontHairImage, wardrobeAboveHairImage)
  const shapeScale = characterShapeScale(proportions)
  const outputWidth = Math.max(canvas.width, Math.ceil(canvas.width * shapeScale.x))
  const outputHeight = Math.max(canvas.height, Math.ceil(canvas.height * shapeScale.y))
  const drawFace = async (
    faceContext: CanvasRenderingContext2D,
    currentAppearance: CustomizerFaceAppearance | undefined,
    studioFaceTransforms?: StudioFaceTransforms,
    expressionEffects?: FaceExpressionEffects,
    studioFaceMode?: StudioFaceMode,
    gpuPass?: GachaFacePass
  ): Promise<void> => {
    let faceAppearance = currentAppearance && studioFaceMode ? {
      ...currentAppearance,
      eyeState: studioFaceMode === 'blink' ? 2 as const : currentAppearance.eyeState === 1 ? 1 as const : 0 as const,
      mouthOpen: studioFaceMode === 'talk'
    } : currentAppearance
    if (studioFaceMode === 'talk' && faceAppearance && !faceAppearance.mouthOpenCatalogId) {
      faceCatalogSummariesPromise ??= assetProvider.listFaceCatalog(modelSlot)
      const catalog = await faceCatalogSummariesPromise
      const mouthOpenCatalogId = resolveStudioTalkMouthId(faceAppearance, catalog)
      if (mouthOpenCatalogId) faceAppearance = { ...faceAppearance, mouthOpenCatalogId }
    }
    if (faceAppearance?.modelSlot === modelSlot) {
      const selections: Array<[FaceSheetKind | FaceElementKind, string | undefined]> = [
        ['eyes', faceAppearance.eyeCatalogId], ['eyebrows', faceAppearance.eyebrowCatalogId], ['nose', faceAppearance.noseCatalogId],
        ['eye-left', faceAppearance.eyeLeftCatalogId ?? undefined], ['eye-right', faceAppearance.eyeRightCatalogId ?? undefined], ['brow-left', faceAppearance.eyebrowLeftCatalogId ?? undefined], ['brow-right', faceAppearance.eyebrowRightCatalogId ?? undefined],
        ['mouth-closed', faceAppearance.mouthClosedCatalogId], ['mouth-open', faceAppearance.mouthOpenCatalogId]
      ]
      const hasCatalogFaceSelection = selections.some(([, id]) => Boolean(id)) || Object.values(faceAppearance.components ?? {}).some((component) => component?.assetId)
      const hasFaceOverlaySelection = Object.values(faceAppearance.faceDetails ?? {}).some(Boolean) || Object.values(faceAppearance.headExtras ?? {}).some(Boolean)
      if (studioFaceMode === 'blink' && !hasCatalogFaceSelection && !legacyFaceImage) throw new Error('Blink precisa dos assets faciais separados do catálogo de rosto ou de Olhos Dev.')
      const activeItems: Partial<Record<FaceSheetKind | FaceElementKind, FaceCatalogItem>> = {}
      await Promise.all(selections.filter((entry): entry is [FaceSheetKind | FaceElementKind, string] => Boolean(entry[1])).map(async ([category, id]) => {
        let item = faceItems[category]?.id === id ? faceItems[category] : null
        if (!item) {
          const key = `${category}:${id}`
          let pending = faceItemPromises.get(key)
          if (!pending) {
            pending = assetProvider.loadFaceCatalogItem(modelSlot, id)
            faceItemPromises.set(key, pending)
          }
          item = await pending ?? null
          if (item) faceItems[category] = item
        }
        if (item) activeItems[category] = item
      }))
      if (studioFaceMode === 'talk' && !activeItems['mouth-open']?.pieces.some((piece) => piece.sheet === 'mouth-open' && piece.index === faceAppearance.expressionIndex)) {
        throw new Error('Não encontrei uma boca aberta para esta variante. Selecione uma folha de bocas abertas em Rosto Dev.')
      }
      const mouthEffects = expressionEffects ?? expressionEffectsByIndex[faceAppearance.expressionIndex]
      if ((!gpuPass || gpuPass === 'catalog') && !hasCatalogFaceSelection && legacyFaceImage && faceAppearance.setId === appearance?.setId) faceContext.drawImage(legacyFaceImage, 0, 0, canvas.width, canvas.height)
      if (hasCatalogFaceSelection || hasFaceOverlaySelection) await drawFaceCatalogOverlay(faceContext, artwork, source, activeItems, faceAppearance, character.customization.modelSkinTone, studioFaceTransforms, mouthEffects, studioFaceMode, resolveClosedEye, character.customization.partOverrides, undefined, assetProvider, gpuPass)
    } else if ((!gpuPass || gpuPass === 'catalog') && legacyFaceImage) faceContext.drawImage(legacyFaceImage, 0, 0, canvas.width, canvas.height)
  }
  const renderToCanvas = async (currentAppearance: CustomizerFaceAppearance | undefined = appearance, studioFaceTransforms?: StudioFaceTransforms, expressionEffects?: FaceExpressionEffects, studioFaceMode?: StudioFaceMode) => {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(rigLayers.behindFace, 0, 0, canvas.width, canvas.height)
    await drawFace(context, currentAppearance, studioFaceTransforms, expressionEffects, studioFaceMode)
    if (rigLayers.inFrontOfFace) context.drawImage(rigLayers.inFrontOfFace, 0, 0, canvas.width, canvas.height)
    if (shapeScale.x === 1 && shapeScale.y === 1) return { canvas, width: canvas.width, height: canvas.height }
    const output = document.createElement('canvas')
    output.width = outputWidth
    output.height = outputHeight
    const outputContext = output.getContext('2d')
    if (!outputContext) throw new Error('Não foi possível aplicar as proporções do personagem.')
    outputContext.translate(outputWidth / 2, outputHeight / 2)
    outputContext.scale(shapeScale.x, shapeScale.y)
    outputContext.drawImage(canvas, -canvas.width / 2, -canvas.height / 2)
    return { canvas: output, width: outputWidth, height: outputHeight }
  }
  const {renderGpuLayers,renderGpuFacePass,gpuStaticLayers}=createPreparedGachaGpuLayers({
    rigLayers,shapeScale,outputWidth,outputHeight,artworkWidth:artwork.width,
    artworkHeight:artwork.height,modelSlot,appearance,legacyFaceImage,drawFace,staticSources:{bodyAndBackHair:baseImage,wardrobe:wardrobeImage,frontHair:frontHairImage,wardrobeAboveHair:wardrobeAboveHairImage}
  })
  const render = async (...args: Parameters<typeof renderToCanvas>) => {
    const value = await renderToCanvas(...args)
    return { dataUrl: value.canvas.toDataURL('image/png'), width: value.width, height: value.height }
  }
  return { width: outputWidth, height: outputHeight, render, renderToCanvas, renderGpuLayers, renderGpuFacePass,
    gpuStaticLayers }
}

export async function renderSavedCharacter(character: CustomizerCharacter, studioFaceTransforms?: StudioFaceTransforms, expressionEffects?: FaceExpressionEffects, studioFaceMode?: StudioFaceMode): Promise<{ dataUrl: string; width: number; height: number }> {
  const renderer = await prepareSavedCharacterRenderer(character)
  return renderer.render(character.customization.faceAppearance, studioFaceTransforms, expressionEffects, studioFaceMode)
}
