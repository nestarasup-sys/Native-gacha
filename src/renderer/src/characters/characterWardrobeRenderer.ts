import type { FabricatorProject, ModelSkinContourStroke, WardrobeCategory, WardrobeSet } from '../../../shared/fabricator'
import type { CharacterColorOverrides, CustomizerWardrobeCategory, CustomizerWardrobeGroup } from '../../../shared/customizer'
import { projectForOriginalPreview } from '../../../shared/fabricatorModelViews'
import { mapWardrobeComponentToPose, wardrobePosePadding } from '../../../shared/wardrobePose'
import { wardrobeJointAssemblyOffset } from '../../../shared/wardrobeJointAssembly'
import { autoConnectParts, normalizeLayerOrder } from '../../../shared/modelRig'
import { bindLegacyTorsoGridWardrobeSet, validateWardrobeFlow } from '../../../shared/assetFlow'
import { wardrobeAdjustmentMatrix } from '../../../shared/wardrobeAdjustment'
import type { CatalogArtwork } from './characterSourceResolver'
import { configureCharacterSampling, MAX_CHARACTER_PREVIEW_PIXELS } from './renderResolution'
import { createCharacterCanvas } from './canvasSurface'
import { drawPreviewImageWithHalo } from './characterCanvasDrawing'
import { isModelBodyPart } from './skinTint'
import { drawWardrobeJointBridge } from './wardrobeJointBridge'
import { drawBodyJointBridgePair, findBodyJointBridgePairs } from './bodyJointBridge'
import type { BodyJointBridgePair } from './bodyJointBridge'
import { resolveShoeBehindShinPlacement } from './wardrobeShoeLayering'
import { findWardrobeBridgePairs } from './wardrobeBridgePairs'
import { loadAssetColorModeImage } from './assetColorMode'
import type { HairColorOverrides } from '../../../shared/customizer'

export type ClothingGroupCategory = CustomizerWardrobeCategory
export type SelectedWardrobeComponent = { modelSlot: number; setId: string; category: ClothingGroupCategory; componentId: string }
export type AdjustmentPreviewHighlight = { scope: 'head'; id: string } | { scope: 'clothing'; piece: SelectedWardrobeComponent }

export type CharacterWardrobeImageLoaders = {
  loadCachedImage: (source: string | CanvasImageSource) => Promise<HTMLImageElement>
  loadCharacterTintedImage: (source: string, overrides: CharacterColorOverrides | undefined) => Promise<HTMLImageElement>
  loadHairTintedImage: (source: string, overrides: HairColorOverrides | undefined) => Promise<HTMLImageElement>
  loadSkinTintedImage: (source: string, tone: string) => Promise<HTMLImageElement>
  loadModelBodyTintedImage: (source: string, skinTone?: string, outlineColor?: string, fakeContours?: ModelSkinContourStroke[]) => Promise<HTMLImageElement>
}

type MappedWardrobeGarment = {
  group: CustomizerWardrobeGroup
  component: WardrobeSet['components'][number]
  sourceBone: FabricatorProject['parts'][number]
  targetBone: FabricatorProject['parts'][number]
  transform: ReturnType<typeof mapWardrobeComponentToPose>
  center: { x: number; y: number }
  sequence: number
}

type MappedWardrobeJointBridge = {
  upper: MappedWardrobeGarment
  lower: MappedWardrobeGarment
  lowerSourceOffset: { x: number; y: number }
}

