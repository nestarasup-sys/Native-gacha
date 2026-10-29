import type { CustomizerFaceAppearance } from '../../../../shared/customizer'

export type CustomizerMouthBlushPatch = Partial<Pick<CustomizerFaceAppearance, 'mouthBlushEnabled' | 'mouthBlushColor' | 'mouthBlushOpacity'>>

/** Carries appearance settings only when the face still belongs to the selected source model. */
export function customizerFaceAppearanceForModel(
  previous: CustomizerFaceAppearance | undefined,
  modelSlot: number
): CustomizerFaceAppearance {
  if (previous?.modelSlot === modelSlot) return { ...previous }
  return {
    modelSlot,
    eyeState: 0,
    eyebrows: true,
    noseIndex: 0,
    expressionIndex: 0,
    mouthOpen: false
  }
}

/** Changes mouth blush without carrying appearance settings across source models. */
export function customizerMouthBlushAppearance(
  previous: CustomizerFaceAppearance | undefined,
  modelSlot: number,
  patch: CustomizerMouthBlushPatch
): CustomizerFaceAppearance {
  const sameModel = previous?.modelSlot === modelSlot
  return {
    ...customizerFaceAppearanceForModel(previous, modelSlot),
    mouthBlushEnabled: sameModel ? previous?.mouthBlushEnabled : false,
    ...patch
  }
}
