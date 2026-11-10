import type { CustomizerCharacter } from '../../../../shared/customizer'
import type { EditorV6BackgroundState, EditorV6Document, EditorV6FaceMode, EditorV6SceneElement } from '../../../../shared/editorV6'
import { resolveEditorV6SceneAtFrame, type EditorV6ResolvedScene } from '../../../../shared/editorV6TimelineScene'
import { resolveEditorV6InspectorSelection } from './editorV6Selection'
import { sceneFaceModeForElement } from '../../characters/sceneFaceMode'

const EMPTY_BACKGROUND: EditorV6BackgroundState = {
  backgroundColor: '#d7b5cd', backgroundAssetId: null,
  backgroundX: 0, backgroundY: 0, backgroundWidth: 100, backgroundHeight: 100, backgroundRotation: 0
}

export type EditorV6SceneViewModel = {
  previewScene: EditorV6ResolvedScene | null
  previewBackground: EditorV6BackgroundState
  visibleTimelineElements: EditorV6SceneElement[]
  inspectorSelection: ReturnType<typeof resolveEditorV6InspectorSelection>
  selectedEditorV6Character: CustomizerCharacter | null
  selectedEditorV6CharacterModelSlot: number | null
  selectedEditorV6PoseSlot: number | null
  selectedEditorV6FaceAppearance: CustomizerCharacter['customization']['faceAppearance'] | EditorV6SceneElement['faceAppearance']
  selectedEditorV6FaceMode: EditorV6FaceMode
}

type Dependencies = {
  project: EditorV6Document | null
  availableCharacters: readonly CustomizerCharacter[]
  playheadFrame: number
  selectedTimelineBlockId: string | null
  selectedElementId: string | null
}

/** Resolves the preview scene and Inspector selection from one consistent frame snapshot. */
export function createEditorV6SceneViewModel({
  project, availableCharacters, playheadFrame, selectedTimelineBlockId, selectedElementId
}: Dependencies): EditorV6SceneViewModel {
  const previewScene = project ? resolveEditorV6SceneAtFrame(project, playheadFrame, { includeMotion: false }) : null
  const previewBackground = previewScene?.background ?? EMPTY_BACKGROUND
  const visibleTimelineElements = previewScene?.elements ?? []
  const inspectorSelection = resolveEditorV6InspectorSelection({
    project,
    visibleElements: visibleTimelineElements,
    backgroundAssetId: previewBackground.backgroundAssetId,
    selectedTimelineBlockId,
    selectedElementId,
    playheadFrame
  })
  const selectedElement = inspectorSelection.selectedElement
  const selectedEditorV6Character = selectedElement?.kind === 'character'
    ? availableCharacters.find((character) => character.id === selectedElement.characterId) ?? null
    : null
  const selectedEditorV6CharacterModelSlot = selectedEditorV6Character
    ? selectedEditorV6Character.customization.modelSlot ?? 1
    : null
  const selectedEditorV6PoseSlot = selectedElement?.kind === 'character'
    ? selectedElement.poseSlot === undefined ? selectedEditorV6Character?.customization.poseSlot ?? null : selectedElement.poseSlot
    : null
  const selectedEditorV6FaceAppearance = selectedElement?.kind === 'character'
    ? selectedElement.faceAppearance ?? selectedEditorV6Character?.customization.faceAppearance
    : undefined
  const selectedEditorV6FaceMode = selectedElement?.kind === 'character'
    ? sceneFaceModeForElement(selectedElement, selectedEditorV6FaceAppearance)
    : 'idle'

  return {
    previewScene,
    previewBackground,
    visibleTimelineElements,
    inspectorSelection,
    selectedEditorV6Character,
    selectedEditorV6CharacterModelSlot,
    selectedEditorV6PoseSlot,
    selectedEditorV6FaceAppearance,
    selectedEditorV6FaceMode
  }
}