export function createCharacterWardrobeRenderer(loaders: CharacterWardrobeImageLoaders) {
  const { loadCachedImage, loadCharacterTintedImage, loadHairTintedImage, loadSkinTintedImage, loadModelBodyTintedImage } = loaders
  const colorLoaders = { fixedPalette: loadCharacterTintedImage, assetColors: loadHairTintedImage }
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
    highlight?: AdjustmentPreviewHighlight | null,
    shoesBehindShinClothing = false
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
    const originalModel = projectForOriginalPreview(source)
    const originalPartsById = new Map(originalModel?.parts.map((part) => [part.id, part]) ?? [])
    const garmentLayers = new Map<string, MappedWardrobeGarment[]>()
    const mappedGarments: MappedWardrobeGarment[] = []
    const imagePromises = new Map<string, Promise<HTMLImageElement>>()
    const loadGarmentImage = (garment: Pick<MappedWardrobeGarment, 'group' | 'component'>) => {
      const set = renderDetails[`${garment.group.modelSlot}:${garment.group.setId}`]
      const key = `${garment.component.id}:${garment.group.modelSlot}:${garment.group.setId}:${set?.colorMode ?? 'fixed-palette'}:${JSON.stringify(garment.group.colors ?? null)}`
      let image = imagePromises.get(key)
      if (!image) {
        image = garment.group.colors
          ? loadAssetColorModeImage(garment.component.dataUrl, garment.group.colors, set?.colorMode, 'fixed-palette', colorLoaders)
          : loadCachedImage(garment.component.dataUrl)
        imagePromises.set(key, image)
      }
      return image
    }
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
      const mapped: MappedWardrobeGarment[] = []
      for (const component of components) {
        const sourceBone = source.parts.find((part) => part.id === component.attachedPartId)
        const targetBone = artwork.parts.find((part) => part.id === component.attachedPartId)
        if (!sourceBone || !targetBone) continue
        const { kneeOverlap, edgePadding } = wardrobePosePadding(component, equippedComponents.get(`${group.modelSlot}:${group.setId}`) ?? [])
        // Fitting pieces can be loose while retaining their bone and source
        // geometry; only an explicit release hides them from the posed character.
        if (component.glue?.mode === 'loose' && component.glue.explicitRelease) continue
        const transform = mapWardrobeComponentToPose(component, sourceBone, targetBone, kneeOverlap, edgePadding)
        mapped.push({ group, component, sourceBone, targetBone, transform, center: transform.origin, sequence: sequence++ })
      }
      if (!mapped.length) continue
      // Each component owns its bone anchor. Averaging the centers of visible
      // siblings shifted scale/rotation pivots whenever another piece was hidden
      // or restored (thigh + calf, sleeves, accessories, etc.).
      for (const item of mapped) {
        const layer = garmentLayers.get(item.component.attachedPartId) ?? []
        layer.push(item)
        garmentLayers.set(item.component.attachedPartId, layer)
        mappedGarments.push(item)
      }
    }

    const modelJoints = source.joints?.length ? source.joints : autoConnectParts(source.parts)
    const modelPairs = findBodyJointBridgePairs({ parts: source.parts, joints: modelJoints })
    const pairedGarments = findWardrobeBridgePairs(mappedGarments, modelPairs)
    const bridgesAfterPart = new Map<string, MappedWardrobeJointBridge[]>()
    for (const pair of pairedGarments) {
      const { upper, lower } = pair
      if (!upper || !lower) continue
      const armPair = upper.component.category === 'manga-superior' && lower.component.category === 'manga-inferior'
      const legPair = upper.component.category === 'calca-coxa' && lower.component.category === 'calca-canela'
      if (!armPair && !legPair) continue
      const upperLayer = bodyOrder.indexOf(upper.component.attachedPartId)
      const lowerLayer = bodyOrder.indexOf(lower.component.attachedPartId)
      if (upperLayer < 0 || lowerLayer < 0) continue
      const renderAfterPart = bodyOrder[Math.max(upperLayer, lowerLayer)]
      const bridges = bridgesAfterPart.get(renderAfterPart) ?? []
      const sourceUpper = originalPartsById.get(upper.sourceBone.id) ?? upper.sourceBone
      const sourceLower = originalPartsById.get(lower.sourceBone.id) ?? lower.sourceBone
      bridges.push({ upper, lower,
        lowerSourceOffset: wardrobeJointAssemblyOffset(sourceUpper, sourceLower, upper.sourceBone, lower.sourceBone) })
      bridgesAfterPart.set(renderAfterPart, bridges)
    }

    const bodyJointBridges = findBodyJointBridgePairs(artwork)

    const shoeLayersAroundShinAfterPart = new Map<string, {
      shoesBehindShin: MappedWardrobeGarment[]
      shinGarments: MappedWardrobeGarment[]
      bridges: MappedWardrobeJointBridge[]
      shoesAboveShin: MappedWardrobeGarment[]
    }>()
    const deferredShoes = new Set<MappedWardrobeGarment>()
    const deferredShinGarments = new Set<MappedWardrobeGarment>()
    const deferredJointBridges = new Set<MappedWardrobeJointBridge>()
    for (const garment of mappedGarments) {
      if (garment.component.category !== 'sapato') continue
      const placement = resolveShoeBehindShinPlacement(
        garment.component, garment.targetBone, artwork.parts, bodyOrder)
      if (!placement.shinPartId) continue
      const layers = shoeLayersAroundShinAfterPart.get(placement.renderAfterPartId) ?? {
        shoesBehindShin: [], shinGarments: [], bridges: [], shoesAboveShin: []
      }
      const shoeLayers = shoesBehindShinClothing ? layers.shoesBehindShin : layers.shoesAboveShin
      shoeLayers.push(garment)
      deferredShoes.add(garment)
      for (const shinGarment of garmentLayers.get(placement.shinPartId) ?? []) {
        if (shinGarment.component.category !== 'calca-canela' || deferredShinGarments.has(shinGarment)) continue
        layers.shinGarments.push(shinGarment)
        deferredShinGarments.add(shinGarment)
      }
      for (const bridges of bridgesAfterPart.values()) {
        for (const bridge of bridges) {
          if (bridge.lower.component.category !== 'calca-canela'
            || bridge.lower.component.attachedPartId !== placement.shinPartId
            || deferredJointBridges.has(bridge)) continue
          layers.bridges.push(bridge)
          deferredJointBridges.add(bridge)
        }
      }
      shoeLayersAroundShinAfterPart.set(placement.renderAfterPartId, layers)
    }

    async function renderWardrobeGarment(garment: MappedWardrobeGarment) {
      try {
        const image = await loadGarmentImage(garment)
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
        const accessoryContext = aboveHairContext
        const targetContext: CanvasRenderingContext2D = renderAboveHair
          ? (accessoryContext ?? outputContext!)
          : outputContext!
        if (highlightMatchesClothing || highlightMatchesHeadExtra) drawGarment(targetContext, true)
        drawGarment(targetContext)
      } catch {
        throw new Error(`A imagem da peça ${garment.component.name} não pôde ser renderizada. Verifique o asset no Fabricador Dev sem alterar o personagem.`)
      }
    }

    async function renderWardrobeJointBridge(bridge: MappedWardrobeJointBridge) {
      try {
        const upperImage = await loadGarmentImage(bridge.upper)
        const lowerImage = await loadGarmentImage(bridge.lower)
        drawWardrobeJointBridge(outputContext!,
          { ...bridge.upper, image: upperImage },
          { ...bridge.lower, image: lowerImage, sourceOffset: bridge.lowerSourceOffset },
          pixelScale)
      } catch {
        const name = bridge.upper.component.name.replace(/ · (braço superior|coxa)$/i, '')
        throw new Error(`Não foi possível preparar a continuidade da roupa “${name}” na junta desta pose. Revise os dois segmentos em Roupas DEV.`)
      }
    }

    async function renderBodyJointBridge(pair: BodyJointBridgePair) {
      await drawBodyJointBridgePair(outputContext!, pair, async (part) =>
        isModelBodyPart(part) && (skinTone || source?.modelOutlineColor)
          ? loadModelBodyTintedImage(part.dataUrl, skinTone, source?.modelOutlineColor, part.fakeSkinContours)
          : skinTone ? loadSkinTintedImage(part.dataUrl, skinTone) : loadCachedImage(part.dataUrl), pixelScale, source ?? undefined)
    }

    // Draw the body repair surface before the source segments so its seam is
    // hidden by the restored skin/contour pixels wherever they overlap.
    for (const bridge of bodyJointBridges) {
      try { await renderBodyJointBridge(bridge) }
      catch { /* A damaged optional bridge must not suppress the wardrobe composite. */ }
    }

    for (const partId of bodyOrder) {
      const part = artwork.parts.find((item) => item.id === partId)
      if (!part) continue
      if (!hidden.has(part.id)) {
        try {
          // The wardrobe composite redraws the body to interleave garments with
          // model layers. Keep that duplicate body in sync with the tinted base
          // preview, otherwise the original skin pixels cover the selected tone.
          const image = isModelBodyPart(part) && (skinTone || source.modelOutlineColor)
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
        if (deferredShoes.has(garment) || deferredShinGarments.has(garment)) continue
        await renderWardrobeGarment(garment)
      }
      for (const bridge of bridgesAfterPart.get(part.id) ?? []) {
        if (!deferredJointBridges.has(bridge)) await renderWardrobeJointBridge(bridge)
      }
      const shoeLayers = shoeLayersAroundShinAfterPart.get(part.id)
      for (const shoe of shoeLayers?.shoesBehindShin ?? []) await renderWardrobeGarment(shoe)
      for (const shinGarment of shoeLayers?.shinGarments ?? []) await renderWardrobeGarment(shinGarment)
      for (const bridge of shoeLayers?.bridges ?? []) {
        await renderWardrobeJointBridge(bridge)
      }
      for (const shoe of shoeLayers?.shoesAboveShin ?? []) await renderWardrobeGarment(shoe)
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
    highlight?: AdjustmentPreviewHighlight | null,
    shoesBehindShinClothing = false
  ): Promise<{ imageUrl: string | null; aboveHairImageUrl: string | null }> {
    const rendered = await renderWardrobeOverlayCanvases(
      groups, details, artwork, modelSlot, source, skinTone, maxSize, highlight, shoesBehindShinClothing)
    return {
      imageUrl: rendered.canvas?.toDataURL('image/png') ?? null,
      aboveHairImageUrl: rendered.aboveHairCanvas?.toDataURL('image/png') ?? null,
    }
  }


  return { clothingCategories, wardrobeComponentsForGroup, renderWardrobeOverlayCanvases, renderWardrobeOverlay }
}
