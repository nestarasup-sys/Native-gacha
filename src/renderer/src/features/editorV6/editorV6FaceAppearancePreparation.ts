import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { EditorV6Element, EditorV6FaceRenderMode, EditorV6FaceTransforms } from '../../../../shared/editorV6'
import type { bakeFaceModeAssets, measureFaceModeCrop, PreparedEditorV6FaceRenderer } from './faceModeAssets'
import type { TrimmedImage } from '../../characters/transparentImageTrim'
import type { createEditorV6InteractiveFaceBakes } from './editorV6InteractiveFaceBakes'

type BakedFace = Awaited<ReturnType<typeof bakeFaceModeAssets>>
type FaceRender = Awaited<ReturnType<PreparedEditorV6FaceRenderer['renderToCanvas']>>

export type EditorV6FaceAppearanceExpressionState = Pick<EditorV6Element,
  'expressionBase' | 'activeExpressionGaze' | 'activeExpressionPresetId' | 'activeExpressionPresetUpdatedAt'
  | 'activeExpressionCollectionId' | 'activeExpressionEffects' | 'activeFaceMode'
>

type FaceAppearancePreparationDependencies = {
  faceModeForElement: (element: EditorV6Element, appearance?: CustomizerFaceAppearance) => EditorV6FaceRenderMode
  measureCrop: typeof measureFaceModeCrop
  bakeAssets: typeof bakeFaceModeAssets
  interactiveBakes: ReturnType<typeof createEditorV6InteractiveFaceBakes>
}

export type PreparedEditorV6FaceAppearance = {
  baseMode: EditorV6FaceRenderMode
  rendered: Pick<FaceRender, 'width' | 'height'>
  baked: BakedFace
  previousCrop: Pick<TrimmedImage, 'left' | 'top' | 'width' | 'height'> | null
}

/** Prepares the before/after face images while leaving cache and project writes to their owners. */
export async function prepareEditorV6FaceAppearance(
  input: {
    character: CustomizerCharacter
    element: EditorV6Element
    appearance: CustomizerFaceAppearance
    faceTransforms: EditorV6FaceTransforms
    expressionState?: EditorV6FaceAppearanceExpressionState
  },
  renderer: PreparedEditorV6FaceRenderer,
  dependencies: FaceAppearancePreparationDependencies
): Promise<PreparedEditorV6FaceAppearance> {
  const { character, element, appearance, faceTransforms, expressionState } = input
  const activeEffects = expressionState && Object.hasOwn(expressionState, 'activeExpressionEffects')
    ? expressionState.activeExpressionEffects
    : element.activeExpressionEffects
  const faceMode = expressionState && Object.hasOwn(expressionState, 'activeFaceMode')
    ? expressionState.activeFaceMode
    : element.activeFaceMode
  const baseMode = faceMode ?? dependencies.faceModeForElement(element, appearance)

  const previousAppearance = element.faceAppearance ?? character.customization.faceAppearance
  let previousCrop: PreparedEditorV6FaceAppearance['previousCrop'] | undefined = element.activeFaceMode && dependencies.interactiveBakes.previousCrop(
    renderer, element.text, previousAppearance, element.faceTransforms, element.activeExpressionEffects, element.activeFaceMode
  )
  // Saved snapshots use the union of all face modes, not the active frame alone.
  if (previousCrop === undefined) {
    const previousRendered = await renderer.renderToCanvas(previousAppearance, element.faceTransforms, element.activeExpressionEffects, element.activeFaceMode)
    previousCrop = await dependencies.measureCrop(
      element.text, renderer, previousAppearance, element.faceTransforms, element.activeExpressionEffects,
      element.activeFaceMode ?? dependencies.faceModeForElement(element, previousAppearance),
      previousRendered
    )
  }
  const prepared = await dependencies.interactiveBakes.bake(renderer, element.text, appearance, faceTransforms, activeEffects, baseMode, dependencies.bakeAssets)
  return { baseMode, ...prepared, previousCrop }
}
