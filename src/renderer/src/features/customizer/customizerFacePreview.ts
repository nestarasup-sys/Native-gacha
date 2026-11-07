import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { FaceCatalogItem, FaceElementKind, FaceExpressionEffects, FaceSheetKind, FabricatorProject } from '../../../../shared/fabricator'
import { drawFaceCatalogOverlay } from '../../characters/characterRenderer'
import type { CatalogArtwork } from '../../characters/characterRenderer'
import { configureCharacterSampling, MAX_CHARACTER_PREVIEW_PIXELS } from './renderResolution'

type Options = {
  artwork: CatalogArtwork
  source: FabricatorProject
  items: Partial<Record<FaceSheetKind | FaceElementKind, FaceCatalogItem>>
  appearance: CustomizerFaceAppearance
  skinTone?: string
  maxSize?: number
  expressionEffects?: FaceExpressionEffects
  headOverrides?: CustomizerCharacter['customization']['partOverrides']
  highlightedHeadId?: string | null
}

export type CustomizerFacePreviewImages = {
  faceUrl: string | null
  eyesAboveRearHairUrl: string | null
}

export async function renderCustomizerFacePreview({
  artwork, source, items, appearance, skinTone,
  maxSize = Math.max(artwork.width, artwork.height), expressionEffects,
  headOverrides = {}, highlightedHeadId
}: Options): Promise<CustomizerFacePreviewImages> {
  const canvas = document.createElement('canvas')
  const eyesAboveRearHairCanvas = appearance.eyesAboveRearHair ? document.createElement('canvas') : null
  const pixelScale = Math.min(maxSize / Math.max(artwork.width, artwork.height), Math.sqrt(MAX_CHARACTER_PREVIEW_PIXELS / (artwork.width * artwork.height)))
  canvas.width = Math.max(1, Math.ceil(artwork.width * pixelScale))
  canvas.height = Math.max(1, Math.ceil(artwork.height * pixelScale))
  if (eyesAboveRearHairCanvas) {
    eyesAboveRearHairCanvas.width = canvas.width
    eyesAboveRearHairCanvas.height = canvas.height
  }
  const context = canvas.getContext('2d')
  if (context) configureCharacterSampling(context)
  const eyesAboveRearHairContext = eyesAboveRearHairCanvas?.getContext('2d') ?? null
  if (eyesAboveRearHairContext) configureCharacterSampling(eyesAboveRearHairContext)
  if (!context || eyesAboveRearHairCanvas && !eyesAboveRearHairContext) return { faceUrl: null, eyesAboveRearHairUrl: null }
  context.scale(pixelScale, pixelScale)
  eyesAboveRearHairContext?.scale(pixelScale, pixelScale)
  await drawFaceCatalogOverlay(context, artwork, source, items, appearance, skinTone, undefined, expressionEffects, undefined, undefined, headOverrides, highlightedHeadId, undefined, undefined, eyesAboveRearHairContext ?? undefined)
  return {
    faceUrl: canvas.toDataURL('image/png'),
    eyesAboveRearHairUrl: eyesAboveRearHairCanvas?.toDataURL('image/png') ?? null
  }
}
