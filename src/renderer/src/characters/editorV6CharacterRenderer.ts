import type { FaceCatalogItem, FaceCatalogItemSummary, FaceElementKind, FaceExpressionEffects, FaceSheetKind, FabricatorProject } from '../../../shared/fabricator'
import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../../shared/customizer'
import { resolveEditorV6TalkMouthId, type EditorV6FaceRenderMode, type EditorV6FaceTransforms } from '../../../shared/editorV6'
import { isEditorV6BlinkRenderMode } from '../../../shared/editorV6FaceSchedule'
import { configureCharacterSampling } from './renderResolution'
import type { CharacterRenderAssetProvider } from '../../../shared/characterRenderAssets'
import { resolveSavedCharacterSource, characterShapeScale, type CatalogArtwork } from './characterSourceResolver'
import { getCharacterProportions } from '../../../shared/customizer'
import { isValidSkinTone } from '../../../shared/skinTones'
import { prepareGachaStaticLayers } from './gachaStaticLayers'
import { loadCachedImage } from './editorV6CharacterImageMemos'
import { createCharacterImageTint } from './characterImageTint'
import { createCharacterLayerRenderer } from './characterLayerRenderer'
import { createCharacterFaceCatalogRenderer } from './characterFaceCatalogRenderer'
import { loadPreparedCharacterMaterials } from './preparedCharacterMaterials'
import type { GachaReusableMaterialCache, GachaReusableMaterials } from './preparedCharacterMaterials'
import { createClosedEyeAssetResolver, isRightFaceAsset as resolveIsRightFaceAsset } from './characterFaceCatalogSupport'
import type { ClosedEyeAssetResolver } from './characterFaceCatalogSupport'
import { createCharacterCanvas } from './canvasSurface'
import { createCharacterWardrobeRenderer } from './characterWardrobeRenderer'
import { loadStandardExpressionEffects, type StandardExpressionEffects } from './standardExpressionEffects'
export { loadCachedImage } from './editorV6CharacterImageMemos'
export { withCharacterHeadSize, characterShapeScale } from './characterSourceResolver'
export type { CatalogArtwork } from './characterSourceResolver'
export type { GachaReusableMaterialCache, GachaReusableMaterials }

export { loadStandardExpressionEffects }
export type { StandardExpressionEffects }

export const isRightFaceAsset = resolveIsRightFaceAsset

export type { HairTintOptions } from './characterImageTint'

const characterImageTint = createCharacterImageTint(loadCachedImage)
export const loadHairTintedImage = characterImageTint.loadHairTintedImage
export const loadSkinTintedImage = characterImageTint.loadSkinTintedImage
export const loadModelBodyTintedImage = characterImageTint.loadModelBodyTintedImage

const characterFaceCatalogRenderer = createCharacterFaceCatalogRenderer(
  { loadCachedImage, loadHairTintedImage, loadSkinTintedImage },
  (mode) => isEditorV6BlinkRenderMode(mode)
)

export type { HairCatalogSide } from './characterLayerRenderer'

const characterLayerRenderer = createCharacterLayerRenderer({ loadCachedImage, loadHairTintedImage, loadSkinTintedImage, loadModelBodyTintedImage })
export const customizerHairParts = characterLayerRenderer.customizerHairParts
export const hairAppearanceStyleId = characterLayerRenderer.hairAppearanceStyleId
export const loadHairAppearanceLayers = characterLayerRenderer.loadHairAppearanceLayers
export const resolvedHairColors = characterLayerRenderer.resolvedHairColors
export const renderArtwork = characterLayerRenderer.renderArtwork
export const renderArtworkWithHair = characterLayerRenderer.renderArtworkWithHair
export const renderFrontHairOverlay = characterLayerRenderer.renderFrontHairOverlay
export const renderFaceOverlay = characterLayerRenderer.renderFaceOverlay
export type { AdjustmentPreviewHighlight, ClothingGroupCategory, SelectedWardrobeComponent } from './characterWardrobeRenderer'

