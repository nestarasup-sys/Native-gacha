import type { FabricatorDesktopApi } from '../../shared/fabricator'
import type { CustomizerDesktopApi } from '../../shared/customizer'
import type { StudioDesktopApi, VideoBackgroundLibraryDesktopApi } from '../../shared/studio'
import type { EditorV6DesktopApi } from '../../shared/editorV6'
import type { RoteirosDesktopApi } from '../../shared/roteiros'
import type { BaseVideosDesktopApi } from '../../shared/baseVideos'
import type { MediaLibraryDesktopApi } from '../../shared/mediaLibrary'
import type { DataManagementDesktopApi } from '../../shared/dataManagement'
import type { ImageImportDesktopApi } from '../../shared/imageImport'

declare global {
  interface Window {
    desktop: {
      platform: string
      appName: string
      flushPendingWrites: StudioDesktopApi['flushPendingWrites']
      images: ImageImportDesktopApi
      dataManagement: DataManagementDesktopApi
      fabricator: FabricatorDesktopApi
      customizer: CustomizerDesktopApi
      studio: StudioDesktopApi
      editorV6: EditorV6DesktopApi
      roteiros: RoteirosDesktopApi
      baseVideos: BaseVideosDesktopApi
      mediaLibrary: MediaLibraryDesktopApi
      videoBackgrounds: VideoBackgroundLibraryDesktopApi
    }
  }
}

export {}
