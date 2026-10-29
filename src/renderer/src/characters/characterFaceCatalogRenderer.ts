import type { FaceCatalogItem, FaceComponentAsset, FaceDetailKind, FaceElementKind, FaceExpressionEffects, FaceSheetKind, FabricatorProject } from '../../../shared/fabricator'
import type { CharacterRenderAssetProvider } from '../../../shared/characterRenderAssets'
import type { CustomizerCharacter, CustomizerFaceAppearance, FaceComponentPartId, FacePalettePartId, HairColorOverrides } from '../../../shared/customizer'
import type { EditorV6FaceRenderMode, EditorV6FaceTransforms } from '../../../shared/editorV6'
import type { StudioFaceMode, StudioFaceTransforms } from '../../../shared/studio'
import { drawFaceExpressionEffects, type ExpressionEffectMouthPlacement } from './expressionEffectRender'
import { eyeInteriorMaskSource } from '../ui/image/eyeInteriorMask'
import { createCharacterCanvas } from './canvasSurface'
import { drawPreviewImageWithHalo } from './characterCanvasDrawing'
import { alignMouthTransformToClosedBase, faceElementOrder, transferEyeCloseAdjustment, type ClosedEyeAssetResolver } from './characterFaceCatalogSupport'
import type { CatalogArtwork } from './characterSourceResolver'
import type { HairTintOptions } from './characterImageTint'

type FaceCatalogTransforms = StudioFaceTransforms | EditorV6FaceTransforms
type FaceCatalogRenderMode = StudioFaceMode | EditorV6FaceRenderMode

type CharacterFaceCatalogImageLoaders = {
  loadCachedImage: (source: string | CanvasImageSource) => Promise<HTMLImageElement>
  loadHairTintedImage: (source: string, overrides: HairColorOverrides | undefined, options?: HairTintOptions) => Promise<HTMLImageElement>
  loadSkinTintedImage: (source: string, tone: string) => Promise<HTMLImageElement>
}

export function createCharacterFaceCatalogRenderer(loaders: CharacterFaceCatalogImageLoaders, isBlinkMode: (mode?: FaceCatalogRenderMode) => boolean) {
  const { loadCachedImage, loadHairTintedImage, loadSkinTintedImage } = loaders
  async function drawFaceCatalogOverlay(context: CanvasRenderingContext2D, artwork: CatalogArtwork, source: FabricatorProject, items: Partial<Record<FaceSheetKind | FaceElementKind, FaceCatalogItem>>, appearance: CustomizerFaceAppearance, skinTone?: string, studioFaceTransforms?: FaceCatalogTransforms, expressionEffects?: FaceExpressionEffects, studioFaceMode?: FaceCatalogRenderMode, resolveClosedEye?: ClosedEyeAssetResolver, headOverrides: CustomizerCharacter['customization']['partOverrides'] = {}, highlightedHeadId?: string | null, assetProvider: CharacterRenderAssetProvider = window.desktop.fabricator): Promise<void> {
    const sourceHead = source.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
    const targetHead = artwork.parts.find((part) => /cabe[çc]a|head/i.test(part.name))
    if (!sourceHead || !targetHead || sourceHead.width <= 0 || sourceHead.height <= 0) return
    // A Dev asset can be recalibrated without changing the character document.
    // Keep only a render-local cache so each face draw sees the current calibration.
    const componentLoads = new Map<string, Promise<FaceComponentAsset | null>>()
    const loadComponent = (id: string) => {
      let pending = componentLoads.get(id)
      if (!pending) { pending = assetProvider.loadFaceComponentAsset(appearance.modelSlot, id); componentLoads.set(id, pending) }
      return pending
    }
    await drawFaceExpressionEffects(context, artwork, targetHead, appearance, expressionEffects, 'underlay')
    let mouthBlushPlacement: ExpressionEffectMouthPlacement | undefined
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
        if (element === 'mouth') {
          mouthBlushPlacement = {
            x: localX,
            y: localY,
            rotation: transform.rotation + (studioTransform?.rotation ?? 0)
          }
        }
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
    const blinking = isBlinkMode(studioFaceMode)
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
      // Fabricador owns placement and scale; the character customization selects the asset.
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
    // Paint mouth blush after the mouth bitmap so its position and rotation stay visible.
    await drawFaceExpressionEffects(context, artwork, targetHead, appearance, expressionEffects, 'mouth', mouthBlushPlacement)
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
  return { drawFaceCatalogOverlay }
}
