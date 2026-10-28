import type { FabricatorDesktopApi } from '../../shared/fabricator'
import type { CustomizerDesktopApi } from '../../shared/customizer'
import type { StudioDesktopApi, VideoBackgroundLibraryDesktopApi } from '../../shared/studio'
import type { EditorV6DesktopApi } from '../../shared/editorV6'
import type { RoteirosDesktopApi } from '../../shared/roteiros'
import type { BaseVideosDesktopApi } from '../../shared/baseVideos'
import type { MediaLibraryDesktopApi } from '../../shared/mediaLibrary'
import type { DataMigrationPauseResult, DataMigrationProgress, DataMigrationResult, DataMigrationSummary, DataStorageSummary } from '../../shared/dataManagement'

declare global {
  interface Window {
    desktop: {
      platform: string
      appName: string
      normalizeImageForImport: (bytes: Uint8Array) => Promise<{ dataUrl: string; width: number; height: number; bitDepth: 8 | 16; sourceBytes: number; outputBytes: number }>
      loadFabricatorDesignSettings: () => Promise<unknown | null>
      saveFabricatorDesignSettings: (settings: unknown) => Promise<void>
      getAppDataStorageSummary: () => Promise<DataStorageSummary>
      getDataMigrationSummary: () => Promise<DataMigrationSummary>
      runDataMigration: () => Promise<DataMigrationResult>
      pauseDataMigration: () => Promise<DataMigrationPauseResult>
      restartAfterDataMigration: () => Promise<void>
      onDataMigrationProgress: (callback: (progress: DataMigrationProgress) => void) => () => void
      listDataBackups: () => Promise<Array<{ id: string; createdAt: string; fileCount: number; byteLength: number; verifiedAt: string | null }>>
      createDataBackup: () => Promise<{ id: string; valid: boolean; fileCount: number; byteLength: number; createdAt: string; verifiedAt: string; databaseSchema: number }>
      verifyDataBackup: (id: string) => Promise<{ id: string; valid: boolean; fileCount: number; byteLength: number; createdAt: string; verifiedAt: string; databaseSchema: number }>
      restoreDataBackup: (id: string) => Promise<{ cancelled?: boolean; safetyBackupId?: string; restoreId?: string; backupId?: string; fileCount?: number; byteLength?: number }>
      deleteDataBackup: (id: string) => Promise<{ deleted: boolean }>
      fabricator: FabricatorDesktopApi
      customizer: CustomizerDesktopApi
      studio: StudioDesktopApi
      editorV6: EditorV6DesktopApi
      roteiros: RoteirosDesktopApi
      baseVideos: BaseVideosDesktopApi
      mediaLibrary: MediaLibraryDesktopApi
      videoBackgrounds: VideoBackgroundLibraryDesktopApi
    } & FabricatorDesktopApi & CustomizerDesktopApi & StudioDesktopApi & EditorV6DesktopApi & RoteirosDesktopApi
  }
}

export {}
