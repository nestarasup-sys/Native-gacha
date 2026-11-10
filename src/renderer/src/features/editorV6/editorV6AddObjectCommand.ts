import type { EditorV6Asset, EditorV6Document, EditorV6Element } from '../../../../shared/editorV6'
import { addEditorV6ElementAtFrame } from '../../../../shared/editorV6TimelineCore'

type InspectorTab = 'editor' | 'custom'

export type EditorV6AddObjectCommandDependencies = {
  activeProject: EditorV6Document | null
  getFrame: () => number
  createId: () => string
  now: () => string
  changeScene: (transform: (project: EditorV6Document) => EditorV6Document) => void
  setError: (message: string) => void
  setSelectedElementId: (elementId: string | null) => void
  setSelectedTimelineBlockId: (blockId: string | null) => void
  setInspectorOpen: (open: boolean) => void
  setInspectorTab: (tab: InspectorTab) => void
}

/** Adds a shared object to the current frame and focuses its Inspector controls. */
export function createEditorV6AddObjectCommand(dependencies: EditorV6AddObjectCommandDependencies) {
  return (asset: EditorV6Asset): void => {
    const project = dependencies.activeProject
    if (!project) return
    if (project.timeline.tracks.some((track) => track.kind === 'object' && track.locked)) {
      dependencies.setError('Desbloqueie a faixa Objetos para adicionar uma imagem.')
      return
    }

    const element: EditorV6Element = {
      id: dependencies.createId(),
      kind: 'image',
      assetId: asset.id,
      text: '',
      x: 0,
      y: 0,
      width: 25,
      height: 25,
      rotation: 0,
      zIndex: Math.max(0, ...project.elements.map((item) => item.zIndex)) + 1
    }
    const blockId = dependencies.createId()
    const frame = dependencies.getFrame()

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
