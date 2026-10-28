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

export async function renderCustomizerFacePreview({
  artwork, source, items, appearance, skinTone,
  maxSize = Math.max(artwork.width, artwork.height), expressionEffects,
  headOverrides = {}, highlightedHeadId
}: Options): Promise<string | null> {
  const canvas = document.createElement('canvas')
  const pixelScale = Math.min(maxSize / Math.max(artwork.width, artwork.height), Math.sqrt(MAX_CHARACTER_PREVIEW_PIXELS / (artwork.width * artwork.height)))
  canvas.width = Math.max(1, Math.ceil(artwork.width * pixelScale))
  canvas.height = Math.max(1, Math.ceil(artwork.height * pixelScale))
  const context = canvas.getContext('2d')
  if (context) configureCharacterSampling(context)
  if (!context) return null
  context.scale(pixelScale, pixelScale)
  await drawFaceCatalogOverlay(context, artwork, source, items, appearance, skinTone, undefined, expressionEffects, undefined, undefined, headOverrides, highlightedHeadId)
  return canvas.toDataURL('image/png')
}
