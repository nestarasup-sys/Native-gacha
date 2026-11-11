import type { EditorV6Document, EditorV6Element, EditorV6TimelineBlock } from '../../../../shared/editorV6'
import { editorV6ClipAtFrame } from '../../../../shared/editorV6TimelineCore'

type Dependencies = {
  project: EditorV6Document | null
  stageCharacters: readonly EditorV6Element[]
  allPositionsLocked: boolean
  currentFrame: () => number
  pausePlayback: () => void
  changeScene: (transform: (project: EditorV6Document) => EditorV6Document) => void
  now: () => string
  setCastSelection: (characterIds: string[]) => void
  setCastPickerOpen: (open: boolean) => void
  setSelectedElementId: (elementId: string | null) => void
  setSelectedTimelineBlockId: (blockId: string | null) => void
  setActiveTool: (tool: 'background' | 'objects' | null) => void
  setInspectorOpen: (open: boolean) => void
  setInspectorTab: (tab: 'editor' | 'custom') => void
  restoreCharacterInspectorView: () => void
}

/** Coordinates stage, timeline, and cast selection without owning their UI state. */
export function createEditorV6StageSelectionCommands(dependencies: Dependencies) {
  const openCastPicker = () => {
    dependencies.setCastSelection(dependencies.stageCharacters
      .map((element) => element.characterId)
      .filter((id): id is string => Boolean(id)))
    dependencies.setCastPickerOpen(true)
  }

  const toggleCharacterPositionLock = () => {
    if (!dependencies.project || dependencies.stageCharacters.length === 0) return
    const nextLocked = !dependencies.allPositionsLocked
    dependencies.changeScene((project) => ({
      ...project,
      elements: project.elements.map((element) => element.kind === 'character'
        ? { ...element, positionLocked: nextLocked }
        : element),
      updatedAt: dependencies.now()
    }))
  }

  const selectStageCharacter = (element: EditorV6Element) => {
    dependencies.pausePlayback()
    dependencies.setSelectedElementId(element.id)
    const block = dependencies.project
      ? editorV6ClipAtFrame(dependencies.project.timeline, element.id, dependencies.currentFrame())?.block
      : undefined
    dependencies.setSelectedTimelineBlockId(block?.id ?? null)
    dependencies.setActiveTool(null)
    dependencies.setInspectorOpen(true)
    dependencies.restoreCharacterInspectorView()
  }

  const selectTimelineBlock = (block: EditorV6TimelineBlock) => {
    dependencies.setSelectedTimelineBlockId(block.id)
    dependencies.setSelectedElementId(block.background ? 'background' : block.elementId ?? null)
    dependencies.setActiveTool(block.background ? 'background' : null)
    dependencies.setInspectorOpen(true)
    if (block.state?.kind === 'character') dependencies.restoreCharacterInspectorView()
    else dependencies.setInspectorTab('editor')
  }

  return { openCastPicker, toggleCharacterPositionLock, selectStageCharacter, selectTimelineBlock }
}
