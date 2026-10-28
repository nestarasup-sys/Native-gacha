/** IPC dos documentos de Roteiros; preserva canais e checagem de origem. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { RoteiroDocument } from '../../../src/shared/roteiros'

export function registerRoteirosDocumentHandlers(deps: {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  service: { list: () => Promise<RoteiroDocument[]>; save: (value: unknown) => Promise<void> }
}): void {
  deps.ipcMain.handle('roteiros:list', async (event): Promise<RoteiroDocument[]> => {
    deps.assertTrustedSender(event)
    return deps.service.list()
  })
  deps.ipcMain.handle('roteiros:save', async (event, roteiros: unknown): Promise<void> => {
    deps.assertTrustedSender(event)
    await deps.service.save(roteiros)
  })
}
