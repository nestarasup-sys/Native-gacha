import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { EditorV6Element, EditorV6FaceRenderMode } from '../../../../shared/editorV6'
import type { bakeFaceModeAssets, PreparedEditorV6FaceRenderer } from './faceModeAssets'
import type { TrimmedImage } from '../../characters/transparentImageTrim'
import type { createEditorV6InteractiveFaceBakes } from './editorV6InteractiveFaceBakes'

type PoseRender = Awaited<ReturnType<PreparedEditorV6FaceRenderer['renderToCanvas']>>
type BakedPose = Awaited<ReturnType<typeof bakeFaceModeAssets>>

type PosePreparationDependencies = {
  withRenderer: <T>(character: CustomizerCharacter, run: (renderer: PreparedEditorV6FaceRenderer) => Promise<T>) => Promise<T | null>
  bakeAssets: typeof bakeFaceModeAssets
  interactiveBakes: ReturnType<typeof createEditorV6InteractiveFaceBakes>
  trimCanvas: (canvas: HTMLCanvasElement) => Pick<TrimmedImage, 'width' | 'height' | 'left' | 'top'> | null
  faceModeForElement: (element: EditorV6Element, appearance?: CustomizerFaceAppearance) => EditorV6FaceRenderMode
  getStageSize: () => { width: number; height: number }
  faceRenderGeometry: (
    element: EditorV6Element,
    rendered: Pick<PoseRender, 'width' | 'height'>,
    crop: Pick<TrimmedImage, 'width' | 'height' | 'left' | 'top'> | null,
    stageWidth: number,
    stageHeight: number
  ) => Pick<EditorV6Element, 'characterCanvasWidth' | 'width' | 'height'>
}

export type PreparedEditorV6PoseChange = {
  baseMode: EditorV6FaceRenderMode
  baked: BakedPose
  geometry: Pick<EditorV6Element, 'characterCanvasWidth' | 'width' | 'height'>
}

/** Renders a new pose and derives its saved geometry without mutating the project. */
export async function prepareEditorV6PoseChange(
  input: {
    character: CustomizerCharacter
    element: EditorV6Element
    poseSlot: number | null
  },
  dependencies: PosePreparationDependencies
): Promise<PreparedEditorV6PoseChange | null> {
  const { character, element, poseSlot } = input
  const appearance = element.faceAppearance ?? character.customization.faceAppearance
  let characterCanvasWidth = element.characterCanvasWidth

  if (!characterCanvasWidth) {
    const currentPoseCharacter: CustomizerCharacter = {
      ...character,
      customization: {
        ...character.customization,
        poseSlot: element.poseSlot === undefined ? character.customization.poseSlot : element.poseSlot,
        faceAppearance: appearance
      }
    }
    characterCanvasWidth = await dependencies.withRenderer(currentPoseCharacter, async (renderer) => {
      const currentRendered = await renderer.renderToCanvas(
        appearance,
        element.faceTransforms,
        element.activeExpressionEffects,
        element.activeFaceMode
      )
      const currentCrop = dependencies.trimCanvas(currentRendered.canvas)
      return element.width * currentRendered.width / (currentCrop?.width ?? currentRendered.width)
    }) ?? undefined
    if (characterCanvasWidth === undefined) return null
  }

  const poseCharacter: CustomizerCharacter = {
    ...character,
    customization: { ...character.customization, poseSlot, faceAppearance: appearance }
  }
  const baseMode = dependencies.faceModeForElement(element, poseCharacter.customization.faceAppearance)
  const prepared = await dependencies.withRenderer(poseCharacter, (renderer) => dependencies.interactiveBakes.bake(
    renderer, element.text, appearance, element.faceTransforms, element.activeExpressionEffects, baseMode, dependencies.bakeAssets
  ))
  if (!prepared) return null
  const { rendered, baked } = prepared

  const stageSize = dependencies.getStageSize()
  const geometry = dependencies.faceRenderGeometry(
    { ...element, characterCanvasWidth },
    rendered,
    baked.crop,
    stageSize.width,
    stageSize.height
  )
  return { baseMode, baked, geometry }
}
