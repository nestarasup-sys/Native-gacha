import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { FabricatorDesignSettingsService } from './designSettingsService.ts'
import { createPendingOperationTracker } from '../storage/pendingOperationTracker.ts'

export function registerFabricatorDesignSettingsHandlers(deps: {
  ipcMain: Pick<IpcMain, 'handle'>
  assertTrustedSender: (event: IpcMainInvokeEvent) => void
  service: FabricatorDesignSettingsService
}) {
  const pending = createPendingOperationTracker()
  deps.ipcMain.handle('fabricator:design-settings:load', async (event) => {
    deps.assertTrustedSender(event)
    return deps.service.load()
  })
  deps.ipcMain.handle('fabricator:design-settings:save', async (event, settings: unknown) => {
    deps.assertTrustedSender(event)
    return pending.track(() => deps.service.save(settings))
  })
  return { getPendingWrites: pending.getPending }
}
