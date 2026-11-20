import type { CustomizerCharacter } from '../../../../shared/customizer'
import { canvasFaceAlphaBounds } from './faceModeAssets'

/** A model-level neutral reference prevents hair, clothing and pose crops from changing actor scale. */
export async function editorV6CharacterStageReference(character: CustomizerCharacter, source?: Parameters<typeof import('../../characters/editorV6CharacterRenderer').prepareSavedCharacterRenderer>[1]) {
  const { prepareSavedCharacterRenderer } = await import('../../characters/editorV6CharacterRenderer')
  const neutral: CustomizerCharacter = {
    ...character,
    customization: { modelSlot: character.customization.modelSlot, poseSlot: null, partOverrides: {}, layerOrder: [] }
  }
  const renderer = await prepareSavedCharacterRenderer(neutral, source)
  try {
    const { canvas, width, height } = await renderer.renderToCanvas(undefined, undefined, undefined, 'idle')
    const crop = canvasFaceAlphaBounds(canvas)
    return { rendered: { width, height }, crop: { width: crop?.width ?? width, height: crop?.height ?? height } }
  } finally { renderer.dispose() }
}
