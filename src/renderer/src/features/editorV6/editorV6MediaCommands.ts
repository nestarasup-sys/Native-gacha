import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'
import type { VideoBackgroundLibraryDesktopApi, VideoBackgroundLibraryItem } from '../../../../shared/studio'
import type { EditorV6Asset, EditorV6Document, EditorV6DesktopApi, EditorV6LibraryMediaItem, EditorV6MediaLibraryDesktopApi } from '../../../../shared/editorV6'
import type { editEditorV6BackgroundAtFrame } from '../../../../shared/editorV6TimelineScene'
import type { editorV6ClipAtFrame } from '../../../../shared/editorV6TimelineCore'
import type { addEditorV6ImageAsset, addEditorV6TimelineMedia } from './editorV6MediaChanges'
import type { importEditorV6ImageToProject, importEditorV6MediaToTimeline } from './editorV6MediaImport'

type InspectorTab = 'editor' | 'custom'
type ActiveTool = 'background' | 'objects' | null
type TrackOperation = <T>(operation: () => Promise<T>) => Promise<T>
type EditorV6MediaBridge = Pick<EditorV6DesktopApi,
  'importEditorV6Image' | 'importEditorV6Media' | 'linkEditorV6LibraryVideo'
  | 'linkEditorV6LibraryBackground' | 'linkEditorV6LibraryAsset' | 'linkEditorV6LibraryAudio'
>

export type EditorV6MediaCommandDependencies = {
  activeProject: EditorV6Document | null
  trackOperation: TrackOperation
  bridge: EditorV6MediaBridge
  backgroundLibrary: Pick<VideoBackgroundLibraryDesktopApi, 'importVideoBackground'>
  mediaLibrary: Pick<EditorV6MediaLibraryDesktopApi, 'import'>
  refreshObjectLibrary: () => Promise<void>
  refreshBackgroundLibrary: () => Promise<void>
  importImageToProject: typeof importEditorV6ImageToProject
  importMediaToTimeline: typeof importEditorV6MediaToTimeline
  addImageAsset: typeof addEditorV6ImageAsset
  addTimelineMedia: typeof addEditorV6TimelineMedia
  findClipAtFrame: typeof editorV6ClipAtFrame
  editBackgroundAtFrame: typeof editEditorV6BackgroundAtFrame
  pausePlayback: () => void
  publishPlayheadFrame: (frame: number) => void
  getFrame: () => number
  loadLatestProject: (projectId: string) => Promise<EditorV6Document | null>
  persistImportedDocument: (source: EditorV6Document, next: EditorV6Document) => Promise<boolean>
  setError: (message: string | null) => void
  setVideoPickerOpen: (open: boolean) => void
  setAudioPickerOpen: (open: boolean) => void
  setSelectedElementId: (elementId: string | null) => void
  setSelectedTimelineBlockId: (blockId: string | null) => void
  setActiveTool: (tool: ActiveTool) => void
  setInspectorOpen: (open: boolean) => void
  setInspectorTab: (tab: InspectorTab) => void
  changeScene: (transform: (project: EditorV6Document) => EditorV6Document) => void
  createId: () => string
}

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

  const importTimelineMedia = (kind: 'video' | 'audio') => dependencies.trackOperation(async () => {
    const activeProject = dependencies.activeProject
    if (!activeProject) return
    if (kind === 'video') {
      dependencies.setVideoPickerOpen(true)
      return
    }
    const track = activeProject.timeline.tracks.find((item) => item.kind === 'audio')
    if (track?.locked) {
      dependencies.setError('Desbloqueie a faixa Áudio para importar mídia.')
      return
    }
    dependencies.pausePlayback()
    dependencies.setAudioPickerOpen(true)
  })

  const linkAudioLibraryItem = (item: EditorV6LibraryMediaItem) => dependencies.trackOperation(async () => {
    const project = dependencies.activeProject
    if (!project) return
    const track = project.timeline.tracks.find((entry) => entry.kind === 'audio')
    if (track?.locked) throw Error('Desbloqueie a faixa Áudio antes de adicionar um áudio.')
    const projectId = project.id
    dependencies.pausePlayback()
    try {
      const result = await dependencies.importMediaToTimeline({ frame: getFrame(), requestMedia: () => dependencies.bridge.linkEditorV6LibraryAudio(projectId, item.id),
        loadProject: () => dependencies.loadLatestProject(projectId), persistDocument: dependencies.persistImportedDocument,
        createId, addTimelineMedia: dependencies.addTimelineMedia })
      if (!result) return
      dependencies.publishPlayheadFrame(result.startFrame)
      dependencies.setSelectedTimelineBlockId(result.blockId)
      dependencies.setSelectedElementId(null)
      dependencies.setActiveTool(null)
      dependencies.setInspectorOpen(true)
      dependencies.setInspectorTab('editor')
      dependencies.setAudioPickerOpen(false)
    } catch (reason) { dependencies.setError(reason instanceof Error ? reason.message : 'Não foi possível vincular o áudio da biblioteca.') }
  })

  const linkVideoLibraryItem = (item: VideoLibraryItem) => dependencies.trackOperation(async () => {
    const activeProject = dependencies.activeProject
    if (!activeProject) return
    const projectId = activeProject.id
    const track = activeProject.timeline.tracks.find((entry) => entry.kind === 'video')
    if (track?.locked) throw new Error('Desbloqueie a faixa Vídeo antes de adicionar um vídeo.')
    dependencies.pausePlayback()
    const frameAtImport = getFrame()
    const result = await dependencies.importMediaToTimeline({
      frame: frameAtImport,
      requestMedia: () => dependencies.bridge.linkEditorV6LibraryVideo(projectId, item.id),
      loadProject: () => dependencies.loadLatestProject(projectId),
      persistDocument: dependencies.persistImportedDocument,
      createId,
      addTimelineMedia: dependencies.addTimelineMedia
    })
    if (!result) return
    dependencies.publishPlayheadFrame(result.startFrame)
    dependencies.setSelectedTimelineBlockId(result.blockId)
    dependencies.setSelectedElementId(null)
    dependencies.setActiveTool(null)
    dependencies.setInspectorOpen(true)
    dependencies.setInspectorTab('editor')
    dependencies.setVideoPickerOpen(false)
  })

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

  return { importImage, importTimelineMedia, linkVideoLibraryItem, linkAudioLibraryItem, selectBackground, linkSharedBackground, linkSharedObject }
}
