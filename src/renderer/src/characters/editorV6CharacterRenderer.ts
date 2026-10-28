import type { FaceCatalogItem, FaceCatalogItemSummary, FaceComponentAsset, FaceDetailKind, FaceElementKind, FaceExpressionEffects, FaceSheetKind, FabricatorProject } from '../../../shared/fabricator'
import type { CustomizerCharacter, CustomizerFaceAppearance, CustomizerWardrobeGroup, FaceComponentPartId, FacePalettePartId, HairColorOverrides } from '../../../shared/customizer'
import { resolveEditorV6TalkMouthId, type EditorV6FaceRenderMode, type EditorV6FaceTransforms } from '../../../shared/editorV6'
import { isEditorV6BlinkRenderMode } from '../../../shared/editorV6FaceSchedule'
import { eyeInteriorMaskSource } from '../ui/image/eyeInteriorMask'
import { configureCharacterSampling } from './renderResolution'
import { drawFaceExpressionEffects } from './expressionEffectRender'
import type { CharacterRenderAssetProvider } from '../../../shared/characterRenderAssets'
import { resolveSavedCharacterSource, characterShapeScale, type CatalogArtwork } from './characterSourceResolver'
import { getCharacterProportions } from '../../../shared/customizer'
import { prepareGachaStaticLayers } from './gachaStaticLayers'
import { loadCachedImage } from './editorV6CharacterImageMemos'
import { createCharacterImageTint } from './characterImageTint'
import { createCharacterLayerRenderer } from './characterLayerRenderer'
import { loadPreparedCharacterMaterials } from './preparedCharacterMaterials'
import type { GachaReusableMaterialCache, GachaReusableMaterials } from './preparedCharacterMaterials'
import { alignMouthTransformToClosedBase, createClosedEyeAssetResolver, faceElementOrder, isRightFaceAsset as resolveIsRightFaceAsset, transferEyeCloseAdjustment, type ClosedEyeAssetResolver } from './characterFaceCatalogSupport'
import { createCharacterCanvas, isCharacterCanvasWorker } from './canvasSurface'
import { createCharacterWardrobeRenderer } from './characterWardrobeRenderer'
import { drawPreviewImageWithHalo } from './characterCanvasDrawing'
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

export type { HairCatalogSide } from './characterLayerRenderer'

const characterLayerRenderer = createCharacterLayerRenderer({ loadCachedImage, loadHairTintedImage, loadSkinTintedImage })
export const customizerHairParts = characterLayerRenderer.customizerHairParts
export const hairAppearanceStyleId = characterLayerRenderer.hairAppearanceStyleId
export const loadHairAppearanceLayers = characterLayerRenderer.loadHairAppearanceLayers
export const resolvedHairColors = characterLayerRenderer.resolvedHairColors
export const renderArtwork = characterLayerRenderer.renderArtwork
export const renderArtworkWithHair = characterLayerRenderer.renderArtworkWithHair
export const renderFrontHairOverlay = characterLayerRenderer.renderFrontHairOverlay
export const renderFaceOverlay = characterLayerRenderer.renderFaceOverlay
export type { AdjustmentPreviewHighlight, ClothingGroupCategory, SelectedWardrobeComponent } from './characterWardrobeRenderer'

const characterWardrobeRenderer = createCharacterWardrobeRenderer({ loadCachedImage, loadHairTintedImage, loadSkinTintedImage })
export const clothingCategories = characterWardrobeRenderer.clothingCategories
export const wardrobeComponentsForGroup = characterWardrobeRenderer.wardrobeComponentsForGroup
export const renderWardrobeOverlayCanvases = characterWardrobeRenderer.renderWardrobeOverlayCanvases
export const renderWardrobeOverlay = characterWardrobeRenderer.renderWardrobeOverlay