const characterWardrobeRenderer = createCharacterWardrobeRenderer({ loadCachedImage, loadHairTintedImage, loadSkinTintedImage, loadModelBodyTintedImage })
export const clothingCategories = characterWardrobeRenderer.clothingCategories
export const wardrobeComponentsForGroup = characterWardrobeRenderer.wardrobeComponentsForGroup
export const renderWardrobeOverlayCanvases = characterWardrobeRenderer.renderWardrobeOverlayCanvases
export const renderWardrobeOverlay = characterWardrobeRenderer.renderWardrobeOverlay

export function drawFaceCatalogOverlay(context: CanvasRenderingContext2D, artwork: CatalogArtwork, source: FabricatorProject, items: Partial<Record<FaceSheetKind | FaceElementKind, FaceCatalogItem>>, appearance: CustomizerFaceAppearance, skinTone?: string, studioFaceTransforms?: EditorV6FaceTransforms, expressionEffects?: FaceExpressionEffects, studioFaceMode?: EditorV6FaceRenderMode, resolveClosedEye?: ClosedEyeAssetResolver, headOverrides: CustomizerCharacter['customization']['partOverrides'] = {}, highlightedHeadId?: string | null, assetProvider: CharacterRenderAssetProvider = window.desktop.fabricator): Promise<void> {
  return characterFaceCatalogRenderer.drawFaceCatalogOverlay(context, artwork, source, items, appearance, skinTone, studioFaceTransforms, expressionEffects, studioFaceMode, resolveClosedEye, headOverrides, highlightedHeadId, assetProvider)
}

/**
 * GPU-ready compositing pieces of a prepared Gacha pose. The lower and upper
 * layers are immutable until the pose itself changes, while face is a mutable
 * Canvas surface reused for each expression; consume before rendering again.
 */
export type PreparedGachaLayerFrame = Readonly<{
  behindFace: HTMLCanvasElement
  face: HTMLCanvasElement
  inFrontOfFace: HTMLCanvasElement | null
  width: number
  height: number
  outputWidth: number
  outputHeight: number
  shapeScaleX: number
  shapeScaleY: number
}>


export async function materialsForPreparedCharacter(
  character: CustomizerCharacter, slot: number, assetProvider: CharacterRenderAssetProvider,
  cache?: GachaReusableMaterialCache,
): Promise<GachaReusableMaterials> {
  return loadPreparedCharacterMaterials(character, slot, assetProvider, loadHairAppearanceLayers, cache)
}

