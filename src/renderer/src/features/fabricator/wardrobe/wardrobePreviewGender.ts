import type { ModelPart, WardrobePreviewGender } from '../../../../../shared/fabricator'
import { isTorsoPart } from '../../../../../shared/modelRig.ts'

/** Returns the alternate torso image only for the visual body preview. */
export function wardrobePreviewTorsoImage(
  part: Pick<ModelPart, 'name'>,
  maleTorso: Pick<ModelPart, 'dataUrl'> | undefined,
  gender: WardrobePreviewGender | undefined
): string | null {
  return gender === 'male' && maleTorso && isTorsoPart(part) ? maleTorso.dataUrl : null
}

/** Sets saved before the preview option existed continue to open as female. */
export function wardrobePreviewGenderOf(value: WardrobePreviewGender | undefined): WardrobePreviewGender {
  return value === 'male' ? 'male' : 'female'
}