export async function drawFaceCatalogOverlay(context: CanvasRenderingContext2D, artwork: CatalogArtwork, source: FabricatorProject, items: Partial<Record<FaceSheetKind | FaceElementKind, FaceCatalogItem>>, appearance: CustomizerFaceAppearance, skinTone?: string, studioFaceTransforms?: EditorV6FaceTransforms, expressionEffects?: FaceExpressionEffects, studioFaceMode?: EditorV6FaceRenderMode, resolveClosedEye?: ClosedEyeAssetResolver, headOverrides: CustomizerCharacter['customization']['partOverrides'] = {}, highlightedHeadId?: string | null, assetProvider: CharacterRenderAssetProvider = window.desktop): Promise<void> {
  const sourceHead = source.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
  const targetHead = artwork.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
  if (!sourceHead || !targetHead || sourceHead.width <= 0 || sourceHead.height <= 0) return
  // A Dev asset can be recalibrated without changing the character document.
  // Keep only a render-local cache so each Customizer/Editor V6 draw sees the current calibration.
  const componentLoads = new Map<string, Promise<FaceComponentAsset | null>>()
  const loadComponent = (id: string) => {
    let pending = componentLoads.get(id)
    if (!pending) { pending = assetProvider.loadFaceComponentAsset(appearance.modelSlot, id); componentLoads.set(id, pending) }
    return pending
  }
  await drawFaceExpressionEffects(context, artwork, sourceHead, targetHead, appearance, items, expressionEffects, studioFaceTransforms)
  const categoryIds: Partial<Record<FaceSheetKind, string | undefined>> = {
    eyes: appearance.eyeCatalogId,
    eyebrows: appearance.eyebrowCatalogId,
    nose: appearance.noseCatalogId,
    'mouth-closed': appearance.mouthOpen ? undefined : appearance.mouthClosedCatalogId,
    'mouth-open': appearance.mouthOpen ? appearance.mouthOpenCatalogId : undefined
  }
  for (const element of faceElementOrder) {
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
  const componentIds: FaceComponentPartId[] = ['eye-left', 'eye-right', 'pupil-left', 'pupil-right', 'brow-left', 'brow-right']
  const loaded = new Map<FaceComponentPartId, FaceComponentAsset>()
  await Promise.all(componentIds.map(async (part) => {
    const id = appearance.components?.[part]?.assetId
    if (!id) return
    const asset = await loadComponent(id)
    if (asset) loaded.set(part, asset)
  }))

  const closedEyeAssets = new Map<FaceComponentPartId, FaceComponentAsset>()
  const blinking = isEditorV6BlinkRenderMode(studioFaceMode)
  if (blinking) {
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
    const category = part.startsWith('eye') ? 'eye' : part.startsWith('pupil') ? 'pupil' : 'eyebrow'
    const isRight = part.endsWith('right')
    if (blinking && category === 'pupil') continue
    const asset = category === 'eye' && blinking ? closedEyeAssets.get(part) ?? loaded.get(part) : loaded.get(part)
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
        if (!pupilClipCanvas) { pupilClipCanvas = createCharacterCanvas(); pupilClipCanvas.width = context.canvas.width; pupilClipCanvas.height = context.canvas.height }
        const clipped = pupilClipCanvas.getContext('2d')
        if (clipped) {
          clipped.clearRect(0, 0, pupilClipCanvas.width, pupilClipCanvas.height)
          clipped.save(); clipped.translate(x, y); clipped.rotate((targetHead.rotation + drawRotation) * Math.PI / 180)
          const pupilFlip = Boolean(transform.flipX) !== Boolean(pupilEyeClip.flipX)
          if (pupilFlip) clipped.scale(-1, 1)
          clipped.drawImage(image, -width / 2, -height / 2, width, height); clipped.restore()

          const eyeMask = await loadCachedImage(await eyeInteriorMaskSource(pupilEyeClip.asset.dataUrl))
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
  const detailOrder: FaceDetailKind[] = ['facial-shadow', 'blush', 'eye-highlight-left', 'eye-highlight-right']
  for (const kind of detailOrder) {
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
  const materials = await materialsForPreparedCharacter(character, modelSlot, assetProvider, renderSource?.materialCache)
  const { backStyles, frontStyles } = materials
  const baseImage = createCharacterCanvas()
  baseImage.width = artwork.width
  baseImage.height = artwork.height
  const baseContext = baseImage.getContext('2d')
  if (!baseContext) throw new Error(`Não foi possível montar a prévia de ${character.name}.`)
  await renderArtworkWithHair(artwork, source, backStyles, Math.max(artwork.width, artwork.height), character.customization.modelSkinTone, hairAppearance, baseContext, character.customization.partOverrides)

  const groups = (character.customization.wardrobeGroups ?? []).filter((group) => group.modelSlot === modelSlot)
  const wardrobe = await renderWardrobeOverlayCanvases(groups, materials.wardrobeDetails, artwork, modelSlot, source, character.customization.modelSkinTone)

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
      if (hasCatalogFaceSelection || hasFaceOverlaySelection) await drawFaceCatalogOverlay(targetContext, artwork, source, activeItems, faceAppearance, character.customization.modelSkinTone, studioFaceTransforms, mouthEffects, studioFaceMode, resolveClosedEye, character.customization.partOverrides, undefined, assetProvider)
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
