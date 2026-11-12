import type { VideoBackgroundLibraryDesktopApi } from '../../../../shared/studio'
import type { EditorV6Document, EditorV6DesktopApi, EditorV6MediaLibraryDesktopApi } from '../../../../shared/editorV6'
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

/** Private renderer-side ports used by Editor V6's media commands. */
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
