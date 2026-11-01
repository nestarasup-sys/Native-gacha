import type { ModelPart } from '../../../../../shared/fabricator'

/** Applies warped pixels while preserving the original torso frame. */
export function createMaleTorsoDeformationPatch(part: ModelPart, dataUrl: string): ModelPart {
  return { ...part, dataUrl, fakeSkinContours: undefined }
}
