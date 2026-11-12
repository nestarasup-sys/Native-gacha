import type { VideoBackgroundLibraryItem } from '../../../../shared/studio'
import type { EditorV6Asset, EditorV6LibraryMediaItem } from '../../../../shared/editorV6'
import type { EditorV6MediaCommandDependencies } from './editorV6MediaCommandTypes'

type Dependencies = Pick<EditorV6MediaCommandDependencies,
  'activeProject' | 'trackOperation' | 'bridge' | 'importImageToProject' | 'addImageAsset'
  | 'findClipAtFrame' | 'editBackgroundAtFrame' | 'getFrame' | 'loadLatestProject'
  | 'persistImportedDocument' | 'setError' | 'setSelectedElementId' | 'setSelectedTimelineBlockId'
  | 'setActiveTool' | 'setInspectorOpen' | 'setInspectorTab' | 'changeScene' | 'createId'
>

/** Owns background/object library links and the scene selection they publish. */
export function createEditorV6SharedAssetCommands(dependencies: Dependencies) {
  const { createId, getFrame } = dependencies

  const selectBackground = (asset: EditorV6Asset) => {
    const frame = getFrame()
    dependencies.changeScene((project) => ({
      ...dependencies.editBackgroundAtFrame(project, frame, {
        backgroundAssetId: asset.id,
        backgroundX: 0,
        backgroundY: 0,
        backgroundWidth: 100,
        backgroundHeight: 100,
        backgroundRotation: 0
      }),
      updatedAt: new Date().toISOString()
    }))
    dependencies.setSelectedTimelineBlockId(null)
    dependencies.setSelectedElementId('background')
    dependencies.setInspectorOpen(true)
    dependencies.setInspectorTab('editor')
  }

  const linkSharedBackground = (item: VideoBackgroundLibraryItem) => dependencies.trackOperation(async () => {
    const project = dependencies.activeProject
    if (!project) return
    const existing = project.assets.find((asset) => asset.libraryAssetId === item.id || asset.libraryBackgroundId === item.id)
    if (existing) {
      selectBackground(existing)
      return
    }
    const projectId = project.id
    try {
      const result = await dependencies.importImageToProject({
        category: 'background', frame: getFrame(),
        importAsset: () => dependencies.bridge.linkEditorV6LibraryBackground(projectId, item.id),
        loadProject: () => dependencies.loadLatestProject(projectId),
        persistDocument: dependencies.persistImportedDocument,
        createId, addImageAsset: dependencies.addImageAsset, findClipAtFrame: dependencies.findClipAtFrame
      })
      if (!result) return
      dependencies.setSelectedElementId(result.selectedElementId)
      dependencies.setSelectedTimelineBlockId(null)
      dependencies.setActiveTool('background')
      dependencies.setInspectorOpen(true)
      dependencies.setInspectorTab('editor')
    } catch (reason) {
      dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível vincular o fundo compartilhado.')
    }
  })

  const linkSharedObject = (item: EditorV6LibraryMediaItem) => dependencies.trackOperation(async () => {
    const project = dependencies.activeProject
    if (!project) return
    if (project.timeline.tracks.some((track) => track.kind === 'object' && track.locked)) throw Error('Desbloqueie a faixa Objetos antes de adicionar uma imagem.')
    const existing = project.assets.find((asset) => asset.libraryAssetId === item.id)
    if (existing) return
    const projectId = project.id
    try {
      const asset = await dependencies.bridge.linkEditorV6LibraryAsset(projectId, 'object', item.id)
      const result = await dependencies.importImageToProject({ category: 'object', frame: getFrame(), importAsset: async () => asset,
        loadProject: () => dependencies.loadLatestProject(projectId), persistDocument: dependencies.persistImportedDocument,
        createId, addImageAsset: dependencies.addImageAsset, findClipAtFrame: dependencies.findClipAtFrame })
      if (!result) return
      dependencies.setSelectedElementId(result.selectedElementId)
      dependencies.setSelectedTimelineBlockId(result.selectedTimelineBlockId ?? null)
      dependencies.setActiveTool('objects')
      dependencies.setInspectorOpen(true)
      dependencies.setInspectorTab('editor')
    } catch (reason) { dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível vincular o objeto compartilhado.') }
  })

  return { selectBackground, linkSharedBackground, linkSharedObject }
}
