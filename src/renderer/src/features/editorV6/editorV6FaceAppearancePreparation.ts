import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { EditorV6Element, EditorV6FaceRenderMode, EditorV6FaceTransforms } from '../../../../shared/editorV6'
import type { bakeFaceModeAssets, PreparedEditorV6FaceRenderer } from './faceModeAssets'
import type { TrimmedImage } from '../../characters/transparentImageTrim'

type BakedFace = Awaited<ReturnType<typeof bakeFaceModeAssets>>
type FaceRender = Awaited<ReturnType<PreparedEditorV6FaceRenderer['renderToCanvas']>>

export type EditorV6FaceAppearanceExpressionState = Pick<EditorV6Element,
  'expressionBase' | 'activeExpressionGaze' | 'activeExpressionPresetId' | 'activeExpressionPresetUpdatedAt'
  | 'activeExpressionCollectionId' | 'activeExpressionEffects' | 'activeFaceMode'
>

type FaceAppearancePreparationDependencies = {
  faceModeForElement: (element: EditorV6Element, appearance?: CustomizerFaceAppearance) => EditorV6FaceRenderMode
  trimCanvas: (canvas: HTMLCanvasElement) => TrimmedImage | null
  bakeAssets: typeof bakeFaceModeAssets
}

export type PreparedEditorV6FaceAppearance = {
  baseMode: EditorV6FaceRenderMode
  rendered: FaceRender
  baked: BakedFace
  previousCrop: TrimmedImage | null
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

  const previousRendered = await renderer.renderToCanvas(
    element.faceAppearance ?? character.customization.faceAppearance,
    element.faceTransforms,
    element.activeExpressionEffects,
    element.activeFaceMode
  )
  const previousCrop = dependencies.trimCanvas(previousRendered.canvas)
  const rendered = await renderer.renderToCanvas(appearance, faceTransforms, activeEffects, baseMode)
  const baked = await dependencies.bakeAssets(
    element.text,
    renderer,
    appearance,
    faceTransforms,
    activeEffects,
    baseMode,
    rendered
  )

  return { baseMode, rendered, baked, previousCrop }
}
