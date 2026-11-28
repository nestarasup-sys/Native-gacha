import { useRef } from 'react'
import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../../../shared/customizer'
import type { EditorV6Document, EditorV6Element, EditorV6FaceTransform } from '../../../../shared/editorV6'
import { faceRenderGeometry } from '../../characters/characterGeometry'
import { bakeEditorV6FaceModeAssets, canvasFaceAlphaBounds, editorV6FaceModeForElement, measureFaceModeCrop } from './faceModeAssets'
import { prepareEditorV6FaceAppearance } from './editorV6FaceAppearancePreparation'
import { createEditorV6CharacterAppearanceCommands } from './editorV6CharacterAppearanceCommands'
import { prepareEditorV6PoseChange } from './editorV6PosePreparation'
import { createEditorV6FaceTransformCommands } from './editorV6FaceTransformCommands'
import { useEditorV6FacePreview } from './useEditorV6FacePreview'
import type { PoseRevisionSnapshot } from './editorV6CharacterSourceModel'
import { editorV6PoseRevisionKey } from './editorV6CharacterSourceRevisions'
import { createEditorV6InteractiveFaceBakes } from './editorV6InteractiveFaceBakes'
import { normalizeEditorV6IntroPoseFace } from './editorV6IntroInspectorTarget'
import { prepareEditorV6IntroPoseBatch } from './editorV6IntroPoseCommands'

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
  intro?: { characters: readonly CustomizerCharacter[]; commit: Options['changeScene'] }
}

/** Connects face preview rendering, appearance/pose preparation, and transform edits. */
export function useEditorV6CharacterAppearance(options: Options) {
  const facePreview = useEditorV6FacePreview({ ...options, sourceSnapshot: options.poseSourceSnapshot })
  const bakes = useRef<ReturnType<typeof createEditorV6InteractiveFaceBakes> | null>(null)
  const interactiveBakes = bakes.current ??= createEditorV6InteractiveFaceBakes()
  const preparePose = (input: Parameters<typeof prepareEditorV6PoseChange>[0]) => prepareEditorV6PoseChange(input, {
      withRenderer: (character, run) => {
        const modelSlot = character.customization.modelSlot ?? 1
        const poseSlot = character.customization.poseSlot
        const revisions = options.poseSourceSnapshot
        const poseRevision = typeof poseSlot === 'number'
          ? revisions?.revisions[editorV6PoseRevisionKey(modelSlot, poseSlot)] ?? (revisions ? 'missing' : undefined)
          : undefined
        return facePreview.withRenderer(character, poseRevision, revisions?.modelRevisions[modelSlot] ?? input.element.modelSourceRevision, run)
      },
      bakeAssets: bakeEditorV6FaceModeAssets,
      interactiveBakes,
      trimCanvas: canvasFaceAlphaBounds,
      faceModeForElement: editorV6FaceModeForElement,
      getStageSize: () => ({ width: 1920, height: 1080 }),
      faceRenderGeometry
  })
  const appearance = createEditorV6CharacterAppearanceCommands({
    activeProject: options.activeProject,
    selectedElement: options.selectedElement,
    selectedCharacter: options.selectedCharacter,
    faceBusy: options.faceBusy,
    setFaceBusy: options.setFaceBusy,
    facePreview,
    poseSourceSnapshot: options.poseSourceSnapshot,
    prepareFaceAppearance: (input, renderer) => prepareEditorV6FaceAppearance(input, renderer, {
      faceModeForElement: editorV6FaceModeForElement,
      measureCrop: measureFaceModeCrop,
      bakeAssets: bakeEditorV6FaceModeAssets,
      interactiveBakes
    }),
    preparePoseChange: preparePose,
    resolvePoseElement: options.intro ? normalizeEditorV6IntroPoseFace : undefined,
    changeScene: options.changeScene,
    patchDocument: options.patchDocument,
    setError: options.setError
  })
  const applyIntroPoseToAll = async () => {
    const { activeProject, selectedElement, selectedCharacter, intro } = options
    if (!activeProject || !selectedElement || !selectedCharacter || !intro || options.faceBusy) return
    options.setFaceBusy(true)
    try {
      const batch = await prepareEditorV6IntroPoseBatch(activeProject, selectedElement, selectedCharacter, intro.characters, preparePose)
      intro.commit(batch.apply)
      options.setError(batch.skipped.length ? 'Pose equivalente indisponível para: ' + batch.skipped.join(', ') : null)
    } catch (reason) {
      options.setError(reason instanceof Error ? reason.message : String(reason))
    } finally { options.setFaceBusy(false) }
  }
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
    applyIntroPoseToAll,
    updateFaceTransform: transforms.update,
    finishFaceTransform: transforms.finish
  }
}
