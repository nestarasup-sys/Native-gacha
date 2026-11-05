import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { CharacterSheet } from '../../../src/shared/roteiros'

export function registerCharacterSheetsHandlers(deps: { ipcMain: Pick<IpcMain, 'handle'>; assertTrustedSender: (event: IpcMainInvokeEvent) => void; service: { list: () => Promise<CharacterSheet[]>; save: (value: unknown) => Promise<void> } }): void {
  deps.ipcMain.handle('roteiros:character-sheets:list', async (event): Promise<CharacterSheet[]> => { deps.assertTrustedSender(event); return deps.service.list() })
  deps.ipcMain.handle('roteiros:character-sheets:save', async (event, value: unknown): Promise<void> => { deps.assertTrustedSender(event); await deps.service.save(value) })
}
