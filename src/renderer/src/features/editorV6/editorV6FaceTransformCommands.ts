import type { CustomizerCharacter, CustomizerFaceAppearance } from '../../../../shared/customizer'
import type {
  EditorV6Document,
  EditorV6Element,
  EditorV6FaceTransform,
  EditorV6FaceTransforms
} from '../../../../shared/editorV6'
import { editorV6ClipAtFrame, timelineClips } from '../../../../shared/editorV6TimelineCore'
import type { EditorV6FacePreviewJob } from './useEditorV6FacePreview'

type MutableRef<T> = { current: T }

type EditorV6FaceTransformCommandDependencies = {
  activeProject: EditorV6Document | null
  activeProjectId: string | null
  selectedElement: EditorV6Element | null
  selectedCharacter: CustomizerCharacter | null
  selectedFaceAppearance: CustomizerFaceAppearance | null | undefined
  selectedTimelineBlockId: string | null
  transformsRef: MutableRef<Record<string, EditorV6FaceTransforms>>
  defaultTransform: EditorV6FaceTransform
  updateElement: (elementId: string, values: Partial<EditorV6Element>, record?: boolean) => void
  getFrame: () => number
  schedulePreview: (job: EditorV6FacePreviewJob) => void
  flushPreview: () => void
}

/** Coordinates live face-transform edits with authored state and the debounced preview owner. */
export function createEditorV6FaceTransformCommands(dependencies: EditorV6FaceTransformCommandDependencies) {
  const update = (
    transformKey: string,
    patch: Partial<EditorV6FaceTransform>,
    record = false,
    baseTransform = dependencies.defaultTransform
  ) => {
    const element = dependencies.selectedElement
    if (!element || element.kind !== 'character') return

    const saved = dependencies.transformsRef.current[element.id] ?? element.faceTransforms ?? {}
    const transform = { ...(saved[transformKey] ?? baseTransform), ...patch }
    const nextTransforms = { ...saved, [transformKey]: transform }
    dependencies.transformsRef.current[element.id] = nextTransforms
    dependencies.updateElement(element.id, { faceTransforms: nextTransforms }, record)

    const project = dependencies.activeProject
    const character = dependencies.selectedCharacter
    const appearance = dependencies.selectedFaceAppearance
    const projectId = dependencies.activeProjectId
    if (!project || !character || !appearance || !element.assetId || !projectId) return

    const selectedClip = timelineClips(project.timeline).find(({ block }) =>
      block.id === dependencies.selectedTimelineBlockId && block.elementId === element.id
    ) ?? editorV6ClipAtFrame(project.timeline, element.id, dependencies.getFrame())
    const previewCharacter: CustomizerCharacter = {
      ...character,
      customization: {
        ...character.customization,
        poseSlot: element.poseSlot === undefined ? character.customization.poseSlot : element.poseSlot,
        faceAppearance: appearance
      }
    }
    dependencies.schedulePreview({
      projectId,
      elementId: element.id,
      assetId: element.assetId,
      blockId: selectedClip?.block.id ?? null,
      poseSlot: element.poseSlot,
      poseSourceRevision: element.poseSourceRevision,
      modelSourceRevision: element.modelSourceRevision,
      character: previewCharacter,
      transforms: nextTransforms,
      previousState: {
        faceAppearance: element.faceAppearance,
        faceTransforms: element.faceTransforms,
        activeExpressionEffects: element.activeExpressionEffects,
        activeFaceMode: element.activeFaceMode
      }
    })
  }

  const finish = (transformKey: string) => {
    const element = dependencies.selectedElement
    if (!element || element.kind !== 'character') return
    const transforms = dependencies.transformsRef.current[element.id] ?? element.faceTransforms ?? {}
    if (!transforms[transformKey]) return
    dependencies.flushPreview()
  }

  return { update, finish }
}
