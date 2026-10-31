import type { FabricatorProject, ModelSkinContourStroke, WardrobeCategory, WardrobeSet } from '../../../shared/fabricator'
import type { CharacterColorOverrides, CustomizerWardrobeCategory, CustomizerWardrobeGroup } from '../../../shared/customizer'
import { mapWardrobeComponentToPose, wardrobePosePadding } from '../../../shared/wardrobePose'
import { normalizeLayerOrder } from '../../../shared/modelRig'
import { bindLegacyTorsoGridWardrobeSet, validateWardrobeFlow } from '../../../shared/assetFlow'
import { wardrobeAdjustmentMatrix } from '../../../shared/wardrobeAdjustment'
import type { CatalogArtwork } from './characterSourceResolver'
import { configureCharacterSampling, MAX_CHARACTER_PREVIEW_PIXELS } from './renderResolution'
import { createCharacterCanvas } from './canvasSurface'
import { drawPreviewImageWithHalo } from './characterCanvasDrawing'
import { isModelBodyPartName } from './skinTint'

export type ClothingGroupCategory = CustomizerWardrobeCategory
export type SelectedWardrobeComponent = { modelSlot: number; setId: string; category: ClothingGroupCategory; componentId: string }
export type AdjustmentPreviewHighlight = { scope: 'head'; id: string } | { scope: 'clothing'; piece: SelectedWardrobeComponent }

export type CharacterWardrobeImageLoaders = {
  loadCachedImage: (source: string | CanvasImageSource) => Promise<HTMLImageElement>
  loadCharacterTintedImage: (source: string, overrides: CharacterColorOverrides | undefined) => Promise<HTMLImageElement>
  loadSkinTintedImage: (source: string, tone: string) => Promise<HTMLImageElement>
  loadModelBodyTintedImage: (source: string, skinTone?: string, outlineColor?: string, fakeContours?: ModelSkinContourStroke[]) => Promise<HTMLImageElement>
}

