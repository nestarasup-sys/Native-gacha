/** IPC da biblioteca de GIFs do Roteiros, com origem validada em cada chamada. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { RoteiroUiGifItem } from '../../../src/shared/roteiros'

export function registerRoteiroUiGifsHandlers(deps: {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  service: {
    list: () => Promise<RoteiroUiGifItem[]>
    import: () => Promise<RoteiroUiGifItem | null>
    delete: (id: unknown) => Promise<void>
  }
}): void {
  deps.ipcMain.handle('roteiros:ui-gifs:list', async (event): Promise<RoteiroUiGifItem[]> => {
    deps.assertTrustedSender(event)
    return deps.service.list()
  })
  deps.ipcMain.handle('roteiros:ui-gifs:import', async (event): Promise<RoteiroUiGifItem | null> => {
    deps.assertTrustedSender(event)
    return deps.service.import()
  })
  deps.ipcMain.handle('roteiros:ui-gifs:delete', async (event, id: unknown): Promise<void> => {
    deps.assertTrustedSender(event)
    await deps.service.delete(id)
  })
}
