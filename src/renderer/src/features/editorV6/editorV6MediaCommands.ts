import type { EditorV6MediaCommandDependencies } from './editorV6MediaCommandTypes'
import { createEditorV6SharedAssetCommands } from './editorV6SharedAssetCommands'
import { createEditorV6TimelineMediaCommands } from './editorV6TimelineMediaCommands'

export type { EditorV6MediaCommandDependencies } from './editorV6MediaCommandTypes'

/** Adapts media import use cases to Editor V6's pending operations and UI selection. */
export function createEditorV6MediaCommands(dependencies: EditorV6MediaCommandDependencies) {
  const { createId, getFrame } = dependencies

  const importImage = (category: 'background' | 'object') => dependencies.trackOperation(async () => {
    const activeProject = dependencies.activeProject
    if (!activeProject) return
    dependencies.pausePlayback()
    const targetTrackKind = category === 'object' ? 'object' : 'video'
    const lockedTrackError = category === 'object'
      ? 'Desbloqueie a faixa Objetos para adicionar uma imagem.'
      : 'Desbloqueie a faixa Vídeo para adicionar uma imagem.'
    if (category !== 'background' && activeProject.timeline.tracks.some((track) => track.kind === targetTrackKind && track.locked)) {
      dependencies.setError(lockedTrackError)
      return
    }
    const projectId = activeProject.id
    try {
      const result = await dependencies.importImageToProject({
        category,
        frame: getFrame(),
        importAsset: async (assetCategory) => {
          if (assetCategory === 'background') {
            const item = await dependencies.backgroundLibrary.importVideoBackground()
            if (!item) return null
            await dependencies.refreshBackgroundLibrary()
            return dependencies.bridge.linkEditorV6LibraryBackground(projectId, item.id)
          }
          const item = await dependencies.mediaLibrary.import('object')
          if (item) await dependencies.refreshObjectLibrary()
          return item ? dependencies.bridge.linkEditorV6LibraryAsset(projectId, 'object', item.id) : null
        },
        loadProject: () => dependencies.loadLatestProject(projectId),
        persistDocument: dependencies.persistImportedDocument,
        createId,
        addImageAsset: dependencies.addImageAsset,
        findClipAtFrame: dependencies.findClipAtFrame,
        validateProject: (currentProject) => {
          if (category !== 'background' && currentProject.timeline.tracks.some((track) => track.kind === targetTrackKind && track.locked)) {
            throw new Error(lockedTrackError)
          }
        }
      })
      if (!result) return
      dependencies.setSelectedElementId(result.selectedElementId)
      if (category === 'object') dependencies.setSelectedTimelineBlockId(result.selectedTimelineBlockId ?? null)
      dependencies.setActiveTool(result.activeTool)
      dependencies.setInspectorOpen(true)
      dependencies.setInspectorTab('editor')
    } catch (reason) {
      dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível importar a imagem.')
    }
  })

  const timelineMedia = createEditorV6TimelineMediaCommands(dependencies)
  const sharedAssets = createEditorV6SharedAssetCommands(dependencies)
  return {
    importImage,
    importTimelineMedia: timelineMedia.importTimelineMedia,
    linkVideoLibraryItem: timelineMedia.linkVideoLibraryItem,
    linkAudioLibraryItem: timelineMedia.linkAudioLibraryItem,
    selectBackground: sharedAssets.selectBackground,
    linkSharedBackground: sharedAssets.linkSharedBackground,
    linkSharedObject: sharedAssets.linkSharedObject
  }
}
