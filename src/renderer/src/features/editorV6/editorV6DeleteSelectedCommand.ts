import type { EditorV6Document, EditorV6Element } from '../../../../shared/editorV6'
import type { editEditorV6BackgroundAtFrame } from '../../../../shared/editorV6TimelineSceneEdits'
import { removeEditorV6TimelineBlock } from '../../../../shared/editorV6TimelineEdits'

export type EditorV6DeleteSelectedCommandDependencies = {
  activeProject: EditorV6Document | null
  selectedElementId: string | null
  selectedTimelineVideoBlockId: string | null
  selectedTimelineCardBlockId?: string | null
  selectedTimelineIntroBlockId?: string
  getFrame: () => number
  editBackgroundAtFrame: typeof editEditorV6BackgroundAtFrame
  now: () => string
  changeScene: (transform: (project: EditorV6Document) => EditorV6Document) => void
  removeStageCharacter: (element: EditorV6Element) => void
  setSelectedElementId: (elementId: string | null) => void
  setSelectedTimelineBlockId: (blockId: string | null) => void
}

/** Routes deletion by the current Inspector selection while leaving asset ownership with the project. */
export function createEditorV6DeleteSelectedCommand(dependencies: EditorV6DeleteSelectedCommandDependencies) {
  return (): void => {
    const project = dependencies.activeProject
    if (!project) return
    const introBlockId = dependencies.selectedTimelineIntroBlockId
    if (introBlockId) {
      const track = project.timeline.tracks.find(item => item.kind === 'intro' && item.blocks.some(block => block.id === introBlockId))
      if (!track || track.locked) return
      dependencies.changeScene(current => ({
        ...current,
        updatedAt: dependencies.now(),
        timeline: removeEditorV6TimelineBlock(current.timeline, introBlockId)
      }))
      dependencies.setSelectedTimelineBlockId(null)
      return
    }

    if (dependencies.selectedElementId === 'background') {
      const frame = dependencies.getFrame()
      dependencies.changeScene((current) => ({
        ...dependencies.editBackgroundAtFrame(current, frame, { backgroundAssetId: null }),
        updatedAt: dependencies.now()
      }))
      dependencies.setSelectedElementId(null)
    } else if (dependencies.selectedTimelineVideoBlockId) {
      const blockId = dependencies.selectedTimelineVideoBlockId
      dependencies.changeScene((current) => ({
        ...current,
        timeline: removeEditorV6TimelineBlock(current.timeline, blockId),
        updatedAt: dependencies.now()
      }))
      dependencies.setSelectedTimelineBlockId(null)
    } else if (dependencies.selectedTimelineCardBlockId) {
      const blockId = dependencies.selectedTimelineCardBlockId
      dependencies.changeScene((current) => ({
        ...current,
        timeline: removeEditorV6TimelineBlock(current.timeline, blockId),
        updatedAt: dependencies.now()
      }))
      dependencies.setSelectedTimelineBlockId(null)
    } else if (dependencies.selectedElementId) {
      const selectedElement = project.elements.find((element) => element.id === dependencies.selectedElementId)
      if (selectedElement?.kind === 'character') {
        dependencies.removeStageCharacter(selectedElement)
      } else {
        const elementId = dependencies.selectedElementId
        dependencies.changeScene((current) => ({
          ...current,
          elements: current.elements.filter((element) => element.id !== elementId),
          updatedAt: dependencies.now()
        }))
      }
      dependencies.setSelectedElementId(null)
    }
  }
}
