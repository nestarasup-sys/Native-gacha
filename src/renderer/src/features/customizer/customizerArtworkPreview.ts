import type { CharacterBodyDimensions, CharacterProportions, CustomizerCharacter } from '../../../../shared/customizer'
import type { FabricatorProject } from '../../../../shared/fabricator'
import { MODEL_SKIN_BASE_TONE, isValidSkinTone } from '../../../../shared/skinTones.ts'
import type { CatalogArtwork } from '../../characters/characterRenderer'
import type { CustomizerArtworkSource } from './customizerArtworkSource'

type PreviewExtent = { width: number; height: number; density: number }
type ModelAppearance = Pick<CustomizerCharacter['customization'], 'modelSkinTone' | 'modelOutlineColor'>
type BasePreviewOptions = {
  proportions: CharacterProportions
  bodyDimensions: CharacterBodyDimensions
  extent: PreviewExtent
  zoom: number
  skinTone?: string
  outlineColor?: string
}

export type CustomizerArtworkPreviewResult =
  | Exclude<CustomizerArtworkSource, { status: 'ready' }>
  | (Extract<CustomizerArtworkSource, { status: 'ready' }> & { previewUrl: string })

export type CustomizerArtworkPreviewProviders = {
  loadSource: (
    modelSlot: number,
    poseSlot: number | null,
    cachedModel?: FabricatorProject | null
  ) => Promise<CustomizerArtworkSource>
  sampleOriginalSkinTone: (project: FabricatorProject) => Promise<string | null>
  renderBasePreview: (artwork: CatalogArtwork, options: BasePreviewOptions) => Promise<string>
}

type ReadyArtworkSource = Extract<CustomizerArtworkSource, { status: 'ready' }>

/** Resolve a model/pose snapshot and render its preview with the character's appearance. */
export async function prepareCustomizerArtworkPreview(input: {
  modelSlot: number
  poseSlot: number | null
  cachedModel?: FabricatorProject | null
  appearance?: ModelAppearance
  proportions: CharacterProportions
  bodyDimensions: CharacterBodyDimensions
  extent: PreviewExtent
  zoom: number
  onSourceResolved?: (source: ReadyArtworkSource) => void
}, providers: CustomizerArtworkPreviewProviders): Promise<CustomizerArtworkPreviewResult> {
  const source = await providers.loadSource(input.modelSlot, input.poseSlot, input.cachedModel)
  if (source.status !== 'ready') return source
  input.onSourceResolved?.(source)

  const modelSkinTone = isValidSkinTone(source.sourceProject.modelSkinTone)
    ? source.sourceProject.modelSkinTone
    : await providers.sampleOriginalSkinTone(source.sourceProject)
  const previewUrl = await providers.renderBasePreview(source.artwork, {
    proportions: input.proportions,
    bodyDimensions: input.bodyDimensions,
    extent: input.extent,
    zoom: input.zoom,
    skinTone: input.appearance?.modelSkinTone
      ?? (modelSkinTone === MODEL_SKIN_BASE_TONE ? modelSkinTone : undefined),
    outlineColor: isValidSkinTone(input.appearance?.modelOutlineColor)
      ? input.appearance.modelOutlineColor
      : source.sourceProject.modelOutlineColor
  })
  return { ...source, previewUrl }
}