export async function prepareSavedCharacterRenderer(character: CustomizerCharacter, renderSource?: { artwork: CatalogArtwork; source: FabricatorProject; assetProvider?: CharacterRenderAssetProvider; materialCache?: GachaReusableMaterialCache }): Promise<{ width: number; height: number; render: (appearance?: CustomizerFaceAppearance, studioFaceTransforms?: EditorV6FaceTransforms, expressionEffects?: FaceExpressionEffects, studioFaceMode?: EditorV6FaceRenderMode) => Promise<{ dataUrl: string; width: number; height: number }>; renderToCanvas: (appearance?: CustomizerFaceAppearance, studioFaceTransforms?: EditorV6FaceTransforms, expressionEffects?: FaceExpressionEffects, studioFaceMode?: EditorV6FaceRenderMode) => Promise<{ canvas: HTMLCanvasElement; width: number; height: number }>; renderLayersToCanvas: (appearance?: CustomizerFaceAppearance, studioFaceTransforms?: EditorV6FaceTransforms, expressionEffects?: FaceExpressionEffects, studioFaceMode?: EditorV6FaceRenderMode) => Promise<PreparedGachaLayerFrame> ; dispose: () => void }> {
  const { modelSlot, assetProvider, source, artwork } = await resolveSavedCharacterSource(character, renderSource)
  const proportions = getCharacterProportions(character.customization)
  const hairAppearance = character.customization.hairAppearance
  const skinTone = isValidSkinTone(character.customization.modelSkinTone) ? character.customization.modelSkinTone : source.modelSkinTone
  const outlineColor = isValidSkinTone(character.customization.modelOutlineColor) ? character.customization.modelOutlineColor : source.modelOutlineColor
  const appearanceSource = { ...source, modelOutlineColor: outlineColor }
  const materials = await materialsForPreparedCharacter(character, modelSlot, assetProvider, renderSource?.materialCache)
  const { backStyles, frontStyles } = materials
  const baseImage = createCharacterCanvas()
  baseImage.width = artwork.width
  baseImage.height = artwork.height
  const baseContext = baseImage.getContext('2d')
  if (!baseContext) throw new Error(`Não foi possível montar a prévia de ${character.name}.`)
  await renderArtworkWithHair(artwork, appearanceSource, backStyles, Math.max(artwork.width, artwork.height), skinTone, hairAppearance, baseContext, character.customization.partOverrides)

  const groups = (character.customization.wardrobeGroups ?? []).filter((group) => group.modelSlot === modelSlot)
  const wardrobe = await renderWardrobeOverlayCanvases(groups, materials.wardrobeDetails, artwork, modelSlot, appearanceSource, skinTone)

  const appearance = character.customization.faceAppearance
  const expressionEffectsByIndex = appearance?.modelSlot === modelSlot
    ? await loadStandardExpressionEffects(modelSlot, assetProvider).catch((): StandardExpressionEffects => ({}))
    : {}
  let faceItems: Partial<Record<FaceSheetKind | FaceElementKind, FaceCatalogItem>> = {}
  const faceItemPromises = new Map<string, Promise<FaceCatalogItem | null>>()
  let faceCatalogSummariesPromise: Promise<FaceCatalogItemSummary[]> | null = null
  const resolveClosedEye = createClosedEyeAssetResolver(modelSlot, assetProvider)
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
  const frontHairImage = frontStyles.length ? createCharacterCanvas() : null
  if (frontHairImage) {
    frontHairImage.width = artwork.width
    frontHairImage.height = artwork.height
    const frontContext = frontHairImage.getContext('2d')
    if (!frontContext) throw new Error('Não foi possível preparar o cabelo do personagem.')
    await renderFrontHairOverlay(artwork, source, frontStyles, Math.max(artwork.width, artwork.height), hairAppearance, frontContext, character.customization.partOverrides)
  }
  // Direct Canvas-to-Canvas composition avoids two expensive PNG encode/decode
  // cycles for every interpolated pose, preserving the *same pixel buffers*.
  const wardrobeImage = wardrobe.canvas
  const wardrobeAboveHairImage = wardrobe.aboveHairCanvas
  const legacyFaceImage = legacyFaceUrl ? await loadCachedImage(legacyFaceUrl) : null
  const canvas = createCharacterCanvas()
  canvas.width = Math.max(1, artwork.width)
  canvas.height = Math.max(1, artwork.height)
  const context = canvas.getContext('2d')
  if (context) configureCharacterSampling(context)
  if (!context) throw new Error('Não foi possível preparar a imagem do personagem.')
  // baseImage/frontHairImage are exclusively owned by this prepared rig.
  // Compose onto them in place: no duplicate full-size Canvas buffers.
  const rigLayers = prepareGachaStaticLayers(baseImage, wardrobeImage, frontHairImage, wardrobeAboveHairImage,
    { adoptSourceCanvases: true })
  const shapeScale = characterShapeScale(proportions)
  const outputWidth = Math.max(canvas.width, Math.ceil(canvas.width * shapeScale.x))
  const outputHeight = Math.max(canvas.height, Math.ceil(canvas.height * shapeScale.y))
  /**
   * Share the exact eye/mouth/pupil/blink/effect implementation between the
   * legacy all-in-one Canvas and the GPU-ready layered compositor.
   * Only the drawing target changes. No second face calibration pipeline.
   */
  const paintPreparedFace = async (
    targetContext: CanvasRenderingContext2D,
    currentAppearance: CustomizerFaceAppearance | undefined = appearance,
    studioFaceTransforms?: EditorV6FaceTransforms,
    expressionEffects?: FaceExpressionEffects,
    studioFaceMode?: EditorV6FaceRenderMode
  ): Promise<void> => {
    let faceAppearance = currentAppearance && studioFaceMode ? {
      ...currentAppearance,
      eyeState: isEditorV6BlinkRenderMode(studioFaceMode) ? 2 as const : currentAppearance.eyeState === 1 ? 1 as const : 0 as const,
      mouthOpen: studioFaceMode === 'talk' || studioFaceMode === 'talk-blink'
    } : currentAppearance
    if ((studioFaceMode === 'talk' || studioFaceMode === 'talk-blink') && faceAppearance && !faceAppearance.mouthOpenCatalogId) {
      faceCatalogSummariesPromise ??= assetProvider.listFaceCatalog(modelSlot)
      const catalog = await faceCatalogSummariesPromise
      const mouthOpenCatalogId = resolveEditorV6TalkMouthId(faceAppearance, catalog)
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
      if (isEditorV6BlinkRenderMode(studioFaceMode) && !hasCatalogFaceSelection && !legacyFaceImage) throw new Error('Blink precisa dos assets faciais separados do catálogo de rosto ou de Olhos Dev.')
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
      if ((studioFaceMode === 'talk' || studioFaceMode === 'talk-blink') && !activeItems['mouth-open']?.pieces.some((piece) => piece.sheet === 'mouth-open' && piece.index === faceAppearance.expressionIndex)) {
        throw new Error('Não encontrei uma boca aberta para esta variante. Selecione uma folha de bocas abertas em Rosto Dev.')
      }
      const mouthEffects = expressionEffects ?? expressionEffectsByIndex[faceAppearance.expressionIndex]
      if (!hasCatalogFaceSelection && legacyFaceImage && faceAppearance.setId === appearance?.setId) targetContext.drawImage(legacyFaceImage, 0, 0, canvas.width, canvas.height)
      if (hasCatalogFaceSelection || hasFaceOverlaySelection) await drawFaceCatalogOverlay(targetContext, artwork, source, activeItems, faceAppearance, skinTone, studioFaceTransforms, mouthEffects, studioFaceMode, resolveClosedEye, character.customization.partOverrides, undefined, assetProvider)
    } else if (legacyFaceImage) targetContext.drawImage(legacyFaceImage, 0, 0, canvas.width, canvas.height)
  }
  // The default Canvas/PNG preview never needs an extra facial buffer.
  // Create it lazily only when the experimental GPU layer path is selected.
  let faceLayer: HTMLCanvasElement | null = null
  let faceContext: CanvasRenderingContext2D | null = null
  const ensureFaceLayer = () => {
    if (!faceLayer) {
      const prepared = createCharacterCanvas()
      prepared.width = canvas.width
      prepared.height = canvas.height
      const context = prepared.getContext('2d')
      if (!context) throw new Error('Não foi possível preparar a camada dinâmica do rosto.')
      faceLayer = prepared
      faceContext = context
    }
    return { faceLayer, faceContext: faceContext! }
  }
  /**
   * Preview-only three-layer output. Caller must paint/snapshot the mutable
   * face layer before another call; behindFace and inFrontOfFace stay stable
   * for the lifetime of this prepared pose. Does not change the exact Canvas
   * render path or the serialized EditorV6Document.
   */
  const renderLayersToCanvas = async (
    currentAppearance: CustomizerFaceAppearance | undefined = appearance,
    studioFaceTransforms?: EditorV6FaceTransforms,
    expressionEffects?: FaceExpressionEffects,
    studioFaceMode?: EditorV6FaceRenderMode
  ) => {
    const { faceLayer, faceContext } = ensureFaceLayer()
    faceContext.clearRect(0, 0, faceLayer.width, faceLayer.height)
    await paintPreparedFace(faceContext, currentAppearance, studioFaceTransforms, expressionEffects, studioFaceMode)
    return {
      behindFace: rigLayers.behindFace,
      face: faceLayer,
      inFrontOfFace: rigLayers.inFrontOfFace,
      width: canvas.width, height: canvas.height,
      outputWidth, outputHeight,
      shapeScaleX: shapeScale.x, shapeScaleY: shapeScale.y,
    }
  }
  // A facial-only 60 FPS sequence should never allocate a fresh proportion
  // surface each frame. One prepared pose owns one reusable output buffer;
  // callers snapshot a frame before advancing the next one.
  let scaledOutput: HTMLCanvasElement | null = null
  let scaledContext: CanvasRenderingContext2D | null = null
  const renderToCanvas = async (currentAppearance: CustomizerFaceAppearance | undefined = appearance, studioFaceTransforms?: EditorV6FaceTransforms, expressionEffects?: FaceExpressionEffects, studioFaceMode?: EditorV6FaceRenderMode) => {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(rigLayers.behindFace, 0, 0, canvas.width, canvas.height)
    await paintPreparedFace(context, currentAppearance, studioFaceTransforms, expressionEffects, studioFaceMode)
    if (rigLayers.inFrontOfFace) context.drawImage(rigLayers.inFrontOfFace, 0, 0, canvas.width, canvas.height)
    if (shapeScale.x === 1 && shapeScale.y === 1) return { canvas, width: canvas.width, height: canvas.height }
    if (!scaledOutput) {
      scaledOutput = createCharacterCanvas()
      scaledOutput.width = outputWidth
      scaledOutput.height = outputHeight
      scaledContext = scaledOutput.getContext('2d')
      if (!scaledContext) throw new Error('Não foi possível aplicar as proporções do personagem.')
    }
    const outputContext = scaledContext!
    outputContext.save()
    outputContext.setTransform(1, 0, 0, 1, 0, 0)
    outputContext.clearRect(0, 0, outputWidth, outputHeight)
    outputContext.translate(outputWidth / 2, outputHeight / 2)
    outputContext.scale(shapeScale.x, shapeScale.y)
    outputContext.drawImage(canvas, -canvas.width / 2, -canvas.height / 2)
    outputContext.restore()
    return { canvas: scaledOutput, width: outputWidth, height: outputHeight }
  }
  const render = async (...args: Parameters<typeof renderToCanvas>) => {
    const value = await renderToCanvas(...args)
    return { dataUrl: value.canvas.toDataURL('image/png'), width: value.width, height: value.height }
  }
  const dispose = () => {
    for (const surface of new Set([baseImage, frontHairImage, wardrobeImage, wardrobeAboveHairImage, canvas, rigLayers.behindFace, rigLayers.inFrontOfFace, faceLayer, scaledOutput])) {
      if (surface) { surface.width = 1; surface.height = 1 }
    }
  }
  return { width: outputWidth, height: outputHeight, render, renderToCanvas, renderLayersToCanvas, dispose }
}

export async function renderSavedCharacter(character: CustomizerCharacter, studioFaceTransforms?: EditorV6FaceTransforms, expressionEffects?: FaceExpressionEffects, studioFaceMode?: EditorV6FaceRenderMode): Promise<{ dataUrl: string; width: number; height: number }> {
  const renderer = await prepareSavedCharacterRenderer(character)
  try { return await renderer.render(character.customization.faceAppearance, studioFaceTransforms, expressionEffects, studioFaceMode) }
  finally { renderer.dispose() }
}
