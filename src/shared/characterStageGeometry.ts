export type CharacterArtworkSize = { width: number; height: number }
export type CharacterArtworkCrop = { width: number; height: number }

/**
 * Fits a character from neutral-pose bounds and sizes the active pose in the
 * same untrimmed artwork coordinate system. Pose crops can change the visible
 * rectangle without changing the actor's base scale.
 */
export function fitCharacterToStage(
  referenceRendered: CharacterArtworkSize,
  referenceCrop: CharacterArtworkCrop,
  rendered: CharacterArtworkSize,
  crop: CharacterArtworkCrop,
  stageWidth: number,
  stageHeight: number
) {
  const referenceWidth = Math.max(1, referenceRendered.width)
  const referenceCropWidth = Math.max(1, referenceCrop.width)
  const referenceCropHeight = Math.max(1, referenceCrop.height)
  const renderedWidth = Math.max(1, rendered.width)
  const cropWidth = Math.max(1, crop.width)
  const cropHeight = Math.max(1, crop.height)
  const safeStageWidth = Math.max(1, stageWidth)
  const safeStageHeight = Math.max(1, stageHeight)

  const widthAtLimit = 20
  const referenceHeightAtWidthLimit = widthAtLimit * safeStageWidth / safeStageHeight * referenceCropHeight / referenceCropWidth
  const fitScale = Math.min(1, 82 / Math.max(1, referenceHeightAtWidthLimit))
  const referenceVisibleWidth = widthAtLimit * fitScale
  const characterCanvasWidth = referenceVisibleWidth * referenceWidth / referenceCropWidth

  return {
    characterCanvasWidth,
    width: characterCanvasWidth * cropWidth / renderedWidth,
    height: characterCanvasWidth * safeStageWidth / safeStageHeight * cropHeight / renderedWidth
  }
}
