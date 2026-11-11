import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { EditorV6Document, EditorV6Element, EditorV6FaceTransform } from '../../../../shared/editorV6'
import { faceRenderGeometry } from '../../characters/characterGeometry'
import { bakeFaceModeAssets, editorV6FaceModeForElement, trimTransparentCanvas } from './faceModeAssets'
import { prepareEditorV6FaceAppearance } from './editorV6FaceAppearancePreparation'
import { createEditorV6CharacterAppearanceCommands } from './editorV6CharacterAppearanceCommands'
import { prepareEditorV6PoseChange } from './editorV6PosePreparation'
import { createEditorV6FaceTransformCommands } from './editorV6FaceTransformCommands'
import { useEditorV6FacePreview } from './useEditorV6FacePreview'
import type { PoseRevisionSnapshot } from './editorV6CharacterSourceModel'

type FacePreviewOptions = Parameters<typeof useEditorV6FacePreview>[0]
type Options = FacePreviewOptions & {
  selectedElement: EditorV6Element | null
  selectedCharacter: CustomizerCharacter | null
  selectedFaceAppearance: CustomizerFaceAppearance | null | undefined
  faceBusy: boolean
  setFaceBusy: (busy: boolean) => void
  poseSourceSnapshot: PoseRevisionSnapshot | null
  changeScene: (update: (project: EditorV6Document) => EditorV6Document) => void
  patchDocument: (update: (project: EditorV6Document) => EditorV6Document) => void
  selectedTimelineBlockId: string | null
  defaultTransform: EditorV6FaceTransform
  updateElement: (elementId: string, values: Partial<EditorV6Element>, record?: boolean) => void
  getFrame: () => number
}

/** Connects face preview rendering, appearance/pose preparation, and transform edits. */
export function useEditorV6CharacterAppearance(options: Options) {
  const facePreview = useEditorV6FacePreview(options)
  const appearance = createEditorV6CharacterAppearanceCommands({
    activeProject: options.activeProject,
    selectedElement: options.selectedElement,
    selectedCharacter: options.selectedCharacter,
    faceBusy: options.faceBusy,
    setFaceBusy: options.setFaceBusy,
    facePreview,
    sceneRef: options.sceneRef,
    poseSourceSnapshot: options.poseSourceSnapshot,
    prepareFaceAppearance: (input, renderer) => prepareEditorV6FaceAppearance(input, renderer, {
      faceModeForElement: editorV6FaceModeForElement,
      trimCanvas: trimTransparentCanvas,
      bakeAssets: bakeFaceModeAssets
    }),
    preparePoseChange: async (input) => {
      const { prepareSavedCharacterRenderer } = await import('../../characters/editorV6CharacterRenderer')
      return prepareEditorV6PoseChange(input, {
        prepareRenderer: prepareSavedCharacterRenderer,
        bakeAssets: bakeFaceModeAssets,
        trimCanvas: trimTransparentCanvas,
        faceModeForElement: editorV6FaceModeForElement,
        getStageSize: () => ({ width: options.sceneRef.current?.clientWidth ?? 1000, height: options.sceneRef.current?.clientHeight ?? 562 }),
        faceRenderGeometry
      })
    },
    changeScene: options.changeScene,
    patchDocument: options.patchDocument,
    setError: options.setError
  })
  const transforms = createEditorV6FaceTransformCommands({
    activeProject: options.activeProject,
    activeProjectId: options.activeProjectId,
    selectedElement: options.selectedElement,
    selectedCharacter: options.selectedCharacter,
    selectedFaceAppearance: options.selectedFaceAppearance,
    selectedTimelineBlockId: options.selectedTimelineBlockId,
    transformsRef: options.transformsRef,
    defaultTransform: options.defaultTransform,
    updateElement: options.updateElement,
    getFrame: options.getFrame,
    schedulePreview: facePreview.schedulePreview,
    flushPreview: facePreview.flushPreview
  })

  return {
    facePreview,
    applyFaceAppearance: appearance.applyFaceAppearance,
    applyPose: appearance.applyPose,
    updateFaceTransform: transforms.update,
    finishFaceTransform: transforms.finish
  }
}
