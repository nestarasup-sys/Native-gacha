import type { EditorV6Document, EditorV6Element, EditorV6TimelineTrack } from '../../../../shared/editorV6'
import { addEditorV6ElementAtFrame } from '../../../../shared/editorV6TimelineCore'

export type EditorV6TextElementKind = 'narrator' | 'speech' | 'thought'

type InspectorTab = 'editor' | 'custom'

export type EditorV6TextElementCommandDependencies = {
  activeProject: EditorV6Document | null
  selectedCharacterElement: EditorV6Element | null
  pausePlayback: () => void
  getFrame: () => number
  createTextElement: (kind: EditorV6TextElementKind, zIndex: number) => EditorV6Element
  createBlockId: () => string
  now: () => string
  changeScene: (transform: (project: EditorV6Document) => EditorV6Document) => void
  setError: (message: string) => void
  setSelectedElementId: (elementId: string | null) => void
  setSelectedTimelineBlockId: (blockId: string | null) => void
  setInspectorOpen: (open: boolean) => void
  setInspectorTab: (tab: InspectorTab) => void
}

const trackKindForTextElement = (kind: EditorV6TextElementKind): EditorV6TimelineTrack['kind'] => (
  kind === 'narrator' ? 'video' : kind
)

const lockedTrackMessage = 'Desbloqueie a faixa para adicionar um bloco.'

/** Creates an Editor V6 text element and focuses its timeline block after applying it to the scene. */
export function createEditorV6TextElementCommand(dependencies: EditorV6TextElementCommandDependencies) {
  return (kind: EditorV6TextElementKind): void => {
    const project = dependencies.activeProject
    if (!project) return

    const character = kind === 'narrator' ? null : dependencies.selectedCharacterElement
    if (kind !== 'narrator' && !character?.characterId) {
      dependencies.setError('Selecione um personagem na cena antes de adicionar fala ou pensamento.')
      return
    }

    dependencies.pausePlayback()
    const frame = dependencies.getFrame()
    const trackKind = trackKindForTextElement(kind)
    if (project.timeline.tracks.some((track) => track.kind === trackKind && track.locked)) {
      dependencies.setError(lockedTrackMessage)
      return
    }

    const element = {
      ...dependencies.createTextElement(kind, Math.max(0, ...project.elements.map((item) => item.zIndex)) + 1),
      ...(character ? {
        characterId: character.characterId,
        attachedCharacterElementId: character.id,
        attachmentOriginX: character.x,
        attachmentOriginY: character.y,
        x: character.x,
        y: character.y
      } : {})
    }
    const blockId = dependencies.createBlockId()

    dependencies.changeScene((current) => ({
      ...addEditorV6ElementAtFrame(current, element, frame, blockId),
      updatedAt: dependencies.now()
    }))
    dependencies.setSelectedElementId(element.id)
    dependencies.setSelectedTimelineBlockId(blockId)
    dependencies.setInspectorOpen(true)
    dependencies.setInspectorTab('editor')
  }
}
