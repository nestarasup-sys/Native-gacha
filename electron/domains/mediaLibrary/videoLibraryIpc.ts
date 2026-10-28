/** Canais IPC da biblioteca de vídeos, com validação da origem em cada chamada. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { VideoLibraryItem } from '../../../src/shared/mediaLibrary'

export function registerVideoLibraryHandlers(deps: {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  service: {
    list: () => Promise<VideoLibraryItem[]>
    import: () => Promise<VideoLibraryItem | null>
    finishImport: (id: string, durationFrames: number) => Promise<VideoLibraryItem>
    rename: (id: string, name: string) => Promise<VideoLibraryItem>
    delete: (id: string) => Promise<void>
  }
}): void {
  deps.ipcMain.handle('video-library:list', async (event): Promise<VideoLibraryItem[]> => {
    deps.assertTrustedSender(event)
    return deps.service.list()
  })
  deps.ipcMain.handle('video-library:import', async (event): Promise<VideoLibraryItem | null> => {
    deps.assertTrustedSender(event)
    return deps.service.import()
  })
  deps.ipcMain.handle('video-library:finish', async (event, id: string, durationFrames: number): Promise<VideoLibraryItem> => {
    deps.assertTrustedSender(event)
    return deps.service.finishImport(id, durationFrames)
  })
  deps.ipcMain.handle('video-library:rename', async (event, id: string, name: string): Promise<VideoLibraryItem> => {
    deps.assertTrustedSender(event)
    return deps.service.rename(id, name)
  })
  deps.ipcMain.handle('video-library:delete', async (event, id: string): Promise<void> => {
    deps.assertTrustedSender(event)
    await deps.service.delete(id)
  })
}
