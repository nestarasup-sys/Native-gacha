import type { VideoLibraryItem } from '../../../../shared/mediaLibrary'
import type { EditorV6LibraryMediaItem } from '../../../../shared/editorV6'
import type { EditorV6MediaCommandDependencies } from './editorV6MediaCommandTypes'

type Dependencies = Pick<EditorV6MediaCommandDependencies,
  'activeProject' | 'trackOperation' | 'bridge' | 'importMediaToTimeline' | 'pausePlayback'
  | 'publishPlayheadFrame' | 'getFrame' | 'loadLatestProject' | 'persistImportedDocument'
  | 'addTimelineMedia' | 'createId' | 'setError' | 'setVideoPickerOpen' | 'setAudioPickerOpen'
  | 'setSelectedElementId' | 'setSelectedTimelineBlockId' | 'setActiveTool' | 'setInspectorOpen' | 'setInspectorTab'
>

/** Owns picker, library-link and timeline-selection commands for video/audio clips. */
export function createEditorV6TimelineMediaCommands(dependencies: Dependencies) {
  const { createId, getFrame } = dependencies

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

  return { importTimelineMedia, linkAudioLibraryItem, linkVideoLibraryItem }
}
