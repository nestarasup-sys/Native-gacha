/** Canais IPC estáveis para o catálogo de modelos do Fabricador. */
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { FabricatorModelCatalog } from './modelCatalog.ts'

export function registerFabricatorModelCatalogHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  assertTrustedSender: (event: IpcMainInvokeEvent) => void,
  catalog: Pick<FabricatorModelCatalog, 'listSlots' | 'loadSlot'>
): void {
  ipc.handle('fabricator:list-slots', async (event) => {
    assertTrustedSender(event)
    return catalog.listSlots()
  })
  ipc.handle('fabricator:load-slot', async (event, slot: number) => {
    assertTrustedSender(event)
    return catalog.loadSlot(slot)
  })
}
