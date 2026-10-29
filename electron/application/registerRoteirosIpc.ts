import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { Database } from 'better-sqlite3'
import type { VideoLibraryStore } from '../domains/mediaLibrary/videoLibraryStore.ts'
import type { VideoBackgroundLibraryStore } from '../backgroundLibrary.ts'
import type { RoteiroUiGifLibraryStore } from '../roteiroUiGifLibrary.ts'
import { createBackgroundLibraryService } from '../domains/mediaLibrary/backgroundLibraryService.ts'
import { registerBackgroundLibraryHandlers } from '../domains/mediaLibrary/backgroundLibraryIpc.ts'
import { createVideoLibraryService } from '../domains/mediaLibrary/videoLibraryService.ts'
import { registerVideoLibraryHandlers } from '../domains/mediaLibrary/videoLibraryIpc.ts'
import { createRoteiroBackgroundReferenceGuard, createRoteiroUiGifReferenceGuard } from '../domains/roteiros/assetReferences.ts'
import { createRoteiroExportLogsService } from '../domains/roteiros/exportLogsService.ts'
import { registerRoteiroExportLogsHandlers } from '../domains/roteiros/exportLogsIpc.ts'
import { createRoteiroExportService } from '../domains/roteiros/exportService.ts'
import { registerRoteiroExportHandlers } from '../domains/roteiros/exportIpc.ts'
import { createRoteiroUiGifsService } from '../domains/roteiros/uiGifsService.ts'
import { registerRoteiroUiGifsHandlers } from '../domains/roteiros/uiGifsIpc.ts'
import { createRoteirosDocumentService } from '../domains/roteiros/service.ts'
import { registerRoteirosDocumentHandlers } from '../domains/roteiros/documentIpc.ts'

export type RoteirosImportKind = 'video' | 'background' | 'gif'
export type RoteirosIpcLifecycle = ReturnType<typeof registerRoteiroExportHandlers>

export type RegisterRoteirosIpcDependencies = {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  getDatabase: () => Database | null
  videoLibrary: VideoLibraryStore
  videoBackgroundLibrary: VideoBackgroundLibraryStore
  roteiroUiGifLibrary: RoteiroUiGifLibraryStore
  getDefaultGifPath: () => string | undefined
  getAppDataRoot: () => string
  resolvePhysicalPath: (path: string) => Promise<string | null>
  openImportFile: (kind: RoteirosImportKind) => Promise<string | null>
  openPath: (path: string) => Promise<string>
  enqueueWrite: <T>(operation: () => Promise<T> | T) => Promise<T>
  waitForPendingWrites: () => Promise<void>
  coordinateVideoReferenceChange: <T>(operation: () => Promise<T> | T) => Promise<T>
  assertNoVideoReferences: (id: string) => Promise<void>
  assertLibraryVideoReferencesAvailable: (ids: readonly string[]) => Promise<void>
  assertLibraryBackgroundReferencesAvailable: (ids: readonly string[]) => Promise<void>
  assertLibraryUiGifReferencesAvailable: (ids: readonly string[]) => Promise<void>
}

/** Composes media-library and Roteiros services at the application boundary. */
export function registerRoteirosIpc(deps: RegisterRoteirosIpcDependencies): RoteirosIpcLifecycle {
  const videoLibraryService = createVideoLibraryService({
    library: deps.videoLibrary,
    openImportDialog: () => deps.openImportFile('video'),
    enqueueWrite: deps.enqueueWrite,
    coordinateReferenceChange: deps.coordinateVideoReferenceChange,
    assertNoReferences: deps.assertNoVideoReferences
  })
  registerVideoLibraryHandlers({ ipcMain: deps.ipcMain, assertTrustedSender: deps.assertTrustedSender, service: videoLibraryService })

  const backgroundLibraryService = createBackgroundLibraryService({
    openImportDialog: () => deps.openImportFile('background'),
    library: deps.videoBackgroundLibrary,
    assertRoteiroUnreferenced: createRoteiroBackgroundReferenceGuard(deps.getDatabase),
    enqueueWrite: deps.enqueueWrite
  })
  registerBackgroundLibraryHandlers({ ipcMain: deps.ipcMain, assertTrustedSender: deps.assertTrustedSender, service: backgroundLibraryService })

  const roteiroUiGifsService = createRoteiroUiGifsService({
    getDefaultGifPath: deps.getDefaultGifPath,
    openImportDialog: () => deps.openImportFile('gif'),
    library: deps.roteiroUiGifLibrary,
    assertUnreferenced: createRoteiroUiGifReferenceGuard(deps.getDatabase),
    enqueueWrite: deps.enqueueWrite
  })
  registerRoteiroUiGifsHandlers({ ipcMain: deps.ipcMain, assertTrustedSender: deps.assertTrustedSender, service: roteiroUiGifsService })

  const roteiroExportService = createRoteiroExportService({
    getAppDataRoot: deps.getAppDataRoot,
    resolveBackground: async (id) => {
      const resolved = await deps.videoBackgroundLibrary.resolve(id)
      return await deps.resolvePhysicalPath(resolved.path) ?? resolved.path
    },
    resolveGif: async (id) => {
      const resolved = await deps.roteiroUiGifLibrary.resolve(id)
      return await deps.resolvePhysicalPath(resolved) ?? resolved
    },
    resolveVideo: async (video) => {
      const resolved = await deps.videoLibrary.resolveMedia(video.id)
      if (resolved.extension !== video.extension || resolved.durationFrames !== null && resolved.durationFrames !== video.durationFrames) {
        throw new Error(`O vídeo “${video.name}” não corresponde ao arquivo da biblioteca.`)
      }
      return await deps.resolvePhysicalPath(resolved.path) ?? resolved.path
    }
  })
  const exportLifecycle = registerRoteiroExportHandlers({
    ipcMain: deps.ipcMain,
    assertTrustedSender: deps.assertTrustedSender,
    openPath: deps.openPath,
    service: roteiroExportService
  })

  const roteiroDocumentService = createRoteirosDocumentService({
    getDatabase: deps.getDatabase,
    waitForPendingWrites: deps.waitForPendingWrites,
    enqueueWrite: deps.enqueueWrite,
    coordinateVideoReferenceChange: deps.coordinateVideoReferenceChange,
    assertLibraryVideoReferencesAvailable: deps.assertLibraryVideoReferencesAvailable,
    assertLibraryBackgroundReferencesAvailable: deps.assertLibraryBackgroundReferencesAvailable,
    assertLibraryUiGifReferencesAvailable: deps.assertLibraryUiGifReferencesAvailable
  })
  registerRoteirosDocumentHandlers({ ipcMain: deps.ipcMain, assertTrustedSender: deps.assertTrustedSender, service: roteiroDocumentService })

  const roteiroExportLogsService = createRoteiroExportLogsService({
    getDatabase: deps.getDatabase,
    waitForPendingWrites: deps.waitForPendingWrites,
    enqueueWrite: deps.enqueueWrite
  })
  registerRoteiroExportLogsHandlers({ ipcMain: deps.ipcMain, assertTrustedSender: deps.assertTrustedSender, service: roteiroExportLogsService })

  return exportLifecycle
}
