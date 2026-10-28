/** IPC da biblioteca de fundos com validação da origem em cada canal. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { VideoBackgroundLibraryItem } from '../../../src/shared/studio'

export function registerBackgroundLibraryHandlers(deps: {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  service: {
    list: () => Promise<VideoBackgroundLibraryItem[]>
    import: () => Promise<VideoBackgroundLibraryItem | null>
    delete: (id: unknown) => Promise<void>
  }
}): void {
  deps.ipcMain.handle('background-library:list', async (event): Promise<VideoBackgroundLibraryItem[]> => {
    deps.assertTrustedSender(event)
    return deps.service.list()
  })
  deps.ipcMain.handle('background-library:import', async (event): Promise<VideoBackgroundLibraryItem | null> => {
    deps.assertTrustedSender(event)
    return deps.service.import()
  })
  deps.ipcMain.handle('background-library:delete', async (event, id: unknown): Promise<void> => {
    deps.assertTrustedSender(event)
    await deps.service.delete(id)
  })
}
