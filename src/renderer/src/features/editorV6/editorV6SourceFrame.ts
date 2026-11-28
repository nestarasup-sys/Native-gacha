import type { EditorV6Element } from '../../../../shared/editorV6'
import type { TrimmedImage } from '../../characters/transparentImageTrim'
import { EDITOR_V6_SOURCE_FRAME_VERSION } from '../../../../shared/editorV6CharacterFaceGeometry'

export { EDITOR_V6_SOURCE_FRAME_VERSION }
type Crop = Pick<TrimmedImage, 'left' | 'top' | 'width' | 'height'>

/** Convert a legacy alpha-cropped snapshot to the source canvas once.
 * Derive both axes from its actual saved rectangle, including user geometry.
 */
export function editorV6SourceFrameGeometry(state: EditorV6Element, rendered: { width: number; height: number }, previousCrop: Crop | null) {
  if ((state.faceRendererVersion ?? 0) >= EDITOR_V6_SOURCE_FRAME_VERSION || !previousCrop) return {}
  const width = state.width * rendered.width / previousCrop.width
  const height = state.height * rendered.height / previousCrop.height
  const dx = (rendered.width / 2 - previousCrop.left - previousCrop.width / 2) * state.width / previousCrop.width
  const dy = (rendered.height / 2 - previousCrop.top - previousCrop.height / 2) * state.height / previousCrop.height
  const overall = (state.characterScale ?? 100) / 100
  const pixelX = dx * 19.2 * overall * (state.characterWidthScale ?? 100) / 100 * (state.flipX ? -1 : 1)
  const pixelY = dy * 10.8 * overall * (state.characterHeightScale ?? 100) / 100
  const angle = state.rotation * Math.PI / 180
  return {
    width, height, characterCanvasWidth: width,
    x: state.x + (pixelX * Math.cos(angle) - pixelY * Math.sin(angle)) / 19.2,
    y: state.y + (pixelX * Math.sin(angle) + pixelY * Math.cos(angle)) / 10.8
  }
}
