import { fitCharacterToStage, type CharacterArtworkCrop, type CharacterArtworkSize } from './characterStageGeometry.ts'

export type { CharacterArtworkCrop, CharacterArtworkSize } from './characterStageGeometry.ts'

export function fitEditorV6CharacterToStage(
  referenceRendered: CharacterArtworkSize,
  referenceCrop: CharacterArtworkCrop,
  rendered: CharacterArtworkSize,
  crop: CharacterArtworkCrop,
  stageWidth: number,
  stageHeight: number
) {
  return fitCharacterToStage(referenceRendered, referenceCrop, rendered, crop, stageWidth, stageHeight)
}
