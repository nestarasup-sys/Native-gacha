/** IPC dos logs de exportação, com validação de origem em cada canal. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { RoteiroExportLog } from '../../../src/shared/roteiros'

export function registerRoteiroExportLogsHandlers(deps: {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  service: {
    list: (roteiroId: unknown) => Promise<RoteiroExportLog[]>
    append: (roteiroId: unknown, value: unknown) => Promise<void>
    clear: (roteiroId: unknown) => Promise<void>
  }
}): void {
  deps.ipcMain.handle('roteiros:export-logs:list', async (event, roteiroId: unknown): Promise<RoteiroExportLog[]> => {
    deps.assertTrustedSender(event)
    return deps.service.list(roteiroId)
  })
  deps.ipcMain.handle('roteiros:export-logs:append', async (event, roteiroId: unknown, value: unknown): Promise<void> => {
    deps.assertTrustedSender(event)
    await deps.service.append(roteiroId, value)
  })
  deps.ipcMain.handle('roteiros:export-logs:clear', async (event, roteiroId: unknown): Promise<void> => {
    deps.assertTrustedSender(event)
    await deps.service.clear(roteiroId)
  })
}
