import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { EditorV6Element, EditorV6FaceRenderMode } from '../../../../shared/editorV6'
import type { bakeFaceModeAssets, PreparedEditorV6FaceRenderer } from './faceModeAssets'
import type { TrimmedImage } from '../../characters/transparentImageTrim'

type PoseRender = Awaited<ReturnType<PreparedEditorV6FaceRenderer['renderToCanvas']>>
type BakedPose = Awaited<ReturnType<typeof bakeFaceModeAssets>>

type PosePreparationDependencies = {
  prepareRenderer: (character: CustomizerCharacter) => Promise<PreparedEditorV6FaceRenderer>
  bakeAssets: typeof bakeFaceModeAssets
  trimCanvas: (canvas: HTMLCanvasElement) => TrimmedImage | null
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
): Promise<PreparedEditorV6PoseChange> {
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
    const currentRenderer = await dependencies.prepareRenderer(currentPoseCharacter)
    let currentRendered: PoseRender
    try {
      currentRendered = await currentRenderer.renderToCanvas(
        appearance,
        element.faceTransforms,
        element.activeExpressionEffects,
        element.activeFaceMode
      )
    } finally {
      currentRenderer.dispose()
    }
    const currentCrop = dependencies.trimCanvas(currentRendered.canvas)
    characterCanvasWidth = element.width * currentRendered.width / (currentCrop?.width ?? currentRendered.width)
  }

  const poseCharacter: CustomizerCharacter = {
    ...character,
    customization: { ...character.customization, poseSlot, faceAppearance: appearance }
  }
  const baseMode = dependencies.faceModeForElement(element, poseCharacter.customization.faceAppearance)
  const poseRenderer = await dependencies.prepareRenderer(poseCharacter)
  let rendered: PoseRender
  let baked: BakedPose
  try {
    rendered = await poseRenderer.renderToCanvas(
      poseCharacter.customization.faceAppearance,
      element.faceTransforms,
      element.activeExpressionEffects,
      baseMode
    )
    baked = await dependencies.bakeAssets(
      element.text,
      poseRenderer,
      poseCharacter.customization.faceAppearance,
      element.faceTransforms,
      element.activeExpressionEffects,
      baseMode,
      rendered
    )
  } finally {
    poseRenderer.dispose()
  }

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
