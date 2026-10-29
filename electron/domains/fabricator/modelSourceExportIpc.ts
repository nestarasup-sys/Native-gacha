import { fabricatorIpcChannels } from '../../../src/shared/fabricatorIpcChannels.ts'
/** Transporte IPC do download: a pasta Downloads é fornecida pelo processo principal. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { exportModelSourceToDownloads } from './modelSourceExport.ts'
import { createPendingOperationTracker } from '../storage/pendingOperationTracker.ts'

type ExportModelSource = typeof exportModelSourceToDownloads

export function registerModelSourceDownloadHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  assertTrustedSender: (event: IpcMainInvokeEvent) => void,
  getDownloadsPath: () => string,
  exportSource: ExportModelSource = exportModelSourceToDownloads
) {
  const pending = createPendingOperationTracker()
  ipc.handle(fabricatorIpcChannels.downloadFabricatorModelSource, async (event, slot: number, pngDataUrl: string) => {
    assertTrustedSender(event)
    return pending.track(() => exportSource(slot, pngDataUrl, getDownloadsPath()))
  })
  return { getPendingWrites: pending.getPending }
}
