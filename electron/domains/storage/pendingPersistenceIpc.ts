import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { studioIpcChannels } from '../../../src/shared/studioIpcChannels'

type PendingPersistenceFlushDependencies = {
  ipcMain: IpcMain
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  flushRendererWrites: (event: IpcMainInvokeEvent) => Promise<void>
  flushMainWrites: () => Promise<void>
}

/** Registers the app-wide flush channel and preserves renderer-before-main ordering. */
export function registerPendingPersistenceFlushIpc({
  ipcMain,
  assertTrustedSender,
  flushRendererWrites,
  flushMainWrites
}: PendingPersistenceFlushDependencies): void {
  ipcMain.handle(studioIpcChannels.flushPendingWrites, async (event): Promise<void> => {
    assertTrustedSender(event)
    await flushRendererWrites(event)
    await flushMainWrites()
  })
}
