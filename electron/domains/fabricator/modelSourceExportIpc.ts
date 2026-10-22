/** Transporte IPC do download: a pasta Downloads é fornecida pelo processo principal. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { exportModelSourceToDownloads } from './modelSourceExport'

export function registerModelSourceDownloadHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  assertTrustedSender: (event: IpcMainInvokeEvent) => void,
  getDownloadsPath: () => string
): void {
  ipc.handle('fabricator:model-source:download', async (event, slot: number, pngDataUrl: string) => {
    assertTrustedSender(event)
    return exportModelSourceToDownloads(slot, pngDataUrl, getDownloadsPath())
  })
}
