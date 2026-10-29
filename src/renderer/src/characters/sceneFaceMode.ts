import type { CustomizerFaceAppearance } from '../../../shared/customizer'
import type { SceneFaceMode } from '../../../shared/sceneFaceValidation'

export type SceneFaceModeElement = { activeFaceMode?: SceneFaceMode }

/** Resolve the scene-local playback mode, falling back to the selected face appearance. */
export function sceneFaceModeForElement(element: SceneFaceModeElement | null, appearance: CustomizerFaceAppearance | undefined): SceneFaceMode {
  if (element?.activeFaceMode) return element.activeFaceMode
  if (appearance?.eyeState === 2) return 'blink'
  if (appearance?.mouthOpen) return 'talk'
  return 'idle'
}
