import type { CustomizerCharacter } from '../../../../shared/customizer'
import { trimTransparentImage } from '../../characters/transparentImageTrim'

/** A model-level neutral reference prevents hair, clothing and pose crops from changing actor scale. */
export async function editorV6CharacterStageReference(character: CustomizerCharacter) {
  const { renderSavedCharacter } = await import('../../characters/editorV6CharacterRenderer')
  const neutral: CustomizerCharacter = {
    ...character,
    customization: { modelSlot: character.customization.modelSlot, poseSlot: null, partOverrides: {}, layerOrder: [] }
  }
  const rendered = await renderSavedCharacter(neutral, undefined, undefined, 'idle')
  const crop = await trimTransparentImage(rendered.dataUrl)
  return { rendered: { width: rendered.width, height: rendered.height }, crop: { width: crop?.width ?? rendered.width, height: crop?.height ?? rendered.height } }
}
