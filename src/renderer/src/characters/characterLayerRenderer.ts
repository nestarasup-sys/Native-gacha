import type { FaceComponentAssetSummary, FaceElementKind, FaceSet, FabricatorProject, HairStyle } from '../../../shared/fabricator'
import type { CharacterRenderAssetProvider } from '../../../shared/characterRenderAssets'
import type { CustomizerCharacter, CustomizerFaceAppearance, HairColorOverrides, HairPartId } from '../../../shared/customizer'
import { hairCategories } from '../../../shared/hairCategories'
import type { CatalogArtwork } from './characterSourceResolver'
import { configureCharacterSampling, MAX_CHARACTER_PREVIEW_PIXELS } from './renderResolution'
import { createCharacterCanvas } from './canvasSurface'
import { drawPreviewImageWithHalo } from './characterCanvasDrawing'

export type HairCatalogSide = 'front' | 'back'
export const faceElementOrder: FaceElementKind[] = ['brow-left', 'brow-right', 'eye-left', 'eye-right', 'nose', 'mouth']

export function isRightFaceAsset(asset: FaceComponentAssetSummary): boolean {
  return asset.rightSidePositioned === true || / · (?:Olho|Olho aberto|Olho fechado|Pupila|Sobrancelha) direit[oa]$/i.test(asset.name)
}

export type CharacterLayerImageLoaders = {
  loadCachedImage: (source: string | CanvasImageSource) => Promise<HTMLImageElement>
  loadHairTintedImage: (source: string, overrides: HairColorOverrides | undefined) => Promise<HTMLImageElement>
  loadSkinTintedImage: (source: string, tone: string) => Promise<HTMLImageElement>
}

export function createCharacterLayerRenderer(loaders: CharacterLayerImageLoaders) {
  const { loadCachedImage, loadHairTintedImage, loadSkinTintedImage } = loaders
  type HairLayerSide = HairCatalogSide | 'fringe'

  type HairLayerReference = { style: HairStyle; side: HairLayerSide; part: HairPartId }

  const customizerHairParts = hairCategories

  const hairAppearanceStyleId = (appearance: NonNullable<CustomizerCharacter['customization']['hairAppearance']> | undefined, side: HairCatalogSide): string | null => {
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

  async function loadHairAppearanceLayers(appearance: NonNullable<CustomizerCharacter['customization']['hairAppearance']> | undefined, modelSlot: number, side: HairLayerSide, cached: Record<string, HairStyle> = {}, assetProvider: CharacterRenderAssetProvider = window.desktop): Promise<HairLayerReference[]> {
    if (!appearance || appearance.modelSlot !== modelSlot) return []
    const ids = hairAppearanceStyleIds(appearance, side)
    const styles = await Promise.all(ids.map(async ({ id }) => cached[`${modelSlot}:${id}`] ?? await assetProvider.loadHairStyle(modelSlot, id)))
    return styles.flatMap((style, index) => style ? [{ style, side, part: ids[index].part }] : [])
  }

  function resolvedHairColors(appearance: CustomizerCharacter['customization']['hairAppearance'], part: HairPartId): HairColorOverrides {
    return { ...appearance?.colors, ...appearance?.partColors?.[part] }
  }


  async function renderArtwork(artwork: CatalogArtwork, maxSize: number, skinTone?: string, trimTransparent = false): Promise<string | null> {
    if (artwork.width <= 0 || artwork.height <= 0) return null
    const scale = Math.min(maxSize / artwork.width, maxSize / artwork.height)
    const canvas = createCharacterCanvas()
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
    const trimmed = createCharacterCanvas()
    trimmed.width = right - left + 1 + margin * 2
    trimmed.height = bottom - top + 1 + margin * 2
    trimmed.getContext('2d')?.drawImage(canvas, left, top, right - left + 1, bottom - top + 1, margin, margin, right - left + 1, bottom - top + 1)
    return trimmed.toDataURL('image/png')
  }

  async function renderArtworkWithHair(artwork: CatalogArtwork, source: FabricatorProject, backStyles: HairStyle | HairLayerReference[] | null, maxSize: number, skinTone?: string, hairAppearance?: CustomizerCharacter['customization']['hairAppearance'], targetContext?: CanvasRenderingContext2D, headOverrides: CustomizerCharacter['customization']['partOverrides'] = {}, highlightedHeadId?: string | null): Promise<string | null> {
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
    const canvas = targetContext?.canvas ?? createCharacterCanvas()
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

  async function renderFrontHairOverlay(artwork: CatalogArtwork, source: FabricatorProject, frontStyles: HairStyle | HairLayerReference[] | null, maxSize: number, hairAppearance?: CustomizerCharacter['customization']['hairAppearance'], targetContext?: CanvasRenderingContext2D, headOverrides: CustomizerCharacter['customization']['partOverrides'] = {}, highlightedHeadId?: string | null): Promise<string | null> {
    const hairLayers: HairLayerReference[] = Array.isArray(frontStyles) ? frontStyles : frontStyles ? [{ style: frontStyles, side: 'front', part: 'rearHair' }] : []
    const validHairLayers = hairLayers.filter((layer) => (layer.side === 'front' || layer.side === 'fringe') && layer.style[layer.side] && layer.style.modelSlot === source.slot)
    if (!validHairLayers.length && !targetContext) return null
    const sourceHead = source.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
    const targetHead = artwork.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
    if (!sourceHead || !targetHead || sourceHead.width <= 0 || sourceHead.height <= 0) return null
    const scale = Math.min(maxSize / artwork.width, maxSize / artwork.height)
    const canvas = targetContext?.canvas ?? createCharacterCanvas()
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

  async function renderFaceOverlay(artwork: CatalogArtwork, source: FabricatorProject | null, face: FaceSet | null, appearance: CustomizerFaceAppearance | undefined, maxSize = Math.max(artwork.width, artwork.height), headOverrides: CustomizerCharacter['customization']['partOverrides'] = {}, highlightedHeadId?: string | null): Promise<string | null> {
    if (!source || !face || !appearance || appearance.setId !== face.id || appearance.modelSlot !== source.slot) return null
    const sourceHead = source.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
    const targetHead = artwork.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
    if (!sourceHead || !targetHead || sourceHead.width <= 0 || sourceHead.height <= 0) return null
    const canvas = createCharacterCanvas()
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


  return { customizerHairParts, hairAppearanceStyleId, loadHairAppearanceLayers, resolvedHairColors, renderArtwork, renderArtworkWithHair, renderFrontHairOverlay, renderFaceOverlay }
}
