import { applyCharacterBodyShape } from '../../../../shared/bodyShape'
import type { CharacterBodyDimensions, CharacterProportions } from '../../../../shared/customizer'
import { renderArtwork, withCharacterHeadSize } from '../../characters/characterRenderer'
import type { CatalogArtwork } from '../../characters/characterRenderer'
import { characterRenderSize } from './renderResolution'
import { preparePreviewImage } from './customizerPreviewImages'

type PreviewExtent = { width: number; height: number; density: number }

/** Render and decode a base character preview before callers replace the visible image. */
export async function renderCustomizerBasePreview(
  artwork: CatalogArtwork,
  options: {
    proportions: CharacterProportions
    bodyDimensions: CharacterBodyDimensions
    extent: PreviewExtent
    zoom: number
    skinTone?: string
  }
): Promise<string> {
  const shapedArtwork = applyCharacterBodyShape(withCharacterHeadSize(artwork, options.proportions), options.bodyDimensions)
  const imageUrl = await renderArtwork(
    shapedArtwork,
    characterRenderSize(artwork.width, artwork.height, options.extent.width, options.extent.height, options.zoom, options.extent.density),
    options.skinTone
  )
  if (!imageUrl) throw new Error('A prévia nova não pôde ser renderizada; mantendo a imagem anterior.')
  if (!await preparePreviewImage(imageUrl)) throw new Error('A prévia nova não pôde ser decodificada; mantendo a imagem anterior.')
  return imageUrl
}