export function createCharacterWardrobeRenderer(loaders: CharacterWardrobeImageLoaders) {
  const { loadCachedImage, loadCharacterTintedImage, loadSkinTintedImage, loadModelBodyTintedImage } = loaders
  const clothingCategories: Record<'Superior' | 'Inferior', Array<{ id: ClothingGroupCategory; label: string; source: WardrobeCategory[] }>> = {
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

  function wardrobeComponentsForGroup(group: CustomizerWardrobeGroup, details: Record<string, WardrobeSet>): WardrobeSet['components'] {
    const components = details[`${group.modelSlot}:${group.setId}`]?.components
    if (!components) return []
    // A stable component ID is authoritative. Its catalog category may have been
    // edited after the character equipped it; filtering by the stale group
    // category made valid saved clothes look deleted.
    if (group.componentId) return components.filter((component) => component.id === group.componentId)
    const accepted = Object.values(clothingCategories).flat().find((category) => category.id === group.category)?.source
    return components.filter((component) => accepted?.includes(component.category))
  }

  async function renderWardrobeOverlayCanvases(
    groups: CustomizerWardrobeGroup[],
    details: Record<string, WardrobeSet>,
    artwork: CatalogArtwork,
    modelSlot: number | null,
    source: FabricatorProject | null,
    skinTone?: string,
    maxSize = Math.max(artwork.width, artwork.height),
    highlight?: AdjustmentPreviewHighlight | null
  ): Promise<{ canvas: HTMLCanvasElement | null; aboveHairCanvas: HTMLCanvasElement | null }> {
    if (!groups.length || modelSlot === null || !source) return { canvas: null, aboveHairCanvas: null }
    const renderDetails: Record<string, WardrobeSet> = {}
    for (const [key, set] of Object.entries(details)) renderDetails[key] = bindLegacyTorsoGridWardrobeSet(set, source)
    const output = createCharacterCanvas()
    const pixelScale = Math.min(maxSize / Math.max(artwork.width, artwork.height), Math.sqrt(MAX_CHARACTER_PREVIEW_PIXELS / (artwork.width * artwork.height)))
    output.width = Math.max(1, Math.ceil(artwork.width * pixelScale))
    output.height = Math.max(1, Math.ceil(artwork.height * pixelScale))
    const outputContext = output.getContext('2d')
    if (!outputContext) return { canvas: null, aboveHairCanvas: null }
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
      const set = renderDetails[`${group.modelSlot}:${group.setId}`]
      if (!set || group.modelSlot !== modelSlot || group.hidden) return []
      const accepted = clothingCategories[clothingCategories.Inferior.some((item) => item.id === group.category) ? 'Inferior' : 'Superior']
        .find((category) => category.id === group.category)?.source
      if (!accepted) return []
      const components = wardrobeComponentsForGroup(group, renderDetails)
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
        throw new Error(`A roupa “${set.name}” não pôde ser encaixada neste modelo/pose: ${errors.map((issue) => `${issue.code} (parte: ${issue.boneId ?? 'não identificada'})`).join(', ')}. Confira a peça vinculada em Roupas DEV.`)
      }
      const mapped: Array<{ component: WardrobeSet['components'][number]; transform: ReturnType<typeof mapWardrobeComponentToPose>; center: { x: number; y: number }; sequence: number }> = []
      for (const component of components) {
        const sourceBone = source.parts.find((part) => part.id === component.attachedPartId)
        const targetBone = artwork.parts.find((part) => part.id === component.attachedPartId)
        if (!sourceBone || !targetBone) continue
        const { kneeOverlap, edgePadding } = wardrobePosePadding(component, equippedComponents.get(`${group.modelSlot}:${group.setId}`) ?? [])
        // Fitting pieces can be loose while retaining their bone and source
        // geometry; only an explicit release hides them from the posed character.
        if (component.glue?.mode === 'loose' && component.glue.explicitRelease) continue
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
          const image = isModelBodyPartName(part.name) && (skinTone || source.modelOutlineColor)
            ? await loadModelBodyTintedImage(part.dataUrl, skinTone, source.modelOutlineColor, part.fakeSkinContours)
            : skinTone ? await loadSkinTintedImage(part.dataUrl, skinTone) : await loadCachedImage(part.dataUrl)
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
          const image = garment.group.colors ? await loadCharacterTintedImage(garment.component.dataUrl, garment.group.colors) : await loadCachedImage(garment.component.dataUrl)
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
            aboveHairCanvas = createCharacterCanvas()
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
    // Reutiliza os buffers renderizados em memória. Serializar cada
    // changing wardrobe pose to PNG and decoding it back blocks both preview
    // and export; callers needing a PNG still have the legacy wrapper below.
    return { canvas: output, aboveHairCanvas: hasAboveHairAccessories ? aboveHairCanvas : null }
  }

  /**
   * Historical PNG API for Customizador/Fabricador and other consumers.
   * Mantém o contrato público ao compor Canvas nativo.
   */
  async function renderWardrobeOverlay(
    groups: CustomizerWardrobeGroup[],
    details: Record<string, WardrobeSet>,
    artwork: CatalogArtwork,
    modelSlot: number | null,
    source: FabricatorProject | null,
    skinTone?: string,
    maxSize = Math.max(artwork.width, artwork.height),
    highlight?: AdjustmentPreviewHighlight | null
  ): Promise<{ imageUrl: string | null; aboveHairImageUrl: string | null }> {
    const rendered = await renderWardrobeOverlayCanvases(
      groups, details, artwork, modelSlot, source, skinTone, maxSize, highlight)
    return {
      imageUrl: rendered.canvas?.toDataURL('image/png') ?? null,
      aboveHairImageUrl: rendered.aboveHairCanvas?.toDataURL('image/png') ?? null,
    }
  }


  return { clothingCategories, wardrobeComponentsForGroup, renderWardrobeOverlayCanvases, renderWardrobeOverlay }
}
